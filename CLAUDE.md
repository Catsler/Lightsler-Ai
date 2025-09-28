# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚀 快速开始

```bash
# 最常用命令
npm run dev                              # 启动开发服务器
npm run lint && npm run build            # 代码检查和构建
npx prisma migrate dev                   # 数据库迁移
npm run deploy                           # 部署到Shopify

# 开发环境（绕过SSL）
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

## 🚨 开发启动第一准则

### 项目启动权限控制
**绝对禁止**:
- ❌ 自主启动项目开发服务器
- ❌ 更改用户指定的启动域名、隧道配置

**强制要求**:
- ✅ 项目启动前必须获得用户明确授权
- ✅ 如必须启动，使用指定命令：`shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000`

### 关键配置信息
- **应用URL**: https://translate.ease-joy.fun
- **Client ID**: fa2e9f646301c483f81570613924c495
- **API版本**: Shopify GraphQL Admin API 2025-07

## 项目架构

Shopify多语言翻译应用，基于Remix框架构建的嵌入式Shopify Admin应用。支持26种资源类型的批量翻译。

### 技术栈
- **框架**: Remix v2.16.1 + React v18.2.0 + Shopify Polaris v12.27.0
- **数据库**: SQLite + Prisma ORM v6.2.1
- **队列**: Bull + Redis（自动降级到内存队列）
- **Node**: ^18.20 || ^20.10 || >=21.0.0

### 核心架构

**3层架构设计**:
1. **Presentation Layer**: Remix routes + Polaris components
2. **Service Layer**: Business logic services (`.server.js` suffix)
3. **Data Layer**: Prisma ORM + SQLite

**核心翻译流水线**:
```
shopify-graphql.server.js → database.server.js → queue.server.js → translation.server.js → sync-to-shopify.server.js
```

**Sequential Thinking系统** (app/services/):
- sequential-thinking-core.server.js - 核心决策引擎
- intelligent-skip-engine.server.js - 智能跳过决策
- version-detection.server.js - 内容版本检测
- error-prevention-guard.server.js - 错误预防
- auto-recovery.server.js - 自动恢复

### 数据模型 (Prisma)

核心表:
- **Resource**: 待翻译资源 (resourceType, gid, contentHash, riskScore)
- **Translation**: 翻译结果 (syncStatus: pending/syncing/synced/failed)
- **TranslationSession**: 会话管理 (断点续传)
- **ErrorLog**: 错误日志 (指纹分组, 自动分析)
- **Language**: 支持的语言配置
- **ContentDigest**: 内容摘要追踪 (语言覆盖率)

### 主要API端点

**核心翻译API**:
- `POST /api/scan-resources` - 扫描所有资源
- `POST /api/translate` - 同步翻译
- `POST /api/translate-queue` - 异步翻译
- `POST /api/sync-translations` - 同步到Shopify
- `GET /api/status` - 系统状态

**语言覆盖率API**:
- `GET /api/language-coverage` - 语言覆盖统计
- `GET /api/resource-coverage/:resourceId` - 资源覆盖详情

## 开发规范

### 服务层规范
```javascript
// 服务文件必须以 .server.js 结尾
import { captureError } from "../utils/error-handler.server.js";
import { logger } from "../utils/logger.server.js";

export async function mainServiceFunction(params) {
  try {
    logger.info('开始处理', { params });
    // 业务逻辑
    return result;
  } catch (error) {
    await captureError('SERVICE_NAME', error, params);
    throw error;
  }
}
```

### API路由规范
```javascript
// 使用withErrorHandling包装器
import { withErrorHandling } from "../utils/error-handler.server.js";
import { authenticate } from "../shopify.server.js";

export const action = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  // 业务逻辑
  return json({ success: true, data: result });
});
```

### 数据库操作规范
```javascript
// 使用事务和乐观锁
await prisma.$transaction(async (tx) => {
  const resource = await tx.resource.update({
    where: { id },
    data: {
      ...updates,
      contentVersion: { increment: 1 }
    }
  });
});
```

## 环境变量

**必需**:
```bash
SHOPIFY_API_KEY=xxx        # Shopify应用密钥
SHOPIFY_API_SECRET=xxx     # Shopify应用密码
GPT_API_KEY=xxx           # OpenAI/兼容API密钥
```

**可选**:
```bash
GPT_API_URL=https://api.cursorai.art/v1  # GPT API地址
REDIS_URL=redis://localhost:6379         # Redis
QUEUE_CONCURRENCY=5                      # 队列并发数
NODE_ENV=development|production          # 环境标识
ENABLE_PRODUCT_RELATED_TRANSLATION=true  # 产品关联翻译
```

## 日志查看

### 本地日志文件
```bash
# 实时查看所有日志
tail -f logs/app.log

