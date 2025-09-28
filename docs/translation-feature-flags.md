# Translation Feature Flags & Environment Switches

| 标识 | 环境变量 / 来源 | 说明 | 默认值 | 影响范围 |
| --- | --- | --- | --- | --- |
| `ENABLE_TRANSLATION_SKIP` | `config.translation.skipEnabled` | 是否启用智能跳过（翻译时检测相同内容可直接跳过）。 | `false` | `translateTextWithFallback` 及队列调度，影响缓存与重试策略。 |
| `TRANSLATION_SKIP_ONLY_WITH_HASH` | `config.translation.skipOnlyWithHash` | 仅在内容哈希存在时才允许跳过；关闭后根据文本内容判定。 | `true` | 跳过策略容错，避免因缺少哈希导致误判。 |
| `ENABLE_PRODUCT_RELATED_TRANSLATION` | `process.env.ENABLE_PRODUCT_RELATED_TRANSLATION` | 控制是否在产品主翻译后异步翻译 options/metafields。 | `false` | `translateProductWithRelated`，影响额外的 Shopify API 调用。 |
| `ENABLE_PERSISTENT_LOGGER` | `config.logging.enablePersistentLogger` | 控制日志是否写入数据库持久化。 | `true` | 翻译日志查询、`getTranslationLogs` 持久化能力。 |

## 使用建议

- 所有布尔环境变量统一使用 `true/false` 字符串值。
- 开启 `ENABLE_TRANSLATION_SKIP` 后，应监控 `windows.*.cachedRate` 与失败率，确保跳过逻辑不会导致漏翻。
- 若 `ENABLE_PRODUCT_RELATED_TRANSLATION` 打开，请关注 `shopify-graphql` 调用量及风险守卫。
- 按需在 `.env` / 部署平台配置上述变量，并记录在部署文档。