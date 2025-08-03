# 代码风格和约定

## 代码格式化
- **缩进**: 2个空格
- **字符编码**: UTF-8
- **行尾**: 自动插入换行符
- **尾部空格**: 自动删除（除了Markdown文件）

## ESLint配置
- 基于 @remix-run/eslint-config
- 包含 Node.js 和 Jest 测试库规则
- 集成 Prettier 格式化
- 全局变量: `shopify` (只读)

## 文件命名约定
- **路由文件**: app/routes/ 目录下，使用点号分隔命名（如 app._index.jsx）
- **服务文件**: 使用 .server.js 后缀（如 translation.server.js）
- **组件文件**: 使用 PascalCase（如 Index.jsx）

## 代码组织
- **路由**: app/routes/ - Remix路由文件
- **服务**: app/services/ - 业务逻辑和服务端代码
- **工具**: app/utils/ - 通用工具函数
- **数据库**: prisma/ - 数据模型和迁移

## TypeScript/JavaScript
- 项目支持TypeScript，但当前主要使用JavaScript
- 服务端文件使用 .server.js 后缀以区分客户端和服务端代码

## 注释语言
- 代码注释主要使用中文
- 重要的配置和错误信息使用中文