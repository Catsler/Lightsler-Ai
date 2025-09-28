# Translation Core Refactor Notes

本文档记录 2025-09 的翻译主链路重构要点，帮助后续维护者快速理解新的模块边界与监控方案。

## 模块拆分结构

```
app/services/translation/
├── core.server.js              # 核心实现（原 translation.server.js 主体）
├── chunking.server.js          # 分块、HTML 保护/恢复工具
├── post-processors.server.js   # 统一后处理管线（换行、裁剪、链接转换等）
├── api-client.server.js        # API 调度器（重试/缓存/降级）
├── prompts.server.js           # 提示词模板
├── validators.server.js        # 完整性/质量评估
└── metrics.server.js           # RollingWindow + 分位数指标
```

`app/services/translation.server.js` 现为兼容 facade，仅 re-export `core.server.js` 暴露的接口，外部调用路径保持不变。

## 调用约定

- **短文本**：继续使用 `translateText` / `translateTextWithFallback`。
  - 可传对象参数 `{ retryCount, postProcess, linkConversion }`。
  - `postProcess` 将透传给管线，`linkConversion` 也可单独传入（优先级高于 `postProcess.linkConversion`）。
- **长文本**：`translateTextEnhanced` 会自动检测阈值，触发 `translateLongTextEnhanced → chunkText → applyPostProcessors`。
  - 长文本分块支持 HTML 保护与恢复，默认 joiner：HTML 无分隔、纯文本使用 `\n\n`。
- **后处理**：`applyPostProcessors` 默认执行：换行标准化 → `trim` → fallback 原文。
  - 如提供 `{ linkConversion: { enabled, marketConfig, locale, options } }`，则自动调用 `convertLinksForLocale`。
  - 可追加 `extraProcessors: [async (text, ctx) => text]` 实现自定义流水线。

## 监控与指标

- `metrics.server.js` 新增 `RollingWindow` 实现，提供 `windows.{1m,5m,15m}` 的 `p50/p90/p95/p99`、成功率、缓存率等。
- `translationClient.execute` 在核心层记录：策略、耗时、重试、缓存命中。
- `getTranslationStats()` 中的 `stats.apiMetrics` 现包含 `windows` 字段，可直接用于仪表盘。

## 向后兼容

- 旧代码继续从 `app/services/translation.server.js` 导入；行为与原 facade 一致。
- 长文本、post-process、链接转换选项均为可选，未传递时保持此前输出。
- 迁移过程中仅新增模块文件，无需调整调用方路径。

## TODO / 后续工作

- `docs/translation-core.md`（预留）：补充更细粒度的 API 文档与最佳实践。
- 验证 `translateResource` 等调用方是否需要将 `linkConversion` / `postProcess` 上下文传入，以发挥新管线的能力。
- 结合 RollingWindow 指标，完善 Prometheus / 日志告警脚本。

## 旧接口监控与迁移计划

- 使用 `getTranslationMetrics().strategies` 中的 `originStrategy` 和 `meta.strategy` 字段统计旧策略调用量。
- 推荐每小时记录一次旧策略占比，低于 5% 时通知业务方安排下线窗口。
- 如需更精确统计，可在日志搜索中筛选 `context.functionName` 为 legacy 名称并输出总数。
- 结合《translation-monitoring-guide.md》中的阈值设置告警，确保迁移过程中异常迅速发现。
