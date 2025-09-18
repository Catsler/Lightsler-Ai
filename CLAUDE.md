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

## 🚨 开发启动第一准则 (CRITICAL - READ FIRST)

### 项目启动权限控制
**绝对禁止**: 
- ❌ 自主启动项目开发服务器
- ❌ 更改用户指定的启动域名、隧道配置  
- ❌ 修改用户的开发环境设置（除非明确授权）
- ❌ 使用默认的shopify app dev命令
- ❌ 创建或修改任何隧道配置

**强制要求**:
- ✅ 项目启动前必须获得用户明确授权
- ✅ 保持用户配置的域名和隧道设置不变
- ✅ 如必须启动，使用指定命令：`shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000`
- ✅ 尊重用户的专有隧道配置和部署环境

### 授权启动命令
```bash
# 唯一允许的启动命令（需用户授权）
shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000

# 开发环境SSL绕过（如需要）  
NODE_TLS_REJECT_UNAUTHORIZED=0 shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000
```

**重要提示**: 此域名配置为用户专用，Claude Code不得擅自修改或使用其他隧道地址。

### 关键配置信息
- **应用URL**: https://translate.ease-joy.fun
- **Client ID**: fa2e9f646301c483f81570613924c495 (在shopify.app.toml中配置)
- **应用名称**: Lightsler AI Translator
- **嵌入模式**: 启用 (embedded = true)

## 🚨 组件引用强制规范 (CRITICAL - READ FIRST)

### 强制使用本地组件库
**绝对禁止**: 
- ❌ 使用网络搜索的随机代码示例
- ❌ 使用可能过时的Polaris组件API
- ❌ 直接从记忆中引用组件而不查阅本地文档

**强制要求**:
- ✅ 所有Polaris组件必须先查阅 `docs/components/polaris/` 目录
- ✅ 所有GraphQL查询必须参考 `docs/components/shopify-graphql/` 
- ✅ 使用组件前必须验证本地文档的最后验证日期
- ✅ 如本地文档不存在，必须先创建文档再使用

**组件验证工作流**:
```bash
# 1. 运行组件验证脚本
node scripts/verify-components.js

# 2. 检查组件完整性报告
# 脚本会检查:
# - 本地文档是否存在
# - 文档最后更新时间
# - 组件使用情况统计
# - 缺失的组件文档

# 3. 如果发现缺失文档，必须先创建再使用组件
# 4. 使用组件后更新使用统计
```

### 本地文档引用格式
```
@local:polaris/layout/Card          # 布局类组件
@local:polaris/forms/Button         # 表单类组件  
@local:shopify-graphql/queries/     # GraphQL查询
@local:best-practices/              # 项目最佳实践
```

### 核心组件快速参考
| 组件 | 本地文档路径 | 使用频率 | 关键注意事项 |
|------|------------|----------|-------------|
| Card | @local:polaris/layout/Card | 18% | 使用新版Card，不要用LegacyCard |
| Button | @local:polaris/forms/Button | 18% | v12使用variant/tone，不是布尔属性 |
| Text | @local:polaris/data-display/Text | 18% | 统一文本组件，替代DisplayText等 |
| Badge | @local:polaris/feedback/Badge | 16% | tone属性控制颜色 |
| BlockStack | @local:polaris/layout/BlockStack | 16% | 垂直布局首选 |

## 项目概述

Shopify多语言翻译应用，基于Remix框架构建的嵌入式Shopify Admin应用。支持20+种资源类型的批量翻译，包含富文本处理、SEO优化、品牌词保护和智能队列系统。

### 技术栈
- **框架**: Remix v2.16.1 + React v18.2.0
- **UI**: Shopify Polaris v12.27.0
- **数据库**: SQLite + Prisma ORM v6.2.1
- **队列**: Bull + Redis（可选，自动降级到内存队列）
- **API版本**: Shopify GraphQL Admin API 2025-07
- **构建**: Vite v5.4.8
- **测试**: Playwright v1.48.2 (E2E测试)
- **Node**: ^18.20 || ^20.10 || >=21.0.0 (从package.json engines字段)
- **包管理**: npm
- **TypeScript**: v5.2.2 (开发依赖，类型支持)

