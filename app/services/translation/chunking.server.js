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