# 查看最近100条日志
tail -100 logs/app.log

# 只看错误日志（使用 jq 解析 JSON）
tail -f logs/app.log | jq 'select(.level==50)'

# 按关键词过滤
tail -f logs/app.log | grep "TRANSLATION"

# 使用 rg 高亮显示
tail -f logs/app.log | rg --line-buffered "ERROR" --color always
```

**注意**: 日志为 JSON 格式，包含以下字段：
- `level`: 30=INFO, 40=WARN, 50=ERROR
- `time`: Unix 时间戳
- `msg`: 日志消息
- 其他自定义字段

## 常用命令

### 数据库管理
```bash
npx prisma generate              # 生成Prisma客户端
npx prisma migrate dev           # 创建/运行迁移
npx prisma studio                # 可视化管理界面
npx prisma migrate reset         # 重置数据库
```

### 测试和调试
```bash
# E2E测试
npm run test:e2e                 # 运行端到端测试
npm run test:e2e:ui              # 运行端到端测试（UI模式）
npm run test:e2e:headed          # 运行端到端测试（有头模式）

# API测试
npm run test:api-contracts       # 运行API合约测试

# 代码质量检查
npm run check                    # 运行lint和build检查
npm run check:lint               # 只运行lint检查
npm run check:build              # 只运行build检查

# 核心功能测试
node test-resource-types.js      # 资源类型测试
node test-sequential-thinking.js # AI系统测试
node test-product-related-translation.js # 产品关联翻译测试

# 性能测试
node test-performance-optimization.js    # 性能优化测试
node test-language-switching-performance.js # 语言切换性能

# 语言覆盖率
node scripts/check-language-coverage.mjs # 检查语言覆盖率

# 问题诊断
node diagnose-issue.js           # 问题诊断工具
node view-translation-logs.js    # 查看翻译日志
node init-error-patterns.js     # 初始化错误模式
```

### Shopify部署
```bash
npm run deploy                   # 部署到Shopify
npm run config:link              # 链接应用配置
npm run config:use               # 使用特定配置
npm run generate                 # 生成Shopify应用代码
npm run env                      # 管理环境变量
npm run setup                    # 设置数据库（Prisma生成+迁移）
npm run docker-start             # Docker容器启动
```

### 浏览器调试工具
```bash
./start-browser-tools.sh         # 启动browser-tools服务器
npm run dev                      # 启动开发服务器（自动集成）
./stop-browser-tools.sh          # 停止browser-tools服务器
```

## 核心特性

### 富文本处理 (translation.server.js)
- `protectHtmlTags()` - HTML标签保护
- `restoreHtmlTags()` - 标签恢复
- `BRAND_WORDS` - 品牌词保护
- `intelligentChunkText()` - 智能分块

### 队列系统 (queue.server.js)
- Redis优先，自动降级到内存队列
- 批量处理和进度跟踪
- 失败自动重试（最多3次）

### Sequential Thinking智能系统
- 智能跳过决策 - 避免重复翻译
- 错误自动恢复 - 智能重试策略
- 质量保证 - 多维度评估

### 产品关联翻译
通过设置 `ENABLE_PRODUCT_RELATED_TRANSLATION=true` 启用，自动翻译产品options和metafields。

## 故障排查

| 问题 | 解决方案 |
|------|----------|
| 认证循环 | `npm run deploy` 更新权限 |
| 数据库错误 | `npm run setup` 或 `npx prisma migrate dev` |
| Redis连接失败 | 自动降级到内存队列 |
| 翻译API问题 | 检查 `GPT_API_KEY` 和 `GPT_API_URL` |
| Webhook失败 | `npm run deploy` 重新注册 |

## 开发检查清单

- ✅ `npm run check` 代码质量检查通过
- ✅ `npm run build` 构建成功
- ✅ 数据模型变更后运行 `npx prisma migrate dev`
- ✅ 新增Shopify权限后运行 `npm run deploy`
- ✅ 测试关键功能流程（扫描→翻译→同步）
- ✅ 使用 `npm run test:e2e` 运行端到端测试

## 重要文件位置

### 核心服务 (app/services/)
- `translation.server.js` - 翻译核心引擎
- `shopify-graphql.server.js` - Shopify API封装
- `queue.server.js` - Redis队列系统
- `sync-to-shopify.server.js` - 同步服务
- `error-analyzer.server.js` - 错误分析

### 数据模型
- `prisma/schema.prisma` - 数据库模式定义
- `app/db.server.js` - Prisma客户端单例

### 配置文件
- `shopify.app.toml` - Shopify应用权限配置
- `.env` - 环境变量（本地创建）