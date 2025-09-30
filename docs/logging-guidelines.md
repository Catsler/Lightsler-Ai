# 日志使用规范

## 概述

本项目使用统一的日志系统，基于 `pino` 实现，支持控制台输出和文件持久化。所有日志输出应通过统一的 logger 实例，避免直接使用 `console.*` 方法。

## 环境配置

### 必要环境变量

```bash
# 启用文件输出到 logs/app.log
LOGGING_FILE_ENABLED=true

# 日志级别：error, warn, info, debug
LOGGING_LEVEL=info

# 启用持久化 logger（数据库 + 内存）
LOGGING_ENABLE_PERSISTENT_LOGGER=true

# 持久化级别：ERROR, WARN, INFO, DEBUG
LOGGING_PERSISTENCE_LEVEL=INFO

# 日志保留天数（可选）
LOGGING_RETENTION_DAYS={"ERROR":30,"WARN":15,"INFO":7,"DEBUG":3}
```

### 文件输出位置

- **控制台**：实时彩色输出，用于开发调试
- **文件**：`logs/app.log`，用于生产环境和历史追溯
- **数据库**：结构化存储，用于统计分析

## Logger 使用

### 导入方式

```javascript
// 基础 logger
import { logger } from '../utils/logger.server.js';

// 专用 logger
import { apiLogger, performanceLogger, validationLogger } from '../utils/logger.server.js';

// 翻译专用 logger
import { createTranslationLogger } from '../utils/logger.server.js';
const translationLogger = createTranslationLogger('TRANSLATION');
```

### 日志级别

#### ERROR (level: 0)
用于系统错误、异常情况，需要立即关注

```javascript
logger.error('数据库连接失败', {
  error: error.message,
  stack: error.stack,
  connectionString: 'postgresql://...',
  retryCount: 3
});
```

#### WARN (level: 1)
用于警告信息，可能影响功能但不致命

```javascript
logger.warn('API 调用超时，使用缓存数据', {
  api: '/api/translate',
  timeout: 5000,
  fallbackUsed: true
});
```

#### INFO (level: 2)
用于正常业务流程记录

```javascript
logger.info('翻译任务完成', {
  resourceId: 'res_123',
  targetLanguage: 'zh-CN',
  duration: 1500,
  wordCount: 245
});
```

#### DEBUG (level: 3)
用于详细调试信息，生产环境通常关闭

```javascript
logger.debug('缓存命中', {
  key: 'translation:res_123:zh-CN',
  ttl: 3600,
  size: '2.1KB'
});
```

## 结构化日志

### 推荐格式

```javascript
// ✅ 好的做法 - 结构化数据
logger.info('翻译请求处理', {
  shopId: 'shop123',
  resourceId: 'res_456',
  resourceType: 'PRODUCT',
  targetLanguage: 'zh-CN',
  textLength: 150,
  processingTime: 1200
});

// ❌ 避免的做法 - 字符串拼接
logger.info(`翻译请求处理: shop=${shopId}, resource=${resourceId}, lang=${targetLanguage}`);
```

### 上下文字段规范

常用的结构化字段：

```javascript
{
  // 业务上下文
  shopId: 'shop_identifier',
  resourceId: 'resource_identifier',
  resourceType: 'PRODUCT|PAGE|BLOG|COLLECTION',
  language: 'zh-CN',
  targetLanguage: 'zh-CN',

  // 性能指标
  duration: 1500,           // 毫秒
  textLength: 245,          // 字符数
  processingTime: 1200,     // 处理时间

  // 错误信息
  error: error.message,
  errorCode: 'TRANSLATION_FAILED',
  stack: error.stack,
  retryCount: 2,

  // 操作状态
  status: 'success|pending|failed',
  operation: 'translate|sync|publish'
}
```

## API 路由日志

### 使用 apiLogger

```javascript
import { apiLogger } from '../utils/logger.server.js';

export const action = createApiRoute(async ({ request, session, params }) => {
  apiLogger.info('翻译API请求开始', {
    method: request.method,
    shopDomain: session.shop,
    resourceIds: params.resourceIds,
    targetLanguage: params.language
  });

  try {
    const result = await translateResources(params);

    apiLogger.info('翻译API请求成功', {
      resourceCount: result.length,
      successCount: result.filter(r => r.success).length,
      duration: Date.now() - startTime
    });

    return json({ success: true, data: result });
  } catch (error) {
    apiLogger.error('翻译API请求失败', {
      error: error.message,
      stack: error.stack,
      requestParams: params
    });
    throw error;
  }
});
```

## 翻译服务日志

### 专用方法

