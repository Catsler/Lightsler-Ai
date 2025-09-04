# Shopify Webhook处理指南

## 文档信息
- **版本**：Shopify GraphQL Admin API 2025-07
- **最后更新**：2025-09-04
- **适用**：多语言翻译应用

## 概述

本文档详细阐述Shopify Webhook事件处理的最佳实践，重点关注多语言翻译应用的特定场景。

## 支持的Webhook事件类型

### 1. 产品相关事件
```javascript
// 支持的产品事件
const PRODUCT_EVENTS = [
  'products/create',
  'products/update', 
  'products/delete',
  'products/draft/create',
  'products/draft/update'
]
```

### 2. 集合事件
```javascript
const COLLECTION_EVENTS = [
  'collections/create',
  'collections/update',
  'collections/delete'
]
```

### 3. 页面事件
```javascript
const PAGE_EVENTS = [
  'pages/create', 
  'pages/update',
  'pages/delete'
]
```

### 4. 主题事件
```javascript
const THEME_EVENTS = [
  'themes/publish',
  'themes/create', 
  'themes/update',
  'themes/delete'
]
```

### 5. 其他重要事件
```javascript
const OTHER_EVENTS = [
  'app/uninstalled',
  'shop/update',
  'locales/create',
  'locales/update',
  'articles/create',
  'articles/update'
]
```

## Webhook处理标准

### 验证与安全

```javascript
function verifyWebhook(req, secret) {
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const body = req.rawBody;
  
  const generatedHash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');
  
  return generatedHash === hmac;
}
```

### 幂等性处理

```javascript
async function processWebhook(event) {
  // 检查是否已处理
  const existingEvent = await EventLog.findOne({
    shopifyId: event.id,
    topic: event.topic
  });
  
  if (existingEvent) {
    console.log('重复事件，已跳过');
    return;
  }
  
  // 处理事件
  try {
    await handleEventByType(event);
    
    // 记录事件
    await EventLog.create({
      shopifyId: event.id,
      topic: event.topic,
      processedAt: new Date()
    });
  } catch (error) {
    // 错误处理与重试机制
    await ErrorLog.create({
      eventId: event.id,
      error: error.message,
      retryCount: 0
    });
  }
}
```

## 错误处理策略

### 错误分类

1. **瞬时错误**
   - 网络超时
   - 服务暂时不可用
   - 自动重试（最多3次）

2. **永久性错误**
   - 权限不足
   - 数据验证失败
   - 记录详细日志，人工干预

### 重试机制

```javascript
async function retryWebhookProcessing(event, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await processWebhook(event);
      return true; // 处理成功
    } catch (error) {
      if (isPermanentError(error)) {
        await logPermanentError(event, error);
        return false;
      }
      
      // 指数退避
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  await logFinalFailure(event);
  return false;
}
```

## Webhook事件映射

```javascript
const WEBHOOK_HANDLERS = {
  'products/update': handleProductUpdate,
  'products/create': handleProductCreate,
  'collections/update': handleCollectionUpdate,
  'themes/publish': handleThemePublish,
  'locales/create': handleLocaleCreation
};

async function routeWebhookEvent(event) {
  const handler = WEBHOOK_HANDLERS[event.topic];
  
  if (handler) {
    await handler(event);
  } else {
    console.warn(`未注册的Webhook事件: ${event.topic}`);
  }
}
```

## 性能与限制

- **最大处理时间**：5秒
- **重试间隔**：指数退避（1s, 2s, 4s）
- **并发Webhook**：每秒最多25个
- **事件保留**：成功事件保留7天，失败事件保留30天

## Webhook监控

```javascript
class WebhookMonitor {
  static async trackPerformance(event) {
    const startTime = Date.now();
    
    try {
      await processWebhook(event);
    } finally {
      const duration = Date.now() - startTime;
      
      await PerformanceLog.create({
        topic: event.topic,
        duration,
        status: 'success'
      });
    }
  }
  
  static async analyzeErrorPatterns() {
    const recentErrors = await ErrorLog.findRecent();
    const errorAnalysis = classifyErrors(recentErrors);
    
    if (errorAnalysis.criticalIssues > 0) {
      await notifyAdministrator(errorAnalysis);
    }
  }
}
```

## 建议实践

1. 实现强大的幂等性处理
2. 使用指数退避重试策略
3. 详细记录所有事件
4. 快速响应，避免长时间阻塞
5. 持续监控和分析错误模式