# TranslationResult 字段字典

本文档列出翻译模块返回结构的公共字段，便于前端与调度层对接。

## translateText / translateTextWithFallback

返回 `string`（成功时）或抛出 `TranslationError`。当使用 `translateTextWithFallback` 直接访问结果时，返回结构：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `success` | `boolean` | 是否成功获取翻译文本 |
| `text` | `string` | 翻译结果或原文（若失败/回退） |
| `error` | `string?` | 失败原因（仅失败时） |
| `isOriginal` | `boolean?` | `true` 表示返回的是原文 |
| `language` | `string?` | 翻译目标语言 |
| `meta.strategy` | `string` | 实际采用的策略（包括降级链路名） |
| `meta.originStrategy` | `string` | 调用方声明的初始策略 |
| `meta.cached` | `boolean` | 是否命中缓存 |
| `meta.retries` | `number` | 执行过程中的重试次数 |
| `meta.duration` | `number` | 调用耗时（毫秒） |
| `meta.fallback` | `{ name: string, index: number, chain: string }?` | 若启用降级时记录链路 |
| `meta.degraded` | `{ name: string }?` | 非成功路径的降级标记，如 `return-original` |

## translateTextEnhanced

返回结构与 `translateTextWithFallback` 一致，另附：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `processingTime` | `number?` | 单次翻译耗时（毫秒） |

## translateLongTextEnhanced

返回结构同上；长文本拼接后的 `text` 在 HTML 场景默认无分隔符，纯文本以 `\n\n` 拼接。

> 备注：当长文本触发降级返回原文时，`error` 会描述首个失败片段，`meta.strategy` 保持 `long-text`。

## translateThemeResource

翻译 Theme 资源时返回对象：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `titleTrans` | `string?` | 标题翻译 |
| `descTrans` | `string?` | 描述翻译 |
| `handleTrans` | `string?` | Handle 翻译（默认 `null`，已禁用自动翻译） |
| `seoTitleTrans` | `string?` | SEO 标题 |
| `seoDescTrans` | `string?` | SEO 描述 |
| `translationFields` | `Record<string, string>` | 动态字段翻译结果 |

当 `translationFields` 中包含 JSON 字符串（如 `themeData`），内容已经过 `JSON.stringify` 以便直接写回存储。

## 错误结构

所有抛出的 `TranslationError` 均包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `message` | `string` | 错误描述 |
| `code` | `string` | 错误编码，如 `TRANSLATION_FAILED`, `TRANSLATION_NOT_EFFECTIVE` |
| `retryable` | `boolean` | 是否建议重试 |
| `context` | `object` | 包含 `targetLang`、`retryCount`、`originalSample` 等上下文 |

## 元数据补充

- `linkConversion`：若调用方传入 `{ linkConversion: { enabled, marketConfig, locale } }`，后处理管线会自动嵌入链接转换。
- `postProcess.extraProcessors`：可注入自定义处理器，遵循 `(text: string, context: object) => Promise<string>` 签名。
