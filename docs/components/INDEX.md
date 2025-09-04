# 本地组件库索引

**创建日期**: 2025-01-04  
**状态**: ✅ 生产就绪

## 📚 已完成文档

### Polaris组件 (15/15) 🎉
- ✅ [Card](@local:polaris/layout/Card.md) - 容器卡片组件
- ✅ [Button](@local:polaris/forms/Button.md) - 按钮组件  
- ✅ [Text](@local:polaris/data-display/Text.md) - 统一文本组件
- ✅ [Badge](@local:polaris/feedback/Badge.md) - 状态标签组件
- ✅ [BlockStack](@local:polaris/layout/BlockStack.md) - 垂直布局组件
- ✅ [InlineStack](@local:polaris/layout/InlineStack.md) - 水平布局组件
- ✅ [Banner](@local:polaris/feedback/Banner.md) - 通知横幅组件
- ✅ [ProgressBar](@local:polaris/feedback/ProgressBar.md) - 进度条组件
- ✅ [Page](@local:polaris/layout/Page.md) - 页面容器组件
- ✅ [Select](@local:polaris/forms/Select.md) - 下拉选择组件
- ✅ [Layout](@local:polaris/layout/Layout.md) - 页面布局组件
- ✅ [Box](@local:polaris/layout/Box.md) - 通用容器组件  
- ✅ [Checkbox](@local:polaris/forms/Checkbox.md) - 复选框组件
- ✅ [Modal](@local:polaris/layout/Modal.md) - 模态对话框组件
- ✅ [DataTable](@local:polaris/data-display/DataTable.md) - 数据表格组件

### GraphQL API (4/4) 🎉
- ✅ [翻译查询](@local:shopify-graphql/queries/translation-queries.md) - 翻译相关查询和mutation
- ✅ [产品查询](@local:shopify-graphql/queries/product-queries.md) - 产品查询和变更操作
- ✅ [主题查询](@local:shopify-graphql/queries/theme-queries.md) - 主题资源查询和管理
- ✅ [Webhook处理](@local:shopify-graphql/webhooks/webhook-handlers.md) - Webhook事件处理

### 最佳实践 (3/3) 🎉
- ✅ [翻译模式](@local:best-practices/translation-patterns/index.md) - 翻译流程最佳实践
- ✅ [错误处理](@local:best-practices/error-handling/index.md) - 错误处理规范和恢复策略
- ✅ [性能优化](@local:best-practices/performance/index.md) - 系统性能优化指南

## 🎯 使用统计

基于代码分析的组件使用频率：

### 最高频组件 (>15%)
1. Card - 18% 
2. Button - 18%
3. Text - 18%
4. Badge - 16%
5. BlockStack - 16%
6. InlineStack - 16%

### 高频组件 (10-15%)
7. Page - 14%
8. Select - 12%
9. Layout - 10%
10. Banner - 10%
11. ProgressBar - 10%

### 中频组件 (5-10%)
- Box - 8%
- Checkbox - 6%
- Modal - 6%
- DataTable - 6%

## 📋 创建文档检查清单

创建新组件文档时，必须包含：
- [ ] 最后验证日期
- [ ] 正确的导入语句
- [ ] 基础用法示例
- [ ] 项目特定模式（至少2个）
- [ ] Props参考表
- [ ] v12版本注意事项（如适用）
- [ ] 常见错误和正确用法对比
- [ ] 相关组件列表
- [ ] 验证命令

## 🔄 更新计划

### 每日更新
- 根据开发需求创建新文档
- 修复发现的文档错误

### 每周更新
- 审查高频组件文档完整性
- 补充项目特定使用模式

### 每月更新
- 使用Context7验证所有文档
- 更新API版本变更
- 清理过时内容

## 🚦 文档状态图例

- ✅ 完成 - 文档完整，已验证
- 🔧 更新中 - 正在编辑或更新
- ⏳ 待创建 - 计划创建
- ⚠️ 需更新 - 超过30天未验证
- ❌ 已废弃 - 组件已不再使用

## 📞 快速导航

### 开发常用
- [Button使用](@local:polaris/forms/Button.md#项目特定模式)
- [Card+BlockStack组合](@local:polaris/layout/Card.md#pattern-1-card-blockstack-组合最常用)
- [GraphQL错误处理](@local:shopify-graphql/queries/translation-queries.md#错误处理最佳实践)

### 故障排查
- [组件版本兼容性检查](#)
- [API限流处理](#)
- [常见错误解决方案](#)

---
*使用 `grep -r "import.*from '@shopify/polaris'" app/` 统计组件使用情况*