```javascript
import { translationLogger } from '../utils/logger.server.js';

// 记录翻译开始
translationLogger.logTranslationStart(originalText, targetLang, {
  resourceId: 'res_123',
  strategy: 'gpt-4'
});

// 记录翻译成功
translationLogger.logTranslationSuccess(originalText, translatedText, {
  processingTime: 1500,
  tokenUsage: 150
});

// 记录翻译错误
translationLogger.logTranslationError(error, {
  resourceId: 'res_123',
  targetLanguage: 'zh-CN',
  retryCount: 2
});
```

## 性能日志

### 使用 performanceLogger

```javascript
import { performanceLogger } from '../utils/logger.server.js';

const startTime = Date.now();

try {
  const result = await heavyOperation();

  performanceLogger.info('操作完成', {
    operation: 'batch_translation',
    duration: Date.now() - startTime,
    resourceCount: 50,
    throughput: 50 / ((Date.now() - startTime) / 1000) // 每秒处理数
  });
} catch (error) {
  performanceLogger.warn('操作超时', {
    operation: 'batch_translation',
    duration: Date.now() - startTime,
    timeout: 30000
  });
}
```

## 错误处理日志

### 捕获和记录错误

```javascript
import { logger } from '../utils/logger.server.js';

try {
  await riskyOperation();
} catch (error) {
  // 记录详细错误信息
  logger.error('操作失败', {
    operation: 'sync_translations',
    error: error.message,
    stack: error.stack,
    context: {
      shopId: 'shop_123',
      resourceCount: 10,
      retryable: error.retryable || false
    }
  });

  // 决定是否重新抛出
  if (!error.retryable) {
    throw error;
  }
}
```

## 迁移指南

### 从 console.log 迁移

```javascript
// 替换前
console.log('翻译开始:', resourceId, targetLanguage);
console.error('翻译失败:', error);

// 替换后
logger.info('翻译开始', {
  resourceId,
  targetLanguage
});
logger.error('翻译失败', {
  error: error.message,
  resourceId,
  targetLanguage
});
```

### 批量替换策略

1. **不要**进行大规模批量替换
2. **修改文件时**顺带迁移该文件的日志
3. **新代码**强制使用 logger
4. **保持**向后兼容，渐进改进

## 日志查看

### 开发环境

```bash
# 实时查看所有日志
tail -f logs/app.log

# 只看错误日志
tail -f logs/app.log | jq 'select(.level==50)'

# 按关键词过滤
tail -f logs/app.log | grep "TRANSLATION"

# 高亮显示错误
tail -f logs/app.log | rg --line-buffered "ERROR" --color always
```

### 日志格式说明

```json
{
  "level": 30,                    // 30=INFO, 40=WARN, 50=ERROR
  "time": 1727598234567,         // Unix 时间戳
  "msg": "[TRANSLATION] 翻译完成", // 格式化消息
  "resourceId": "res_123",       // 业务字段
  "targetLanguage": "zh-CN",     // 业务字段
  "duration": 1500               // 业务字段
}
```

## 最佳实践

### DO ✅

- 使用结构化数据而非字符串拼接
- 包含足够的上下文信息
- 记录操作的开始和结束
- 错误时包含堆栈信息
- 性能敏感操作记录耗时

### DON'T ❌

- 直接使用 `console.*` 方法
- 记录敏感信息（密码、token）
- 在循环中过度记录日志
- 使用随意的日志级别
- 遗漏错误上下文信息

## 监控和告警

### 关键指标

- **错误率**：ERROR 级别日志频率
- **响应时间**：API 操作耗时分布
- **翻译质量**：失败重试次数
- **资源使用**：并发翻译任务数

### 告警设置

```bash
# 错误率告警
grep '"level":50' logs/app.log | wc -l

# 慢查询告警
jq 'select(.duration > 5000)' logs/app.log

# API 失败率
jq 'select(.operation == "translate" and .success == false)' logs/app.log
```

## 故障排查

### 常见问题

1. **日志文件未生成**
   - 检查 `LOGGING_FILE_ENABLED=true`
   - 确认 `logs/` 目录权限
   - 重启应用生效

2. **日志级别不正确**
   - 检查 `LOGGING_LEVEL` 设置
   - 确认环境变量加载
   - 验证 logger 配置

3. **性能影响**
   - 调整日志级别到 WARN
   - 使用异步日志写入
   - 定期轮转日志文件

### 调试技巧

```javascript
// 临时提升日志级别
process.env.LOGGING_LEVEL = 'debug';

// 强制刷新日志缓冲
import { forceFlushLogs } from '../services/log-persistence.server.js';
await forceFlushLogs();

// 获取内存日志
import { getInMemoryLogs } from '../services/log-persistence.server.js';
const recentLogs = getInMemoryLogs();
```