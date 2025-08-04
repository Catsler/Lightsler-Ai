# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个Shopify翻译应用，用于自动翻译店铺的产品和集合内容。应用基于Remix框架构建，集成了Shopify GraphQL API和GPT翻译服务。

### 项目关键特性
- **多资源类型支持**: 支持产品、集合、页面、文章、博客、菜单、链接、过滤器等Shopify资源的翻译
- **批量处理**: 支持同步和异步（通过Redis队列）批量翻译
- **富文本支持**: 保留HTML格式、图片、视频等富媒体内容
- **SEO优化**: 支持SEO标题和描述的翻译
- **嵌入式应用**: 在Shopify Admin中以嵌入式模式运行

## 常用开发命令

### 开发和构建
```bash
npm run dev          # 启动开发服务器（通过Shopify CLI）
npm run build        # 构建生产版本
npm run start        # 启动生产服务器
npm run setup        # 设置项目（生成Prisma + 数据库迁移）
npm run lint         # 运行ESLint代码检查
```

### 数据库操作
```bash
npx prisma generate      # 生成Prisma客户端
npx prisma migrate dev   # 运行数据库迁移（开发环境）
npx prisma studio        # 打开数据库管理界面
```

### Shopify CLI操作
```bash
npm run config:link      # 链接Shopify配置
npm run deploy          # 部署应用到Shopify
npm run generate        # 生成Shopify扩展
npm run config:use      # 选择Shopify配置
npm run env             # 管理环境变量
```

### 测试和调试
```bash
node test-setup.js      # 测试应用配置
node simple-test.js     # 运行简单测试
node check-status.js    # 检查应用状态
npm run dev             # 开发模式（自动监听文件变化）
open http://localhost:3000/app  # 打开应用界面
```

### Redis操作（可选队列功能）
```bash
brew services start redis  # 启动Redis（macOS）
brew services stop redis   # 停止Redis（macOS）
redis-cli ping            # 测试Redis连接
redis-cli                # 进入Redis命令行
```

## 项目架构

### 技术栈
- **后端**: Node.js (>=18.20) + Remix (v2.16.1) + Prisma + SQLite
- **前端**: React (v18.2.0) + Shopify Polaris (v12.0.0)
- **队列**: Bull + Redis/IORedis (可选)
- **API**: Shopify GraphQL Admin API (2025-07) + GPT翻译API
- **构建工具**: Vite (v6.2.2) + TypeScript (v5.2.2)

### 核心目录结构
```
app/
├── routes/              # Remix路由（页面和API）
├── services/            # 业务逻辑服务
│   ├── translation.server.js     # 翻译服务
│   ├── shopify-graphql.server.js # Shopify API操作
│   ├── database.server.js        # 数据库操作
│   └── queue.server.js           # 任务队列
└── utils/               # 工具函数
```

### 数据流程
1. **资源扫描**: 通过GraphQL API获取产品/集合数据
2. **数据存储**: 使用Prisma将资源保存到SQLite
3. **翻译处理**: 调用GPT API翻译内容
4. **结果同步**: 通过GraphQL API更新Shopify店铺

### API端点
- `POST /api/scan-products` - 扫描产品
- `POST /api/scan-collections` - 扫描集合  
- `POST /api/translate` - 同步翻译
- `POST /api/translate-queue` - 异步翻译（需要Redis）
- `GET /api/status` - 获取状态信息
- `GET /api/config` - 获取配置信息
- `POST /api/clear` - 清理数据

### 测试页面
- `/app` - 主应用界面（嵌入式）
- `/test/translation` - 翻译功能测试页面
- 通过 `open http://localhost:3000/app` 访问

## 开发注意事项

### 环境变量
确保配置以下必需的环境变量：
- `SHOPIFY_API_KEY` - Shopify应用API密钥
- `SHOPIFY_API_SECRET` - Shopify应用密钥
- `GPT_API_URL` - GPT翻译API地址（默认：https://api-gpt-ge.apifox.cn）
- `GPT_API_KEY` - GPT翻译API密钥（推荐）
- `REDIS_URL` - Redis连接URL（可选，用于任务队列）
- `DATABASE_URL` - 数据库连接URL（默认：file:dev.sqlite）

### 代码风格
- 使用2个空格缩进
- 服务端文件使用 `.server.js` 后缀
- 遵循ESLint和Prettier配置
- 注释使用中文

### Shopify集成
- 应用使用嵌入式模式运行在Shopify Admin中
- 认证通过 `shopify.authenticate.admin()` 处理
- 使用 `@shopify/polaris` 组件保持UI一致性
- GraphQL API版本：2025-07

### 错误处理
- 所有API路由使用 `withErrorHandling` 包装器
- 翻译失败会记录到数据库并返回详细错误信息
- Redis连接失败会自动降级到内存队列

## 数据模型结构

### 核心数据表
- **Session** - Shopify会话存储
- **Shop** - 店铺信息（包含域名、访问令牌等）
- **Resource** - 待翻译资源
  - 支持的资源类型：product, collection, article, blog, page, menu, link, filter
  - 包含原始内容和富文本内容（descriptionHtml）
  - 使用contentFields字段存储特定资源类型的额外字段
- **Translation** - 翻译结果记录
  - 每个资源的每种语言都有独立记录
  - 使用translationFields存储特定类型的翻译字段
- **Language** - 支持的语言列表（包含语言代码和名称）

### 数据库操作
```bash
npx prisma studio    # 打开数据库管理界面
npx prisma db push   # 推送schema变更（开发环境）
npx prisma reset     # 重置数据库（删除所有数据）
```

## 任务完成检查

完成开发任务后，请执行以下检查：
1. 运行 `npm run lint` 确保代码质量
2. 运行 `npm run build` 确保构建成功
3. 如修改数据模型，运行 `npx prisma migrate dev`
4. 测试相关功能是否正常工作：
   - 通过 `/app` 访问主界面
   - 测试扫描功能
   - 测试翻译功能
5. 检查TypeScript类型错误（IDE自动检查）
6. 如果添加新的Shopify权限，运行 `npm run deploy` 更新配置

## 常见问题排查

### 认证问题
- 如果遇到认证循环，检查应用权限是否已更新：`npm run deploy`
- 确保环境变量SHOPIFY_API_KEY和SHOPIFY_API_SECRET正确配置

### 翻译API问题
- 检查GPT_API_KEY是否配置
- 检查GPT_API_URL是否可访问（默认：https://api-gpt-ge.apifox.cn）

### 数据库问题
- 数据库表不存在：运行 `npm run setup`
- 需要重置数据库：`npx prisma migrate reset`

### Redis连接问题
- 确保Redis服务已启动：`brew services start redis`
- 如果Redis不可用，系统会自动降级到内存队列