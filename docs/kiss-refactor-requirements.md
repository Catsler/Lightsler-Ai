# KISS 架构与 API 包装器修复需求

## 1. 背景与范围
- 现状存在超大文件、重复抽象、配置分散；近期在 Phase 1&2 引入统一 createApiRoute 包装后，由于未向处理器传递 URLSearchParams 造成 16+ 路由不可用。
- 目标以 “接口稀疏 + 默认直通 + 局部启用 + 可回退” 为核心原则，建立稳定契约、降低复杂度、确保兼容与可观测。
- 范围覆盖 API 包装器、Hooks 架构、Feature Flag 策略、模块拆分、监控指标与测试。数据库模型、外部依赖和一次性大迁移不在本次范围内。

## 2. 稳定契约
- RouteContext（长期稳定）
  - 字段：request、params（query+body 合并对象）、searchParams（原生 URLSearchParams）、admin、session、routeParams、requestId。
  - 包装器负责构造 url、注入 searchParams，并保留 params 实现双通道兼容；默认提供 30s 超时保护与统一日志。
  - 要求在文档中明确，并通过注释与测试锁定。
- Hooks 接口分级
  - v1 Core（稳定、默认直通）：shouldTranslate、schedule、validate。
  - v2 Extended（实验性、需 Feature Flag）：chooseRecoveryStrategy、cachePolicy、batchSize、onBeforeRequest、onAfterResponse。
  - 插件需自描述 version 与 capabilities；异常应隔离并回退默认逻辑。

## 3. Feature Flag 与回滚
- 三层来源：请求头（最高优先级）、运行时配置（DB/缓存）、编译期环境变量。
- 命名示例：ENABLE_HOOKS、HOOKS_ACTIVE_PLUGIN、ENABLE_API_BASE_ROUTE。
- 回滚策略：关闭相关 flag 即可恢复旧逻辑，需在 5 分钟内确认恢复并持续观察 24 小时。

## 4. 模块拆分策略
- 翻译核心：保持 translation/core.server 为薄编排层，继续使用现有 chunking、post-processors、prompts、metrics、validators、api-client 等子模块；在决策/调度/验收点挂接 Hooks v1。
- Shopify GraphQL：按边界拆分为查询定义、分页与退避、数据映射三个模块，保留薄入口；并发限制在 2-4、实现指数退避与最大重试。
- 坚持按边界而非行数拆分，避免新的“巨石模块”。

## 5. 轻量批处理指南
- 每请求作用域实例化批处理器，支持 key 去重、最大批量与最短等待（建议 50 条 / 10 毫秒），结束时显式 flush。
- 错误应支持局部失败传播；与 GraphQL 限流策略配合使用。

## 6. 可观测性与指标
- 指标金字塔：
  - P0 业务：翻译成功率、同步完成率。
  - P1 性能：P95、队列深度、重试次数、降级率。
  - P2 系统：内存占用、事件循环延迟（采样即可）。
  - P3 诊断：缓存命中率、错误指纹分布、策略路径统计。
- 阈值：失败率 >0.1% 或 P95 较基线 +5% 持续 5 分钟触发告警。
- 日志：统一使用 logger，贯穿 requestId 与 shopId；参数解析失败统一记录键名（例如 param_parse_failed）。
  - 实现：`app/utils/base-route.server.js` 在解析异常时输出 `{ metric: { param_parse_failed: 1 } }`，方便日志聚合与告警。

## 7. 测试策略
- 先补集成测试覆盖关键路径（翻译、状态、GraphQL 退避与降级、后处理管线），后补合约测试与必要快照。
- 核心模块（如翻译、error-toolkit）维持 ≥80% 覆盖；每次改动需覆盖触达边界。
- 新增两条参数解析集成测试：GET 与 POST 各验证 params 与 searchParams 同时可用。

## 8. 交付物与验收标准
- 交付物：RouteContext 契约说明、Hooks v1 指南、Feature Flag 使用文档、指标与告警清单、相关 ADR（Hooks 架构、GraphQL 拆分）、参数解析测试用例。
- 验收：语言与错误管理 API 正常响应；失败率与 P95 不劣于基线；Hooks flag 启用/关闭行为一致；日志与指标可查询；回滚演练通过。

## 9. 里程碑
- Phase 0（完成）：日志统一、错误处理收口、ESLint no-console、searchParams 注入修复。
- Phase 1（Day 3–7）：Hooks v1 只在翻译链路挂接并默认直通；createApiRoute 试点 2–3 路由；补充契约文档与参数解析测试。
- Phase 2（T+2–3 周）：Hooks 扩展到更多决策点（在收益明确时启用）；GraphQL 按边界拆分；建立 P0/P1 告警。

## 10. 风险与缓解
- 新巨石风险：保持薄 facade + 插件模式。
- 接口不兼容：稳定契约 + 集成测试兜底。
- Flag 滥用：统一经 config.server 出口，不允许业务直接读取环境变量。
- 监控噪音：高频接口支持静默/采样；默认不启用 debug。
- 内存风险：批处理与缓存仅限请求级作用域，并确保释放。

## 11. 文档与治理
- ADR 模板字段：Status、Context、Decision、Alternatives、Consequences、Rollout、Metrics、Rollback。
- 目录：docs/adr/ADR-00X-<slug>.md。
- 首要 ADR：Hooks 架构（记录 v1 契约与 flag 策略）、GraphQL 拆分。

## 12. 试点清单
- app/routes/api.translate.jsx
- app/routes/api.status.jsx
- app/routes/api.scan-resources.jsx

以上需求作为后续迭代和评审依据，禁止在未更新契约或缺少回滚策略的情况下调整核心接口。
