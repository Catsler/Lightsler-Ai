# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Shopify多语言翻译应用，基于Remix框架构建的嵌入式Shopify Admin应用。支持15+种资源类型的批量翻译，包含富文本处理、SEO优化、品牌词保护和智能队列系统。

### 技术栈
- **框架**: Remix v2.16.1 + React v18.2.0
- **UI**: Shopify Polaris v12.27.0
- **数据库**: SQLite + Prisma ORM v6.2.1
- **队列**: Bull + Redis（可选，自动降级到内存队列）
- **API版本**: Shopify GraphQL Admin API 2025-07
- **构建**: Vite v5.4.8
- **Node**: >=18.20

## 常用开发命令

```bash
# 初次设置
npm install                      # 安装依赖
npm run setup                    # 初始化数据库（生成Prisma客户端 + 迁移）

# 开发
npm run dev                      # 启动开发服务器（Shopify CLI处理隧道和认证）
npm run lint                     # ESLint代码检查
npm run build                    # 构建生产版本

# 数据库操作
npx prisma generate              # 生成Prisma客户端（模型改变后需执行）
npx prisma migrate dev           # 创建/运行数据库迁移
npx prisma studio                # 可视化数据库管理界面
npx prisma migrate reset         # 重置数据库（清除所有数据）

# Shopify部署
npm run deploy                   # 部署到Shopify（更新权限、webhook等）

# 测试脚本
node test-error-system.js        # 错误系统测试
node test-resource-types.js      # 资源类型测试  
node test-category-translation.js # 分类翻译测试
node diagnose-issue.js           # 问题诊断工具

# Redis（可选）
brew services start redis        # macOS启动Redis
redis-cli ping                   # 测试Redis连接
```

## 项目架构

### 核心目录结构
```
app/
├── routes/              # Remix路由
│   ├── api.*.jsx       # API端点（扫描、翻译、同步）
│   ├── app.*.jsx       # 嵌入式应用页面
│   ├── test.*.jsx      # 测试页面
│   └── debug.*.jsx     # 调试页面
├── services/            # 业务逻辑
│   ├── translation.server.js     # GPT翻译核心（含品牌词保护）
│   ├── shopify-graphql.server.js # Shopify API封装（资源类型定义）
│   ├── database.server.js        # 数据库操作
│   ├── queue.server.js           # Redis队列
│   ├── memory-queue.server.js    # 内存队列降级
│   ├── sync-to-shopify.server.js # 批量同步服务
│   ├── theme-translation.server.js # 主题翻译专用服务
│   ├── error-analyzer.server.js  # 错误分析服务
│   └── error-collector.server.js # 错误收集服务
├── utils/               # 工具函数
│   ├── error-handler.server.js   # 错误处理（TranslationError类）
│   ├── api-response.server.js    # API响应标准化
│   ├── error-fingerprint.server.js # 错误指纹分组
│   ├── logger.server.js          # 日志系统
│   ├── api.server.js             # API辅助函数
│   └── config.server.js          # 配置管理
├── config/              # 配置文件
│   └── resource-categories.js    # 资源分类配置
├── shopify.server.js    # Shopify应用配置
└── db.server.js         # Prisma客户端单例
```

### 支持的资源类型（RESOURCE_TYPES）
- **产品类**: product, collection, filter, product_option, product_option_value
- **内容类**: article, blog, page  
- **导航类**: menu, link
- **主题类**: online_store_theme, online_store_theme_file, online_store_theme_asset, online_store_theme_template, online_store_theme_section, online_store_theme_block, online_store_theme_snippet
- **其他**: selling_plan, shop, shop_policy

### 数据流程
1. **扫描**: GraphQL批量获取Shopify资源 → 存储到SQLite
2. **翻译**: 调用GPT API（保护HTML标签和品牌词） → 保存翻译结果
3. **同步**: GraphQL Mutation更新到Shopify店铺

### 主要API端点
- `POST /api/scan-resources` - 扫描所有资源类型
- `POST /api/translate` - 同步翻译（少量即时）
- `POST /api/translate-queue` - 异步翻译（大批量队列）
- `GET /api/status` - 系统状态和统计
- `POST /api/sync-translations` - 同步翻译到Shopify
- `POST /api/clear` - 清理数据
- `GET /api/errors` - 错误日志查询
- `GET /api/translation-logs` - 翻译日志查询
- `GET /api/translation-status` - 翻译状态查询

## 数据模型（Prisma）

### 核心表结构
- **Session**: Shopify会话管理
- **Shop**: 店铺信息和访问令牌
- **Resource**: 待翻译资源
  - resourceType: 资源类型
  - gid: GraphQL ID
  - resourceId: 友好文件名ID
  - originalResourceId: 原始Shopify资源ID
  - descriptionHtml: 富文本内容
  - contentFields: JSON扩展字段（Theme资源的动态字段）
