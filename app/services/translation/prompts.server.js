// 提示词与语言名称集中管理
// 暂保留现有逻辑，后续可按策略扩展

const LANGUAGE_NAMES = {
  en: '英语',
  zh: '中文',
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  pt: '葡萄牙语',
  ru: '俄语',
  it: '意大利语',
  ar: '阿拉伯语',
  hi: '印地语'
};

const EXAMPLE_TRANSLATIONS = {
  waterproof: {
    de: 'wasserdicht',
    'zh-CN': '防水',
    'zh-TW': '防水',
    ja: '防水',
    fr: 'imperméable',
    es: 'impermeable'
  },
  lightweight: {
    de: 'leicht',
    'zh-CN': '轻量',
    'zh-TW': '輕量',
    ja: '軽量',
    fr: 'léger',
    es: 'ligero'
  }
};

const DEFAULT_EXAMPLE_PLACEHOLDER = '对应语言';

function pickExampleTranslation(exampleKey, targetLang) {
  const translations = EXAMPLE_TRANSLATIONS[exampleKey];
  if (!translations) {
    return DEFAULT_EXAMPLE_PLACEHOLDER;
  }
  return translations[targetLang] ?? DEFAULT_EXAMPLE_PLACEHOLDER;
}

export function getLanguageName(langCode = '') {
  if (!langCode) {
    return langCode;
  }
  return LANGUAGE_NAMES[langCode] || LANGUAGE_NAMES[langCode.toLowerCase?.()] || langCode;
}

export function buildEnhancedPrompt(targetLang) {
  const languageName = getLanguageName(targetLang);
  const waterproofExample = pickExampleTranslation('waterproof', targetLang);
  const lightweightExample = pickExampleTranslation('lightweight', targetLang);

  return `你是一个专业的电商翻译助手。请将用户提供的文本完全翻译成${languageName}。

⚠️ 重要：若原文并无"__PROTECTED_"前缀，则不要生成此类占位符。FAQ、URL、PDF等常见缩写可保留或翻译为对应语言常用表达。

🔴 最重要的要求：
- 必须将所有内容100%翻译成${languageName}
- 除了品牌名称和产品型号外，不得保留任何英文单词
- 即使是技术术语也要翻译成${languageName}
- 例如："waterproof" 必须翻译成 "${waterproofExample}"
- 例如："lightweight" 必须翻译成 "${lightweightExample}"

🔵 HTML/CSS保护规则（非常重要）：
1. 绝对不能翻译或修改任何以"__PROTECTED_"开头和"__"结尾的占位符
2. 不要翻译HTML标签名（如div, span, p, h1等）
3. 不要翻译CSS类名（如shipping, prose, message等）
4. 不要翻译HTML属性名（如class, id, style, data-*等）
5. 只翻译纯文本内容，不翻译代码部分
6. 示例：
   - 保持不变：__PROTECTED_CLASS_1__
   - 保持不变：__PROTECTED_STYLE_2__
   - 保持不变：__PROTECTED_IMG_3__

品牌保护规则：
1. 保持品牌名称不变：Onewind、Apple、Nike、Adidas等
2. 保持产品型号不变：iPhone 15、Model 3、PS5等

翻译标准：
- 必须完整翻译所有文本内容，不能遗漏任何部分
- 翻译后的文本中不应包含英文（除品牌和型号）
- 如果原文很长，确保翻译完整，不要截断
- 保持段落和换行结构
- 使用地道的${languageName}表达方式
- 保持专业的商务语调
- 只返回翻译结果，不要添加任何解释或说明

质量检查：
- 翻译完成后，检查是否还有英文单词残留
- 确保所有技术术语都已翻译
- 确保翻译自然流畅，符合目标语言习惯
- 确保所有占位符保持原样
`;
}

export function buildConfigKeyPrompt(targetLang) {
  const languageName = getLanguageName(targetLang);
  return `你将收到一个由小写字母和下划线组成的配置键，例如 "social_facebook"。

请将它翻译成自然的${languageName}短语，供最终用户在界面中阅读：
- 将下划线视为单词之间的空格
- 只返回翻译后的短语，不要保留下划线
- 不要生成任何以__PROTECTED_开头的占位符
- 保持译文简洁明了`;
}

export function buildSimplePrompt(targetLang) {
  const languageName = getLanguageName(targetLang);
  return `请将以下文本翻译成${languageName}：

要求：
- 直接翻译，保持原意
- 保留HTML标签不变
- 只返回翻译结果，无需解释

文本：`;
}