## 常用开发命令

### 初次设置
```bash
npm install                      # 安装依赖
npm run setup                    # 初始化数据库（生成Prisma客户端 + 迁移）

# 首次运行前的完整初始化
npm install && npm run setup && npm run init-error-patterns
```

### 日常开发
```bash
# 标准开发流程
npm run dev                      # 启动开发服务器
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev  # 开发环境绕过SSL验证

# 增强调试开发流程（推荐）
./start-browser-tools.sh         # 1. 启动浏览器调试工具
npm run dev                      # 2. 启动开发服务器（会自动集成browser-tools）
# 3. 打开 http://localhost:3000/app 开始开发
# 4. browser-tools会实时监控和记录调试信息

# 代码质量检查
npm run lint                     # ESLint代码检查
npm run build                    # 构建生产版本
npm run start                    # 运行生产构建

# 停止调试环境
./stop-browser-tools.sh          # 停止browser-tools服务器
```

### 数据库管理
```bash
npx prisma generate              # 生成Prisma客户端（模型改变后需执行）
npx prisma migrate dev           # 创建/运行数据库迁移
npx prisma studio                # 可视化数据库管理界面
npx prisma migrate reset         # 重置数据库（清除所有数据）
npx prisma migrate deploy        # 生产环境迁移
```

### Shopify部署
```bash
npm run deploy                   # 部署到Shopify（更新权限、webhook等）
npm run config:link              # 链接Shopify应用配置
npm run config:use               # 使用特定的应用配置
npm run generate                 # 生成Shopify应用代码
npm run env                      # 管理环境变量

# 生产环境相关命令
npm run docker-start             # Docker容器启动（包含setup）
npm run graphql-codegen          # GraphQL代码生成
```

### 测试和调试
```bash
# Playwright E2E测试
npm run test:e2e                 # 运行端到端测试
npm run test:e2e:ui              # 运行测试界面
npm run test:e2e:headed          # 运行有界面测试

# 核心功能测试
node test-resource-types.js      # 资源类型测试
node test-multi-language.js      # 多语言测试
node test-sequential-thinking.js # AI系统测试
node test-product-related-translation.js # 产品关联翻译测试（options+metafields）

# 性能测试套件
node test-language-switching-performance.js      # 语言切换性能测试
node test-language-manager-performance.js        # 语言管理器性能
node test-performance-optimization.js            # 性能优化测试
node test-cache-optimization.js                  # 缓存优化测试
node test-database-optimization.js               # 数据库优化测试

# 语言功能测试
node test-language-switching.js                  # 基础语言切换
node test-language-switching-comprehensive.js    # 综合语言切换测试
node test-language-switching-functionality.js    # 语言切换功能测试
node test-language-switching-integration.js      # 集成测试
node test-language-switching-suite.js            # 完整测试套件
node test-language-switching-ux-edge-cases.js    # UX边缘情况测试
node test-language-filter-api.js                 # 语言过滤API测试
node test-language-filter-database.js            # 语言过滤数据库测试

# 系统稳定性测试
node test-error-recovery-system.js               # 错误恢复系统测试
node test-debounce-circuit-breaker.js           # 防抖和熔断器测试

# 问题诊断工具
node diagnose-issue.js           # 问题诊断工具
node check-logs.js               # 检查系统日志
node view-translation-logs.js    # 查看翻译日志

# 系统初始化
npm run init-error-patterns      # 初始化错误模式
node scripts/init-languages.js   # 初始化语言配置
node scripts/reset-database.js   # 重置数据库
node scripts/verify-components.js # 验证组件完整性
```

### Redis管理（可选）
```bash
brew services start redis        # macOS启动Redis
redis-cli ping                   # 测试连接
redis-cli flushall              # 清空缓存
```

