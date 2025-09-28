import { logger } from '../../utils/logger.server.js';

const DEFAULT_MAX_CHUNK_SIZE = 1000;
const MIN_CHUNK_SIZE = 200;

function coerceChunkSize(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAX_CHUNK_SIZE;
  }
  return Math.max(MIN_CHUNK_SIZE, Math.floor(value));
}

export function isLikelyHtml(text) {
  if (typeof text !== 'string') return false;
  return /<([a-z][^>]*?)>/i.test(text) && /<\/[a-z]+>/i.test(text);
}

export function chunkText(text, maxChunkSize = DEFAULT_MAX_CHUNK_SIZE, options = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return [];
  }

  const limit = coerceChunkSize(maxChunkSize);
  if (text.length <= limit) {
    return [text];
  }

  const { isHtml: forcedHtmlMode } = options;
  const treatAsHtml = typeof forcedHtmlMode === 'boolean' ? forcedHtmlMode : isLikelyHtml(text);

  return treatAsHtml
    ? chunkHtmlText(text, limit)
    : chunkPlainText(text, limit);
}

function chunkPlainText(text, maxChunkSize) {
  const chunks = [];
  let currentChunk = '';
  const paragraphs = text.split(/\n\s*\n|\r\n\s*\r\n/);

  logger.debug(`[Chunking] Plain text mode，段落数: ${paragraphs.length}`);

  paragraphs.forEach((paragraph, index) => {
    const normalizedParagraph = paragraph.trim();
    if (!normalizedParagraph) return;

    logger.debug(`[Chunking] 处理段落 ${index + 1}/${paragraphs.length}，长度: ${normalizedParagraph.length}`);

    if (normalizedParagraph.length > maxChunkSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      const sentenceRegex = /([^.!?。！？]+[.!?。！？]+)/g;
      const sentences = normalizedParagraph.match(sentenceRegex) || [normalizedParagraph];

      sentences.forEach(sentence => {
        const trimmed = sentence.trim();
        if (!trimmed) return;

        if (trimmed.length > maxChunkSize) {
          flushChunk(chunks, trimmed, maxChunkSize);
          return;
        }

        if (currentChunk.length + trimmed.length + 1 > maxChunkSize) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = trimmed;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + trimmed;
        }
      });
    } else {
      if (currentChunk.length + normalizedParagraph.length + 2 > maxChunkSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = normalizedParagraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + normalizedParagraph;
      }
    }
  });

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  logger.debug(`[Chunking] Plain text mode生成 ${chunks.length} 个分块`);
  return chunks;
}

function chunkHtmlText(text, maxChunkSize) {
  const chunks = [];
  let currentChunk = '';

  logger.debug('[Chunking] HTML 模式启动');

  const hasList = /<[uo]l[^>]*>.*?<\/[uo]l>/is.test(text);
  const effectiveLimit = hasList ? Math.min(maxChunkSize, 500) : maxChunkSize;

  const tagRegex = /<[^>]+>|[^<]+/g;
  const segments = text.match(tagRegex) || [text];

  segments.forEach(segment => {
    if (currentChunk.length + segment.length > effectiveLimit) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = segment;
    } else {
      currentChunk += segment;
    }
  });

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  logger.debug(`[Chunking] HTML 模式生成 ${chunks.length} 个分块（每块上限 ${effectiveLimit} 字符）`);
  return chunks;
}

function flushChunk(chunks, text, maxChunkSize) {
  const words = text.split(/\s+/);
  let tempChunk = '';

  words.forEach(word => {
    if (tempChunk.length + word.length + 1 > maxChunkSize) {
      if (tempChunk.trim()) {
        chunks.push(tempChunk.trim());
      }
      tempChunk = word;
    } else {
      tempChunk += (tempChunk ? ' ' : '') + word;
    }
  });

  if (tempChunk.trim()) {
    chunks.push(tempChunk.trim());
  }
}

