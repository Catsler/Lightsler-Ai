/**
 * Metafield 翻译规则配置和智能识别工具
 *
 * 快速修改指南：
 * 1. 添加白名单: 在 WHITELIST_PATTERNS (第 26 行) 添加 namespace.key 模式
 * 2. 添加黑名单: 在 BLACKLIST_PATTERNS (第 38 行) 添加 namespace.key 模式
 * 3. 调整内容检测: 修改 CONTENT_RULES (第 52 行)
 *
 * 规则版本: v1.0.0
 * KISS原则: 只做能明显判断的事，复杂内容先跳过并记录原因
 */

// 规则配置对象 - 集中管理便于维护
const TRANSLATION_RULES_V1 = {
  // 类型白名单 - 仅这些类型考虑翻译
  ALLOWED_TYPES: [
    'single_line_text_field',
    'multi_line_text_field'
    // rich_text 暂不支持，避免HTML/Liquid边界复杂性
  ],

  // 键名白名单 - 强制翻译，忽略长度和内容检测
  WHITELIST_PATTERNS: [
    /^custom\.specifications$/i,      // 产品规格
    /^custom\.features$/i,            // 产品特性
    /^custom\.instructions$/i,        // 使用说明
    /^custom\.warranty$/i,            // 保修信息
    /^custom\.description(_[a-z0-9]+)?$/i, // 描述类内容（包括 description_extended 等）
    /^custom\.benefits$/i,            // 产品优势
    /^custom\.care$/i                 // 护理说明
  ],

  // 键名黑名单 - 强制跳过
  BLACKLIST_PATTERNS: [
    /^global\.title_tag$/i,           // 原因: 与meta title重复
    /^global\.description_tag$/i,     // 原因: 与meta description重复
    /^mm-google-shopping\.google_product_category$/i,  // 原因: Google分类ID
    /^shopify\.color-pattern$/i,      // 原因: 颜色代码/模式
    /^custom\.sku$/i,                 // 原因: SKU编码
    /^custom\.barcode$/i,             // 原因: 条形码
    /^custom\.video$/i,               // 原因: 通常是URL或嵌入代码
    /^custom\.review$/i,              // 原因: 评论数据结构复杂
    /^custom\.size_chart$/i,          // 原因: 尺码表通常是HTML
    /^custom\.shipping_info$/i        // 原因: 运费信息通常含代码
  ],

  // 内容检测规则
  CONTENT_RULES: {
    SKIP_PATTERNS: {
      PURE_URL: /^https?:\/\/[^\s]+$/,                    // 纯URL
      PRODUCT_ID: /^[A-Z0-9_-]{3,30}$/,                  // 产品标识符
      JSON_LIKE: /^\s*[\{\[][\s\S]*[\}\]]\s*$/,          // JSON格式
      HTML_HEAVY: /<[^>]+>/g,                            // HTML标签
      EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,               // 邮箱地址
      PHONE: /^[\+\-\s\d\(\)]{10,20}$/                   // 电话号码
    },
    LENGTH_LIMITS: {
      TOO_SHORT: 3,                                       // 最短长度
      TOO_LONG: 1000                                      // 最长长度
    },
    NATURAL_LANGUAGE: {
      HAS_CHINESE: /[\u4e00-\u9fa5]/,                    // 包含中文
      MULTI_WORD: /\s+\w+\s+\w+/,                       // 至少3个词
      MIXED_CASE: /[a-z].*[A-Z]|[A-Z].*[a-z]/,          // 大小写混合
      SHORT_TEXT_THRESHOLD: 50                            // 短文本阈值
    }
  }
};

/**
 * 检测内容类型
 * @param {string} value - Metafield值
 * @returns {string} 内容类型
 */
