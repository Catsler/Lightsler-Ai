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

## 🔴 生产部署红线警告

### 致命禁区（违反必究）

**❌ 绝对禁止的操作**:
1. **禁止覆盖生产配置文件**
   - 禁止同步 `.env` 到生产服务器
   - 禁止同步 `shopify.app.toml` 到生产服务器
   - 禁止同步数据库文件（`prisma/dev.sqlite`）到生产服务器
   - 禁止同步 Redis 队列数据

2. **禁止混淆环境**
   - 本地开发配置（devshop, DB 13）≠ 生产配置（shop1/shop2, DB 11/12）
   - Fynony 使用 Redis DB 11，OneWind 使用 Redis DB 12
   - 每个店铺有独立的 SHOPIFY_API_KEY 和认证信息

3. **禁止未经授权的生产操作**
   - 所有生产部署必须先获得用户明确授权
   - 禁止自主重启生产服务（PM2 restart）
   - 禁止自主修改生产数据库

### ✅ 正确的部署流程

**安全部署步骤**:
```bash
# 1. 提交代码到 Git
git add .
git commit -m "feat: 功能描述"
git push origin main

# 2. SSH到服务器（选择目标）
# Fynony: /var/www/app1-fynony
# OneWind: /var/www/app2-onewind

# 3. 服务器上拉取代码并构建
cd /var/www/app1-fynony
git pull origin main
npm run build  # ⚠️ 必须：重新构建

# 4. 重启进程
pm2 restart shop1-fynony shop1-worker

# 5. 验证
pm2 logs shop1-fynony --lines 20 --nostream
```

**使用安全部署脚本**:
```bash
# 脚本位置：/tmp/safe-deploy-to-production.sh
# 包含交互式确认和环境选择
./tmp/safe-deploy-to-production.sh
```

### ⚠️ 生产配置备份位置

**配置备份文件**（只读参考，禁止修改）:
- Fynony: `/Users/elie/Downloads/translate/Lightsler-Ai/阿里云轻量服务器部署文件/app1-fynony-production.env`
- OneWind: `/Users/elie/Downloads/translate/Lightsler-Ai/阿里云轻量服务器部署文件/app2-onewind-production.env`

**生产配置关键信息**:
```bash
# Fynony (shop1)
SHOPIFY_API_KEY=f97170933cde079c914f7df7e90cd806
REDIS_URL=redis://...39953/11
SHOP_ID=shop1

# OneWind (shop2)
SHOPIFY_API_KEY=（OneWind专用key）
REDIS_URL=redis://...39953/12
SHOP_ID=shop2
```

### 🛡️ 防御措施

**在执行任何生产操作前，必须检查**:
1. 是否获得用户明确授权？
2. 操作是否会影响配置文件？
3. 是否使用了正确的环境标识（shop1/shop2）？
4. 是否有回滚方案？

**如违反红线**:
- 立即停止操作
- 检查服务器当前状态（只读）
- 从备份文件恢复正确配置
- 重启服务并验证
- 向用户报告并记录事故

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

**🆕 链接转换配置**:
```bash
LINK_CONVERSION_ENABLED=false            # 启用内链转换功能
LINK_CONVERSION_STRATEGY=conservative    # 转换策略: conservative(保守) | aggressive(激进)
```
> 启用后，翻译时自动将内部链接转换为目标语言的URL（如 `/products/shirt` → `/fr/products/shirt`）。
> 保守模式只转换明确匹配的域名和路径，激进模式会尝试转换更多链接。
> 可在UI中（语言域名配置页面）动态修改，数据库配置优先级高于环境变量。

**API 监控**:
```bash
API_MONITORING_ENABLED=true                 # 默认开启监控
API_MONITORING_OPERATIONS=""               # 为空监控所有 createApiRoute 路由
# API_MONITORING_OPERATIONS="api.translate,api.status"  # 指定白名单
API_MONITOR_FAILURE_WARN=0.001              # 失败率 WARN 阈值
API_MONITOR_FAILURE_ERROR=0.005             # 失败率 ERROR 阈值
API_MONITOR_MIN_SAMPLE=20                   # 最小样本量
API_MONITOR_P95_WARN_RATIO=1.05             # P95 WARN 比例阈值
API_MONITOR_P95_ERROR_RATIO=1.1             # P95 ERROR 比例阈值
```
> 建议在排障或巡检时将 `API_MONITORING_OPERATIONS` 置空获取全量路由指标，详情见 `docs/api-monitoring-optimization.md`。

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

