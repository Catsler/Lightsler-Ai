/**
 * Pricing & credit configuration.
 *
 * KISS：所有定价参数集中在一个文件中，避免散落在代码各处。
 * - API 成本默认为 GPT-5 推理 + 输出的安全估算
 * - Shopify 平台抽佣按照 15% 预留
 * - 目标毛利率 35%（可按季度复核）
 * - 1 额度 = 20,000 字符，最小扣除 1 额度
 */

// 安全读取环境变量，避免在浏览器端出现 process 未定义的错误
const env = (key, fallback) => {
  if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
    return process.env[key];
  }
  return fallback;
};

export const PRICING_CONFIG = {
  API_COST_PER_1K_CHARS: 0.02,
  SHOPIFY_COMMISSION: 0.15,
  TARGET_MARGIN: 0.35,
  SAFETY_MULTIPLIER: 2.5,
  ACTUAL_PRICE_PER_1K_CHARS: 0.05,
  CREDIT_TO_CHARS: 100, // 1 credit = 100 chars
  MIN_CREDIT_CHARGE: 1,

  // 显示与模型配置（对外展示固定 GPT-5，实际调用从 env 读取，保留 fallback 开关）
  DISPLAY_MODEL_NAME: 'GPT-5',
  GPT_MODEL_NAME: env('GPT_MODEL_NAME', 'gpt-5-preview'),
  FALLBACK_MODEL_NAME: env('FALLBACK_MODEL_NAME', 'gpt-4o-mini'),
  FALLBACK_ENABLED: env('FALLBACK_ENABLED', 'true') !== 'false',
  GPT_TIMEOUT_MS: Number(env('GPT_TIMEOUT_MS', 45_000)),
  GPT_RATE_LIMIT_PER_MIN: Number(env('GPT_RATE_LIMIT_PER_MIN', 20)),

  // Free 档与 Top-up 配置（可通过 env 覆盖）
  FREE_RATE_LIMIT: Number(env('FREE_RATE_LIMIT', 5)),
  FREE_MONTHLY_CREDITS: Number(env('FREE_MONTHLY_CREDITS', 2_000)),
  CREDIT_PRICE_USD: Number(env('CREDIT_PRICE_USD', 0.001)), // $1 = 1000 credits 默认
  CREDIT_MIN_PURCHASE: Number(env('CREDIT_MIN_PURCHASE', 10_000)), // $10 起购
  CREDIT_EXPIRY_DAYS: env('CREDIT_EXPIRY_DAYS', null)
    ? Number(env('CREDIT_EXPIRY_DAYS', null))
    : null, // null 代表长期有效
  DEDUCTION_ORDER: env('DEDUCTION_ORDER', 'SUBSCRIPTION_FIRST'),

  get MIN_PRICE_PER_1K_CHARS() {
    return (
      this.API_COST_PER_1K_CHARS /
      (1 - this.SHOPIFY_COMMISSION) /
      (1 - this.TARGET_MARGIN)
    );
  },

  /**
   * 1 额度对应的理论成本（美元）。
   */
  get COST_PER_CREDIT() {
    return (
      (this.CREDIT_TO_CHARS / 1000) * this.API_COST_PER_1K_CHARS
    );
  },

  /**
   * 当前售价对应的单额度收入（美元）。
   */
  get REVENUE_PER_CREDIT() {
    return (
      (this.CREDIT_TO_CHARS / 1000) * this.ACTUAL_PRICE_PER_1K_CHARS
    );
  },

  /**
   * 定价自检，确保售价高于安全最低值。
   */
  validatePricing() {
    if (this.ACTUAL_PRICE_PER_1K_CHARS < this.MIN_PRICE_PER_1K_CHARS) {
      throw new Error(
        `定价过低：当前 $${this.ACTUAL_PRICE_PER_1K_CHARS.toFixed(
          4
        )}/千字符，至少需要 $${this.MIN_PRICE_PER_1K_CHARS.toFixed(4)}/千字符`
      );
    }
  }
};

/**
 * 预设套餐配置（供脚本和 UI 使用）。
 */