function detectContentType(value) {
  if (!value || typeof value !== 'string') return 'empty';

  const rules = TRANSLATION_RULES_V1.CONTENT_RULES;

  // 检测特殊格式
  if (rules.SKIP_PATTERNS.PURE_URL.test(value)) return 'url';
  if (rules.SKIP_PATTERNS.EMAIL.test(value)) return 'email';
  if (rules.SKIP_PATTERNS.PHONE.test(value)) return 'phone';
  if (rules.SKIP_PATTERNS.PRODUCT_ID.test(value)) return 'identifier';
  if (rules.SKIP_PATTERNS.JSON_LIKE.test(value)) return 'json';

  // HTML检测
  const htmlMatches = value.match(rules.SKIP_PATTERNS.HTML_HEAVY) || [];
  if (htmlMatches.length > 3 || htmlMatches.length > value.length / 50) {
    return 'html';
  }

  // 自然语言检测
  if (rules.NATURAL_LANGUAGE.HAS_CHINESE.test(value)) return 'natural_text';
  if (rules.NATURAL_LANGUAGE.MULTI_WORD.test(value)) return 'natural_text';
  if (value.length < rules.NATURAL_LANGUAGE.SHORT_TEXT_THRESHOLD &&
      rules.NATURAL_LANGUAGE.MIXED_CASE.test(value)) {
    return 'natural_text';
  }

  return 'unknown';
}

/**
 * 检查是否为自然语言文本
 * @param {string} value - Metafield值
 * @returns {boolean} 是否为自然语言
 */
function isNaturalLanguage(value) {
  const contentType = detectContentType(value);
  return contentType === 'natural_text';
}

/**
 * 主判断函数：决定是否翻译某个 Metafield
 * @param {Object} metafield - Metafield对象 { id, namespace, key, type, value }
 * @returns {Object} 决策结果 { translate: boolean, reason: string, ruleApplied: string }
 */
export function shouldTranslateMetafield(metafield) {
  const { namespace, key, type, value } = metafield;
  const fullKey = `${namespace}.${key}`;
  const rules = TRANSLATION_RULES_V1;

  // 记录决策路径，便于调试
  const decisionLog = {
    metafieldId: metafield.id,
    fullKey,
    type,
    valueLength: value?.length || 0,
    valuePreview: value?.substring(0, 50) || '',
    checks: []
  };

  // 1. 类型过滤（第一道关卡）
  decisionLog.checks.push({
    rule: 'TYPE_CHECK',
    allowed: rules.ALLOWED_TYPES,
    current: type,
    passed: rules.ALLOWED_TYPES.includes(type)
  });

  if (!rules.ALLOWED_TYPES.includes(type)) {
    return {
      translate: false,
      reason: `类型 ${type} 暂不支持`,
      ruleApplied: 'TYPE_FILTER',
      debug: decisionLog
    };
  }

  // 2. 键名白名单检查（优先级最高）
  for (const pattern of rules.WHITELIST_PATTERNS) {
    if (pattern.test(fullKey)) {
      decisionLog.checks.push({
        rule: 'WHITELIST',
        pattern: pattern.toString(),
        matched: true
      });

      return {
        translate: true,
        reason: '白名单规则',
        ruleApplied: 'WHITELIST_KEY',
        debug: decisionLog
      };
    }
  }

  // 3. 键名黑名单检查
  for (const pattern of rules.BLACKLIST_PATTERNS) {
    if (pattern.test(fullKey)) {
      decisionLog.checks.push({
        rule: 'BLACKLIST',
        pattern: pattern.toString(),
        matched: true
      });

      // 根据具体模式返回详细原因
      let detailReason = '黑名单规则';
      if (fullKey.includes('title_tag')) detailReason += ' - 与meta title重复';
      else if (fullKey.includes('description_tag')) detailReason += ' - 与meta description重复';
      else if (fullKey.includes('google_product_category')) detailReason += ' - Google分类ID';
      else if (fullKey.includes('color-pattern')) detailReason += ' - 颜色代码';
      else if (fullKey.includes('sku') || fullKey.includes('barcode')) detailReason += ' - 产品标识符';

      return {
        translate: false,
        reason: detailReason,
        ruleApplied: 'BLACKLIST_KEY',
        debug: decisionLog
      };
    }
  }

  // 4. 内容长度检查
  if (!value || value.length < rules.CONTENT_RULES.LENGTH_LIMITS.TOO_SHORT) {
    decisionLog.checks.push({
      rule: 'LENGTH_CHECK',
      length: value?.length || 0,
      minRequired: rules.CONTENT_RULES.LENGTH_LIMITS.TOO_SHORT,
      passed: false
    });

    return {
      translate: false,
      reason: '内容过短',
      ruleApplied: 'LENGTH_FILTER',
      debug: decisionLog
    };
  }

  if (value.length > rules.CONTENT_RULES.LENGTH_LIMITS.TOO_LONG) {
    decisionLog.checks.push({
      rule: 'LENGTH_CHECK',
      length: value.length,
      maxAllowed: rules.CONTENT_RULES.LENGTH_LIMITS.TOO_LONG,
      passed: false
    });

    return {
      translate: false,
      reason: '内容过长',
      ruleApplied: 'LENGTH_FILTER',
      debug: decisionLog
    };
  }

  // 5. 内容类型检测
  const contentType = detectContentType(value);
  decisionLog.checks.push({
    rule: 'CONTENT_TYPE',
    detected: contentType,
    value: value.substring(0, 100)
  });

  switch (contentType) {
    case 'url':
      return {
        translate: false,
        reason: 'URL链接',
        ruleApplied: 'CONTENT_DETECTION',
        debug: decisionLog
      };

    case 'email':
      return {
        translate: false,
        reason: '邮箱地址',
        ruleApplied: 'CONTENT_DETECTION',
        debug: decisionLog
      };

    case 'phone':
      return {
        translate: false,
        reason: '电话号码',
        ruleApplied: 'CONTENT_DETECTION',
        debug: decisionLog
      };

    case 'identifier':
      return {
        translate: false,
        reason: '产品标识符',
        ruleApplied: 'CONTENT_DETECTION',
        debug: decisionLog
      };

    case 'json':
      return {
        translate: false,
        reason: 'JSON数据',
        ruleApplied: 'CONTENT_DETECTION',
        debug: decisionLog
      };

    case 'html':
      return {
        translate: false,
        reason: 'HTML内容',
        ruleApplied: 'CONTENT_DETECTION',
        debug: decisionLog
      };

    case 'natural_text':
      return {
        translate: true,
        reason: '自然语言文本',
        ruleApplied: 'CONTENT_DETECTION',
        debug: decisionLog
      };

    case 'empty':
      return {
        translate: false,
        reason: '内容为空',
        ruleApplied: 'CONTENT_DETECTION',
        debug: decisionLog
      };

    default:
      // 6. 默认规则：短文本倾向翻译
      if (value.length < rules.CONTENT_RULES.NATURAL_LANGUAGE.SHORT_TEXT_THRESHOLD) {
        // 进一步检查是否包含技术字符
        const techCharRatio = (value.match(/[{}()<>[\]&;]/g) || []).length / value.length;
        if (techCharRatio > 0.2) {
          return {
            translate: false,
            reason: '疑似技术内容',
            ruleApplied: 'DEFAULT_RULE',
            debug: decisionLog
          };
        }

        return {
          translate: true,
          reason: '短文本默认翻译',
          ruleApplied: 'DEFAULT_RULE',
          debug: decisionLog
        };
      }

      return {
        translate: false,
        reason: '无法确定类型',
        ruleApplied: 'DEFAULT_RULE',
        debug: decisionLog
      };
  }
}