### 浏览器调试工具
```bash
# 启动浏览器调试工具服务器
./start-browser-tools.sh         # 启动browser-tools服务器
./stop-browser-tools.sh          # 停止browser-tools服务器

# 与开发环境集成使用
# 1. 启动browser-tools服务器
./start-browser-tools.sh

# 2. 启动开发服务器
npm run dev

# 3. 打开浏览器开发者工具进行调试
# 4. browser-tools会自动监控控制台错误和网络请求

# 调试工作流
open http://localhost:3000/app    # 打开应用
# browser-tools会自动捕获:
# - JavaScript控制台错误和警告
# - 网络请求状态和响应时间
# - 页面性能指标
# - 自动截图功能（v1.2.0+）
```

## 项目架构

### 核心架构模式

**3层架构设计**:
1. **Presentation Layer (UI)**: Remix routes + Polaris components
2. **Service Layer**: Business logic services with `.server.js` suffix
3. **Data Layer**: Prisma ORM + SQLite (production-ready)

**关键设计原则**:
- **Queue-First**: Redis queue with graceful fallback to memory queue
- **Sequential Thinking**: AI-powered error recovery and intelligent skip logic
- **Multi-Store Support**: Shop-scoped data with isolated processing
- **Webhook-Driven**: Real-time sync via comprehensive webhook handling

### 服务层架构

#### 核心翻译流水线
```
shopify-graphql.server.js → database.server.js → queue.server.js → translation.server.js → sync-to-shopify.server.js
```

#### Sequential Thinking 智能系统
```
sequential-thinking-core.server.js  # 核心决策引擎
├── intelligent-skip-engine.server.js    # 智能跳过决策
├── version-detection.server.js          # 内容版本检测
├── error-prevention-guard.server.js     # 错误预防
├── quality-error-analyzer.server.js     # 质量分析
├── auto-recovery.server.js              # 自动恢复
└── translation-intelligence.server.js   # 翻译智能分析
```

#### 错误处理生态
```
error-collector.server.js  # 统一错误收集
├── error-analyzer.server.js        # 模式识别
├── error-recovery.server.js        # 自动修复
└── translation-session-manager.js  # 会话管理
```

#### 性能与监控系统
```
performance-monitor.server.js  # 性能监控
├── memory-cache.server.js          # 内存缓存管理
├── alert-manager.server.js         # 告警管理
└── log-persistence.server.js       # 日志持久化
```

#### 增强服务层
```
enhanced-translation.server.js  # 增强翻译服务
├── theme-translation.server.js     # 主题翻译专用
├── shopify-locales.server.js       # Shopify语言管理
└── webhook-manager.server.js       # Webhook管理
└── webhook-cleanup.server.js       # Webhook清理
```

### 资源类型系统

支持26种Shopify资源类型，按4大分类组织:
- **Products & Collections**: PRODUCT, COLLECTION, FILTER, PRODUCT_OPTION, SELLING_PLAN等
- **Content Management**: ARTICLE, BLOG, PAGE
- **Navigation**: MENU, LINK
- **Theme Resources**: 7种主题相关资源类型
- **Shop Settings**: SHOP, SHOP_POLICY

### 数据模型核心设计

#### 核心实体关系
```
Shop 1:N Language (多语言支持)
Shop 1:N Resource (资源管理)
Resource 1:N Translation (翻译记录)
Resource 1:N ErrorLog (错误追踪)
TranslationSession 1:N Translation (会话管理)
ErrorPattern N:N ErrorLog (模式匹配)
```

#### 关键数据特性
- **版本控制**: contentHash + contentVersion 实现增量检测
- **错误指纹**: fingerprint分组 + 自动修复规则
- **质量评分**: qualityScore + riskScore 双维度评估
- **会话恢复**: 断点续传 + resumeData检查点

### 核心业务流程

