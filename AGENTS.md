# Repository Guidelines

## Global Rules (Codex)
- 本项目继承全局规则：`/Users/Administrator/AGENTS.md`。
- 语言：永远用中文回答（除非明确要求其它语言）。
- 核心：好品味（化特殊为常规）、不破坏用户空间、务实优先、极简设计。
- 执行：使用计划工具、命令前写简短前导语、最小化变更、保持现有代码风格、避免破坏性操作、输出简洁。
- 若与本文件局部约定冲突，应优先遵循全局规则的精神与上位条款。

## Project Structure & Module Organization
- Remix + Vite + Prisma 项目。
- 主要目录：
  - `app/` – Remix 路由与服务层（`app/routes/*.jsx`、`app/services/*.js`、`app/components/`、`app/utils/`）。
  - `public/` – 静态资源与独立测试页。
  - `prisma/` – `schema.prisma` 与 `migrations/`、本地 `dev.db`。
  - `scripts/` – 维护脚本（如 `reset-database.js`、`init-languages.js`）。
  - `docs/` – 组件与最佳实践文档。
  - `extensions/` – Shopify 扩展工作区。

## Build, Test, and Development Commands
- 开发（第一准则，勿擅自改域名/隧道/启动方式）：
  - 授权启动命令（仅在得到明确授权时使用）：
    - `shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000`
- 构建：`npm run build`（Remix Vite 构建）。
- 运行：`npm run start`（启动 `remix-serve`）。不得更改启动域名/隧道设置。
- 数据库：`npm run setup`（Prisma generate + migrate deploy）。
- Lint：`npm run lint`（ESLint，使用缓存）。
- 其他：`npm run shopify`、`npm run prisma`、`npm run graphql-codegen`、`npm run vite`。

## Coding Style & Naming Conventions
- TypeScript/JavaScript：遵循 ESLint + Prettier（配置见 `.eslintrc.cjs`、`.prettierignore`）。
- 文件：React 组件用 `PascalCase.jsx`；工具与服务 `kebab-case.js` 或 `camelCase.js`，保持与现有文件一致。
- 导入顺序：第三方 → 内部模块；避免相对路径地狱，优先 tsconfig 路径或清晰相对路径。
- 约定：函数/变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，目录小写短横线或与现有一致。

## Testing Guidelines
- 当前仓库未提供测试脚手架。建议采用 `vitest` 或 `jest`：
  - 目录：`tests/**/*.test.(ts|js)` 或与 `app/` 同级镜像。
  - 覆盖重点：`app/services/*.server.js`、`app/utils/*.js` 纯逻辑模块。
  - 命令建议：`npm run test`（可在 `package.json` 中新增）。

## Commit & Pull Request Guidelines
- 提交信息：动词原形、精炼、作用域可选（参考 Conventional Commits）。
  - 例：`feat(app): add translation queue api`、`fix(services): handle webhook error`
- PR 要求：
  - 清晰描述与动机，关联 Issue；列出测试步骤与影响范围；UI/CLI 变更附截图或日志；必要时更新文档与脚本。

## Security & Configuration
- 不提交密钥与令牌；使用环境变量与 `shopify.app.toml`/`.env`；提供 `.env.example`（如需）。
- Prisma 迁移在 CI/CD 使用 `npm run setup`；本地 SQLite 文件勿上传生产数据。
- Webhook/GraphQL 输入需校验与限流；记录错误并使用现有 `app/services/*error*.server.js` 能力。