- **Translation**: 翻译结果
  - 每个资源+语言组合一条记录
  - syncStatus: pending/syncing/synced/failed
  - translationFields: JSON扩展字段
- **Language**: 支持的语言配置
- **ErrorLog**: 完整的错误日志系统（含指纹分组、影响评估）

## 开发规范

### 代码约定
- 服务端文件: `*.server.js` 后缀
- 错误处理: API路由使用 `withErrorHandling` 包装
- 认证: 使用 `shopify.authenticate.admin()` 
- GraphQL版本: 2025-07
- 缩进: 2个空格
- 注释: 中文

### 环境变量

**必需**:
```bash
SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx  
GPT_API_KEY=xxx
```

**可选**:
```bash
GPT_API_URL=https://api.cursorai.art/v1  # GPT API地址
REDIS_URL=redis://localhost:6379         # Redis（自动降级）
QUEUE_CONCURRENCY=5                      # 队列并发数
```

## 关键特性

### 富文本处理
- HTML标签自动保留（protectHtmlTags/restoreHtmlTags）
- 媒体元素（图片/视频）保护
- 品牌词不翻译（BRAND_WORDS词库）
- 智能分块处理长文本（intelligentChunkText）

### 队列系统
- Redis不可用时自动降级到内存队列
- 支持批量处理和进度跟踪
- 失败自动重试（最多3次）
- 并发控制（QUEUE_CONCURRENCY）

### Shopify集成
- 嵌入式运行在Shopify Admin内
- 权限配置在 `shopify.app.toml`
- 支持webhook处理
- GraphQL批量操作优化

### Theme资源处理
- 动态字段提取（dynamicFields）
- 智能文件名解析（product.tent → Product: Tent）
- JSON模板内容处理
- 保持原始资源ID用于API调用

## 故障排查

### 常见问题
1. **认证循环**: 运行 `npm run deploy` 更新权限
2. **数据库错误**: 运行 `npm run setup` 或 `npx prisma migrate dev`
3. **Redis连接失败**: 自动降级，无需干预
4. **翻译API问题**: 检查GPT_API_KEY和GPT_API_URL

### 开发完成检查
- ✅ `npm run lint` 无错误
- ✅ `npm run build` 构建成功
- ✅ 数据模型变更后运行 `npx prisma migrate dev`
- ✅ 新增Shopify权限后运行 `npm run deploy`

## 重要函数和模块

### 翻译服务 (translation.server.js)
- `translateResourceWithLogging`: 主入口，含日志记录
- `translateTextEnhanced`: 增强型文本翻译（处理HTML和品牌词）
- `translateUrlHandle`: URL slug翻译优化
- `validateTranslation`: 翻译质量验证
- `TranslationLogger`: 翻译日志管理类
- `intelligentChunkText`: 智能文本分块
- `protectHtmlTags/restoreHtmlTags`: HTML标签保护

### GraphQL服务 (shopify-graphql.server.js)
- `fetchResourcesByType`: 按类型获取资源
- `fetchThemeResources`: Theme资源特殊处理
- `updateResourceTranslationBatch`: 批量更新翻译
- `executeGraphQLWithRetry`: 带重试的GraphQL执行
- `RESOURCE_TYPES`: 资源类型配置对象
- `FIELD_MAPPINGS`: 字段映射配置

### 错误处理 (error-handler.server.js)
- `TranslationError`: 自定义错误类
- `withErrorHandling`: 路由错误包装器
- `captureError`: 错误记录和分析

### 错误分析服务 (error-analyzer.server.js)
- 错误模式识别
- 影响评估
- 根因分析

## 测试和调试

### 测试页面路由
- `/test/*` - 各种功能测试页面
- `/debug/*` - 调试信息页面
- `/app` - 主应用界面
- `/app/errors` - 错误管理界面
- `/app/sync` - 同步管理界面

### 开发时常用命令
```bash
# 开发服务器（带Shopify隧道）
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev

# 查看数据库
npx prisma studio

# 运行测试脚本
node test-error-system.js
node test-resource-types.js
node diagnose-issue.js

# 清理缓存和重置
npx prisma migrate reset
```

## 注意事项

1. **Theme资源**: 使用动态字段，需要特殊处理contentFields
2. **翻译质量**: 关注HTML结构完整性和品牌词保护
3. **性能优化**: 大批量翻译使用队列系统
4. **错误恢复**: ErrorLog表提供详细错误追踪
5. **开发环境**: 需要设置NODE_TLS_REJECT_UNAUTHORIZED=0绕过SSL验证
6. **批量操作**: 使用updateResourceTranslationBatch进行批量更新以优化性能
7. **日志管理**: TranslationLogger类自动记录所有翻译操作
8. **内存管理**: 大文本使用intelligentChunkText分块处理避免内存溢出