#### 完整翻译流水线
1. **资源发现**: Webhook触发 + 批量扫描 → GraphQL API → SQLite存储
2. **智能决策**: Sequential Thinking评估 → 跳过检查 → 版本对比
3. **队列处理**: Redis队列调度 → 并发控制 → 错误重试
4. **AI翻译**: GPT API调用 → HTML标签保护 → 品牌词保护 → 质量评估
5. **结果同步**: GraphQL Mutation → Shopify店铺 → 状态更新

#### 错误恢复机制
1. **错误收集**: 统一错误指纹 → 模式识别 → 自动分类
2. **智能分析**: 根因分析 → 影响评估 → 修复建议
3. **自动恢复**: 重试策略 → 参数调整 → 人工介入

### 主要API端点

#### 核心翻译API
- `POST /api/scan-resources` - 扫描所有资源类型
- `POST /api/translate` - 同步翻译（少量即时）
- `POST /api/translate-queue` - 异步翻译（大批量队列）
- `GET /api/status` - 系统状态和统计
- `POST /api/sync-translations` - 同步翻译到Shopify
- `POST /api/clear` - 清理数据

#### Sequential Thinking API
- `POST /api/translation-sessions` - 翻译会话管理（创建、启动、暂停、恢复）
- `POST /api/detect-changes` - 内容变更检测和智能跳过评估
- `POST /api/error-prevention` - 错误预防和风险评估
- `POST /api/quality-management` - 翻译质量分析和自动恢复

#### 监控和日志API  
- `GET /api/errors` - 错误日志查询
- `GET /api/translation-logs` - 翻译日志查询
- `GET /api/translation-status` - 翻译状态查询

#### Webhook端点
- `/webhooks/app/uninstalled` - 应用卸载
- `/webhooks/app/scopes_update` - 权限更新
- `/webhooks/product/*` - 产品创建/更新/删除
- `/webhooks/collection/*` - 集合创建/更新
- `/webhooks/page/*` - 页面创建/更新
- `/webhooks/theme/*` - 主题发布/更新
- `/webhooks/locale/*` - 语言创建/更新
- `/webhooks/article/*` - 文章创建/更新

## 数据模型（Prisma）

### 核心表结构
- **Session**: Shopify会话管理（含用户信息、权限范围）
- **Shop**: 店铺信息和访问令牌
- **Resource**: 待翻译资源
  - resourceType: 资源类型
  - gid: GraphQL ID
  - resourceId: 友好文件名ID
  - originalResourceId: 原始Shopify资源ID
  - descriptionHtml: 富文本内容
  - contentFields: JSON扩展字段（Theme资源的动态字段）
  - contentHash: 内容哈希值（版本检测）
  - riskScore: 风险评分（0-1）
- **Translation**: 翻译结果
  - 每个资源+语言组合一条记录
  - syncStatus: pending/syncing/synced/failed
  - translationFields: JSON扩展字段
- **Language**: 支持的语言配置
- **ErrorLog**: 完整的错误日志系统
  - 错误指纹分组
  - 影响评估
  - 自动分析和建议修复
  - 多维度索引优化查询

### Sequential Thinking 扩展表结构
- **TranslationSession**: 翻译会话管理
  - 会话状态跟踪（CREATED/RUNNING/PAUSED/COMPLETED/FAILED）
  - 断点检查点系统
  - 进度统计和错误率监控
- **ErrorPattern**: 错误模式识别
  - 错误特征和关键词匹配
  - 频率统计和影响评估
  - 自动修复建议和预防措施
- **ErrorPatternMatch**: 错误模式匹配关系
  - 错误日志与模式的关联
  - 匹配置信度和关键词记录
- **WebhookEvent**: Webhook事件记录
  - 事件类型、负载、处理状态

## 开发规范

### 关键开发模式

#### 服务层开发规范
```javascript
// 服务文件必须以 .server.js 结尾
// 导出单一主函数 + 工具函数
// 统一错误处理和日志记录

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

#### API路由开发规范
```javascript
// 所有API路由使用withErrorHandling包装
import { withErrorHandling } from "../utils/error-handler.server.js";
import { authenticate } from "../shopify.server.js";

