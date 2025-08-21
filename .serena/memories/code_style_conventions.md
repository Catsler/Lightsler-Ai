# 代码风格和约定

## 文件命名约定
- **服务端文件**: 使用 `*.server.js` 后缀（如 `translation.server.js`）
- **客户端组件**: 使用 `*.jsx` 后缀
- **路由文件**: 遵循Remix文件系统路由约定
- **配置文件**: 使用描述性名称（如 `resource-categories.js`）

## 代码风格
- **缩进**: 2个空格
- **注释语言**: 中文注释
- **ESLint**: 基于 @remix-run/eslint-config
- **Prettier**: 统一代码格式化
- **TypeScript**: 启用严格类型检查

## 架构模式
- **MVC分离**: 
  - `routes/` - 控制器层（Remix路由）
  - `services/` - 业务逻辑层
  - `components/` - 视图层（React组件）
  - `utils/` - 工具函数层
- **错误处理**: 统一使用 `withErrorHandling` 包装器
- **数据库**: Prisma ORM单例模式（`db.server.js`）

## API设计约定
- **认证**: 使用 `shopify.authenticate.admin()` 
- **GraphQL版本**: 统一使用 2025-07
- **错误响应**: 标准化错误格式（TranslationError类）
- **API路径**: 
  - `/api/*` - 业务API端点
  - `/webhooks/*` - Webhook处理端点
  - `/app/*` - 嵌入式应用页面
  - `/test/*` - 测试页面
  - `/debug/*` - 调试页面

## 数据模型约定
- **ID生成**: 使用 `@default(cuid())` 
- **时间戳**: 标准 `createdAt` 和 `updatedAt`
- **软删除**: 使用状态字段而非物理删除
- **索引**: 为常用查询添加数据库索引
- **关系**: 使用级联删除 `onDelete: Cascade`

## 函数命名
- **翻译函数**: `translate*` 前缀（如 `translateTextEnhanced`）
- **验证函数**: `validate*` 前缀
- **处理函数**: `process*` 前缀
- **获取函数**: `fetch*` 或 `get*` 前缀
- **工具函数**: 动词开头（如 `protectHtmlTags`）

## 错误处理约定
- **自定义错误**: 继承 `TranslationError` 类
- **错误分类**: API/DB/VALIDATION/NETWORK/UI/QUEUE/GRAPHQL等
- **错误指纹**: 用于错误去重和分组
- **自动重试**: GraphQL操作使用 `executeGraphQLWithRetry`

## 安全最佳实践
- **密钥保护**: 从不在代码中硬编码API密钥
- **日志安全**: 避免记录敏感信息
- **输入验证**: 所有用户输入都要验证
- **权限检查**: Shopify权限范围严格控制