export const SAFE_PLANS = [
  {
    tier: 'free',
    name: 'free',
    displayName: 'Free', // 仅用于横幅或降级选项
    price: 0,
    monthlyCredits: 0,
    description: '体验版，仅支持扫描和查看翻译结果',
    maxLanguages: 2,
    order: 0,
    hidden: true, // 在主价格表中隐藏
    badge: null
  },
  {
    tier: 'starter',
    name: 'starter',
    displayName: 'Starter',
    price: 9.99,
    monthlyCredits: 10,
    charsLimit: 200_000,
    description: '适合测试期店铺（约 2 个长页面/月）',
    maxLanguages: 5,
    order: 1,
    hidden: false,
    badge: null
  },
  {
    tier: 'pro',
    name: 'pro',
    displayName: 'Standard', // 原 Pro
    price: 29.99,
    monthlyCredits: 40,
    charsLimit: 800_000,
    description: '适合小型团队持续翻译（约 8 个页面/月）',
    maxLanguages: 20,
    order: 2,
    hidden: false,
    badge: { text: 'Most Popular', tone: 'success' }, // 推荐标签
    highlight: true // 视觉高亮
  },
  {
    tier: 'enterprise',
    name: 'enterprise',
    displayName: 'Premium', // 原 Enterprise
    price: 99.99,
    monthlyCredits: 130,
    charsLimit: 2_600_000,
    description: '适合中大型团队批量翻译（约 26 个页面/月）',
    maxLanguages: null,
    order: 3,
    hidden: false,
    badge: null,
    legacyNote: 'Formerly Enterprise' // 过渡期提示
  }
];

// Ultra 方案：5 档阶梯（Free → Gold），仅用于新版定价；旧逻辑仍可使用 SAFE_PLANS
export const ULTRA_PLANS = [
  {
    id: 'free',
    tier: 'free',
    name: 'free',
    displayName: 'Free',
    price: 0,
    originalPrice: 0,
    monthlyCredits: 2000,
    maxLanguages: 2,
    rateLimit: PRICING_CONFIG.FREE_RATE_LIMIT,
    description: 'For personal use',
    highlight: false,
    order: 0,
    hidden: true // Hide from grid
  },
  {
    id: 'starter',
    tier: 'starter',
    name: 'starter',
    displayName: 'Starter',
    price: 19.99,
    originalPrice: 29.99,
    monthlyCredits: 10000,
    maxLanguages: 5,
    rateLimit: 20,
    description: 'For beginners',
    order: 1,
    highlight: false,
    topUpRate: 20, // $20/1k
    features: {
      autoTranslation: true,
      editTranslation: true,
      languageSwitcher: true
    }
  },
  {
    id: 'standard',
    tier: 'standard',
    name: 'standard',
    displayName: 'Standard',
    price: 49.99,
    originalPrice: 69.99,
    monthlyCredits: 40000,
    maxLanguages: 20,
    rateLimit: 60,
    description: 'For small teams',
    order: 2,
    highlight: true,
    badge: { text: 'Recommended', tone: 'success' },
    topUpRate: 18, // $18/1k
    features: {
      autoTranslation: true,
      editTranslation: true,
      languageSwitcher: true,
      prioritySupport: true
    }
  },
  {
    id: 'silver',
    tier: 'silver',
    name: 'silver',
    displayName: 'Silver',
    price: 99.99,
    originalPrice: 139.99,
    monthlyCredits: 90000,
    maxLanguages: 40,
    rateLimit: 120,
    description: 'For growing business',
    order: 3,
    highlight: false,
    topUpRate: 16, // $16/1k
    features: {
      autoTranslation: true,
      editTranslation: true,
      languageSwitcher: true,
      prioritySupport: true
    }
  },
  {
    id: 'gold',
    tier: 'gold',
    name: 'gold',
    displayName: 'Gold',
    price: 249.99,
    originalPrice: 349.99,
    monthlyCredits: 250000,
    maxLanguages: null, // Unlimited
    rateLimit: 240,
    description: 'For global enterprise',
    order: 4,
    highlight: false,
    badge: { text: 'Best Value', tone: 'info' },
    topUpRate: 15, // $15/1k
    features: {
      autoTranslation: true,
      editTranslation: true,
      languageSwitcher: true,
      prioritySupport: true,
      dedicatedSuccess: true
    }
  }
];

