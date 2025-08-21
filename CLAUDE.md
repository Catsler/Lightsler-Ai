# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Shopify多语言翻译应用，基于Remix框架构建的嵌入式Shopify Admin应用。支持20+种资源类型的批量翻译，包含富文本处理、SEO优化、品牌词保护和智能队列系统。

### 核心特点
- **Sequential Thinking智能系统**: AI驱动的翻译决策引擎，支持智能跳过、错误预防、质量分析
- **自动降级机制**: Redis不可用时自动降级到内存队列
- **品牌词保护**: 智能识别并保护品牌词、SKU、产品型号
- **Webhook自动化**: 实时响应Shopify事件，自动触发翻译流程

### 技术栈
- **框架**: Remix v2.16.1 + React v18.2.0
- **UI**: Shopify Polaris v12.27.0
- **数据库**: SQLite + Prisma ORM v6.2.1
- **队列**: Bull + Redis（可选，自动降级到内存队列）
- **API版本**: Shopify GraphQL Admin API 2025-07
- **构建**: Vite v5.4.8
- **Node**: >=18.20
- **包管理**: npm

## 常用开发命令

```bash
# 初次设置
npm install                      # 安装依赖
npm run setup                    # 初始化数据库（生成Prisma客户端 + 迁移）

# 开发（推荐使用NODE_TLS_REJECT_UNAUTHORIZED避免SSL问题）
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev  # 启动开发服务器（绕过SSL验证）
npm run dev                      # 标准启动（可能遇到SSL问题）
npm run lint                     # ESLint代码检查
npm run build                    # 构建生产版本
npm run start                    # 运行生产构建

# 数据库操作
npx prisma generate              # 生成Prisma客户端（模型改变后需执行）
npx prisma migrate dev           # 创建/运行数据库迁移
npx prisma studio                # 可视化数据库管理界面
npx prisma migrate reset         # 重置数据库（清除所有数据）
npx prisma migrate deploy        # 生产环境迁移

# Shopify CLI命令
npm run deploy                   # 部署到Shopify（更新权限、webhook等）
npm run config:link              # 链接Shopify应用配置
npm run config:use               # 使用特定的应用配置
npm run generate                 # 生成Shopify应用代码
npm run env                      # 管理环境变量

# 测试脚本
node test-error-system.js        # 错误系统测试
node test-resource-types.js      # 资源类型测试  
node test-category-translation.js # 分类翻译测试
node test-multi-language.js      # 多语言测试
node test-sequential-thinking.js # Sequential Thinking 系统演示
node test-translation-logs.js    # 翻译日志测试
node test-url-handle.js          # URL处理测试
node diagnose-issue.js           # 问题诊断工具
node check-logs.js               # 检查系统日志
node view-translation-logs.js    # 查看翻译日志

# 初始化脚本
npm run init-error-patterns      # 初始化错误模式数据
node scripts/init-languages.js   # 初始化语言配置
node scripts/reset-database.js   # 重置数据库脚本

# Redis（可选）
brew services start redis        # macOS启动Redis
redis-cli ping                   # 测试Redis连接
redis-cli flushall              # 清空Redis缓存
```

## 项目架构

### 核心目录结构
```
app/
├── routes/              # Remix路由
│   ├── api.*.jsx       # API端点（扫描、翻译、同步）
│   ├── app.*.jsx       # 嵌入式应用页面
│   ├── test.*.jsx      # 测试页面
│   ├── debug.*.jsx     # 调试页面
│   └── webhooks.*.jsx  # Webhook处理
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
├── components/          # React组件
├── shopify.server.js    # Shopify应用配置
└── db.server.js         # Prisma客户端单例
```

### 支持的资源类型（RESOURCE_TYPES）
- **产品类**: PRODUCT, COLLECTION, FILTER, PRODUCT_OPTION, PRODUCT_OPTION_VALUE, SELLING_PLAN, SELLING_PLAN_GROUP
- **内容类**: ARTICLE, BLOG, PAGE  
- **导航类**: MENU, LINK
- **主题类**: ONLINE_STORE_THEME及其7个子类型（APP_EMBED, JSON_TEMPLATE, LOCALE_CONTENT等）
- **店铺类**: SHOP, SHOP_POLICY

### 数据流程
1. **扫描**: GraphQL批量获取Shopify资源 → 存储到SQLite
2. **翻译**: 调用GPT API（保护HTML标签和品牌词） → 保存翻译结果
3. **同步**: GraphQL Mutation更新到Shopify店铺

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

### 代码约定
- **文件命名**: 服务端文件使用 `*.server.js` 后缀
- **错误处理**: API路由使用 `withErrorHandling` 包装器
- **认证**: 使用 `shopify.authenticate.admin()` 
- **GraphQL版本**: 2025-07
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
- Webhook处理（支持产品、集合、页面、主题等事件）
- GraphQL批量操作优化（executeGraphQLWithRetry）
- 权限范围：读写产品、内容、主题、翻译、文件等

### Theme资源处理
- 动态字段提取（dynamicFields）
- 智能文件名解析（product.tent → Product: Tent）
- JSON模板内容处理
- 保持原始资源ID用于API调用