export const action = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  // 业务逻辑
  return json({ success: true, data: result });
});
```

#### 数据库操作规范
```javascript
// 使用事务保证数据一致性
// 乐观锁防止并发冲突
import prisma from "../db.server.js";

await prisma.$transaction(async (tx) => {
  const resource = await tx.resource.findUnique({
    where: { id, contentVersion: expectedVersion }
  });
  
  if (!resource) throw new Error('版本冲突');
  
  await tx.resource.update({
    where: { id },
    data: { 
      ...updates,
      contentVersion: { increment: 1 }
    }
  });
});
```

### 代码约定
- **文件命名**: 服务端文件使用 `*.server.js` 后缀
- **错误处理**: API路由使用 `withErrorHandling` 包装器
- **认证**: 使用 `shopify.authenticate.admin()` 
- **GraphQL版本**: 2025-07（在shopify.app.toml中配置）
- **缩进**: 2个空格
- **注释**: 中文注释
- **ESLint**: 基于 @remix-run/eslint-config
- **格式化**: Prettier配置

### 环境变量

**必需**:
```bash
SHOPIFY_API_KEY=xxx        # Shopify应用密钥
SHOPIFY_API_SECRET=xxx     # Shopify应用密码
GPT_API_KEY=xxx           # OpenAI/兼容API密钥
```

**可选**:
```bash
GPT_API_URL=https://api.cursorai.art/v1  # GPT API地址
REDIS_URL=redis://localhost:6379         # Redis（自动降级）
QUEUE_CONCURRENCY=5                      # 队列并发数
NODE_ENV=development|production          # 环境标识
NODE_TLS_REJECT_UNAUTHORIZED=0           # 开发环境SSL绕过
DATABASE_URL="file:./dev.db"             # SQLite数据库文件路径（可选）
```

**环境配置文件示例** (.env):
```bash
# Shopify应用配置
SHOPIFY_API_KEY=fa2e9f646301c483f81570613924c495
SHOPIFY_API_SECRET=your_secret_here

# AI翻译配置
GPT_API_KEY=your_gpt_key_here
GPT_API_URL=https://api.cursorai.art/v1