/**
 * 根据店铺信息推导生效套餐（兼容 override / 订阅 / 兜底）。
 * 注意：此函数假设可能不存在 override 字段，需用 optional chaining 防御。
 */
export function getEffectivePlan(shop, plans = ULTRA_PLANS) {
  if (!plans || plans.length === 0) return null;

  // 1) override 优先（字段可能不存在，使用 optional chaining）
  const overridePlanId = shop?.overridePlanId;
  const overrideNotExpired = !shop?.overrideExpiresAt || new Date(shop.overrideExpiresAt) > new Date();
  if (overridePlanId && overrideNotExpired) {
    const found = plans.find((p) => p.id === overridePlanId || p.tier === overridePlanId || p.name === overridePlanId);
    if (found) return found;
  }

  // 2) 订阅计划（字段名兼容多版本：activeSubscription.planId / subscription.planId / planId）
  const planId = shop?.activeSubscription?.planId || shop?.subscription?.planId || shop?.planId;
  if (planId) {
    const found = plans.find((p) => p.id === planId || p.tier === planId || p.name === planId);
    if (found) return found;
  }

  // 3) 兜底：Free（第一个）
  return plans[0];
}

export const FEATURE_MATRIX = [
  {
    categoryKey: 'featureCategories.translationLimits',
    items: [
      { labelKey: 'featureRows.aiModel', free: 'GPT-5', starter: 'GPT-5', standard: 'GPT-5', silver: 'GPT-5', gold: 'GPT-5' },
      { labelKey: 'featureRows.translationLanguages', free: '2', starter: '5', standard: '20', silver: '40', gold: 'unlimited' },
      { labelKey: 'featureRows.products', free: 'unlimited', starter: 'unlimited', standard: 'unlimited', silver: 'unlimited', gold: 'unlimited' },
      { labelKey: 'featureRows.blogs', free: 'unlimited', starter: 'unlimited', standard: 'unlimited', silver: 'unlimited', gold: 'unlimited' }
    ]
  },
  {
    categoryKey: 'featureCategories.features',
    items: [
      { labelKey: 'featureRows.autoTranslation', free: false, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.editTranslation', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.glossary', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.aiContext', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.urlTranslation', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.htmlTranslation', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.preserveTranslations', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.skipDuplicates', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.previewUnpublished', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.bulkTranslation', free: false, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.languageSwitcher', free: false, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.adaptMarket', free: false, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.thirdPartyTranslation', free: false, starter: true, standard: true, silver: true, gold: true }
    ]
  },
  {
    categoryKey: 'featureCategories.support',
    items: [
      { labelKey: 'featureRows.freeDemo', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.emailSupport', free: true, starter: true, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.prioritySupport', free: false, starter: false, standard: true, silver: true, gold: true },
      { labelKey: 'featureRows.oneOnOneSupport', free: false, starter: false, standard: false, silver: false, gold: true }
    ]
  }
];

/**
 * 格式化紧凑数字 (e.g. 1.2M, 800K)
 */
export function formatCompactNumber(value) {
  if (value == null) return '--';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

/**
 * 计算指定套餐的月度净收入（扣除抽佣）。
 */
export function getPlanNetRevenue(price) {
  return price * (1 - PRICING_CONFIG.SHOPIFY_COMMISSION);
}

/**
 * 计算套餐的预估 API 成本。
 */
export function getPlanApiCost(monthlyCredits) {
  return monthlyCredits * PRICING_CONFIG.COST_PER_CREDIT;
}

/**
 * 根据当前配置估算套餐毛利率。
 */
export function getPlanMargin(price, monthlyCredits) {
  const netRevenue = getPlanNetRevenue(price);
  const apiCost = getPlanApiCost(monthlyCredits);
  if (price === 0) return 0;
  return (netRevenue - apiCost) / price;
}

// 启动时执行定价自检
PRICING_CONFIG.validatePricing();
