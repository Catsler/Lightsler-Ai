# 翻译系统监控与报警指南

本指南说明如何使用翻译核心的滚动窗口度量、日志与补充状态接口来持续追踪失败率、延迟与去重/缓存情况。

## 关键指标来源

| 指标 | 说明 | 获取方式 |
| --- | --- | --- |
| `totals.successRate` | 全量成功率，需保持 >99.9% | `getTranslationMetrics()` |
| `totals.cachedRate` | 缓存命中率，评估命中策略 | `getTranslationMetrics()` |
| `recent.p95Duration` | 最近窗口 P95 延迟，阈值：基线 +5% | `getTranslationMetrics()` |
| `windows.1m/5m/15m` | 滑动窗口统计（p50/p90/p95/p99、成功率、缓存率、平均 retries） | `getTranslationMetrics().windows` |
| `strategies[strategy]` | 各策略成功率/时延，用于追踪降级链路效果 | `getTranslationMetrics().strategies` |
| `orchestrator.cache` | API 缓存命中、占用情况 | `getTranslationOrchestratorStatus()` |
| `orchestrator.deduplicator.inFlight` | 当前去重队列长度，用于检测泄漏 | `getTranslationOrchestratorStatus()` |

## 推荐阈值与告警

- **失败率**：`windows.5m.successRate < 0.999` 触发 WARN，`<0.995` 触发 ERROR。
- **P95 延迟**：`windows.5m.p95Duration` 超过基线 5% 触发 WARN；`windows.15m.p95Duration` 超过 10% 触发 ERROR。
- **降级率**：`strategies['simple'].total / totals.total > 0.05` 需调查；>0.1 触发告警。
- **Deduplicator**：`orchestrator.deduplicator.inFlight > 50` 持续 5min 视为潜在泄漏，建议自动清理或告警。
- **缓存命中率**：`windows.15m.cachedRate < 0.2` 表示缓存策略偏低，可复核 TTL 或键策略。

## 验证器回归监控

- 所有验证失败会通过 `collectError` 记录 `ERROR_TYPES.VALIDATION`。
- 建议建立日志查询：`errorCategory: VALIDATION`，比较 `reason` 分布。
- 可基于 `getTranslationMetrics().strategies` 对比连续窗口的失败率差异，阈值：10% WARN，30% ERROR。

## 旧接口调用量统计

旧版调用可通过以下维度评估：

1. `getTranslationMetrics().strategies` 的 `originStrategy` 链接会记录 `enhanced`, `long-text`, `simple` 等新策略；若仍出现其它策略名称（例如 legacy 标记），视为旧接口调用。
2. 日志中 `context.functionName` 保留原始调用入口，可使用以下查询统计：
   - `functionName: translateResource`（旧入口）
   - `functionName: translateTextEnhanced`（新入口）
3. 结合上面滑动窗口数据绘制旧入口占比曲线；当比例 <5% 可安排下线计划。

## 操作建议

- 为 `getTranslationStats()` 添加 Prometheus exporter 或周期性脚本，采集 `totals`、`recent`、`windows` 指标。
- 在 CI / 每日巡检脚本中调用 `getTranslationOrchestratorStatus()`，输出缓存命中率、在途去重数，附带相邻两次差值判断泄漏。
- 校验 `linkConversion` 功能启用店铺时的成功率：过滤 `context.linkConversion.enabled = true` 的日志，确保失败率不高于全局标准。