# 可选配置
REDIS_URL=redis://localhost:6379
QUEUE_CONCURRENCY=5
NODE_ENV=development
NODE_TLS_REJECT_UNAUTHORIZED=0
```

## 关键架构决策

### 核心设计哲学
- **Linus哲学**: 消除特殊情况，统一为通用模式（如26种资源类型统一处理）
- **KISS原则**: 保持简单，最小改动实现最大效果
- **向后兼容**: Never break userspace，避免破坏现有行为

### 服务层设计原则
- **单一职责**: 每个`.server.js`文件专注一个业务领域
- **依赖注入**: 服务间通过接口解耦，便于测试和替换
- **错误边界**: 每层都有完整的错误处理和日志记录
- **异步优先**: 重IO操作使用队列和异步处理

### 数据一致性策略
- **乐观锁**: 使用版本号防止并发更新冲突
- **事务边界**: Prisma事务确保跨表操作的原子性
- **幂等操作**: API设计支持安全重试
- **最终一致性**: 异步队列处理接受短暂的数据不一致

### 性能优化架构
- **缓存分层**: 内存缓存 + Redis缓存 + 数据库缓存
- **批量操作**: GraphQL批量查询和更新减少API调用
- **智能跳过**: Sequential Thinking避免不必要的翻译
- **队列分流**: 按资源类型和优先级分队列处理

### 错误处理架构
- **统一收集**: 所有错误通过ErrorLog表集中管理
- **指纹识别**: 相同错误自动去重和分组
- **模式匹配**: ErrorPattern表定义自动修复规则
- **分级响应**: 根据严重程度自动执行不同的恢复策略

## 核心特性实现

### 富文本处理（translation.server.js）
- `protectHtmlTags()`: HTML标签占位符保护
- `restoreHtmlTags()`: 标签恢复和完整性验证
- `BRAND_WORDS`: 品牌词库跳过翻译
- `intelligentChunkText()`: 长文本智能分块

### 队列系统（queue.server.js + memory-queue.server.js）
- Redis优先，自动降级到内存队列
- 批量处理和进度跟踪
- 失败自动重试（最多3次）
- `QUEUE_CONCURRENCY`环境变量控制并发

### Sequential Thinking 智能系统

**核心功能**：AI驱动的智能决策和错误恢复系统

#### 使用场景
1. **智能跳过决策**: 自动判断资源是否需要翻译
   - 检测内容版本变化
   - 评估翻译必要性
   - 避免重复翻译

2. **错误自动恢复**: 翻译失败时的智能处理
   - 分析错误模式
   - 自动调整参数
   - 智能重试策略

3. **质量保证**: 翻译质量多维度评估
   - HTML完整性检查
   - 品牌词保护验证
   - 语义一致性评分

#### 核心模块
- **会话管理**: `translation-session-manager.server.js` - 断点续传
- **智能跳过**: `intelligent-skip-engine.server.js` - AI决策
- **版本检测**: `version-detection.server.js` - 增量更新
- **错误预防**: `error-prevention-guard.server.js` - 风险评估
- **质量分析**: `quality-error-analyzer.server.js` - 多维度评估
- **自动恢复**: `auto-recovery.server.js` - 智能修复

### 产品关联翻译系统（Enhanced Product Translation）

**功能简介**：自动翻译产品的关联内容（options + metafields），无需架构改动。

#### 🚀 启用方法
```bash
# 在 .env 文件中启用功能
ENABLE_PRODUCT_RELATED_TRANSLATION=true

# 重启应用使配置生效
npm run dev
```

#### 🎯 工作原理
1. **零架构改动**: 基于现有API组合调用，不修改核心翻译管线
2. **异步处理**: 关联内容翻译不阻塞产品主体翻译
3. **故障隔离**: Options/Metafields翻译失败不影响产品主体
4. **智能过滤**: 自动识别可翻译的Metafields，跳过技术字段

#### 📋 翻译流程
```
产品翻译请求 → translateResourceWithLogging()
├── 翻译产品主体（title, description, SEO等）✅
├── 检测是否为产品 + 功能已启用
└── 异步触发关联翻译:
    ├── 获取并翻译Product Options
    └── 获取并翻译Product Metafields
```

#### 🔧 核心文件
- `product-translation-enhanced.server.js` - 关联翻译包装服务
- `translation.server.js` - 主翻译入口集成点
- `api.translate.jsx` - API路由调用点

#### ✅ 测试验证
```bash
# 运行完整功能测试
node test-product-related-translation.js

