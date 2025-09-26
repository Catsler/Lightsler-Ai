# Repository Guidelines

本指南为项目贡献者提供快速上手的参考，在开始开发或提交变更前请先通读，并遵循仓库既定流程。

## Project Structure & Module Organization
- Remix 源码位于 `app/`，其中路由与 API 置于 `app/routes/*.jsx`，服务逻辑集中在 `app/services/*.js`，UI 组件存放在 `app/components/`，工具与 hooks 在 `app/utils/`。
- 数据库 schema 与迁移文件存放于 `prisma/`，静态资源和演示 HTML 位于 `public/`，自动化脚本和维护脚本集中在 `scripts/`，Shopify 扩展在 `extensions/`。
- 测试位于 `tests/**`，必要时可与对应路由同目录；构建产物写入 `build/`，提交前务必清理；若子目录存在更具体的 `AGENTS.md`，请以其为准。

## Build, Test, and Development Commands
- `npm run build`：使用 Vite 编译 Remix SSR 与客户端代码至 `build/`，确保部署前产物最新。
- `npm run start`：基于编译产物由 `remix-serve` 启动本地服务，需确保 `.env` 与 Shopify 配置保持一致。
- `npm run setup`：执行 `prisma generate` 与 `prisma migrate deploy`，以同步 Prisma Client 与数据库 schema。
- `npm run lint`：运行 ESLint（启用缓存），仅在必要时携带原因使用 `// eslint-disable-next-line`。
- `npm run test` / `vitest`：执行测试，涉及数据库时追加 `--runInBand` 以避免竞争条件。

## Coding Style & Naming Conventions
- 统一采用 2 空格缩进、Prettier 默认格式、单引号与尾随逗号，保证 import 顺序为第三方→内部别名→相对路径。
- React 组件使用 PascalCase，例如 `CoverageCard.jsx`；服务与工具使用 camelCase 或 kebab-case，例如 `languageCoverage.server.js`、`queue-manager.js`。
- 注释保持精炼，仅在复杂逻辑前提供背景说明，避免重复代码行为。

## Testing Guidelines
- 首选 Vitest/Jest，重点覆盖 `app/services/*.server.js` 与 `app/utils/*.js`，目标覆盖率≥80%。
- 测试文件命名为 `*.test.js` 或 `*.spec.js`，共享测试辅助函数放入 `tests/utils/`。
- Shopify API 调用需使用确定性 mock，数据库相关测试请串行执行（`--runInBand`），必要时重置数据状态。

## Commit & Pull Request Guidelines
- 提交信息遵循 Conventional Commits，例如 `feat(app): add translation queue api`、`fix(services): handle webhook error`。
- PR 描述需包含变更动机、关联 Issue、验证步骤、日志或截图，以及潜在风险与后续计划；推送前运行 `npm run lint && npm run test && npm run setup`。
- 在创建 PR 前清理 `build/`，并确保 Prisma 生成文件符合 `.gitignore` 设定。

## Security & Configuration Tips
- Shopify 密钥、店铺域与隧道地址必须存放于 `.env` 或平台环境变量，提交记录中只使用占位符。
- 新迁移完成后立即执行 `npm run setup` 同步本地 SQLite；切换环境时可使用 `prisma migrate reset` 确保 schema 一致。
- 外部回调与 GraphQL 输入需进行校验，将错误集中记录在 `app/services/*error*.server.js` 以提升可观测性。
