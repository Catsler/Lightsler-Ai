import { logger } from '../../utils/logger.server.js';

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
      return `style="${placeholder}"`;
    });

    protectedAttributes = protectedAttributes.replace(/(href|src)\s*=\s*["']([^"']*)["']/gi, (_attr, attrName, urlValue) => {
      const placeholder = `__PROTECTED_URL_${counter}__`;
      protectionMap.set(placeholder, urlValue);
      counter += 1;
      return `${attrName}="${placeholder}"`;
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

  let replaced = true;
  while (replaced) {
    replaced = false;
    for (const [placeholder, originalContent] of tagMap) {
      const before = restoredText;
      restoredText = restoredText.split(placeholder).join(originalContent);
      if (restoredText !== before) {
        replaced = true;
      }
    }
  }

  restoredText = restoredText.replace(/\n\n注意[：:].*?一致性和连贯性[。\.]/g, '');

  logger.debug('[HTML Restore] 完成', { finalLength: restoredText.length });
  return restoredText;
}