## ⚠️ Shopify 平台限制

### Webhook 支持限制

**不支持的资源类型**：
- ❌ **Articles (博客文章)** - 无 `articles/*` webhook
- ❌ **Pages (页面)** - 无 `pages/*` webhook

**原因**：
- Shopify API（包括 2025-07 及所有历史版本）不提供这些 webhook events
- 参考：[WebhookSubscriptionTopic Enum](https://shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic)

**替代方案**：
1. **定期轮询**：通过 GraphQL API 定期检查资源更新时间戳
2. **手动触发**：在 UI 中添加"扫描新内容"按钮
3. **间接信号**：监听 `themes/update` webhook，在主题更新时触发内容扫描

**支持的 Webhook**：
- ✅ Products (`products/create`, `products/update`, `products/delete`)
- ✅ Collections (`collections/create`, `collections/update`, `collections/delete`)
- ✅ Themes (`themes/publish`, `themes/update`)
- ✅ Locales (`locales/create`, `locales/update`)

## 翻译错误排查

### 错误代码说明

**CHUNK_SIZE_ABNORMAL** - 分块数量异常
- **触发条件**: 文本分块数量超过 100 个
- **影响**: 可能导致翻译质量下降、API调用超限
- **排查位置**: `app/services/translation/core.server.js:intelligentChunkText`
- **常见原因**:
  - 富文本内容中含有大量复杂HTML标签
  - 文本过长且未合理分段
  - 品牌词保护导致分块碎片化

**LINK_CONVERSION_LOW_SUCCESS_RATE** - URL转换成功率过低
- **触发条件**: URL转换成功率 < 80% 且链接数量 ≥ 5
- **影响**: 翻译内容中的内链未正确本地化
- **排查位置**: `app/services/link-converter.server.js:convertLinksForLocale`
- **常见原因**:
  - Markets配置缺失或不完整
  - URL格式不符合转换规则
  - 目标语言域名配置错误

### 日志查询示例

**查询分块异常**:
```bash
# 查看所有分块异常警告
tail -f logs/app.log | jq 'select(.errorCode=="CHUNK_SIZE_ABNORMAL")'

# 统计分块异常频率（最近1000条）
tail -1000 logs/app.log | jq -r 'select(.errorCode=="CHUNK_SIZE_ABNORMAL") | .time' | wc -l

# 查看具体分块详情
tail -f logs/app.log | jq 'select(.errorCode=="CHUNK_SIZE_ABNORMAL") | {chunkCount, textLength, averageSize}'
```

**查询URL转换问题**:
```bash
# 查看URL转换成功率警告
tail -f logs/app.log | jq 'select(.errorCode=="LINK_CONVERSION_LOW_SUCCESS_RATE")'

# 查看失败的URL样本
tail -f logs/app.log | jq 'select(.errorCode=="LINK_CONVERSION_LOW_SUCCESS_RATE") | .context.failedSamples'

# 查看转换统计
tail -f logs/app.log | jq 'select(.eventType=="linkConversion" and .locale) | {locale, stats}'
```

**综合错误查询**:
```bash
# 查看所有翻译相关警告（最近1小时）
tail -f logs/app.log | jq 'select(.level==40 and .isTranslationError==true)'

# 按错误代码分组统计
tail -1000 logs/app.log | jq -r 'select(.errorCode) | .errorCode' | sort | uniq -c

# 导出错误详情到文件分析
tail -5000 logs/app.log | jq 'select(.errorCode=="CHUNK_SIZE_ABNORMAL")' > chunk_errors.json
```

### API错误查询

**通过 Prisma Studio 查询**:
```bash
# 启动 Prisma Studio
npx prisma studio

# 在浏览器中打开 ErrorLog 表，使用以下过滤条件：
# - errorCode = "CHUNK_SIZE_ABNORMAL"
# - errorCode = "LINK_CONVERSION_LOW_SUCCESS_RATE"
# - errorCategory = "WARNING"
# - createdAt > [最近24小时]
```

**通过数据库直接查询**:
```bash
# 查询分块异常（最近24小时）
sqlite3 prisma/dev.db "SELECT * FROM ErrorLog WHERE errorCode='CHUNK_SIZE_ABNORMAL' AND datetime(createdAt) > datetime('now', '-24 hours') ORDER BY createdAt DESC LIMIT 10;"

# 查询URL转换问题汇总
sqlite3 prisma/dev.db "SELECT errorCode, COUNT(*) as count, MAX(createdAt) as lastOccurrence FROM ErrorLog WHERE errorCode='LINK_CONVERSION_LOW_SUCCESS_RATE' GROUP BY errorCode;"

# 查看错误详情（带context）
sqlite3 prisma/dev.db "SELECT errorCode, message, context FROM ErrorLog WHERE errorCode IN ('CHUNK_SIZE_ABNORMAL', 'LINK_CONVERSION_LOW_SUCCESS_RATE') ORDER BY createdAt DESC LIMIT 5;"
```

### 问题解决指南

**分块数量异常 (CHUNK_SIZE_ABNORMAL)**:
1. 检查原始文本长度和HTML复杂度
2. 查看 `context.chunkCount` 和 `context.averageSize`
3. 优化措施：
   - 简化HTML结构，移除冗余标签
   - 调整 `MAX_CHUNK_SIZE` 配置（当前默认3000）
   - 检查品牌词列表是否过于广泛

**URL转换成功率过低 (LINK_CONVERSION_LOW_SUCCESS_RATE)**:
1. 查看 `context.failedSamples` 了解失败案例
2. 检查 Markets 配置：`/app/language-domains` 页面
3. 验证域名配置：
   ```bash
   # 检查数据库中的 Markets 配置
   sqlite3 prisma/dev.db "SELECT * FROM ShopSettings WHERE key='marketsConfig';"
   ```
4. 优化措施：
   - 补全缺失的语言域名映射
   - 检查 `primaryHost` 和 `primaryUrl` 是否正确
   - 如需调试，临时启用 `aggressive` 策略观察差异

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
- ✅ 代码评审：使用 `createApiRoute` 的处理器需确认遵循 `RouteContext` 契约（优先使用 `params`，如需 `.get()` 直接引用 `searchParams`，避免重复解析 URL）
- ✅ 提交信息遵循 Conventional Commits 格式：`feat(scope): description` 或 `fix(scope): description`
- ✅ 服务层和工具函数测试覆盖率 ≥80% (Vitest)
- ✅ 涉及数据库的测试使用 `--runInBand` 串行执行

## 生产部署

### 服务器架构 (47.79.77.128)

**多租户部署**:
- **Shop1 (Fynony)**: `/var/www/app1-fynony`
  - 主进程: `shop1-fynony`
  - Worker: `shop1-worker`
  - 数据库: Redis DB 11
- **Shop2 (OneWind)**: `/var/www/app2-onewind`
  - 主进程: `shop2-onewind`
  - Worker: `shop2-worker`
  - 数据库: Redis DB 12

### 部署流程

**本地到生产**:
```bash
# 1. 本地开发和测试
npm run check                    # 代码检查
npm run build                    # 本地构建验证

# 2. 提交代码
git add .
git commit -m "feat(service): 功能描述"
git push origin main

# 3. 服务器部署（以 Fynony 为例）
ssh root@47.79.77.128
cd /var/www/app1-fynony
git pull origin main
npm run build                    # ⚠️ 必须：服务器重新构建
pm2 restart shop1-fynony shop1-worker

# 4. 验证部署
pm2 status
pm2 logs shop1-fynony --lines 50 --nostream
```

**⚠️ 关键注意事项**:
- 代码修改后必须在服务器上运行 `npm run build`（特别是前端组件修改）
- 同时重启主进程和 worker 避免代码版本不一致
- 部署时只修改代码，不要同步 `.env`、数据库、`shopify.app.toml`

### SSH 智能连接（绕过VPN）

```bash
# 智能检测物理网卡IP，自动绕过VPN
detect_bypass_vpn_ip() {
    local target_ip="${1:-47.79.77.128}"
    local interface=$(route -n get "$target_ip" 2>/dev/null | grep 'interface:' | awk '{print $2}')

    if [ -n "$interface" ] && [[ ! "$interface" =~ ^utun ]]; then
        local bind_ip=$(ifconfig "$interface" 2>/dev/null | grep "inet " | grep -v "inet6" | awk '{print $2}')
        if [ -n "$bind_ip" ]; then
            echo "$bind_ip"
            return 0
        fi
    fi
}

# SSH连接
ssh_cmd() {
    local BIND_IP=$(detect_bypass_vpn_ip "47.79.77.128")
    if [ -n "$BIND_IP" ]; then
        ssh -b "$BIND_IP" -i /Users/elie/Downloads/shopify.pem -o StrictHostKeyChecking=no root@47.79.77.128 "$@"
    else
        ssh -i /Users/elie/Downloads/shopify.pem -o StrictHostKeyChecking=no root@47.79.77.128 "$@"
    fi
}
```

### PM2 进程管理

```bash
# 查看进程状态
pm2 status
pm2 list

# 重启进程
pm2 restart shop1-fynony shop1-worker    # Fynony
pm2 restart shop2-onewind shop2-worker   # OneWind

# 查看日志
pm2 logs shop1-fynony --lines 100 --nostream
pm2 logs shop1-worker --err              # 只看错误日志

# 监控
pm2 monit
```

## API 开发规范

### 使用 createApiRoute

**标准API路由包装器** (`app/utils/base-route.server.js`):

```javascript
import { createApiRoute } from "../utils/base-route.server.js";

export const action = createApiRoute(
  async (context) => {
    const { params, admin, session, request } = context;

    // 推荐：使用 params 获取参数（query + body 合并）
    const { resourceId, language } = params;

    // 兼容：需要 URLSearchParams 方法时使用 searchParams
    const hasFlag = context.searchParams.get('flag');

    // 业务逻辑
    const result = await someService(resourceId, language);

    return { success: true, data: result };
  },
  {
    requireAuth: true,              // 是否需要Shopify认证
    operationName: '资源翻译',       // 操作名称（日志）
    metricKey: 'api.translate',     // 监控指标键
    timeout: 30000                  // 超时时间（毫秒）
  }
);
```

**RouteContext 契约**:
```typescript
{
  request: Request,              // 原始请求对象
  requestId: string,             // 唯一请求ID
  admin?: object,                // Shopify Admin API (需认证)
  session?: object,              // 店铺会话信息 (需认证)
  params: Record<string, any>,   // query + body 合并对象
  searchParams: URLSearchParams, // 原始 URLSearchParams
  routeParams: Record<string, string> // Remix 路由参数
}
```

**最佳实践**:
- ✅ 优先使用 `params` 获取参数（简洁一致）
- ✅ 返回普通对象，框架自动包装为标准响应
- ✅ 抛出错误会自动捕获并记录
- ❌ 避免重复解析 URL 或 body
- ❌ 不要在处理函数中手动包装 JSON 响应

## 常见 Bug 模式与解决方案

### 对象 vs 字符串混合返回

**问题**: 函数返回类型不一致导致前端显示 `[object Object]`

**案例**: `translateText()` 有时返回 `string`，有时返回 `{text, skipped, skipReason}`

**解决方案**:
1. **后端统一处理** - 在后处理函数中统一提取值：
```javascript
// app/services/translation/core.server.js
export async function postProcessTranslation(translatedText, targetLang, originalText = '') {
  let textToProcess = translatedText;

  // 统一处理两种返回格式
  if (translatedText && typeof translatedText === 'object') {
    textToProcess = translatedText.text ?? translatedText.value ?? originalText ?? '';
  }

  if (typeof textToProcess !== 'string') {
    return originalText;
  }

  return applyPostProcessors(textToProcess, context);
}
```

2. **前端安全提取** - 处理对象/字符串混合数组：
```javascript
// app/components/ResourceDetail.jsx
const extractValue = (item) => {
  if (item && typeof item === 'object') {
    return item.text ?? item.value ?? item.original ?? '';
  }
  return item ?? '';
};

const values = array.map(extractValue).filter(Boolean).join(', ');
```

**关键教训**:
- 使用 KISS 原则：单点修复优于散弹式补丁
- 后端集中处理，所有调用方自动受益
- 前端防御性编程，处理边界情况

### 服务器构建缓存问题

**问题**: 代码已部署但前端仍显示旧行为

**原因**:
- 服务器运行旧的构建产物（`build/` 目录）
- 前端组件修改需要重新编译

**解决方案**:
```bash
# 服务器上必须重新构建
cd /var/www/app1-fynony
npm run build                    # 生成新的 build/
pm2 restart shop1-fynony shop1-worker

# 用户端清除浏览器缓存
# Mac: Cmd + Shift + R
# Windows: Ctrl + Shift + F5
```

**预防措施**:
- 部署检查清单中包含服务器构建步骤
- 验证 `build/` 目录时间戳
- 检查 Network 面板确认加载新版本 JS

### 错误字段不匹配导致通用错误消息

**问题**: 批量发布或单语言发布失败时显示 "❌ 发布失败: 发布失败"（通用错误，无详情）

**根因**:
- 后端 `createApiRoute` 返回: `{success: false, message: "具体错误原因"}`
- 前端只检查 `responseData.error`，导致 fallback 到通用消息
- 错误字段名称不一致：后端用 `message`，前端期望 `error`

**修复** (2025-10-10):
- 前端兼容两种字段：`responseData.error || responseData.message || '发布失败'`
- 添加 `console.debug` 保留原始响应供排查其他未知字段
- 影响位置：
  - `app/routes/app._index.jsx:661-665` (单语言发布 publishFetcher)
  - `app/routes/app._index.jsx:727-731` (批量发布 batchPublishFetcher)

**验证**:
```javascript
// 修复前
❌ 批量发布失败: 批量发布失败

// 修复后（显示真实错误）
❌ 批量发布失败: 资源标识解析失败: RESOURCE_GID_UNRESOLVED
❌ 批量发布失败: Request timeout
```

**调试技巧**:
- 打开浏览器 DevTools Console
- 查看 `[Publish Error] Raw response:` 或 `[Batch Publish Error] Raw response:`
- 检查完整响应结构，确认所有可能的错误字段

**关键教训**:
- 前后端错误字段命名需要统一约定
- 前端应兼容多种错误字段格式（防御性编程）
- 保留调试日志有助于排查未知响应结构

### PRODUCT_OPTION GID 保存错误

**问题**: 产品关联翻译功能在创建PRODUCT_OPTION资源时，错误地将Shopify真实GID替换为临时字符串

**表现**:
- 批量发布失败，日志显示"RESOURCE_GID_UNRESOLVED"
- Resource表的gid字段包含`-temp`后缀或cuid格式

**根因**:
1. GraphQL fallback创建临时对象时用`id: ${resourceId}-temp`覆盖真实GID
2. 保存数据库时`gid: option.id`保存了错误的临时字符串
3. 批量发布时ensureValidResourceGid检查失败

**修复** (`product-translation-enhanced.server.js`):
1. **文件顶部**: 添加静态导入 `import { isValidShopifyGid } from './resource-gid-resolver.server.js';`
2. **第315-333行**: 临时对象保持真实GID
   ```javascript
   const shopifyGid = option.id;  // 保存真实GID
   return {
     id: shopifyGid,    // 用于内存逻辑
     gid: shopifyGid,   // 用于DB保存
     isTemporary: true  // 控制保存行为
   };
   ```
3. **第349-368行**: 同上修改
4. **第470行**: 非临时分支添加GID验证
   ```javascript
   const candidateGid = option.gid ?? option.contentFields?.productGid;
   const validGid = isValidShopifyGid(candidateGid) ? candidateGid : null;
   ```

**验证**: 参考 `docs/OPTION-GID-FIX-VALIDATION.md`

**数据清理**:
```bash
# Dry-run检查
node scripts/fix-option-gids.mjs --dry-run

# 按店铺清理
node scripts/fix-option-gids.mjs --shop=shop1
```

**修复日期**: 2025-10-08

**影响范围**: PRODUCT_OPTION资源（约609个），PRODUCT_METAFIELD不受影响

## 重要文件位置

### 核心服务 (app/services/)

**翻译管道** (核心流程):
- `translation.server.js` - 翻译引擎主入口
- `translation/core.server.js` - 核心翻译逻辑（`translateText`, `postProcessTranslation`）
- `translation/` - 翻译子模块目录
- `shopify-graphql.server.js` - Shopify GraphQL API封装
- `database.server.js` - 数据库操作抽象层
- `queue.server.js` / `queue-manager.server.js` - Redis队列系统
- `sync-to-shopify.server.js` - 翻译结果同步到Shopify

**智能决策系统** (Sequential Thinking):
- `sequential-thinking-core.server.js` - 核心决策引擎
- `intelligent-skip-engine.server.js` - 智能跳过决策（避免重复翻译）
- `version-detection.server.js` - 内容版本检测
- `error-prevention-guard.server.js` - 错误预防守卫
- `auto-recovery.server.js` - 自动恢复机制

**增强功能**:
- `product-translation-enhanced.server.js` - 产品关联翻译（options, metafields）
- `theme-translation.server.js` - 主题翻译
- `incremental-translation.server.js` - 增量翻译
- `link-converter.server.js` - 链接本地化转换

**错误处理体系**:
- `error-handler.server.js` - 统一错误处理（`withErrorHandling`, `captureError`）
- `error-analyzer.server.js` - 错误模式分析
- `error-collector.server.js` - 错误收集聚合
- `error-recovery.server.js` - 错误恢复策略
- `error-toolkit.server.js` - 错误工具集

**钩子系统**:
- `hooks-manager.server.js` - 钩子管理器
- `translation-hooks-manager.server.js` - 翻译钩子管理
- `hooks-plugins/` - 钩子插件目录

**监控与分析**:
- `api-monitor.server.js` - API监控（性能、失败率）
- `performance-monitor.server.js` - 性能监控
- `quality-error-analyzer.server.js` - 质量错误分析
- `log-persistence.server.js` - 日志持久化

**其他关键服务**:
- `language-coverage.server.js` - 语言覆盖率统计
- `content-digest-tracker.server.js` - 内容摘要追踪
- `translation-session-manager.server.js` - 翻译会话管理（断点续传）
- `webhook-manager.server.js` / `webhook-cleanup.server.js` - Webhook管理
- `market-urls.server.js` - Markets多语言URL管理
- `brand-dictionary.server.js` - 品牌词典

### 工具层 (app/utils/)

**API与路由**:
- `base-route.server.js` - `createApiRoute` 统一路由包装
- `api.server.js` - API调用封装（翻译API）
- `api-response.server.js` - 响应格式标准化

**日志系统**:
- `logger.server.js` - 主日志器（`apiLogger`）
- `unified-logger.server.js` - 统一日志
- `base-logger.server.js` - 日志基类

**配置与环境**:
- `config.server.js` - 配置管理
- `env.server.js` - 环境变量加载

**错误处理**:
- `error-handler.server.js` - 错误处理工具
- `error-fingerprint.server.js` - 错误指纹生成
- `error-messages.server.js` - 错误消息格式化

**其他工具**:
- `resource-adapters.js` - 资源适配器（26种资源类型）
- `resource-filters.js` - 资源过滤工具
- `metafields.js` - Metafield处理
- `redis-parser.server.js` - Redis数据解析
- `pipeline.server.js` - 管道工具

### 数据模型
- `prisma/schema.prisma` - 数据库模式定义
- `app/db.server.js` - Prisma客户端单例

### 配置文件
- `shopify.app.toml` - Shopify应用权限配置
- `.env` - 环境变量（本地创建）
- `ecosystem-workers.config.js` - PM2 worker配置
