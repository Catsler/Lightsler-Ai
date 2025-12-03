const DEFAULT_LOCALE = 'zh-CN';

const ERROR_MESSAGES = {
  TRANSLATION_SKIPPED_BY_HOOK: {
    'zh-CN': '翻译被过滤规则跳过',
    'en': 'Translation skipped by hook rules'
  },
  TRANSLATION_SKIPPED: {
    'zh-CN': '翻译跳过（内容未变化）',
    'en': 'Translation skipped (no changes detected)'
  },
  TRANSLATION_FAILED: {
    'zh-CN': '翻译失败，请稍后重试',
    'en': 'Translation failed, please try again later'
  },
  THEME_TRANSLATION_FAILED: {
    'zh-CN': '主题内容翻译失败',
    'en': 'Theme translation failed'
  },
  RELATED_TRANSLATION_PARTIAL: {
    'zh-CN': '关联内容部分翻译失败',
    'en': 'Related content translation partially failed'
  },
  RELATED_TRANSLATION_FAILED: {
    'zh-CN': '关联内容翻译失败',
    'en': 'Related content translation failed'
  },
  CHUNK_SIZE_ABNORMAL: {
    'zh-CN': '分块数量异常({chunks}个，文本长度{textLength}字符)，可能影响翻译质量',
    'en': 'Abnormal chunk count ({chunks}, text length {textLength} chars), may affect translation quality'
  },
  LINK_CONVERSION_LOW_SUCCESS_RATE: {
    'zh-CN': 'URL转换成功率过低(成功率{rate}%，共{total}个链接，失败{failed}个)',
    'en': 'Link conversion success rate too low ({rate}%, total {total}, failed {failed})'
  }
};

export function getLocalizedErrorMessage(code, locale = DEFAULT_LOCALE, params = {}) {
  if (!code) {
    return typeof params === 'string' ? params : ''; // 向后兼容：第三个参数为 fallback 字符串
  }

  const normalizedLocale = locale || DEFAULT_LOCALE;
  const entry = ERROR_MESSAGES[code];

  if (!entry) {
    const fallback = typeof params === 'string' ? params : '';
    return fallback || ERROR_MESSAGES.TRANSLATION_FAILED?.[normalizedLocale] || code;
  }

  let message = entry[normalizedLocale] || entry[DEFAULT_LOCALE] || code;

  // 参数替换：支持 {key} 占位符
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    for (const [key, value] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
  }

  return message;
}

export default ERROR_MESSAGES;
