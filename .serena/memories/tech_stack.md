# 技术栈

## 后端
- **框架**: Node.js + Remix (v2.16.1)
- **数据库**: Prisma ORM + SQLite (默认，生产环境可切换)
- **Shopify集成**: @shopify/shopify-app-remix (v3.7.0)
- **队列系统**: Bull + Redis (可选)
- **会话存储**: @shopify/shopify-app-session-storage-prisma

## 前端
- **框架**: React (v18.2.0) + Remix
- **UI组件**: @shopify/polaris (v12.0.0)
- **Shopify桥接**: @shopify/app-bridge-react (v4.1.6)

## 开发工具
- **构建工具**: Vite (v6.2.2)
- **类型检查**: TypeScript (v5.2.2)
- **代码检查**: ESLint + Prettier
- **包管理**: npm/yarn/pnpm

## API集成
- **Shopify API**: GraphQL Admin API (2025-07版本)
- **翻译服务**: GPT API (可配置)

## 运行环境要求
- Node.js: 18.20+ 或 20.10+ 或 21.0+
- Redis: 可选，用于任务队列