export function protectHtmlTags(text) {
  const protectionMap = new Map();
  let counter = 0;

  if (typeof text !== 'string' || !text.includes('<')) {
    return { text, tagMap: protectionMap };
  }

  let protectedText = text;
  logger.debug('[HTML Protect] 开始处理，原始长度:', text.length);

  const styleRegex = /<style[^>]*>.*?<\/style>/gis;
  const styleMatches = protectedText.match(styleRegex);
  if (styleMatches) {
    styleMatches.forEach(match => {
      const placeholder = `__PROTECTED_STYLE_BLOCK_${counter}__`;
      protectionMap.set(placeholder, match);
      protectedText = protectedText.replace(match, placeholder);
      counter += 1;
    });
  }

  const scriptRegex = /<script[^>]*>.*?<\/script>/gis;
  const scriptMatches = protectedText.match(scriptRegex);
  if (scriptMatches) {
    scriptMatches.forEach(match => {
      const placeholder = `__PROTECTED_SCRIPT_BLOCK_${counter}__`;
      protectionMap.set(placeholder, match);
      protectedText = protectedText.replace(match, placeholder);
      counter += 1;
    });
  }

  const commentRegex = /<!--.*?-->/gs;
  const commentMatches = protectedText.match(commentRegex);
  if (commentMatches) {
    commentMatches.forEach(match => {
      const placeholder = `__PROTECTED_COMMENT_${counter}__`;
      protectionMap.set(placeholder, match);
      protectedText = protectedText.replace(match, placeholder);
      counter += 1;
    });
  }

  const preTagRegex = /<pre[^>]*>(.*?)<\/pre>/gis;
  const preMatches = protectedText.match(preTagRegex);
  if (preMatches) {
    preMatches.forEach(match => {
      const placeholder = `__PROTECTED_PRE_${counter}__`;
      protectionMap.set(placeholder, match);
      protectedText = protectedText.replace(match, placeholder);
      counter += 1;
    });
  }

  const codeTagRegex = /<code[^>]*>(.*?)<\/code>/gis;
  const codeMatches = protectedText.match(codeTagRegex);
  if (codeMatches) {
    codeMatches.forEach(match => {
      const placeholder = `__PROTECTED_CODE_${counter}__`;
      protectionMap.set(placeholder, match);
      protectedText = protectedText.replace(match, placeholder);
      counter += 1;
    });
  }

  const attributeRegex = /<([a-zA-Z0-9-]+)([^>]*?)>/g;
  protectedText = protectedText.replace(attributeRegex, (match, tagName, attributes) => {
    if (!attributes) {
      return match;
    }

    let protectedAttributes = attributes;

    protectedAttributes = protectedAttributes.replace(/style\s*=\s*["']([^"']*)["']/gi, (_attr, value) => {
      const placeholder = `__PROTECTED_STYLE_ATTR_${counter}__`;
      protectionMap.set(placeholder, value);
      counter += 1;
      return `style=\"${placeholder}\"`;
    });

    protectedAttributes = protectedAttributes.replace(/(href|src)\s*=\s*["']([^"']*)["']/gi, (_attr, attrName, urlValue) => {
      const placeholder = `__PROTECTED_URL_${counter}__`;
      protectionMap.set(placeholder, urlValue);
      counter += 1;
      return `${attrName}=\"${placeholder}\"`;
    });

    protectedAttributes = protectedAttributes.replace(/aria-[a-zA-Z0-9-]+\s*=\s*["']([^"']*)["']/gi, matchValue => {
      const placeholder = `__PROTECTED_ARIA_${counter}__`;
      protectionMap.set(placeholder, matchValue);
      counter += 1;
      return placeholder;
    });

    return `<${tagName}${protectedAttributes}>`;
  });

  const imgRegex = /<img[^>]*\/?>(?![^<]*__PROTECTED_IMG)/gi;
  const imgMatches = protectedText.match(imgRegex);
  if (imgMatches) {
    imgMatches.forEach(img => {
      const placeholder = `__PROTECTED_IMG_${counter}__`;
      protectionMap.set(placeholder, img);
      protectedText = protectedText.replace(img, placeholder);
      counter += 1;
    });
  }

  const mediaTagRegex = /<(source|track)[^>]*\/?>(?![^<]*__PROTECTED_MEDIA_TAG)/gi;
  const mediaMatches = protectedText.match(mediaTagRegex);
  if (mediaMatches) {
    mediaMatches.forEach(tag => {
      const placeholder = `__PROTECTED_MEDIA_TAG_${counter}__`;
      protectionMap.set(placeholder, tag);
      protectedText = protectedText.replace(tag, placeholder);
      counter += 1;
    });
  }

  logger.debug('[HTML Protect] 完成: ', {
    originalLength: text.length,
    protectedLength: protectedText.length,
    protectedCount: protectionMap.size
  });

  return {
    text: protectedText,
    tagMap: protectionMap
  };
}

export function restoreHtmlTags(translatedText, tagMap) {
  if (typeof translatedText !== 'string' || !(tagMap instanceof Map) || tagMap.size === 0) {
    return translatedText;
  }

  let restoredText = translatedText;
  logger.debug('[HTML Restore] 开始恢复占位符', { placeholderCount: tagMap.size });

  for (const [placeholder, originalContent] of tagMap) {
    const before = restoredText.length;
    restoredText = restoredText.split(placeholder).join(originalContent);
    const after = restoredText.length;

    if (before === after) {
      logger.debug('[HTML Restore] 占位符未命中', { placeholder });
    }
  }

  restoredText = restoredText.replace(/\n\n注意[：:].*?一致性和连贯性[。\.]/g, '');

  logger.debug('[HTML Restore] 完成', { finalLength: restoredText.length });
  return restoredText;
}
