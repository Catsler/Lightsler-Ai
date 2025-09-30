# Console.log 迁移任务清单

## 概述

系统中发现 92 处 `console.log` 直接调用，分布在 18 个文件中。采用**渐进式迁移**策略，在日常维护时逐步替换为统一的 logger 系统。

## 迁移策略

### 📋 原则
- **不进行批量替换** - 避免大规模重构风险
- **修改时迁移** - 在修改相关文件时顺带处理
- **新代码强制** - 新功能必须使用 logger
- **保持兼容** - 不影响现有功能

### 🎯 迁移优先级

#### P0 - 高频API路由（优先迁移）
这些文件经常被修改，应优先迁移：

1. **api.translate.jsx** (6处) - 核心翻译API
2. **api.batch-publish.jsx** (8处) - 批量发布API
3. **api.sync-translations.jsx** (4处) - 同步API
4. **api.publish.jsx** (5处) - 发布API

#### P1 - 中频文件（按需迁移）
```
api.translate-product-metafields.jsx (16处)
api.translate-queue.jsx (1处)
api.scan-resources.jsx (3处)
webhooks.app.uninstalled.jsx (1处)
webhooks.app.scopes_update.jsx (1处)
```

#### P2 - 低频文件（维护时迁移）
```
app.resource.$type.$id.jsx (3处)
app.theme.detail.$resourceId.jsx (8处)
components/ThemeJsonTreeView.example.jsx (1处)
components/ThemeTranslationCompare.example.jsx (5处)
utils/storage.client.js (11处)
utils/ui-helpers.js (1处)
config/resource-categories.js (3处)
utils/use-disable-sw-in-dev.js (1处)
```

## 详细迁移清单

### 🔥 api.translate.jsx (6处)
**优先级**: P0
**上次修改**: 经常
**位置**:
```javascript
Line 89:  console.log('翻译请求详情:', {...})
Line 106: console.log('清除缓存：删除现有翻译记录')
Line 130: console.log(`已清除资源 ${targetId} 的 ${targetLanguage} 翻译缓存`)
Line 175: console.log(`使用Theme资源翻译函数处理: ${resource.resourceType}`)
Line 185: console.log(`ℹ️ 跳过资源翻译（内容未变化）: ${resource.title}`)
Line 202: console.log(`✅ 翻译完成，状态设为pending等待发布: ${resource.title} -> ${targetLanguage}`)
```

**迁移示例**:
```javascript
// 替换前
console.log('翻译请求详情:', {
  targetLanguage,
  selectedResourceIds: resourceIds,
  foundResources: resourcesToTranslate.map(r => ({ id: r.id, title: r.title, status: r.status })),
  clearCache
});

// 替换后
import { apiLogger } from '../utils/logger.server.js';

apiLogger.info('翻译请求详情', {
  targetLanguage,
  selectedResourceIds: resourceIds,
  foundResourcesCount: resourcesToTranslate.length,
  clearCache,
  shopId: shop.id
});
```

### 🔥 api.batch-publish.jsx (8处)
**优先级**: P0
**上次修改**: 经常
**建议**: 导入 `apiLogger`，重点记录批量操作的进度和结果

### 🔥 api.sync-translations.jsx (4处)
**优先级**: P0
**上次修改**: 经常
**建议**: 使用结构化日志记录同步状态和错误

### 📊 详细统计

| 文件 | console.log数量 | 优先级 | 建议的logger |
|------|----------------|--------|-------------|
| api.translate.jsx | 6 | P0 | apiLogger |
| api.batch-publish.jsx | 8 | P0 | apiLogger |
| api.sync-translations.jsx | 4 | P0 | apiLogger |
| api.publish.jsx | 5 | P0 | apiLogger |
| api.translate-product-metafields.jsx | 16 | P1 | translationLogger |
| api.translate-queue.jsx | 1 | P1 | apiLogger |
| api.scan-resources.jsx | 3 | P1 | apiLogger |
| app.resource.$type.$id.jsx | 3 | P2 | logger |
| app.theme.detail.$resourceId.jsx | 8 | P2 | logger |
| utils/storage.client.js | 11 | P2 | logger (client) |

## 迁移模板

### API路由迁移模板

```javascript
// 1. 导入logger
import { apiLogger } from '../utils/logger.server.js';

// 2. 替换console.log
// 替换前
console.log('操作开始:', param1, param2);

// 替换后
apiLogger.info('操作开始', {
  param1,
  param2,
  shopId: session?.shop,
  requestId: crypto.randomUUID()
});

// 3. 错误日志
// 替换前
console.error('操作失败:', error);

// 替换后
apiLogger.error('操作失败', {
  error: error.message,
  stack: error.stack,
  context: { param1, param2 }
});
```

### 翻译服务迁移模板

```javascript
// 1. 导入专用logger
import { createTranslationLogger } from '../utils/logger.server.js';
const translationLogger = createTranslationLogger('TRANSLATION');

// 2. 使用专用方法
// 替换前
console.log('翻译完成:', originalText, translatedText);

// 替换后
translationLogger.logTranslationSuccess(originalText, translatedText, {
  targetLanguage,
  resourceId,
  processingTime: endTime - startTime
});
```

## 检查清单

### 迁移前检查
- [ ] 确认文件需要修改（不是单纯为了迁移）
- [ ] 了解原有 console.log 的用途
- [ ] 选择合适的 logger 实例
- [ ] 确定合适的日志级别

### 迁移中检查
- [ ] 保持原有信息完整性
- [ ] 使用结构化数据格式
- [ ] 添加必要的上下文字段
- [ ] 避免敏感信息泄露

### 迁移后检查
- [ ] 验证日志输出正常
- [ ] 确认构建无错误
- [ ] 测试相关功能正常
- [ ] 更新此文档的完成状态

## 进度追踪

### ✅ 已完成
- 无（等待开始）

### 🚧 进行中
- 无

### 📋 待办
- [ ] api.translate.jsx (6处)
- [ ] api.batch-publish.jsx (8处)
- [ ] api.sync-translations.jsx (4处)
- [ ] api.publish.jsx (5处)
- [ ] api.translate-product-metafields.jsx (16处)
- [ ] 其他 13 个文件 (53处)

## 注意事项

### 🚨 风险控制
- **不要**为了迁移而修改文件
- **确保**每次修改都有实际的业务价值
- **测试**每次迁移后的功能正常性
- **记录**迁移过程中发现的问题

### 💡 最佳实践
- 迁移时同步改进日志内容
- 添加有用的上下文信息
- 统一同一文件内的日志风格
- 及时更新文档记录进度

### 🔍 质量标准
- 日志信息结构化
- 包含足够上下文
- 使用合适的级别
- 避免敏感信息

---

## 更新记录
- 2025-09-29: 创建迁移清单，标记92处console.log使用
- 待更新: 记录具体迁移进展