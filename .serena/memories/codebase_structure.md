# 代码库结构详解

## 顶层目录结构
```
translate/                      # 项目根目录
├── app/                       # Remix应用主目录
│   ├── routes/               # 路由处理器
│   ├── services/             # 业务逻辑服务
│   ├── utils/                # 工具函数
│   ├── config/               # 配置文件
│   ├── components/           # React组件
│   ├── shopify.server.js     # Shopify应用配置
│   ├── db.server.js          # Prisma客户端单例
│   ├── root.jsx              # 应用根组件
│   └── entry.server.jsx      # 服务端入口
├── prisma/                    # 数据库相关
│   ├── schema.prisma         # 数据模型定义
│   └── migrations/           # 数据库迁移文件
├── public/                    # 静态资源
├── extensions/                # Shopify扩展
├── scripts/                   # 脚本文件
├── screenshoots/             # 截图文档
└── 配置文件根目录
    ├── package.json          # 项目依赖
    ├── remix.config.js       # Remix配置
    ├── vite.config.js        # Vite构建配置
    ├── shopify.app.toml      # Shopify应用配置
    ├── .eslintrc.cjs         # ESLint配置
    ├── tsconfig.json         # TypeScript配置
    └── CLAUDE.md             # AI助手指南
```

## 核心服务模块 (app/services/)

### translation.server.js
- 翻译核心服务，处理GPT API调用
- 主要功能：
  - `translateResourceWithLogging`: 带日志的翻译主入口
  - `translateTextEnhanced`: 增强型文本翻译
  - `protectHtmlTags/restoreHtmlTags`: HTML标签保护
  - `intelligentChunkText`: 智能文本分块
  - 品牌词保护机制

### shopify-graphql.server.js  
- Shopify GraphQL API封装
- 主要功能：
  - 资源类型定义（RESOURCE_TYPES）
  - `fetchResourcesByType`: 按类型获取资源
  - `updateResourceTranslationBatch`: 批量更新翻译
  - `executeGraphQLWithRetry`: 带重试的GraphQL执行
  - 字段映射配置

### database.server.js
- 数据库操作封装
- 主要功能：
  - 资源CRUD操作
  - 翻译结果管理
  - 批量数据处理

### queue.server.js & memory-queue.server.js
- 队列系统实现
- Redis队列（主）和内存队列（降级方案）
- 支持批量任务处理和进度跟踪

### sync-to-shopify.server.js
- 批量同步服务
- 将翻译结果同步到Shopify店铺

### error-analyzer.server.js & error-collector.server.js
- 错误收集和分析系统
- 错误模式识别和根因分析

### theme-translation.server.js
- Theme资源专用翻译服务
- 处理动态字段和JSON模板

## 路由结构 (app/routes/)

### API路由 (api.*.jsx)
- `api.scan-resources.jsx`: 扫描资源
- `api.translate.jsx`: 同步翻译
- `api.translate-queue.jsx`: 异步队列翻译
- `api.sync-translations.jsx`: 同步到Shopify
- `api.status.jsx`: 系统状态
- `api.errors.jsx`: 错误日志
- `api.clear.jsx`: 清理数据

### 应用页面 (app.*.jsx)
- `app._index.jsx`: 主页面
- `app.errors.jsx`: 错误管理
- `app.sync.jsx`: 同步管理
- `app.*.jsx`: 其他功能页面

### 测试页面 (test.*.jsx)
- 各种功能的测试页面
- 用于开发和调试

### 调试页面 (debug.*.jsx)
- 调试信息展示
- 系统状态监控

## 工具函数 (app/utils/)
- `error-handler.server.js`: 错误处理工具
- `api-response.server.js`: API响应标准化
- `error-fingerprint.server.js`: 错误指纹生成
- `logger.server.js`: 日志系统
- `api.server.js`: API辅助函数
- `config.server.js`: 配置管理

## 数据模型 (Prisma Schema)

### 主要数据表
1. **Session**: Shopify会话管理
2. **Shop**: 店铺信息
3. **Resource**: 待翻译资源
4. **Translation**: 翻译结果
5. **Language**: 支持的语言
6. **ErrorLog**: 错误日志

### 数据关系
- Shop -> Resources (一对多)
- Shop -> Translations (一对多)
- Resource -> Translations (一对多)
- Shop -> Languages (一对多)

## 配置文件说明

### shopify.app.toml
- Shopify应用配置
- 权限声明（scopes）
- Webhook配置
- 应用URL配置

### package.json
- 项目依赖管理
- npm脚本定义
- Node版本要求

### vite.config.js
- 构建配置
- 开发服务器配置
- 插件配置

### remix.config.js
- Remix框架配置
- 路由配置
- 构建选项

## 测试脚本
- `test-error-system.js`: 错误系统测试
- `test-resource-types.js`: 资源类型测试
- `test-category-translation.js`: 分类翻译测试
- `test-multi-language.js`: 多语言测试
- `diagnose-issue.js`: 问题诊断工具

## 开发流程集成
1. 代码修改 -> ESLint检查 -> 构建验证
2. 数据模型修改 -> Prisma迁移 -> 客户端生成
3. 权限修改 -> Shopify部署 -> 权限更新
4. 功能开发 -> 测试脚本 -> 手动验证