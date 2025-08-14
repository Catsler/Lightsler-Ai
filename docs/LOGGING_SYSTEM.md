# 翻译日志系统文档

## 概述

翻译日志系统提供了完整的日志记录、持久化存储和查询分析功能，帮助开发者监控翻译过程、追踪错误和优化系统性能。

## 系统架构

### 1. 双层存储架构

- **内存缓存层**: 快速访问最近的日志（最多100条）
- **数据库持久层**: 长期存储错误和警告日志，支持历史查询和统计分析

### 2. 核心组件

#### TranslationLogger 类
位置: `app/services/translation.server.js`

主要功能:
- 实时日志记录（info/warn/error）
- 自动数据库持久化（错误和警告）
- 批量写入优化（减少数据库压力）
- 错误指纹生成（用于分组和去重）

关键方法:
```javascript
// 记录日志
await translationLogger.log(level, message, data);

// 获取内存日志
translationLogger.getRecentLogs(count);

// 获取历史日志
await translationLogger.getHistoricalLogs(options);

// 获取错误统计
await translationLogger.getErrorStats(hours);
```

#### ErrorLog 数据表
完整的错误日志表结构，包含:
- 错误基本信息（类型、类别、消息、堆栈）
- 错误指纹和分组
- 上下文信息（请求、响应、环境）
- 资源关联（资源类型、资源ID）
- 影响评估（用户影响、严重程度）
- 自动分析结果（建议修复、根因分析）

## 使用方法

### 1. 在代码中记录日志

```javascript
// 记录信息日志
translationLogger.log('info', '开始翻译资源', {
  resourceId: resource.id,
  resourceType: resource.resourceType,
  language: targetLanguage
});

// 记录警告
translationLogger.log('warn', '翻译结果与原文相同', {
  resourceId: resource.id,
  title: resource.title
});

// 记录错误（自动持久化到数据库）
translationLogger.log('error', '翻译失败', {
  resourceId: resource.id,
  error: error.message,
  shopId: shop.id
});
```

### 2. 查看日志

#### 使用简化工具（推荐）
```bash
# 查看最近24小时的日志
node check-logs.js

# 查看最近48小时的日志
node check-logs.js 48

# 查看最近1小时的日志
node check-logs.js 1
```

#### 使用完整工具
```bash
# 查看内存中的最近日志
node view-translation-logs.js recent 50

# 查看数据库中的错误日志
node view-translation-logs.js db 48

# 查看错误统计
node view-translation-logs.js stats

# 搜索包含关键词的日志
node view-translation-logs.js search "API"

# 清理旧日志
node view-translation-logs.js clear 30
```

### 3. 通过API访问

```javascript
// 获取翻译日志和统计
GET /api/translation-logs?count=20

// 响应格式
{
  "success": true,
  "data": {
    "stats": {
      "totalCalls": 100,
      "successCount": 95,
      "failureCount": 5,
      "warningCount": 10,
      "successRate": 0.95
    },
    "logs": [
      {
        "timestamp": "2025-08-14T09:08:20.000Z",
        "level": "error",
        "message": "翻译失败",
        "data": {...}
      }
    ]
  }
}
```

## 日志级别说明

- **INFO**: 正常操作信息（仅内存缓存）
  - 开始翻译
  - 翻译完成
  - 质量评估完成

- **WARN**: 警告信息（持久化到数据库）
  - 翻译结果与原文相同
  - API响应慢
  - 重试操作

- **ERROR**: 错误信息（持久化到数据库）
  - 翻译失败
  - API调用失败
  - 数据验证失败

## 错误指纹系统

系统自动为每个错误生成唯一指纹，用于:
- 错误分组和去重
- 频率统计
- 趋势分析
- 相似错误识别

指纹基于以下信息生成:
- 错误消息
- 错误类型
- 资源类型
- 操作类型

## 性能优化

1. **批量写入**: 错误日志批量写入数据库，减少I/O操作
2. **内存缓存**: 最近日志保存在内存中，快速访问
3. **索引优化**: 数据库表包含多个索引，优化查询性能
4. **自动清理**: 支持定期清理旧日志，控制存储空间

## 故障排查

### 常见问题

1. **日志未持久化到数据库**
   - 检查数据库连接
   - 确认错误级别（只有error和warn会持久化）
   - 查看控制台是否有数据库写入错误

2. **内存日志为空**
   - 服务可能刚重启
   - 检查TranslationLogger实例是否正确初始化

3. **查询性能慢**
   - 考虑添加时间范围限制
   - 定期清理旧日志
   - 检查数据库索引

## 测试脚本

运行测试脚本验证日志系统:
```bash
# 完整测试
node test-translation-logs.js

# 创建测试错误
node test-error-system.js
```

## 未来改进计划

1. **实时监控面板**: 开发Web界面实时显示日志
2. **告警系统**: 错误率超过阈值时自动告警
3. **日志导出**: 支持导出为CSV/JSON格式
4. **更多统计维度**: 按时间、资源类型、语言等维度统计
5. **日志归档**: 自动归档旧日志到冷存储

## 相关文件

- `app/services/translation.server.js` - TranslationLogger类实现
- `prisma/schema.prisma` - ErrorLog表定义
- `check-logs.js` - 简化版日志查看工具
- `view-translation-logs.js` - 完整版日志查看工具
- `test-translation-logs.js` - 日志系统测试脚本