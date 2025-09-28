# Translation Behaviour Regression Summary

本文件记录重构后对关键行为的回归对比，以便后续验证与上线评审。

## 覆盖范围

1. 短文本翻译（`translateText`）
   - 提示词：`buildEnhancedPrompt`
   - 后处理：标准化换行、裁剪、占位符回退；可选链接转换
   - 降级策略：`simple` → 返回原文
2. 长文本翻译（`translateTextEnhanced` with chunking）
   - 分块：paragraph → sentence → word，HTML 模式保留标签
   - HTML 保护：style/script/comment/pre/code/img 等自动占位
   - 拼接：HTML 默认直接拼接，纯文本 `\n\n`
3. Theme 资源翻译（`theme-translation.server.js`）
   - 使用 `translateTextWithFallback`，Post-process 保留链接转换
   - `translationFields.themeData` 仍返回 JSON 字符串
4. 产品关联翻译（`translateProductWithRelated`）
   - 主体翻译调用未变；关联翻译受 `ENABLE_PRODUCT_RELATED_TRANSLATION` 控制
5. 错误处理 / 验证器
   - `validateTranslationCompleteness`、`validateTranslation` 调用保持原日志 & collectError

## 核心回归要点

| 行为 | 预期 | 当前状态 |
| --- | --- | --- |
| 缓存 & 去重 | 命中率记录 `meta.cached`，泄漏通过 `getTranslationOrchestratorStatus()` 监控 | ✅ | 
| 降级链路记录 | `meta.fallback.chain` 指出实际链路 | ✅ |
| 占位符异常回退 | 检测 `__PROTECTED_` 占位符后返回原文并记日志 | ✅ |
| 链接转换 | 通过 post-process 管线 ，默认关闭；需在调用方传 `linkConversion` | ⚠️ 调用方待适配 |
| 长文本超时 | `translateLongTextEnhanced` 按块调用 API；失败块会报错并返回原文 | ✅ |
| 请求超时重试 | API 客户端（`api-client.server.js`）保留指数退避 | ✅ |

## 待办 / 风险

- Playwright E2E 测试尚未覆盖翻译链路（当前项目无测试用例）。
- 调用方需传入新的 `linkConversion` 配置，以保持链接转换功能。
- 建议对 `translateResource`、`queue` 等入口补充单元/集成测试。