/**
 * 分析多个 Metafields 的翻译决策
 * @param {Array} metafields - Metafield数组
 * @returns {Object} 分析统计结果
 */
export function analyzeMetafields(metafields) {
  const results = metafields.map(mf => ({
    ...mf,
    decision: shouldTranslateMetafield(mf)
  }));

  const stats = {
    total: metafields.length,
    translatable: 0,
    skipped: 0,
    byReason: {},
    byNamespace: {},
    byType: {}
  };

  results.forEach(result => {
    const { decision, namespace, type } = result;

    // 统计决策结果
    if (decision.translate) {
      stats.translatable++;
    } else {
      stats.skipped++;
    }

    // 按原因分组
    const reason = decision.reason;
    stats.byReason[reason] = (stats.byReason[reason] || 0) + 1;

    // 按namespace分组
    stats.byNamespace[namespace] = (stats.byNamespace[namespace] || 0) + 1;

    // 按类型分组
    stats.byType[type] = (stats.byType[type] || 0) + 1;
  });

  return {
    results,
    stats,
    summary: {
      translationRate: `${Math.round(stats.translatable / stats.total * 100)}%`,
      topReasons: Object.entries(stats.byReason)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5),
      topNamespaces: Object.entries(stats.byNamespace)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
    }
  };
}

// 导出规则配置供测试和调试使用
export { TRANSLATION_RULES_V1, detectContentType, isNaturalLanguage };