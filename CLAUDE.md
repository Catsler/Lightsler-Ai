# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨🚨🚨 严格禁止的操作（必须遵守）🚨🚨🚨

1. **永远不准自动启动项目测试**
   - 不允许自动执行 `npm run dev` 或任何启动项目的命令
   - 只有用户明确要求时才能提供启动命令

2. **永远不准修改项目通道配置**
   - 不允许修改 `shopify.app.toml` 中的 `application_url` 和 `redirect_urls`
   - 固定通道域名必须保持：`translate.ease-joy.fun`
   - 不要生成或使用任何 trycloudflare.com 随机域名

## 项目概述

Shopify多语言翻译应用 - 嵌入式Shopify Admin应用，支持20+种资源类型的智能批量翻译。

**核心特性**：Sequential Thinking AI决策引擎 | 队列自动降级 | 品牌词保护 | Webhook自动化 | 错误自愈系统

## 必备开发命令

```bash
# 🚨 重要：永远使用固定域名通道启动
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev -- --tunnel-url=translate.ease-joy.fun

# 首次设置
npm install && npm run setup

# 开发流程
npm run lint                     # 代码检查（提交前必须）
npm run build                    # 构建验证（提交前必须）
npx prisma migrate dev           # 数据模型变更后
npm run deploy                   # Shopify权限变更后

# 多店铺开发（独立数据库）
./dev-onewind.sh                # 启动 onewind 店铺 (端口 3001)
./dev-daui.sh                   # 启动 daui 店铺 (端口 3002)  
./dev-sshvdt.sh                 # 启动 sshvdt 店铺 (端口 3003)
./start-all-shops.sh            # 启动所有店铺

# 调试与测试
node test-translate-direct.js   # 直接翻译测试
node test-complete-product-flow.js # 完整产品流程测试
node test-intelligent-scan-fix.js  # 智能扫描修复测试
node test-language-persistence.js  # 语言持久化测试
node diagnose-issue.js           # 问题诊断工具
node reset-database.js           # 重置数据库
```

## 核心架构

### 关键服务分层
- **路由层** (`app/routes/`): API端点使用 `api.*.jsx`，页面使用 `app.*.jsx`，Webhook使用 `webhooks.*.jsx`
- **服务层** (`app/services/`): 所有服务端文件使用 `*.server.js` 后缀
- **工具层** (`app/utils/`): 通用工具函数，包含错误处理和API响应标准化

### 数据流程
1. **扫描**: `fetchResourcesByType` → SQLite存储（支持20+资源类型）
2. **翻译**: `translateResourceWithLogging` → GPT API（HTML标签保护+品牌词保护）
3. **同步**: `updateResourceTranslationBatch` → Shopify GraphQL批量更新

### 关键API工作流
```
扫描 → 翻译 → 同步
POST /api/scan-resources → POST /api/translate-queue → POST /api/sync-translations
```

**Sequential Thinking系统**: `/api/translation-sessions`（会话管理）| `/api/detect-changes`（智能跳过）| `/api/error-prevention`（风险预防）

## 关键实现细节

### 队列自动降级
```javascript
// queue.server.js 不可用时自动切换到 memory-queue.server.js
Redis连接失败 → 自动降级内存队列 → 无需手动干预
```

### Theme资源特殊处理
- 使用 `contentFields` JSON字段存储动态字段
- 保留 `originalResourceId` 用于API调用（resourceId是友好名称）
- 文件名智能解析：`product.tent` → `Product: Tent`

### 品牌词保护机制
```javascript
// translation.server.js
BRAND_WORDS = ['Shopify', 'SKU', ...] // 不翻译的词汇
protectHtmlTags() → translateTextEnhanced() → restoreHtmlTags()
```

## 环境变量配置

```bash
# 必需
SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx  
GPT_API_KEY=xxx

# 可选（有默认值）
GPT_API_URL=https://api.cursorai.art/v1  # 默认OpenAI
REDIS_URL=redis://localhost:6379         # 自动降级到内存

# 多店铺配置（使用独立 .env 文件）
DOTENV_CONFIG_PATH=.env.onewind  # onewind 店铺配置
DOTENV_CONFIG_PATH=.env.daui     # daui 店铺配置
DOTENV_CONFIG_PATH=.env.sshvdt   # sshvdt 店铺配置
DATABASE_URL=file:./prisma/data/[店铺名].db  # 独立数据库
```

## 重要函数映射

### 翻译核心 (translation.server.js)
- `translateResourceWithLogging` - 主入口，含日志
- `translateTextEnhanced` - HTML+品牌词处理  
- `intelligentChunkText` - 长文本分块

### GraphQL服务 (shopify-graphql.server.js)
- `fetchResourcesByType` - 批量获取资源
- `updateResourceTranslationBatch` - 批量更新
- `executeGraphQLWithRetry` - 自动重试机制

### 错误处理 (error-handler.server.js)
- `withErrorHandling` - 路由包装器
- `TranslationError` - 自定义错误类

## 常见问题快速解决

| 问题 | 解决方案 |
|------|---------|
| 认证循环 | `npm run deploy` |
| 数据库错误 | `npx prisma migrate dev` |
| SSL证书问题 | `NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev` |
| Redis失败 | 自动降级，无需处理 |
| API限流 | executeGraphQLWithRetry自动重试 |

## 开发注意事项

1. **SSL问题**: 开发时始终使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`
2. **Theme资源**: 使用 `contentFields` JSON字段，保留 `originalResourceId`
3. **批量操作**: 优先使用 `updateResourceTranslationBatch`
4. **版本要求**: Node.js >=18.20，Polaris v12（v13需要Node 20+）
5. **提交前检查**: 必须运行 `npm run lint` 和 `npm run build`
6. **Cloudflare Tunnel**: 开发环境使用固定域名 `translate.ease-joy.fun`
7. **多店铺隔离**: 每个店铺使用独立端口和数据库，避免数据混淆

## 生产部署

```bash
# PM2 管理（服务器端）
pm2 start ecosystem.config.js    # 启动所有店铺服务
pm2 status                       # 查看服务状态
pm2 logs translate-onewind       # 查看特定店铺日志
pm2 restart all                  # 重启所有服务

# 部署脚本
./server-deploy.sh               # 服务器部署脚本
./start-cloudflare-tunnel.sh    # 启动 Cloudflare 隧道
```

## 项目结构说明

- **app/routes/api.*.jsx** - API 端点（RESTful接口）
- **app/routes/app.*.jsx** - 页面路由（用户界面）
- **app/routes/webhooks.*.jsx** - Webhook 处理器
- **app/services/*.server.js** - 服务端逻辑（必须以 .server.js 结尾）
- **app/components/** - React 组件
- **prisma/data/** - 多店铺独立数据库目录
- **test-*.js** - 功能测试脚本