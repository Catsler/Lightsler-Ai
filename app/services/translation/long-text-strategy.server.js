import { protectHtmlTags, restoreHtmlTags } from './html-handler.server.js';
import { chunkText, isLikelyHtml } from './chunking.server.js';
import { applyPostProcessors } from './post-processors.server.js';
import { runValidationPipeline } from './validators.server.js';
import { buildEnhancedPrompt } from './prompts.server.js';
import { executeTranslationRequest } from './core.server.js';
import { logger } from '../../utils/logger.server.js';

export async function translateLongTextStrategy(text, targetLang, options = {}) {
  const maxChunkSize = options.maxChunkSize ?? options?.translation?.maxChunkSize ?? 1000;
  const htmlDetected = isLikelyHtml(text);

  let workingText = text;
  let tagMap = null;

  const postProcessOptions = options.postProcess || {};

  try {
    if (htmlDetected) {
      const protection = protectHtmlTags(text);
      workingText = protection.text;
      tagMap = protection.tagMap;
    }

    const chunks = chunkText(workingText, maxChunkSize, { isHtml: htmlDetected });
    const chunkCount = chunks.length || 1;

    logger.info('[TRANSLATION] 长文本分块结果', {
      originalLength: text.length,
      chunkCount,
      maxChunkSize,
      htmlDetected,
      avgChunkSize: Math.round(text.length / chunkCount),
      resourceType: options.resourceType
    });

    const translatedChunks = [];

    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = chunks[index] ?? '';

      const response = await executeTranslationRequest({
        text: chunk,
        targetLang,
        systemPrompt: buildEnhancedPrompt(targetLang),
        strategy: chunkCount > 1 ? 'long-text-chunk' : 'long-text',
        context: {
          functionName: 'translateLongTextStrategy',
          chunkIndex: index,
          chunkCount
        }
      });

      if (!response.success) {
        throw new Error(response.error || `分块 ${index + 1} 翻译失败`);
      }

      const chunkContext = {
        targetLang,
        originalText: chunk,
        skipLinkConversion: true,
        ...(options.postProcess || {})
      };

      const processedChunk = await applyPostProcessors(response.text, chunkContext);
      translatedChunks.push(processedChunk);
    }

    const joiner = htmlDetected ? '' : '\\n\\n';
    let combined = translatedChunks.join(joiner);

    if (tagMap && tagMap.size) {
      combined = restoreHtmlTags(combined, tagMap);
    }

    const finalContext = {
      targetLang,
      originalText: text,
      ...(postProcessOptions || {}),
      linkConversion: options.linkConversion || postProcessOptions.linkConversion
    };

    combined = await applyPostProcessors(combined, finalContext);

    const validation = runValidationPipeline({
      originalText: text,
      translatedText: combined,
      targetLang
    });

    logger.info('[TRANSLATION] 长文本翻译完成', {
      originalLength: text.length,
      translatedLength: combined.length,
      chunkCount,
      htmlDetected,
      isTranslated: validation.passed,
      lengthRatio: (combined.length / text.length).toFixed(2),
      resourceType: options.resourceType
    });

    return {
      success: true,
      text: combined,
      tagMap,
      isOriginal: !isTranslated,
      language: targetLang
    };
  } catch (error) {
    logger.error('长文本翻译失败', { error: error.message, targetLang });
    return {
      success: false,
      text,
      error: `长文本翻译失败: ${error.message}`,
      isOriginal: true,
      language: targetLang
    };
  }
}
