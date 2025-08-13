# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Shopify多语言翻译应用，基于Remix框架构建的嵌入式Shopify Admin应用。支持8+种资源类型的批量翻译，包含富文本处理、SEO优化和队列系统。

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
node check-status.js             # 检查应用状态（配置、数据库、队列）
node simple-test.js              # 基础功能测试（无需Shopify环境）

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
│   └── memory-queue.server.js    # 内存队列降级
├── utils/               # 工具函数
│   ├── error-handler.server.js   # 错误处理（TranslationError类）
│   ├── api-response.server.js    # API响应标准化
│   └── logger.server.js          # 日志系统
├── shopify.server.js    # Shopify应用配置
└── db.server.js         # Prisma客户端单例
```

### 支持的资源类型（RESOURCE_TYPES）
- **产品类**: product, collection, filter, product_option, product_option_value
- **内容类**: article, blog, page  
- **导航类**: menu, link
- **主题类**: online_store_theme及其相关资源
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

## 数据模型（Prisma）

### 核心表结构
- **Session**: Shopify会话管理
- **Shop**: 店铺信息和访问令牌
- **Resource**: 待翻译资源
  - resourceType: 资源类型
  - gid: GraphQL ID
  - descriptionHtml: 富文本内容
  - contentFields: JSON扩展字段
- **Translation**: 翻译结果
  - 每个资源+语言组合一条记录
  - syncStatus: pending/syncing/synced/failed
  - translationFields: JSON扩展字段
- **Language**: 支持的语言配置

注意：ErrorLog表在代码中使用但未在schema中定义

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
- HTML标签自动保留
- 媒体元素（图片/视频）保护
- 品牌词不翻译（BRAND_WORDS词库）

### 队列系统
- Redis不可用时自动降级到内存队列
- 支持批量处理和进度跟踪
- 失败自动重试（最多3次）

### Shopify集成
- 嵌入式运行在Shopify Admin内
- 权限配置在 `shopify.app.toml`
- 支持webhook处理

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