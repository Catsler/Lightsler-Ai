# ADR-001: 采用 Hooks 插件架构替代 Sequential Thinking 复杂决策路径

- **状态**: Accepted
- **日期**: 2025-09-29

## 背景
- 原有 Sequential Thinking 系统拆分为 6 个相互依赖的服务文件（累计 4k+ 行），逻辑过于复杂，难以迭代与测试。
- 近期 KISS 架构分析指出需要“接口稀疏、默认直通、局部启用、可回退”的新形态，以降低风险并提升可维护性。
- Phase 1 改造已经引入 `createApiRoute` 包装器和 Hooks v1 试点，但缺乏正式的架构决策依据。

## 决策
- 采用 Hooks 插件机制作为翻译决策链路的标准扩展方式。
  - **Core Hooks（v1）**：提供 `shouldTranslate`、`schedule`、`validate`，默认直通，带超时与异常保护。
  - **Extended Hooks（v2）**：用于恢复策略、缓存策略、批量策略等实验能力，必须由 Feature Flag 控制。
  - 插件需声明 `version` 与 `capabilities`，以便灰度管理与回滚。
- `RouteContext` 契约随 `createApiRoute` 一并稳定：处理器收到 `{ params, searchParams, session, requestId, ... }`，保持旧路由兼容。

## 备选方案
1. **保留 Sequential Thinking**：继续维护既有多文件决策引擎。缺点：复杂度与维护成本无改善，回归风险高。
2. **一次性重写翻译主链路**：大爆炸式迁移到新架构。缺点：风险过高、验证周期长，违背渐进式原则。
3. **引入第三方规则引擎**：外部 DSL/Rule Engine 统一处理。缺点：新依赖、学习成本高，难以与 Shopify 环境集成。

## 影响
- **正面**
  - 提供稳定的扩展点，渐进替换 Sequential Thinking 逻辑。
  - 默认直通，避免新插件对现有流程造成硬破坏。
  - 可测试性增强：核心接口覆盖在单元/集成测试范围内。
- **风险**
  - Feature Flag 管理复杂度增加。
  - 插件异常可能影响主流程，需要统一容错策略。
  - 仍需在 Phase 2/3 中逐步迁移其他决策逻辑。

## 推出计划
1. **Phase 1（已完成）**
   - Hooks v1 接口定义、hooks-manager 安全执行器。
   - 在 `translation/core.server.js` 试点挂接（默认直通）。
2. **Phase 2（T+2-3 周）**
   - 按业务价值扩展 `Extended Hooks`，配合 Feature Flags。
   - 拆分 Sequential Thinking 相关服务，迁移高优先级逻辑至插件。
3. **Phase 3（后续）**
   - 收口遗留的 Sequential Thinking 入口。
   - 更新监控/报警，确保灰度上线与回滚路径成熟。

## 指标与验证
- 业务可用性：翻译成功率 ≥ 基线，失败率 < 0.1%。
- 性能：P95 延迟相较基线 +5% 以内。
- 降级率、重试次数、插件执行耗时可观测。
- 参数解析测试：`tests/api/create-api-route.test.js` 确认 `params + searchParams` 契约可用。

## 回滚方案
1. 关闭 `ENABLE_HOOKS` 或相关 Feature Flag，恢复 Sequential Thinking 路径。
2. 清除活动插件，回退至默认直通行为。
3. 观察关键指标 24 小时；如恢复成功再逐步重新启用试点。

## 备注
- 需求文档详见 `docs/kiss-refactor-requirements.md`。
- TODO 中记录了对应任务与后续行动。
