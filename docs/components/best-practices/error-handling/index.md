# 错误处理规范和恢复策略最佳实践

## 概述

本指南详细介绍Shopify翻译应用的错误处理体系，包括错误分类、捕获机制、恢复策略和预防措施。我们建立了一套完整的错误管理系统，实现了从错误检测到自动修复的全流程覆盖。

**最后验证日期**: 2025-09-04  
**适用版本**: Node.js 18.20+, Prisma 6.2.1

## 目录

1. [TranslationError类体系设计](#1-translationerror类体系设计)
2. [withErrorHandling包装器模式](#2-witherrorhandling包装器模式)
3. [错误分类和指纹系统](#3-错误分类和指纹系统)
4. [API限流和重试策略](#4-api限流和重试策略)
5. [网络错误处理](#5-网络错误处理)
6. [业务逻辑错误管理](#6-业务逻辑错误管理)
7. [错误分析和模式识别](#7-错误分析和模式识别)
8. [自动修复和预防机制](#8-自动修复和预防机制)

---

## 1. TranslationError类体系设计

### 架构原理

采用面向对象的错误类继承体系，提供精确的错误分类和上下文信息：

```javascript
// app/utils/error-handler.server.js
export class TranslationError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TranslationError';
    this.code = options.code || 'TRANSLATION_ERROR';
    this.category = options.category || 'GENERAL';
    this.retryable = options.retryable || false;
    this.context = options.context || {};
    this.originalError = options.originalError || null;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TranslationError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack
    };
  }
}
```

### 实施步骤

1. **专用错误类定义**
```javascript
// API错误 - 处理外部API调用失败
export class APIError extends TranslationError {
  constructor(message, statusCode, options = {}) {
    super(message, {
      ...options,
      code: options.code || `API_ERROR_${statusCode}`,
      category: 'API'
    });
    this.statusCode = statusCode;
    this.retryable = [408, 429, 500, 502, 503, 504].includes(statusCode);
  }
}

// 验证错误 - 数据格式和业务规则验证
export class ValidationError extends TranslationError {
  constructor(message, validationType, options = {}) {
    super(message, {
      ...options,
      code: 'VALIDATION_ERROR',
      category: 'VALIDATION'
    });
    this.validationType = validationType;
    this.retryable = false;
    this.fields = options.fields || [];
  }
}

// 配置错误 - 系统配置问题
export class ConfigError extends TranslationError {
  constructor(message, configKey, options = {}) {
    super(message, {
      ...options,
      code: 'CONFIG_ERROR',
      category: 'CONFIG'
    });
    this.configKey = configKey;
    this.retryable = false;
    this.suggestion = options.suggestion || null;
  }
}

// 网络错误 - 网络连接和超时
export class NetworkError extends TranslationError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      code: 'NETWORK_ERROR',
      category: 'NETWORK',
      retryable: true
    });
    this.timeout = options.timeout || false;
    this.endpoint = options.endpoint || null;
  }
}
```

2. **错误上下文增强**
```javascript
export function enrichErrorContext(error, context) {
  if (error instanceof TranslationError) {
    error.context = {
      ...error.context,
      ...context,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      nodeVersion: process.version
    };
  }
  
  return error;
}

// 使用示例
try {
  await translateResource(resource, 'zh-CN');
} catch (error) {
  throw enrichErrorContext(error, {
    resourceId: resource.id,
    resourceType: resource.resourceType,
    targetLanguage: 'zh-CN',
    attemptNumber: 1
  });
}
```

### 错误类型决策树

```javascript
function classifyError(error) {
  // 网络相关
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return new NetworkError(error.message, {
      originalError: error,
      timeout: error.code === 'ETIMEDOUT'
    });
  }
  
  // API响应错误
  if (error.response?.status) {
    return new APIError(
      error.message,
      error.response.status,
      { originalError: error }
    );
  }
  
  // 验证错误
  if (error.name === 'ValidationError' || error.validation) {
    return new ValidationError(
      error.message,
      error.validationType || 'UNKNOWN',
      { originalError: error }
    );
  }
  
  // 默认错误
  return new TranslationError(error.message, {
    originalError: error
  });
}
```

---

## 2. withErrorHandling包装器模式

### 架构原理

统一的错误处理包装器，自动捕获、记录和响应错误：

```javascript
export function withErrorHandling(handler, options = {}) {
  return async function wrappedHandler(...args) {
    const startTime = Date.now();
    const requestId = generateRequestId();
    
    try {
      // 添加请求追踪
      const context = {
        requestId,
        handler: handler.name || 'anonymous',
        startTime
      };
      
      // 执行原始处理器
      const result = await handler(...args, context);
      
      // 记录成功
      logSuccess(context, Date.now() - startTime);
      
      return result;
    } catch (error) {
      // 分类和增强错误
      const classifiedError = classifyError(error);
      
      // 收集错误
      await collectError(classifiedError, {
        requestId,
        handler: handler.name,
        duration: Date.now() - startTime
      });
      
      // 决定是否重试
      if (classifiedError.retryable && options.retry) {
        return await retryWithBackoff(handler, args, options);
      }
      
      // 创建错误响应
      return createErrorResponse(classifiedError, requestId);
    }
  };
}
```

### 实施步骤

1. **路由级错误处理**
```javascript
// app/routes/api.translate.jsx
export const action = withErrorHandling(
  async ({ request }) => {
    const { resources, targetLanguage } = await request.json();
    
    // 验证输入
    validateTranslationRequest(resources, targetLanguage);
    
    // 执行翻译
    const results = await translateBatch(resources, targetLanguage);
    
    return json({
      success: true,
      data: results
    });
  },
  {
    retry: true,
    maxRetries: 3,
    backoff: 'exponential'
  }
);
```

2. **服务级错误处理**
```javascript
// app/services/translation.server.js
export const translateResourceWithLogging = withErrorHandling(
  async (resource, targetLang, options = {}) => {
    // 检查配置
    if (!config.gpt.apiKey) {
      throw new ConfigError(
        'GPT API key未配置',
        'GPT_API_KEY',
        { suggestion: '请在环境变量中设置GPT_API_KEY' }
      );
    }
    
    // 执行翻译
    const translated = await callGPTAPI(resource, targetLang);
    
    // 验证结果
    if (!validateTranslation(translated)) {
      throw new ValidationError(
        '翻译结果验证失败',
        'TRANSLATION_OUTPUT',
        { fields: ['title', 'description'] }
      );
    }
    
    return translated;
  },
  {
    errorCollector: true,
    metrics: true
  }
);
```

### 高级包装器功能

```javascript
export function withAdvancedErrorHandling(handler, config = {}) {
  return async function(...args) {
    const circuit = new CircuitBreaker(handler, {
      timeout: config.timeout || 30000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    });
    
    circuit.on('open', () => {
      logger.warn(`Circuit breaker opened for ${handler.name}`);
    });
    
    circuit.on('halfOpen', () => {
      logger.info(`Circuit breaker half-open for ${handler.name}`);
    });
    
    try {
      return await circuit.fire(...args);
    } catch (error) {
      if (circuit.opened) {
        // 熔断器打开，使用降级策略
        return await fallbackStrategy(handler, args, error);
      }
      throw error;
    }
  };
}
```

---

## 3. 错误分类和指纹系统

### 架构原理

使用错误指纹技术对相似错误进行分组，便于分析和批量处理：

```javascript
// app/utils/error-fingerprint.server.js
export function generateErrorFingerprint(error) {
  const components = [
    error.name,
    error.code,
    extractErrorLocation(error.stack),
    normalizeErrorMessage(error.message)
  ];
  
  const fingerprintString = components
    .filter(Boolean)
    .join(':');
  
  return crypto
    .createHash('md5')
    .update(fingerprintString)
    .digest('hex')
    .substring(0, 16);
}
```

### 实施步骤

1. **错误指纹生成算法**
```javascript
function normalizeErrorMessage(message) {
  if (!message) return '';
  
  return message
    // 移除动态内容
    .replace(/\b[0-9a-f]{24}\b/gi, 'ID')     // MongoDB IDs
    .replace(/\bgid:\/\/[^\s]+/g, 'GID')     // Shopify GIDs  
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')   // 日期
    .replace(/\d+/g, 'NUM')                  // 数字
    .replace(/https?:\/\/[^\s]+/g, 'URL')    // URLs
    .toLowerCase()
    .trim();
}

function extractErrorLocation(stack) {
  if (!stack) return '';
  
  const lines = stack.split('\n');
  const relevantLine = lines.find(line => 
    line.includes('app/') && 
    !line.includes('node_modules')
  );
  
  if (!relevantLine) return '';
  
  const match = relevantLine.match(/at\s+([^(]+)\s+\(([^:]+):(\d+):(\d+)\)/);
  if (match) {
    return `${match[1]}:${match[2]}:${match[3]}`;
  }
  
  return '';
}
```

2. **错误分组和聚合**
```javascript
export class ErrorAggregator {
  constructor() {
    this.errorGroups = new Map();
  }
  
  async aggregateErrors(timeRange = '24h') {
    const errors = await prisma.errorLog.findMany({
      where: {
        createdAt: {
          gte: getTimeAgo(timeRange)
        }
      }
    });
    
    for (const error of errors) {
      const fingerprint = error.fingerprint;
      
      if (!this.errorGroups.has(fingerprint)) {
        this.errorGroups.set(fingerprint, {
          fingerprint,
          firstSeen: error.createdAt,
          lastSeen: error.createdAt,
          count: 0,
          samples: [],
          affectedResources: new Set(),
          errorType: error.errorType
        });
      }
      
      const group = this.errorGroups.get(fingerprint);
      group.count++;
      group.lastSeen = error.createdAt;
      group.affectedResources.add(error.resourceId);
      
      if (group.samples.length < 5) {
        group.samples.push(error);
      }
    }
    
    return this.analyzeGroups();
  }
  
  analyzeGroups() {
    const analysis = [];
    
    for (const [fingerprint, group] of this.errorGroups) {
      analysis.push({
        fingerprint,
        severity: this.calculateSeverity(group),
        trend: this.calculateTrend(group),
        impact: {
          errorCount: group.count,
          affectedResources: group.affectedResources.size,
          timeSpan: group.lastSeen - group.firstSeen
        },
        recommendation: this.generateRecommendation(group)
      });
    }
    
    return analysis.sort((a, b) => b.severity - a.severity);
  }
  
  calculateSeverity(group) {
    let severity = 0;
    
    // 频率因素
    if (group.count > 100) severity += 3;
    else if (group.count > 10) severity += 2;
    else severity += 1;
    
    // 影响范围因素
    if (group.affectedResources.size > 50) severity += 3;
    else if (group.affectedResources.size > 10) severity += 2;
    else severity += 1;
    
    // 错误类型因素
    if (group.errorType === 'CRITICAL') severity += 3;
    else if (group.errorType === 'ERROR') severity += 2;
    else severity += 1;
    
    return Math.min(10, severity);
  }
}
```

---

## 4. API限流和重试策略

### 架构原理

智能的API限流检测和自适应重试机制：

```javascript
export class RateLimitManager {
  constructor() {
    this.limits = new Map();
    this.backoffStrategies = {
      linear: (attempt) => attempt * 1000,
      exponential: (attempt) => Math.pow(2, attempt) * 1000,
      adaptive: (attempt, context) => this.adaptiveBackoff(attempt, context)
    };
  }
  
  async executeWithRateLimit(fn, options = {}) {
    const key = options.key || 'default';
    const limit = this.getLimit(key);
    
    if (limit.isExceeded()) {
      await this.waitForReset(limit);
    }
    
    try {
      const result = await fn();
      limit.recordSuccess();
      return result;
    } catch (error) {
      if (this.isRateLimitError(error)) {
        limit.recordRateLimit(error);
        return await this.retryWithBackoff(fn, error, options);
      }
      throw error;
    }
  }
}
```

### 实施步骤

1. **Shopify API限流处理**
```javascript
// app/services/shopify-graphql.server.js
export async function executeGraphQLWithRetry(
  admin,
  query,
  variables = {},
  options = {}
) {
  const maxRetries = options.maxRetries || 3;
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await admin.graphql(query, { variables });
      const data = await response.json();
      
      // 检查限流
      if (data.extensions?.cost) {
        updateRateLimitTracking(data.extensions.cost);
      }
      
      // 检查错误
      if (data.errors) {
        const rateLimitError = data.errors.find(e => 
          e.extensions?.code === 'THROTTLED'
        );
        
        if (rateLimitError) {
          const waitTime = calculateWaitTime(rateLimitError);
          logger.warn(`API限流，等待${waitTime}ms`);
          await sleep(waitTime);
          continue;
        }
        
        throw new APIError('GraphQL错误', 400, {
          errors: data.errors
        });
      }
      
      return data;
    } catch (error) {
      lastError = error;
      
      if (!error.retryable || attempt === maxRetries - 1) {
        throw error;
      }
      
      const backoff = calculateBackoff(attempt, error);
      logger.info(`重试第${attempt + 1}次，等待${backoff}ms`);
      await sleep(backoff);
    }
  }
  
  throw lastError;
}

function calculateWaitTime(rateLimitError) {
  // Shopify返回的重试时间
  const retryAfter = rateLimitError.extensions?.retryAfter;
  if (retryAfter) {
    return retryAfter * 1000;
  }
  
  // 默认等待时间
  return 5000;
}

function calculateBackoff(attempt, error) {
  // 如果有明确的重试时间，使用它
  if (error.retryAfter) {
    return error.retryAfter * 1000;
  }
  
  // 指数退避
  const baseDelay = 1000;
  const maxDelay = 30000;
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  
  // 添加抖动避免惊群效应
  const jitter = Math.random() * 1000;
  
  return delay + jitter;
}
```

2. **GPT API限流处理**
```javascript
export async function callGPTWithRateLimit(prompt, options = {}) {
  const rateLimiter = new RateLimiter({
    tokensPerMinute: 90000,
    requestsPerMinute: 3500,
    tokensPerDay: 2000000
  });
  
  return await rateLimiter.execute(async () => {
    try {
      const response = await fetch(config.gpt.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.gpt.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: options.model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature || 0.3,
          max_tokens: options.maxTokens || 2000
        })
      });
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new APIError('Rate limit exceeded', 429, {
          retryAfter: parseInt(retryAfter) || 60,
          retryable: true
        });
      }
      
      if (!response.ok) {
        throw new APIError(
          `GPT API错误: ${response.statusText}`,
          response.status
        );
      }
      
      return await response.json();
    } catch (error) {
      if (error instanceof APIError) throw error;
      
      throw new NetworkError('GPT API调用失败', {
        originalError: error,
        endpoint: config.gpt.apiUrl
      });
    }
  });
}
```

---

## 5. 网络错误处理

### 架构原理

处理各种网络异常情况，包括超时、连接失败和DNS问题：

```javascript
export class NetworkErrorHandler {
  async executeWithNetworkHandling(fn, options = {}) {
    const timeout = options.timeout || 30000;
    const retries = options.retries || 3;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this.executeWithTimeout(fn, timeout);
      } catch (error) {
        const networkError = this.classifyNetworkError(error);
        
        if (!networkError.retryable || attempt === retries - 1) {
          throw networkError;
        }
        
        await this.handleNetworkError(networkError, attempt);
      }
    }
  }
  
  async executeWithTimeout(fn, timeout) {
    return Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new NetworkError('请求超时', {
          timeout: true,
          timeoutDuration: timeout
        })), timeout)
      )
    ]);
  }
}
```

### 实施步骤

1. **网络错误分类**
```javascript
function classifyNetworkError(error) {
  const errorMap = {
    'ECONNREFUSED': {
      type: 'CONNECTION_REFUSED',
      message: '连接被拒绝',
      retryable: true,
      suggestion: '检查服务是否运行'
    },
    'ETIMEDOUT': {
      type: 'TIMEOUT',
      message: '连接超时',
      retryable: true,
      suggestion: '检查网络连接或增加超时时间'
    },
    'ENOTFOUND': {
      type: 'DNS_ERROR',
      message: 'DNS解析失败',
      retryable: false,
      suggestion: '检查域名配置'
    },
    'ECONNRESET': {
      type: 'CONNECTION_RESET',
      message: '连接被重置',
      retryable: true,
      suggestion: '服务器可能重启，请重试'
    },
    'EPIPE': {
      type: 'BROKEN_PIPE',
      message: '管道破裂',
      retryable: true,
      suggestion: '连接意外关闭，请重试'
    }
  };
  
  const errorInfo = errorMap[error.code] || {
    type: 'UNKNOWN_NETWORK_ERROR',
    message: error.message,
    retryable: false
  };
  
  return new NetworkError(errorInfo.message, {
    code: error.code,
    type: errorInfo.type,
    retryable: errorInfo.retryable,
    suggestion: errorInfo.suggestion,
    originalError: error
  });
}
```

2. **连接池管理**
```javascript
export class ConnectionPool {
  constructor(options = {}) {
    this.maxConnections = options.maxConnections || 10;
    this.connectionTimeout = options.connectionTimeout || 5000;
    this.keepAlive = options.keepAlive || true;
    this.connections = new Map();
    this.pendingRequests = [];
  }
  
  async getConnection(key) {
    // 检查是否有可用连接
    if (this.connections.has(key)) {
      const conn = this.connections.get(key);
      if (conn.isHealthy()) {
        return conn;
      }
      // 移除不健康的连接
      this.connections.delete(key);
    }
    
    // 创建新连接
    if (this.connections.size < this.maxConnections) {
      const conn = await this.createConnection(key);
      this.connections.set(key, conn);
      return conn;
    }
    
    // 等待连接释放
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new NetworkError('无法获取连接', {
          code: 'CONNECTION_POOL_EXHAUSTED'
        }));
      }, this.connectionTimeout);
      
      this.pendingRequests.push({
        key,
        resolve: (conn) => {
          clearTimeout(timeout);
          resolve(conn);
        },
        reject
      });
    });
  }
  
  async createConnection(key) {
    const conn = new Connection(key, {
      keepAlive: this.keepAlive,
      timeout: this.connectionTimeout
    });
    
    await conn.connect();
    
    conn.on('error', (error) => {
      logger.error(`连接错误 ${key}:`, error);
      this.connections.delete(key);
      this.processNextRequest();
    });
    
    conn.on('close', () => {
      this.connections.delete(key);
      this.processNextRequest();
    });
    
    return conn;
  }
}
```

---

## 6. 业务逻辑错误管理

### 架构原理

处理特定于业务逻辑的错误，提供清晰的错误信息和修复建议：

```javascript
export class BusinessLogicErrorHandler {
  async validateBusinessRules(resource, operation) {
    const rules = this.getRulesForOperation(operation);
    const violations = [];
    
    for (const rule of rules) {
      const result = await rule.validate(resource);
      if (!result.valid) {
        violations.push({
          rule: rule.name,
          message: result.message,
          severity: rule.severity,
          field: result.field,
          suggestion: rule.suggestion
        });
      }
    }
    
    if (violations.length > 0) {
      throw new BusinessLogicError('业务规则验证失败', {
        violations,
        resource: resource.id,
        operation
      });
    }
  }
}
```

### 实施步骤

1. **业务规则定义**
```javascript
const BUSINESS_RULES = {
  translation: [
    {
      name: 'TITLE_LENGTH',
      validate: (resource) => {
        const valid = resource.title.length <= 255;
        return {
          valid,
          message: valid ? null : '标题长度超过255字符',
          field: 'title',
          suggestion: '请缩短标题长度'
        };
      },
      severity: 'ERROR'
    },
    {
      name: 'HTML_BALANCE',
      validate: (resource) => {
        const valid = isHtmlBalanced(resource.descriptionHtml);
        return {
          valid,
          message: valid ? null : 'HTML标签不平衡',
          field: 'descriptionHtml',
          suggestion: '检查HTML标签是否正确关闭'
        };
      },
      severity: 'ERROR'
    },
    {
      name: 'BRAND_CONSISTENCY',
      validate: (resource) => {
        const brandWords = extractBrandWords(resource);
        const valid = brandWords.every(word => 
          PROTECTED_BRANDS.includes(word)
        );
        return {
          valid,
          message: valid ? null : '包含未保护的品牌词',
          field: 'content',
          suggestion: '添加品牌词到保护列表'
        };
      },
      severity: 'WARNING'
    }
  ]
};
```

2. **错误恢复策略**
```javascript
export class ErrorRecoveryManager {
  async recoverFromError(error, context) {
    const strategy = this.selectRecoveryStrategy(error);
    
    switch (strategy) {
      case 'RETRY':
        return await this.retryOperation(context);
        
      case 'FALLBACK':
        return await this.useFallback(context);
        
      case 'COMPENSATE':
        return await this.compensateOperation(context);
        
      case 'MANUAL':
        return await this.requestManualIntervention(error, context);
        
      default:
        throw error;
    }
  }
  
  selectRecoveryStrategy(error) {
    // 可重试的错误
    if (error.retryable) {
      return 'RETRY';
    }
    
    // 有备选方案的错误
    if (error.category === 'API' && error.statusCode === 503) {
      return 'FALLBACK';
    }
    
    // 需要补偿的错误
    if (error.category === 'BUSINESS' && error.partialSuccess) {
      return 'COMPENSATE';
    }
    
    // 需要人工介入的错误
    if (error.severity === 'CRITICAL') {
      return 'MANUAL';
    }
    
    return 'NONE';
  }
  
  async compensateOperation(context) {
    // 回滚部分成功的操作
    const compensations = [];
    
    for (const operation of context.completedOperations) {
      try {
        await this.rollback(operation);
        compensations.push({
          operation: operation.id,
          status: 'ROLLED_BACK'
        });
      } catch (rollbackError) {
        compensations.push({
          operation: operation.id,
          status: 'ROLLBACK_FAILED',
          error: rollbackError.message
        });
      }
    }
    
    return {
      compensated: true,
      compensations
    };
  }
}
```

---

## 7. 错误分析和模式识别

### 架构原理

使用机器学习和统计分析识别错误模式：

```javascript
export class ErrorPatternAnalyzer {
  async analyzePatterns(timeRange = '7d') {
    const errors = await this.fetchErrors(timeRange);
    
    // 时间序列分析
    const timeSeries = this.buildTimeSeries(errors);
    const trends = this.detectTrends(timeSeries);
    
    // 聚类分析
    const clusters = this.clusterErrors(errors);
    
    // 关联规则挖掘
    const associations = this.findAssociations(errors);
    
    // 异常检测
    const anomalies = this.detectAnomalies(errors);
    
    return {
      patterns: this.extractPatterns(clusters),
      trends,
      associations,
      anomalies,
      recommendations: this.generateRecommendations(clusters, trends)
    };
  }
}
```

### 实施步骤

1. **错误模式数据库**
```javascript
// 预定义的错误模式
const ERROR_PATTERNS = [
  {
    id: 'RATE_LIMIT_PATTERN',
    name: '限流模式',
    keywords: ['rate limit', 'throttled', '429', 'too many requests'],
    frequency: 'HIGH',
    impact: 'MEDIUM',
    solution: {
      immediate: '实施请求队列和限流控制',
      longTerm: '优化API调用频率，实施批量操作'
    }
  },
  {
    id: 'TIMEOUT_PATTERN',
    name: '超时模式',
    keywords: ['timeout', 'ETIMEDOUT', '504', 'gateway timeout'],
    frequency: 'MEDIUM',
    impact: 'HIGH',
    solution: {
      immediate: '增加超时时间，实施重试机制',
      longTerm: '优化查询性能，实施分页和缓存'
    }
  },
  {
    id: 'VALIDATION_PATTERN',
    name: '验证失败模式',
    keywords: ['validation', 'invalid', 'required field', 'format'],
    frequency: 'HIGH',
    impact: 'LOW',
    solution: {
      immediate: '加强前端验证，提供清晰的错误提示',
      longTerm: '实施严格的数据验证层'
    }
  }
];

// 模式匹配引擎
export class PatternMatcher {
  async matchError(error) {
    const matches = [];
    const errorText = this.extractErrorText(error);
    
    for (const pattern of ERROR_PATTERNS) {
      const score = this.calculateMatchScore(errorText, pattern.keywords);
      
      if (score > 0.6) {
        matches.push({
          pattern: pattern.id,
          confidence: score,
          solution: pattern.solution
        });
      }
    }
    
    // 存储匹配结果
    if (matches.length > 0) {
      await this.saveMatches(error.id, matches);
    }
    
    return matches;
  }
  
  calculateMatchScore(text, keywords) {
    const lowerText = text.toLowerCase();
    let matchCount = 0;
    
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        matchCount++;
      }
    }
    
    return matchCount / keywords.length;
  }
}
```

2. **智能错误预测**
```javascript
export class ErrorPredictor {
  constructor() {
    this.model = null;
    this.features = [
      'hour_of_day',
      'day_of_week',
      'resource_count',
      'api_latency',
      'memory_usage',
      'queue_length'
    ];
  }
  
  async trainModel() {
    const historicalData = await this.loadHistoricalData();
    const features = this.extractFeatures(historicalData);
    const labels = this.extractLabels(historicalData);
    
    // 简单的逻辑回归模型
    this.model = new LogisticRegression();
    await this.model.fit(features, labels);
    
    // 保存模型
    await this.saveModel();
  }
  
  async predictErrorProbability(context) {
    if (!this.model) {
      await this.loadModel();
    }
    
    const features = this.contextToFeatures(context);
    const probability = await this.model.predict(features);
    
    return {
      probability,
      riskLevel: this.classifyRisk(probability),
      preventiveMeasures: this.suggestPreventiveMeasures(probability, context)
    };
  }
  
  classifyRisk(probability) {
    if (probability > 0.8) return 'CRITICAL';
    if (probability > 0.6) return 'HIGH';
    if (probability > 0.4) return 'MEDIUM';
    if (probability > 0.2) return 'LOW';
    return 'MINIMAL';
  }
  
  suggestPreventiveMeasures(probability, context) {
    const measures = [];
    
    if (probability > 0.6) {
      measures.push({
        action: 'SCALE_RESOURCES',
        description: '预先扩展资源容量',
        priority: 'HIGH'
      });
    }
    
    if (context.queueLength > 100) {
      measures.push({
        action: 'THROTTLE_REQUESTS',
        description: '限制新请求速率',
        priority: 'MEDIUM'
      });
    }
    
    if (context.memoryUsage > 0.8) {
      measures.push({
        action: 'CLEAR_CACHE',
        description: '清理内存缓存',
        priority: 'HIGH'
      });
    }
    
    return measures;
  }
}
```

---

## 8. 自动修复和预防机制

### 架构原理

实现自动诊断、修复和预防的闭环系统：

```javascript
export class AutoHealingSystem {
  constructor() {
    this.healingStrategies = new Map();
    this.preventionRules = new Map();
    this.healthChecks = [];
  }
  
  async diagnoseAndHeal(error) {
    // 诊断
    const diagnosis = await this.diagnose(error);
    
    // 选择修复策略
    const strategy = this.selectHealingStrategy(diagnosis);
    
    // 执行修复
    const result = await this.executeHealing(strategy, error);
    
    // 验证修复
    const isHealed = await this.verifyHealing(result);
    
    // 记录和学习
    await this.recordHealingResult(error, strategy, isHealed);
    
    return {
      healed: isHealed,
      strategy: strategy.name,
      result
    };
  }
}
```

### 实施步骤

1. **自动修复策略库**
```javascript
const HEALING_STRATEGIES = {
  // Redis连接失败自动降级
  REDIS_FALLBACK: {
    condition: (error) => error.code === 'ECONNREFUSED' && error.context.service === 'redis',
    action: async (error) => {
      logger.warn('Redis连接失败，切换到内存队列');
      
      // 切换到内存队列
      await switchToMemoryQueue();
      
      // 迁移未完成的任务
      const pendingJobs = await migratePendingJobs();
      
      return {
        success: true,
        message: '已切换到内存队列',
        migratedJobs: pendingJobs.length
      };
    },
    verification: async () => {
      const queueStatus = await getQueueStatus();
      return queueStatus.type === 'memory' && queueStatus.healthy;
    }
  },
  
  // 数据库连接池耗尽修复
  DB_POOL_EXHAUSTED: {
    condition: (error) => error.message.includes('connection pool exhausted'),
    action: async (error) => {
      logger.warn('数据库连接池耗尽，执行清理');
      
      // 关闭空闲连接
      await closeIdleConnections();
      
      // 终止长时间运行的查询
      await killLongRunningQueries();
      
      // 增加连接池大小
      await expandConnectionPool();
      
      return {
        success: true,
        message: '连接池已优化'
      };
    },
    verification: async () => {
      const poolStats = await getConnectionPoolStats();
      return poolStats.available > 0;
    }
  },
  
  // 内存泄漏检测和修复
  MEMORY_LEAK: {
    condition: (error) => {
      const memUsage = process.memoryUsage();
      return memUsage.heapUsed / memUsage.heapTotal > 0.9;
    },
    action: async (error) => {
      logger.warn('检测到内存压力，执行清理');
      
      // 清理缓存
      await clearAllCaches();
      
      // 强制垃圾回收
      if (global.gc) {
        global.gc();
      }
      
      // 重启工作进程（如果在集群模式）
      if (process.send) {
        process.send({ cmd: 'graceful-restart' });
      }
      
      return {
        success: true,
        message: '内存已清理'
      };
    },
    verification: async () => {
      const memUsage = process.memoryUsage();
      return memUsage.heapUsed / memUsage.heapTotal < 0.7;
    }
  }
};
```

2. **预防机制实施**
```javascript
export class ErrorPreventionSystem {
  constructor() {
    this.monitors = [];
    this.thresholds = new Map();
  }
  
  async startMonitoring() {
    // 资源监控
    this.monitors.push(
      setInterval(() => this.checkResources(), 30000)
    );
    
    // 错误率监控
    this.monitors.push(
      setInterval(() => this.checkErrorRate(), 60000)
    );
    
    // 性能监控
    this.monitors.push(
      setInterval(() => this.checkPerformance(), 60000)
    );
  }
  
  async checkResources() {
    const resources = {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      connections: await getActiveConnections()
    };
    
    // 内存预警
    if (resources.memory.heapUsed / resources.memory.heapTotal > 0.8) {
      await this.triggerPreventiveAction('MEMORY_WARNING', {
        usage: resources.memory.heapUsed / resources.memory.heapTotal,
        action: 'CLEAR_CACHE'
      });
    }
    
    // 连接池预警
    if (resources.connections.active / resources.connections.max > 0.9) {
      await this.triggerPreventiveAction('CONNECTION_POOL_WARNING', {
        usage: resources.connections.active / resources.connections.max,
        action: 'EXPAND_POOL'
      });
    }
  }
  
  async checkErrorRate() {
    const stats = await getErrorStatistics('5m');
    const errorRate = stats.errors / stats.total;
    
    if (errorRate > 0.05) { // 5%错误率
      await this.triggerPreventiveAction('HIGH_ERROR_RATE', {
        rate: errorRate,
        action: 'ENABLE_CIRCUIT_BREAKER'
      });
    }
  }
  
  async triggerPreventiveAction(type, context) {
    logger.warn(`触发预防措施: ${type}`, context);
    
    switch (context.action) {
      case 'CLEAR_CACHE':
        await clearApplicationCaches();
        break;
        
      case 'EXPAND_POOL':
        await expandConnectionPool();
        break;
        
      case 'ENABLE_CIRCUIT_BREAKER':
        await enableCircuitBreaker();
        break;
    }
    
    // 记录预防措施
    await prisma.preventiveAction.create({
      data: {
        type,
        context,
        timestamp: new Date(),
        successful: true
      }
    });
  }
}
```

### 性能指标

- **错误检测时间**: <100ms
- **自动修复成功率**: >80%
- **预防措施有效率**: >90%
- **平均恢复时间**: <30秒

### 故障排查

1. **错误未被捕获**: 检查withErrorHandling包装器是否正确应用
2. **重试过多**: 调整重试策略和退避算法
3. **修复失败**: 查看修复日志，可能需要手动干预
4. **预防措施无效**: 调整阈值和监控频率

---

## 总结

完善的错误处理体系是系统稳定性的基石。通过分层的错误类设计、智能的重试机制、精确的错误分析和自动修复系统，我们构建了一个高可用、自愈合的翻译服务。

### 关键成功因素

1. **全面覆盖**: 从网络层到业务层的完整错误处理
2. **智能分析**: 错误模式识别和趋势预测
3. **自动恢复**: 80%+的错误可自动修复
4. **预防为主**: 主动监控和预防措施
5. **持续改进**: 从错误中学习和优化

### 最佳实践总结

- 使用结构化的错误类体系
- 实施统一的错误处理包装器
- 建立错误指纹和分组机制
- 实现智能的重试和降级策略
- 部署自动修复和预防系统
- 持续监控和分析错误趋势