### Sequential Thinking 智能翻译系统
- **会话管理**: 断点续传、状态恢复、进度跟踪
- **智能跳过**: 基于内容变化、质量历史的AI决策
- **版本检测**: 增量更新、内容同步、变更追踪
- **错误预防**: 事前风险评估、预防措施执行
- **质量分析**: 多维度质量评估、趋势预测
- **自动恢复**: 错误诊断、智能修复、系统自愈

## 部署

### 生产环境部署
```bash
# 部署说明已更新，请参考最新文档
```

### 本地开发环境
- 使用 `npm run dev` 启动开发服务器
- 配置HTTPS可使用Cloudflare Tunnel

## 故障排查

### 常见问题
1. **认证循环**: 运行 `npm run deploy` 更新权限
2. **数据库错误**: 运行 `npm run setup` 或 `npx prisma migrate dev`
3. **Redis连接失败**: 自动降级到内存队列，无需干预
4. **翻译API问题**: 检查GPT_API_KEY和GPT_API_URL
5. **Shopify API限流**: executeGraphQLWithRetry自动处理重试
6. **SSL证书问题**: 开发环境使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`

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
- `/app/simple` - 简化版界面
- `/app/monitoring` - 监控面板

### Browser Tools集成（MCP服务器）
```bash
# 启动Browser Tools进行UI测试
./start-browser-tools.sh

# 停止Browser Tools
./stop-browser-tools.sh
```
Browser Tools提供浏览器自动化测试，包括截图、控制台日志、网络监控等功能。

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
- ✅ 测试关键功能流程（扫描→翻译→同步）

### 调试工具
```bash
# 查看翻译状态
curl http://localhost:PORT/api/status

# 查看错误日志
curl http://localhost:PORT/api/errors

# 查看翻译日志
curl http://localhost:PORT/api/translation-logs

# 测试GraphQL连接
curl -X POST http://localhost:PORT/api/test-graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ shop { name } }"}'

# 清理缓存和数据
curl -X POST http://localhost:PORT/api/clear

# 查看Webhook统计
curl http://localhost:PORT/api/webhook-stats
```

### 开发提示
- **端口问题**: 开发服务器通常运行在随机端口，检查控制台输出
- **认证问题**: 首次访问需要通过Shopify OAuth流程
- **数据库迁移**: 模型改变后运行 `npx prisma migrate dev`
- **清理测试数据**: 使用 `/api/clear` 端点或 `npx prisma migrate reset`

## 项目依赖管理

### 包版本锁定
项目使用 `resolutions` 和 `overrides` 字段锁定关键依赖版本以避免兼容性问题：
- `@graphql-tools/url-loader`: 8.0.16
- `vite`: ^5.4.8
- `minimatch`: 9.0.5

### 版本升级注意事项
- **Polaris v13升级**: 需要Node.js v20.10+，同时更新Dockerfile
- **Prisma升级**: 运行 `npx prisma migrate dev` 更新数据库架构
- **Shopify API版本**: 当前使用2025-07，升级时更新shopify.app.toml

## 工作流程

### 典型翻译流程
1. **扫描资源**: `POST /api/scan-resources` 获取Shopify资源
2. **批量翻译**: `POST /api/translate-queue` 进入队列处理
3. **同步到店铺**: `POST /api/sync-translations` 更新到Shopify

### Sequential Thinking智能决策流程
1. **创建会话**: 初始化翻译会话，设置断点检查点
2. **智能跳过**: AI评估是否需要重新翻译（基于内容变化、质量历史）
3. **错误预防**: 事前风险评估，执行预防措施
4. **质量分析**: 多维度评估翻译质量
5. **自动恢复**: 错误时智能诊断并修复

## 注意事项

1. **Theme资源**: 使用动态字段，需要特殊处理contentFields
2. **翻译质量**: 关注HTML结构完整性和品牌词保护
3. **性能优化**: 大批量翻译使用队列系统
4. **错误恢复**: ErrorLog表提供详细错误追踪
5. **开发环境**: 需要设置NODE_TLS_REJECT_UNAUTHORIZED=0绕过SSL验证
6. **批量操作**: 使用updateResourceTranslationBatch进行批量更新以优化性能
7. **日志管理**: TranslationLogger类自动记录所有翻译操作
8. **内存管理**: 大文本使用intelligentChunkText分块处理避免内存溢出
9. **权限管理**: 确保shopify.app.toml中的scopes包含所有必需权限
10. **版本兼容**: Node.js需要18.20+，Polaris限制在v12（v13需要Node 20+）
11. **队列系统**: Redis不可用时自动降级到内存队列，无需手动干预
12. **GraphQL限流**: executeGraphQLWithRetry自动处理重试和限流
13. **Webhook处理**: 支持产品、集合、页面、主题、语言、文章等多种事件类型
14. **内容版本控制**: 使用contentHash和contentVersion进行变更检测和增量更新
15. **风险评估**: 每个资源都有riskScore评分，用于智能决策
16. **测试先行**: 修改后必须运行 `npm run lint` 和 `npm run build` 确保代码质量