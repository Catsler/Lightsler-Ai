# Repository Guidelines

## 项目结构与模块组织
- Remix 源码集中在 `app/`，路由文件 `app/routes/*.jsx` 控制页面与 API 处理，服务逻辑放在 `app/services/*.js` 拆分 Shopify 交互、同步、队列等职责，UI 组件复用自 `app/components/`，通用工具与 hooks 置于 `app/utils/`。
- Prisma schema 与迁移位于 `prisma/`；静态资源与实验性 HTML 演示放在 `public/`；自动化脚本位于 `scripts/`；Shopify 扩展存放于 `extensions/`。对照该结构放置新模块，避免在 `app/` 根目录堆积。
- 测试优先镜像业务目录建于 `tests/**`，必要时与路由同级 co-locate；提交前确认清理生成产物 `build/` 与临时日志。

## 构建、测试与开发命令
- `npm run build`：通过 Vite 编译 Remix 入口，生成 SSR 与浏览器产物，产出写入 `build/`。
- `npm run start`：依赖 `remix-serve` 启动编译产物，保持 `.env` 中的隧道 URL 与 Shopify 配置一致。
- `npm run setup`：顺序执行 `prisma generate`、`prisma migrate deploy`，确保 Prisma Client 与数据库 schema 同步。
- `npm run lint`：运行 ESLint 并缓存结果，必要时使用最小化的 `// eslint-disable-next-line` 注释并说明原因。
- `npm run test`（如缺失则改用 `vitest` CLI）：运行 Vitest/Jest 测试；务必在调试模式下加 `--runInBand` 处理数据库依赖。

## 编码风格与命名约定
- 统一采用 2 空格缩进、Prettier 默认配置与 ESLint 规则，启用尾随逗号、单引号字符串及自动排序导入（若适用）。
- React 组件文件使用 PascalCase（如 `CoverageCard.jsx`），服务与工具使用 camelCase 或 kebab-case（如 `languageCoverage.server.js`、`queue-manager.js`）。
- 导入顺序：第三方库 → 内部别名 → 相对路径；避免 `../../..` 深层路径，可通过配置别名解决。

## 测试指南
- 重点覆盖 `app/services/*.server.js` 与 `app/utils/*.js` 的纯函数及副作用接口；为 Shopify API 调用编写 deterministic mock。
- 命名采用 `*.test.js` 或 `*.spec.js`；共享测试工具放在 `tests/utils/`。
- 新增逻辑前先写失败测试；修复线上问题时添加回归测试并在 PR 内记录复现步骤。
- CI 关注逻辑分支覆盖度，建议保持关键服务 ≥80%，并关注数据库回滚路径。

## 提交与拉取请求规范
- 使用 Conventional Commits（示例：`feat(app): add translation queue api`、`fix(services): handle webhook error`），提交范围精准，避免混入无关文件。
- PR 需说明动机、关联 Issue、测试/验证步骤，并附上 UI 截图或 CLI 日志；注明需后续跟进事项及风险。
- 在推送前执行 `npm run lint`、`npm run test`、`npm run setup`，确认 Prisma 迁移和生成文件已纳入提交或忽略。

## 安全与配置提示
- 所有密钥、店铺域、隧道地址仅存于 `.env` 或部署平台环境变量，必要时在 `shopify.app.toml` 使用占位符。
- 设置/刷新 Prisma 迁移后立即运行 `npm run setup` 同步本地 SQLite；若切换环境，请清空旧数据库或使用 `prisma migrate reset`。
- 处理外部回调与 GraphQL 输入时校验请求头并节流；错误统一通过 `app/services/*error*.server.js` 记录，确保可观测性闭环。