# 测试内容包括:
# - 环境变量配置检查
# - 服务模块加载测试
# - 翻译函数集成测试
# - 配置开关功能测试
```

#### 📊 使用场景
- **完整产品翻译**: 一次调用翻译产品的所有内容
- **多变体产品**: 自动翻译颜色、尺寸等选项名称
- **元字段翻译**: 翻译产品描述补充、规格参数等
- **SEO优化**: 确保产品页面的所有可见内容都被翻译

#### ⚠️ 注意事项
1. **首次使用前**: 确保已扫描产品资源和options（`/api/scan-all`）
2. **Metafields过滤**: 系统会智能跳过SKU、ID等技术字段
3. **性能考虑**: 关联翻译异步进行，不影响主体翻译速度
4. **错误监控**: 查看应用日志以确认关联翻译状态

## 故障排查

### 常见问题和解决方案

| 问题 | 症状 | 解决方案 |
|------|------|----------|
| **认证循环** | 登录后立即退出 | `npm run deploy` 更新权限 |
| **数据库错误** | "Table not found" | `npm run setup` 或 `npx prisma migrate dev` |
| **Redis连接失败** | "ECONNREFUSED" | 自动降级到内存队列，无需干预 |
| **翻译API问题** | "401 Unauthorized" | 检查 `GPT_API_KEY` 和 `GPT_API_URL` |
| **Shopify限流** | "429 Too Many Requests" | executeGraphQLWithRetry自动处理 |
| **版本冲突** | "Version conflict" | 检查contentVersion，使用事务处理 |
| **Webhook失败** | Webhook不触发 | `npm run deploy` 重新注册webhook |

### 错误代码速查
- **AUTH_001**: Session过期 → 重新登录
- **DB_001**: 数据库连接失败 → 检查SQLite文件权限
- **API_001**: GraphQL错误 → 检查API版本和权限
- **TRANS_001**: 翻译失败 → 检查GPT API配置
- **QUEUE_001**: 队列处理失败 → 检查Redis或内存限制

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
- 自动修复建议

## 测试和调试

### 测试页面路由
- `/test/*` - 各种功能测试页面
- `/debug/*` - 调试信息页面
- `/app` - 主应用界面
- `/app/errors` - 错误管理界面
- `/app/sync` - 同步管理界面

### 单独测试特定功能
```bash
# 测试特定资源类型的翻译
node -e "require('./test-resource-types.js').testSpecificType('PRODUCT')"

# 测试特定语言的翻译
node -e "require('./test-multi-language.js').testLanguage('zh-CN')"

# 调试特定错误
node diagnose-issue.js --error-id=123

# 查看特定时间段的日志
node view-translation-logs.js --from="2024-01-01" --to="2024-01-31"
```

### 开发完成检查清单
- ✅ `npm run lint` 无错误
- ✅ `npm run build` 构建成功
- ✅ 数据模型变更后运行 `npx prisma migrate dev`
- ✅ 新增Shopify权限后运行 `npm run deploy`
- ✅ 运行组件验证 `node scripts/verify-components.js`
- ✅ 运行性能测试 `node test-performance-optimization.js`
- ✅ 使用browser-tools验证前端功能和性能
- ✅ 运行E2E测试 `npm run test:e2e`（需要配置E2E_STORAGE_STATE）
- ✅ 测试关键功能流程（扫描→翻译→同步）
- ✅ 验证环境变量配置完整性
- ✅ 确保Redis连接或内存队列降级正常
- ✅ 检查webhook注册状态 `curl /api/status`

### 关键调试命令

#### 系统状态检查
```bash
# 完整系统状态（包含队列、数据库、错误统计）
curl http://localhost:3000/api/status

# 错误日志查询（按严重程度分组）
curl http://localhost:3000/api/errors?category=ERROR&limit=50

# 翻译会话状态（断点续传信息）
curl http://localhost:3000/api/translation-status

# 队列状态（Redis + 内存队列）
curl http://localhost:3000/api/queue-status
```

#### 数据诊断工具
```bash
# 单独测试脚本
node test-error-system.js        # 错误系统完整性测试
node test-resource-types.js      # 资源类型扫描测试
node test-translation-logs.js    # 翻译日志系统测试
node diagnose-issue.js           # 问题诊断工具

# Sequential Thinking 系统测试
node test-sequential-thinking.js # AI决策引擎测试
node test-translation-improvements.js # 翻译质量分析
```

#### 开发环境专用调试
```bash
# 查看所有测试页面
open http://localhost:3000/test/language-selector
open http://localhost:3000/test/translation-overview
open http://localhost:3000/debug/resource-data

# 错误系统调试界面
open http://localhost:3000/app/errors

# 监控面板
open http://localhost:3000/app/monitoring
```

## 项目依赖管理

### 包版本锁定
项目使用 `resolutions` 和 `overrides` 字段锁定关键依赖版本以避免兼容性问题：
- `@graphql-tools/url-loader`: 8.0.16
- `@graphql-codegen/client-preset`: 4.7.0
- `@graphql-codegen/typescript-operations`: 4.5.0
- `vite`: ^5.4.8
- `minimatch`: 9.0.5

### 版本升级注意事项
- **Polaris v13升级**: 需要Node.js v20.10+，同时更新Dockerfile
- **Prisma升级**: 运行 `npx prisma migrate dev` 更新数据库架构
- **Shopify API版本**: 当前使用2025-07，升级时更新shopify.app.toml

## 关键注意事项

### 性能优化
- **批量操作**: 使用 `updateResourceTranslationBatch` 批量更新
- **队列系统**: Redis不可用时自动降级到内存队列
- **内存管理**: 大文本使用 `intelligentChunkText` 分块处理
- **GraphQL限流**: `executeGraphQLWithRetry` 自动处理重试

### 数据完整性
- **版本控制**: 使用 `contentHash` 和 `contentVersion` 进行增量更新
- **风险评估**: 每个资源都有 `riskScore` 评分用于智能决策
- **Theme资源**: 动态字段需特殊处理 `contentFields`
- **翻译质量**: HTML完整性和品牌词保护验证

### 环境要求
- **Node.js**: 需要 18.20+
- **Polaris**: 限制在 v12（v13需要Node 20+）
- **开发环境**: 设置 `NODE_TLS_REJECT_UNAUTHORIZED=0` 绕过SSL验证
- **权限配置**: 确保 `shopify.app.toml` 包含所有必需权限

## 性能测试与优化

### 性能测试工作流
```bash
# 完整性能测试套件（按优先级执行）
# 1. 基础性能测试
node test-performance-optimization.js    # 整体性能优化测试

# 2. 缓存系统测试
node test-cache-optimization.js          # 缓存策略优化
node test-database-optimization.js       # 数据库查询优化

# 3. 语言切换性能测试
node test-language-switching-performance.js      # 语言切换响应时间
node test-language-manager-performance.js        # 语言管理器效率

# 4. 系统稳定性测试
node test-debounce-circuit-breaker.js           # 防抖和熔断器
node test-error-recovery-system.js              # 错误恢复性能
```

### 性能监控集成
```bash
# 在开发环境中启用性能监控
# 1. 启动性能监控服务
npm run dev  # 自动启用performance-monitor.server.js

# 2. 查看实时性能指标
curl http://localhost:3000/api/status    # 包含性能统计

# 3. 性能告警监控
# alert-manager.server.js 会自动监控:
# - 响应时间超出阈值
# - 内存使用过高
# - 队列堆积
# - 错误率异常
```

### 性能优化检查清单
```bash
# 开发完成前必须运行的性能测试
npm run lint && npm run build               # 基础质量检查
node test-performance-optimization.js      # 性能回归测试
node test-cache-optimization.js            # 缓存效率验证
node test-language-switching-performance.js # 用户体验测试

# 生产环境性能验证
# 1. 启用浏览器工具监控
./start-browser-tools.sh

# 2. 模拟生产负载
npm run dev  # 配合browser-tools监控

# 3. 性能指标验证
# - 页面加载时间 < 2秒
# - 语言切换响应 < 500ms
# - 翻译队列处理速度符合预期
# - 内存使用稳定无泄漏
```

---

## 🎯 全局开发规则和命令

此项目继承全局 Agent Rules，提供标准化的开发工作流程：

### 可用的斜杠命令
- **`/commit`** - 标准化提交（emoji + 规范格式）
- **`/check`** - 代码质量检查
- **`/clean`** - 修复格式和 lint 问题
- **`/fix`** - Bug 修复工作流
- **`/docs`** - 文档生成
- **`/analyze`** - 代码分析
- **`/pr`** - PR 审查
- **`/changelog`** - 更新 CHANGELOG
- **`/implement`** - 任务实施工作流

更多命令和详细信息请参见全局配置文件 `~/.claude/CLAUDE.md`。
- 永远中文回答