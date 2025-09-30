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
  }
};

export function getLocalizedErrorMessage(code, locale = DEFAULT_LOCALE, fallback = '') {
  if (!code) {
    return fallback;
  }

  const normalizedLocale = locale || DEFAULT_LOCALE;
  const entry = ERROR_MESSAGES[code];

  if (!entry) {
    return fallback || ERROR_MESSAGES.TRANSLATION_FAILED?.[normalizedLocale] || code;
  }

  return entry[normalizedLocale] || entry[DEFAULT_LOCALE] || fallback || code;
}

export default ERROR_MESSAGES;
