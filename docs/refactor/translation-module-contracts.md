# Translation Module Contracts (Phase 2.6 Draft + request-executor)

更新时间：2025-12-09

## 模块一览
- `translation/core.server.js`（编排层）：选择策略 → 调用策略 runner → 计费预估/确认 → 结果校验/后处理 → 占位符/品牌词回退；委托 request-executor 执行 API 调用。
- `translation/request-executor.server.js`：执行 API 请求并记录指标，接口 `executeTranslationRequest({ client, text, targetLang, systemPrompt, strategy, context, fallbacks })`。
- `translation/translation-strategies.server.js`：策略选择（长文本 HTML / 默认），执行器（可扩展）。
- `translation/chunking.server.js`：纯文本/HTML 分片与 HTML 可能性判定。
- `translation/html-handler.server.js`：HTML 占位符保护/恢复。
- `translation/post-processor-rules.server.js`：品牌词判定、品牌保护跳过、占位符回退统计与处理。
- `translation/post-processors.server.js`：后处理流水线（行尾清理、空值兜底、HTML 占位符恢复、链接转换、额外处理器）。
- `translation/api-client.server.js`：翻译请求客户端、缓存、去重器、速率限制。

## 编排层契约（core.server.js）
- `translateText(text, targetLang, options)`：
  - 输入：`text` (string)，`targetLang`，`options`（含 resourceType/shopId/resourceId/fieldName/billingBypass/postProcess/linkConversion/fallbacks/strategy）。
  - 输出：`string`（译文）或 `{ text, skipped, skipReason }`；抛出 `TranslationError` 或计费错误。
  - 行为：品牌词短文本跳过；策略选择（长文本 HTML→`long-html`，否则默认）；计费预估→保留→确认；占位符回退；后处理；相同译文 skip 返回。
- `translateTextWithFallback(text, targetLang, options)`：多策略重试（simple + extra fallbacks），占位符回退，后处理。
- `translateLongTextEnhanced(text, targetLang, options)`：HTML 保护→分片→策略调用→合并→恢复 HTML→后处理→验证。
- `postProcessTranslation(translatedText, targetLang, originalText, options)`：统一对象/字符串处理，传递 tagMap、linkConversion、extraProcessors。
- 输出日志/指标：`translationLogger`、`placeholderFallbackStats`、`applyPostProcessors` 日志键保持现有格式；请求执行指标由 request-executor 统一记录。

## 策略层契约（translation-strategies.server.js）
- `selectTranslationStrategy({ text, targetLang, options })`：返回 `{ key, reason }`；默认 `default`，HTML >1500 → `long-html`。
- `runTranslationStrategy(key, payload, runners)`：执行指定 runner；`long-html` 失败自动回退到 `default`。

## 分片与 HTML 保护契约
- `chunkText(text, maxChunkSize, { isHtml })`：返回字符串数组；HTML 时对列表收紧阈值。
- `isLikelyHtml(text)`：返回 boolean。
- `protectHtmlTags(text)`：返回 `{ text, tagMap }`，保护 script/style/comment/pre/code/属性/媒体标签。
- `restoreHtmlTags(text, tagMap)`：恢复占位符，循环替换直到稳定。

## 后处理契约
- `applyPostProcessors(text, context)`：
  - 基础处理：行尾归一化、trim、空值回退原文。
  - HTML 占位符恢复：`context.tagMap` 存在且文本含占位符时调用。
  - 链接转换：`context.linkConversion`（enabled/locale/marketConfig/options）。
  - 扩展处理器：`context.extraProcessors`（函数数组）。
- `post-processor-rules.server.js`：
  - `checkBrandWords(text, options)`：短文本品牌/型号/全大写保护；vendor/字段白名单跳过。
  - `isBrandWord(word)`：品牌/技术词/单位判定。
  - `handlePlaceholderFallback(params)`：占位符检测→配置键备用翻译→回退原文并计数。
  - `placeholderFallbackStats`：Map(language→count)。

## API 客户端契约
- `createInMemoryCache({ ttlSeconds, cleanupIntervalSeconds, maxEntries })`：`get/set/delete/clear/stats`。
- `createRequestDeduplicator({ maxInFlight })`：`run(key,factory)` 去重 + `size`。
- `createTranslationAPIClient(options)`：`execute({ text,targetLang,systemPrompt,strategy,extras,context })` → `{ success,text,isOriginal,language,tokenLimit,meta,raw }`；尊重 cache/dedupe/fallbacks。

## 依赖与回滚
- 计费：`creditCalculator/creditManager`，需在 orchestrator 内保持预留→确认→确保释放。
- 回退：策略 runner 可扩展；长文本失败回退默认；占位符回退保证不返回非法占位符。
- 兼容性：保留 `translation.server.js` 导出接口（translateText 等）；日志键、计费口径不变。
