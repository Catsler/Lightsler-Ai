# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Shopify多语言翻译应用，用于自动翻译店铺的各种资源内容。基于Remix框架构建，集成Shopify GraphQL API (2025-07版本) 和GPT翻译服务。

### 核心功能
- **多资源类型支持**: 产品、集合、页面、文章、博客、菜单、链接、过滤器等8种Shopify资源类型
- **批量翻译**: 支持同步模式和异步队列模式（Redis/内存降级）
- **富文本处理**: 智能保留HTML标签、图片、视频等富媒体元素
- **SEO优化**: 支持SEO标题和描述的独立翻译
- **嵌入式应用**: 在Shopify Admin中运行，完全集成Shopify生态
- **错误日志系统**: 完整的错误追踪、分析和导出功能

## 常用开发命令

### 快速启动
```bash
npm install          # 安装依赖
npm run setup        # 初始化数据库（生成Prisma客户端 + 迁移）
npm run dev          # 启动开发服务器（Shopify CLI）
```

### 开发调试
```bash
npm run dev          # 启动开发服务器（通过Shopify CLI，自动处理隧道和认证）
npm run build        # 构建生产版本
npm run lint         # 运行ESLint检查
npm run start        # 运行生产服务器（需先build）
node check-status.js # 检查应用运行状态（配置、数据库、队列）
node simple-test.js  # 基础功能测试（无需Shopify环境）
```

### 数据库管理
```bash
npx prisma generate      # 生成Prisma客户端
npx prisma migrate dev   # 创建/运行数据库迁移
npx prisma studio        # 打开数据库管理界面
npx prisma migrate reset # 重置数据库（清除所有数据）
```

### Shopify部署
```bash
npm run deploy       # 部署应用到Shopify（更新权限、webhook等配置）
npm run config:link  # 链接Shopify配置
npm run config:use   # 选择Shopify配置
```

### 测试脚本
```bash
node simple-test.js              # 基础功能测试
node test-new-resources.js       # 测试新资源类型
node scripts/init-languages.js   # 初始化语言列表
```

### Redis队列（可选）
```bash
brew services start redis  # 启动Redis服务（macOS）
redis-cli ping            # 测试Redis连接
```

## 项目架构

### 技术栈
- **框架**: Remix v2.16.1 + React v18.2.0
- **UI组件**: Shopify Polaris v12.27.0
- **数据库**: SQLite + Prisma ORM v6.2.1
- **队列系统**: Bull + Redis/IORedis（可选，自动降级到内存队列）
- **API版本**: Shopify GraphQL Admin API 2025-07
- **构建工具**: Vite v5.4.8
- **Node版本**: >=18.20

### 核心目录结构
```
app/
├── routes/              # Remix路由和页面
│   ├── api.*.jsx       # API端点
│   ├── app.*.jsx       # 应用页面（嵌入式）
│   ├── test.*.jsx      # 测试页面
│   └── debug.*.jsx     # 调试页面
├── services/            # 业务逻辑服务
│   ├── translation.server.js     # 翻译核心服务
│   ├── shopify-graphql.server.js # Shopify API封装
│   ├── database.server.js        # 数据库操作
│   ├── queue.server.js           # Redis队列服务
│   ├── memory-queue.server.js    # 内存队列降级方案
│   └── error-logging.server.js   # 错误日志服务
├── utils/               # 工具函数
│   ├── api.server.js             # API工具函数
│   ├── api-response.server.js    # API响应标准化
│   ├── config.server.js          # 配置管理
│   ├── error-handler.server.js   # 错误处理
│   ├── error-logger.server.js    # 错误记录器
│   ├── error-analyzer.server.js  # 错误分析器
│   ├── logger.server.js          # 日志记录
│   ├── translation-common.server.js # 翻译通用函数
│   └── language-detector.js      # 语言检测工具
├── components/          # React组件
├── shopify.server.js    # Shopify应用配置
└── db.server.js         # Prisma客户端单例
```

### 数据流程
1. **资源扫描**: 通过GraphQL API批量获取Shopify资源
2. **数据存储**: 使用Prisma ORM存储到SQLite数据库
3. **翻译处理**: 调用GPT API进行智能翻译
4. **结果同步**: 通过GraphQL Mutation更新Shopify店铺

