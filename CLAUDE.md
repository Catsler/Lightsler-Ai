# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个Shopify翻译应用，用于自动翻译店铺的产品和集合内容。应用基于Remix框架构建，集成了Shopify GraphQL API和GPT翻译服务。

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
- `POST /api/clear` - 清理数据

## 开发注意事项

### 环境变量
确保配置以下必需的环境变量：
- `SHOPIFY_API_KEY` - Shopify应用API密钥
- `SHOPIFY_API_SECRET` - Shopify应用密钥
- `GPT_API_KEY` - GPT翻译API密钥（推荐）
- `REDIS_URL` - Redis连接URL（可选）

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

## 任务完成检查

完成开发任务后，请执行以下检查：
1. 运行 `npm run lint` 确保代码质量
2. 运行 `npm run build` 确保构建成功
3. 如修改数据模型，运行 `npx prisma migrate dev`
4. 测试相关功能是否正常工作
5. 检查TypeScript类型错误（IDE自动检查）
6. 如果添加新的Shopify权限，运行 `npm run deploy` 更新配置