### 主要API端点
- `POST /api/scan-resources` - 扫描所有支持的资源类型
- `POST /api/translate` - 同步翻译（即时返回）
- `POST /api/translate-queue` - 异步翻译（队列处理）
- `GET /api/status` - 获取系统状态和统计
- `POST /api/clear` - 清理数据（资源/队列/全部）
- `GET /api/translation-logs` - 查看翻译日志
- `POST /api/check-translation` - 检查特定资源翻译状态
- `GET /api/error-logs` - 查看错误日志
- `GET /api/error-stats` - 获取错误统计
- `GET /api/error-export` - 导出错误日志

## 环境变量配置

### 必需配置
```bash
SHOPIFY_API_KEY=xxx        # Shopify应用API密钥
SHOPIFY_API_SECRET=xxx     # Shopify应用密钥
GPT_API_KEY=xxx           # GPT翻译API密钥
```

### 可选配置
```bash
GPT_API_URL=https://api.cursorai.art/v1  # GPT API地址（有默认值）
REDIS_URL=redis://localhost:6379         # Redis连接（可选，自动降级）
DATABASE_URL=file:dev.sqlite             # 数据库路径（有默认值）
QUEUE_CONCURRENCY=5                      # 队列并发数（默认5）
```

## 数据模型

### 核心数据表
- **Session**: Shopify会话管理
- **Shop**: 店铺信息和访问令牌
- **Resource**: 待翻译资源
  - resourceType: 资源类型标识
  - gid: Shopify GraphQL ID
  - descriptionHtml: 富文本内容
  - contentFields: JSON字段存储特定类型数据
- **Translation**: 翻译结果
  - 每个资源+语言组合一条记录
  - translationFields: JSON字段存储额外翻译内容
- **Language**: 支持的语言配置
- **ErrorLog**: 错误日志记录
  - 包含错误类型、消息、堆栈、上下文等信息

## 开发规范

### 代码风格
- 使用2个空格缩进
- 服务端文件命名: `*.server.js`
- 遵循项目ESLint配置
- 注释使用中文

### Shopify集成要点
- 认证: 使用 `shopify.authenticate.admin()` 获取admin和session
- UI组件: 使用Shopify Polaris保持一致性
- GraphQL: 使用2025-07版本API
- 嵌入式模式: 应用在Shopify Admin内运行
- 权限范围: 在shopify.app.toml中配置scopes

### 错误处理
- API路由统一使用 `withErrorHandling` 包装
- 详细记录错误日志到数据库
- Redis失败自动降级到内存队列
- 错误分析工具自动分类和统计

## 翻译系统详解

### 资源类型分类
1. **产品类**: product, collection, filter
2. **内容类**: article, blog, page  
3. **导航类**: menu, link

### 富文本处理策略
- HTML标签自动识别和保留
- 媒体元素（图片/视频）保护
- 特殊字符正确转义
- 嵌套结构完整性维护

### 队列系统特性
- **同步模式**: 少量资源即时处理
- **异步模式**: 大批量后台处理
- **自动降级**: Redis不可用时使用内存队列
- **失败重试**: 自动重试机制（最多3次）
- **进度跟踪**: 实时任务状态查询

## 故障排查

### 认证循环问题
```bash
npm run deploy  # 更新应用权限配置
```

### 数据库错误
```bash
npm run setup           # 初始化数据库
npx prisma migrate dev  # 应用迁移
```

### Redis连接失败
系统会自动降级到内存队列，无需手动干预

### 翻译API问题
- 确认GPT_API_KEY已配置
- 检查GPT_API_URL可访问性
- 查看 `/api/translation-logs` 获取详细错误
- 查看 `/app/error-logs` 页面分析错误模式

## 开发完成检查清单

1. ✅ 运行 `npm run lint` 无错误
2. ✅ 运行 `npm run build` 构建成功
3. ✅ 数据模型变更后运行 `npx prisma migrate dev`
4. ✅ 功能测试通过（扫描、翻译、状态查询）
5. ✅ 新增Shopify权限后运行 `npm run deploy`