/**
 * Language domain configuration page
 * Display URL mappings for all languages and manage drafts
 */

/* eslint-disable react-hooks/exhaustive-deps, no-unused-vars, no-console */

import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator, useNavigation, useLocation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
  Banner,
  useBreakpoints,
  Modal,
  TextField,
  Checkbox,
  Tooltip,
  Badge,
  Icon,
  Link,
  Popover,
  ActionList,
  SkeletonBodyText,
  SkeletonThumbnail,
  Select,
  Collapsible
} from "@shopify/polaris";
import {
  ExternalIcon,
  PlusIcon,
  AlertCircleIcon,
  CheckIcon,
  EditIcon,
  DeleteIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RefreshIcon,
  SettingsIcon,
  StoreIcon,
  StarFilledIcon,
  AlertDiamondIcon,
  ChevronRightIcon
} from "@shopify/polaris-icons";
import { useCallback, useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";
import { prisma } from "../db.server";
import { subscriptionManager } from "../services/subscription-manager.server.js";
import { creditManager } from "../services/credit-manager.server.js";
import { SAFE_PLANS, ULTRA_PLANS } from "../utils/pricing-config.js";

// Helper to normalize and categorize URLs for sorting (domain > subdomain > subfolder > fallback)
const normalizeUrl = (url) => {
  if (!url) return '';
  try {
    const obj = new URL(url);
    // Remove trailing slash (except root)
    if (obj.pathname.endsWith('/') && obj.pathname !== '/') {
      obj.pathname = obj.pathname.replace(/\/+$/, '');
    }
    return obj.toString();
  } catch {
    return url;
  }
};

const categorizeUrl = (url, primaryDomain = '') => {
  try {
    const obj = new URL(url);
    const hostParts = obj.hostname.split('.');
    const pathSegments = obj.pathname.split('/').filter(Boolean);
    const primaryHost = primaryDomain ? new URL(primaryDomain).hostname : '';

    // 独立域名（不包含主域名，且无路径）
    if (primaryHost && !obj.hostname.endsWith(primaryHost) && pathSegments.length === 0) return 1;
    // 子域名
    if (hostParts.length > 2 && hostParts[0].length <= 5) return 2;
    // 子目录
    if (pathSegments.length >= 1) return 3;
    // 主域
    return 4;
  } catch {
    return 5; // fallback lowest priority
  }
};

const normalizeUrlForComparison = (url) => {
  try {
    const obj = new URL(url);
    const path = obj.pathname.replace(/\/+$/, '') || '/';
    return `${obj.protocol}//${obj.hostname}${path}`;
  } catch {
    return url;
  }
};

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { syncMarketConfig, updateUrlConversionSettings, updateShopLocalePublishStatus, clearMarketConfigCache } = await import("../services/market-urls.server");
  const { logger } = await import("../utils/logger.server");
  const { syncShopLocalesToDatabase } = await import("../services/shopify-locales.server");

  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get('action');

  try {
    switch (action) {
      case 'sync':
        // Force sync new configuration
        const [config] = await Promise.all([
          syncMarketConfig(session.shop, admin, true),
          syncShopLocalesToDatabase(session.shop, admin)
        ]);
        logger.info('Manual Markets sync', { shop: session.shop });

        return json({
          success: true,
          message: 'Config synced successfully',
          languageCount: config ? Object.keys(config.mappings || {}).length : 0
        });

      case 'updateSettings':
        // Update URL conversion settings
        const settings = {
          urlStrategy: formData.get('urlStrategy'),
          enableLinkConversion: formData.get('enableLinkConversion') === 'true'
        };

        await updateUrlConversionSettings(session.shop, settings);

        return json({
          success: true,
          message: 'Settings updated'
        });

      case 'createDraft':
        const locale = formData.get('locale');
        const name = formData.get('name');

        if (!locale || !name) {
          return json({ success: false, message: 'Locale and Name are required' });
        }

        // Check uniqueness
        const existing = await prisma.language.findFirst({
          where: {
            shopId: session.shop,
            code: locale
          }
        });

        if (existing) {
          if (existing.isActive) {
            return json({ success: false, message: 'Language is already published' });
          } else {
            return json({ success: false, message: 'Draft already exists' });
          }
        }

        await prisma.language.create({
          data: {
            shopId: session.shop,
            code: locale,
            name: name,
            isActive: false // Drafts are inactive by default
          }
        });

        return json({ success: true, message: 'Draft created successfully' });

      case 'togglePublish': {
        const locale = formData.get('locale');
        const published = formData.get('published') === 'true';

        if (!locale) {
          return json({ success: false, message: 'Locale is required' }, { status: 400 });
        }

        const targetPublished = !published;
        await updateShopLocalePublishStatus(admin, locale, targetPublished);
        await clearMarketConfigCache(session.shop);

        return json({
          success: true,
          message: targetPublished ? 'Language published' : 'Language hidden',
          locale,
          published: targetPublished
        });
      }

      case 'deleteDraft':
        const draftCode = formData.get('code');

        await prisma.language.deleteMany({
          where: {
            shopId: session.shop,
            code: draftCode,
            isActive: false // Only delete if it's a draft
          }
        });

        return json({ success: true, message: 'Draft deleted successfully' });

      default:
        return json({ success: false, message: 'Unknown action' });
    }
  } catch (error) {
    logger.error('Action failed', error);
    return json({
      success: false,
      message: error.message
    });
  }
};

export const loader = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const {
    getMarketConfigWithCache,
    syncMarketConfig,
    getMarketsLanguagesGrouped,
    getUrlConversionSettings,
    updateShopLocalePublishStatus,
    clearMarketConfigCache
  } = await import("../services/market-urls.server");
  const { checkLocaleLimit, getAvailableLocales } = await import("../services/shopify-locales.server");
  const { logger } = await import("../utils/logger.server");

  try {
    const { admin, session } = await authenticate.admin(request);

    logger.info('Load language domains page', { shop: session.shop });

    const [
      marketsLanguages,
      marketsConfig,
      urlSettings,
      limitCheck,
      availableLocales,
      subscription,
      credits
    ] = await Promise.all([
      getMarketsLanguagesGrouped(admin),
      // Force fresh sync to ensure latest subfolder/subdomain URLs
      syncMarketConfig(session.shop, admin),
      getUrlConversionSettings(session.shop),
      checkLocaleLimit(admin),
      getAvailableLocales(admin),
      subscriptionManager.getSubscription(session.shop),
      creditManager.getAvailableCredits(session.shop).catch(() => null)
    ]);

    // Fetch Drafts from DB
    const draftLanguages = await prisma.language.findMany({
      where: {
        shopId: session.shop,
        isActive: false
      },
      orderBy: { name: 'asc' }
    });

    const primaryDomain = marketsConfig?.primaryUrl || `https://${session.shop}`;

    const getLocaleUrls = (locale) => {
      const lc = (locale || '').toLowerCase();
      const variants = marketsConfig?.mappingVariants?.[lc] || [];
      const primaryUrl = marketsConfig?.primaryUrl;

      const urls = variants
        .map(v => v?.url)
        .filter(Boolean);

      if (urls.length === 0) {
        const mapping = marketsConfig?.mappings?.[lc];
        if (mapping?.url) urls.push(mapping.url);
        else if (primaryUrl) urls.push(`${primaryDomain}/${lc}`);
      }

      return Array.from(new Set(urls.map(normalizeUrl)));
    };

    // 1. Aggregate Active Languages (from Markets)
    const activeLangMap = new Map();
    marketsLanguages.forEach(market => {
      market.languages.forEach(lang => {
        const locale = (lang.locale || '').toLowerCase();
        const urlsForLocale = getLocaleUrls(locale);

        if (!activeLangMap.has(locale)) {
          activeLangMap.set(locale, {
            locale,
            name: lang.name || lang.locale,
            urls: urlsForLocale.length ? [...urlsForLocale] : [],
            marketNames: [],
            isPrimary: lang.primary,
            published: lang.published,
            isoCode: locale.split('-')[0],
            status: 'active'
          });
        }

        const entry = activeLangMap.get(locale);
        urlsForLocale.forEach(url => {
          const normalizedKey = normalizeUrlForComparison(url);
          const existingKeys = entry.urls.map(normalizeUrlForComparison);
          if (!existingKeys.includes(normalizedKey)) entry.urls.push(url);
        });
        entry.marketNames.push(market.marketName || market.marketId);
        if (lang.published) entry.published = true;
        if (lang.primary) entry.isPrimary = true;
      });
    });

    // 2. Process Draft Languages
    const draftLangMap = new Map();
    draftLanguages.forEach(draft => {
      const locale = (draft.code || '').toLowerCase();
      const urls = getLocaleUrls(locale);
      draftLangMap.set(locale, {
        locale,
        name: draft.name,
        urls: urls.length ? urls.map(normalizeUrl) : [`${primaryDomain}/${locale}`],
        marketNames: [],
        isPrimary: false,
        published: false,
        isoCode: locale.split('-')[0],
        status: 'draft'
      });
    });

    // 3. Build Base Locale Map (availableLocales + mappings)
    const baseLocaleMap = new Map();
    availableLocales.forEach(avail => {
      const locale = (avail.isoCode || '').toLowerCase();
      baseLocaleMap.set(locale, {
        locale,
        name: avail.name,
        isoCode: locale.split('-')[0],
        source: 'shopify'
      });
    });
    Object.keys(marketsConfig?.mappings || {}).forEach(locale => {
      const lc = (locale || '').toLowerCase();
      if (baseLocaleMap.has(lc)) return;
      const [lang, region] = lc.split('-');
      const baseName = lang ? lang.toUpperCase() : lc.toUpperCase();
      const displayName = region ? `${baseName} (${region.toUpperCase()})` : baseName;
      baseLocaleMap.set(lc, {
        locale: lc,
        name: displayName,
        isoCode: lang || lc,
        source: 'markets'
      });
    });

    // 4. Build Unified All Languages
    const allLanguages = Array.from(baseLocaleMap.values()).map(base => {
      const locale = base.locale;
      const activeEntry = activeLangMap.get(locale);
      if (activeEntry) {
        return {
          ...activeEntry,
          flagCode: resolveFlagCode(locale, activeEntry.marketNames)
        };
      }

      const draftEntry = draftLangMap.get(locale);
      if (draftEntry) {
        return {
          ...draftEntry,
          flagCode: resolveFlagCode(locale, draftEntry.marketNames)
        };
      }

      const mapping = marketsConfig?.mappings?.[locale];
      const urls = getLocaleUrls(locale);
      const previewUrl = urls[0] || mapping?.url || `${primaryDomain}/${locale}`;
      const marketNames = mapping?.marketName ? [mapping.marketName] : [];

      return {
        locale,
        name: base.name,
        urls: urls.length ? urls.map(normalizeUrl) : [normalizeUrl(previewUrl)],
        marketNames,
        isPrimary: false,
        published: false,
        isoCode: base.isoCode,
        status: 'available',
        flagCode: resolveFlagCode(locale, marketNames)
      };
    });

    // Sort: Primary -> Active -> Draft -> Available
    allLanguages.sort((a, b) => {
      if (a.isPrimary) return -1;
      if (b.isPrimary) return 1;

      const statusOrder = { 'active': 1, 'draft': 2, 'available': 3 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }

      return a.name.localeCompare(b.name);
    });

    // Sort URLs by priority within each language
    allLanguages.forEach(lang => {
      lang.urls = lang.urls
        .map(normalizeUrl)
        .filter(Boolean)
        .filter((value, index, self) => self.indexOf(value) === index)
        .sort((a, b) => categorizeUrl(a, primaryDomain) - categorizeUrl(b, primaryDomain));
    });

    // Extract Primary
    const primaryLangIndex = allLanguages.findIndex(l => l.isPrimary);
    let computedPrimaryLanguage = null;
    if (primaryLangIndex > -1) {
      computedPrimaryLanguage = allLanguages[primaryLangIndex];
      // We keep primary in the list or remove? 
      // Usually UI separates it. Let's remove it from the main list to avoid duplication.
      allLanguages.splice(primaryLangIndex, 1);
    } else {
      // Fallback
      computedPrimaryLanguage = {
        name: 'English',
        locale: 'en',
        isoCode: 'en',
        urls: [primaryDomain],
        isPrimary: true,
        published: true,
        status: 'active',
        flagCode: resolveFlagCode('en')
      };
    }

    // Calculate Limits
    // Plan Limit: derive from subscription plan; fallback to config (free=2)
    const ALL_PLANS = [...ULTRA_PLANS, ...SAFE_PLANS];
    const freePlanLimit = ALL_PLANS.find(p => p.name?.toLowerCase() === 'free')?.maxLanguages ?? 2;
    let planLimit = freePlanLimit;
    if (subscription?.plan && subscription?.status === 'active') {
      const maxLanguages = subscription.plan.maxLanguages;
      if (typeof maxLanguages === 'number' && Number.isFinite(maxLanguages)) {
        planLimit = maxLanguages;
      } else {
        const planName = (subscription.plan.name || '').toLowerCase();
        const planFromConfig = ALL_PLANS.find(p => p.name?.toLowerCase() === planName);
        const configMax = planFromConfig?.maxLanguages;
        if (typeof configMax === 'number' && Number.isFinite(configMax)) {
          planLimit = configMax;
        } else if (configMax === null || maxLanguages === null) {
          planLimit = Number.POSITIVE_INFINITY; // Explicit unlimited
        } else {
          planLimit = freePlanLimit;
        }
      }
    }

    // Plan Used: Active (excluding primary) + Drafts
    const primaryLocale = computedPrimaryLanguage?.locale || 'en';
    const usedLanguages = allLanguages.filter(
      (l) =>
        (l.status === 'active' || l.status === 'draft') &&
        l.locale !== primaryLocale
    );
    const planUsed = usedLanguages.length;

    return json({
      marketsLanguages, // Keep for legacy/debug if needed
      marketsConfig,
      shopName: marketsConfig?.shopName || session.shop,
      primaryDomain,
      hasMarketsConfig: !!marketsConfig && marketsLanguages.length > 0,
      urlSettings,
      primaryLanguage: computedPrimaryLanguage,
      allLanguages, // The new unified list
      limitInfo: {
        publishedCount: limitCheck.totalLocales,
        maxPublished: limitCheck.maxLimit + 1,
        draftCount: draftLanguages.length,
        canAddPublished: limitCheck.canAddMore,
        planUsed,
        planLimit
      },
      billing: {
        planLimit,
        planUsed,
        remainingCredits: credits?.remaining || 0
      },
      availableLocales: availableLocales.map(l => ({ label: l.name, value: l.isoCode }))
    });
  } catch (error) {
    logger.error('Failed to load language domains page', error);
    return json({
      marketsLanguages: [],
      marketsConfig: null,
      shopName: '',
      primaryDomain: '',
      hasMarketsConfig: false,
      urlSettings: null,
      primaryLanguage: null,
      allLanguages: [],
      limitInfo: {
        publishedCount: 0,
        maxPublished: 21,
        draftCount: 0,
        canAddPublished: false,
        planUsed: 0,
        planLimit: 2
      },
      availableLocales: [],
      error: error.message
    });
  }
};

// Locale / market → country flag helpers
// 优先级：精确 locale（含地区） > 语言默认 > Shopify 扩展语言表 > 市场名提示 > 无结果
const LOCALE_REGION_MAP = {
  // English variants
  'en-us': 'us',
  'en-gb': 'gb',
  'en-ca': 'ca',
  'en-au': 'au',
  'en-nz': 'nz',
  'en-in': 'in',
  // French / Spanish / Portuguese variants
  'fr-ca': 'ca',
  'fr-fr': 'fr',
  'es-es': 'es',
  'es-mx': 'mx',
  'es-ar': 'ar',
  'es-cl': 'cl',
  'es-pe': 'pe',
  'es-co': 'co',
  'es-uy': 'uy',
  'es-bo': 'bo',
  'es-cr': 'cr',
  'es-gt': 'gt',
  'es-pa': 'pa',
  'es-py': 'py',
  'es-ve': 've',
  'pt-pt': 'pt',
  'pt-br': 'br',
  // Chinese variants
  'zh-cn': 'cn',
  'zh-tw': 'tw',
  'zh-hk': 'hk',
  'zh-sg': 'sg',
  // Arabic regional variants
  'ar-sa': 'sa',
  'ar-eg': 'eg',
  'ar-ae': 'ae',
  'ar-dz': 'dz'
};

const LANGUAGE_DEFAULT_COUNTRY = {
  en: 'us',
  fr: 'fr',
  de: 'de',
  nl: 'nl',
  pt: 'pt',
  es: 'es',
  da: 'dk',
  fi: 'fi',
  ja: 'jp',
  ko: 'kr',
  pl: 'pl',
  ar: 'sa',
  am: 'et',
  hy: 'am',
  sq: 'al',
  ak: 'gh',
  as: 'in',
  bn: 'bd',
  et: 'ee',
  el: 'gr',
  he: 'il',
  hi: 'in',
  hu: 'hu',
  id: 'id',
  it: 'it',
  lt: 'lt',
  lv: 'lv',
  ms: 'my',
  ro: 'ro',
  ru: 'ru',
  sk: 'sk',
  sl: 'si',
  sv: 'se',
  th: 'th',
  tr: 'tr',
  uk: 'ua',
  vi: 'vn',
  ca: 'es',
  cs: 'cz',
  cy: 'gb',
  fa: 'ir',
  ga: 'ie',
  gl: 'es',
  hr: 'hr',
  is: 'is',
  ka: 'ge',
  kk: 'kz',
  km: 'kh',
  kn: 'in',
  ku: 'iq',
  ky: 'kg',
  la: 'va',
  mk: 'mk',
  mn: 'mn',
  mr: 'in',
  nb: 'no',
  nn: 'no',
  sr: 'rs',
  ta: 'lk',
  te: 'in',
  ur: 'pk',
  yo: 'ng',
  zu: 'za',
  bo: 'cn',
  bs: 'ba'
};

const MARKET_TO_COUNTRY = {
  belgium: 'be',
  germany: 'de',
  austria: 'at',
  france: 'fr',
  portugal: 'pt',
  canada: 'ca',
  'united states': 'us',
  'united kingdom': 'gb',
  uk: 'gb',
  spain: 'es',
  italy: 'it',
  switzerland: 'ch',
  netherlands: 'nl',
  japan: 'jp',
  korea: 'kr',
  china: 'cn'
};

const KNOWN_COUNTRY_CODES = new Set([
  'ae','al','am','ar','at','au','ba','bd','be','bo','br','ca','ch','cl','cn','co','cr','cz','de','dk','dz','ee','eg','es','et','fi','fr','gb','ge','gh','gr','gt','hk','hr','hu','id','ie','il','in','iq','is','it','jp','kg','kh','kr','kz','lk','lt','lv','mk','mn','mx','my','ng','nl','no','nz','pa','pe','pk','pl','pt','py','ro','rs','ru','sa','se','sg','si','sk','th','tr','tw','ua','uk','us','uy','va','ve','vn','za','br','bo'
]);

export const resolveFlagCode = (locale, marketNames = []) => {
  const lc = (locale || '').toLowerCase();
  if (!lc) return null;

  // Explicit region in locale
  if (LOCALE_REGION_MAP[lc]) return LOCALE_REGION_MAP[lc];

  const [langPart, regionPart] = lc.split('-');
  if (regionPart && regionPart.length === 2) {
    return regionPart;
  }

  // Language defaults
  if (LANGUAGE_DEFAULT_COUNTRY[lc]) return LANGUAGE_DEFAULT_COUNTRY[lc];
  if (LANGUAGE_DEFAULT_COUNTRY[langPart]) return LANGUAGE_DEFAULT_COUNTRY[langPart];

  // Market name hint
  const marketCode = marketNames
    .map((name) => (name || '').toLowerCase())
    .map((name) => MARKET_TO_COUNTRY[name])
    .find(Boolean);
  if (marketCode) return marketCode;

  // As last resort, use language part only if it is a valid country code
  if (langPart && langPart.length === 2 && KNOWN_COUNTRY_CODES.has(langPart)) {
    return langPart;
  }

  return null;
};

// Flag Icon Component
const FlagIcon = ({ flagCode, countryCode, locale, size = 24 }) => {
  const [error, setError] = useState(false);
  // countryCode kept for backward compatibility; flagCode preferred
  const code = (flagCode || countryCode || '').toLowerCase();

  if (error || !code) {
    const displayCode = (locale || code || countryCode || '??').toUpperCase().slice(0, 2);
    return (
      <div style={{
        width: size,
        height: size * 0.75,
        backgroundColor: '#e1e3e5',
        borderRadius: '2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '10px',
        color: '#6d7175',
        fontWeight: 'bold'
      }}>
        {displayCode}
      </div>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      width={size}
      alt={code.toUpperCase()}
      style={{ borderRadius: '2px', objectFit: 'cover', height: 'auto' }}
      onError={() => setError(true)}
    />
  );
};

const LanguageRow = ({ lang, status, onToggle, onAction, planAtOrOverLimit, isProcessing }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), []);

  const isAdded = status === 'active' || status === 'draft';

  // Optimistic Toggle UI: if processing, show disabled but keep current state visually
  // or we could show a spinner. For now, disabled is good.

  const actions = useMemo(() => {
    if (isAdded) {
      return (
        <Button size="slim" onClick={() => onAction(lang)} disabled={isProcessing}>
          {t('actions.edit', { defaultValue: 'Edit' })}
        </Button>
      );
    }
    return (
      <Button size="slim" onClick={() => onAction(lang)} disabled={isProcessing || (planAtOrOverLimit && !isAdded)}>
        {t('actions.add', { defaultValue: 'Add' })}
      </Button>
    );
  }, [isAdded, isProcessing, onAction, lang, t, planAtOrOverLimit]);

  return (
    <div style={{ borderBottom: '1px solid #f1f2f3' }}>
      {/* Main Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 80px minmax(0, 1fr) 100px',
          gap: '16px',
          alignItems: 'center',
          padding: '12px 0',
        }}
      >
        {/* Language */}
        <InlineStack gap="300" blockAlign="center">
          <div style={{
            width: '24px',
            height: '18px',
            borderRadius: '2px',
            border: '1px solid #e1e3e5',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FlagIcon flagCode={lang.flagCode} countryCode={lang.isoCode} locale={lang.locale} size={24} />
          </div>
          <BlockStack gap="0">
            <Text variant="bodyMd" fontWeight="semibold">{lang.name}</Text>
            <Text variant="bodySm" color="subdued">{lang.locale}</Text>
          </BlockStack>
        </InlineStack>

        {/* Publish Toggle */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {isAdded ? (
            <Tooltip content={lang.published ? t('languageDomains.unpublish', { defaultValue: 'Unpublish' }) : t('languageDomains.publish', { defaultValue: 'Publish' })} preferredPosition="above">
              <div style={{ display: 'inline-block' }}>
                <Checkbox
                  label={t('languageDomains.publish', { defaultValue: 'Publish' })}
                  labelHidden
                  checked={lang.published}
                  disabled={isProcessing || (planAtOrOverLimit && !lang.published)}
                  onChange={() => onToggle(lang)}
                />
              </div>
            </Tooltip>
          ) : (
            <Checkbox label={t('languageDomains.hidden', { defaultValue: 'Hidden' })} labelHidden checked={false} disabled />
          )}
        </div>

        {/* URL */}
        <div style={{ minWidth: 0 }}>
          <InlineStack gap="200" align="start" blockAlign="center">
            <Link url={lang.urls[0]} target="_blank" removeUnderline monochrome>
              <Text truncate as="span" variant="bodyMd" color="interactive">
                {lang.urls[0]}
              </Text>
            </Link>
            {lang.urls.length > 1 && (
              <div style={{ display: 'inline-block' }}>
                <Button
                  plain
                  monochrome
                  onClick={toggleExpanded}
                  icon={expanded ? ChevronUpIcon : ChevronDownIcon}
                >
                  {t('languageDomains.moreUrls', { defaultValue: '+{{count}} more', count: lang.urls.length - 1 })}
                </Button>
              </div>
            )}
          </InlineStack>
        </div>

        {/* Action */}
        <div style={{ textAlign: 'right' }}>
          {actions}
        </div>
      </div>

      {/* Expanded URL List */}
      <Collapsible
        open={expanded}
        id={`urls-${lang.locale}`}
        transition={{ duration: '300ms', timingFunction: 'ease-in-out' }}
        expandOnPrint
      >
        <Box paddingBlockEnd="400" paddingInlineStart="0">
          <div style={{
            display: 'grid',
            gridTemplateColumns: '240px 80px minmax(0, 1fr) 100px',
            gap: '16px'
          }}>
            {/* Spacer columns to align with URL column */}
            <div />
            <div />
            <BlockStack gap="200">
              {lang.urls.slice(1).map((url, idx) => (
                <Link key={idx} url={url} target="_blank" removeUnderline monochrome>
                  <Text as="span" variant="bodyMd" color="interactive">
                    {url}
                  </Text>
                </Link>
              ))}
            </BlockStack>
            <div />
          </div>
        </Box>
      </Collapsible>
    </div>
  );
};

export default function LanguageDomains() {
  const {
    marketsLanguages,
    marketsConfig,
    shopName,
    primaryDomain,
    hasMarketsConfig,
    urlSettings,
    primaryLanguage,
    allLanguages,
    limitInfo,
    availableLocales,
    error
  } = useLoaderData();

  const { t, i18n } = useTranslation();
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const app = useAppBridge();
  const { smDown } = useBreakpoints();
  const location = useLocation();

  // Modal State
  const [showMessage, setShowMessage] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState('');
  const [draftName, setDraftName] = useState('');
  const [modalMode, setModalMode] = useState('add'); // 'add' | 'edit'
  const [searchTerm, setSearchTerm] = useState('');
  const [showAllAvailable, setShowAllAvailable] = useState(false);

  const planLimitIsFinite = Number.isFinite(limitInfo?.planLimit);
  const planAtOrOverLimit = planLimitIsFinite && limitInfo.planUsed >= limitInfo.planLimit;
  const planStrictlyOver = planLimitIsFinite && limitInfo.planUsed > limitInfo.planLimit;
  const isSyncing = fetcher.state !== 'idle' && fetcher.formData?.get('action') === 'sync';
  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const mustDisableParam = urlParams.get('mustDisable');
  const showLimitBanner = urlParams.get('limit') === 'exceeded';

  // Refresh after successful sync
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      revalidator.revalidate();
      setShowMessage(true);
      setIsModalOpen(false);
      setSelectedLocale('');
      setDraftName('');
      // Hide message after 3s
      const timer = setTimeout(() => setShowMessage(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const handleRefresh = useCallback(() => {
    fetcher.submit({ action: 'sync' }, { method: 'post' });
  }, [fetcher]);

  // App Bridge Redirects
  const handleMarketSettingsRedirect = () => {
    if (!app) {
      const store = shopName.replace('.myshopify.com', '');
      window.open(`https://admin.shopify.com/store/${store}/settings/markets`, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const redirect = Redirect.create(app);
      redirect.dispatch(Redirect.Action.ADMIN_PATH, '/settings/markets');
    } catch (redirectError) {
      console.error('Market settings redirect failed', redirectError);
      const store = shopName.replace('.myshopify.com', '');
      window.open(`https://admin.shopify.com/store/${store}/settings/markets`, '_blank', 'noopener,noreferrer');
    }
  };

  // Toggle Publish Status
  const handleTogglePublish = (lang) => {
    // If trying to publish (currently hidden)
    if (!lang.published) {
      const limitReached = planLimitIsFinite && limitInfo.planUsed >= limitInfo.planLimit;
      if (limitReached) {
        setIsUpgradeModalOpen(true);
        return;
      }
    }

    const formData = new FormData();
    formData.append('action', 'togglePublish');
    formData.append('locale', lang.locale);
    formData.append('published', String(lang.published));
    fetcher.submit(formData, { method: 'post' });
  };

  const handleAddAction = (lang) => {
    setModalMode('add');
    setSelectedLocale(lang.locale);
    setDraftName(lang.name);
    if (planAtOrOverLimit) {
      setIsUpgradeModalOpen(true);
    } else {
      setIsModalOpen(true);
    }
  };

  const handleEditAction = (lang) => {
    setModalMode('edit');
    setSelectedLocale(lang.locale);
    setDraftName(lang.name);
    setIsModalOpen(true);
  };

  const handleCreateDraft = useCallback(() => {
    const formData = new FormData();
    formData.append('action', 'createDraft');
    formData.append('locale', selectedLocale);
    formData.append('name', draftName);
    fetcher.submit(formData, { method: 'post' });
  }, [fetcher, selectedLocale, draftName]);

  // Filter Lists
  const addedLanguages = allLanguages.filter(l => l.status === 'active' || l.status === 'draft');
  const availableList = allLanguages.filter(l => l.status === 'available');

  const filteredAvailable = availableList.filter(l =>
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.locale.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLocaleUrls = useCallback((locale) => {
    const lc = (locale || '').toLowerCase();
    const variants = marketsConfig?.mappingVariants?.[lc] || [];
    const primaryUrl = marketsConfig?.primaryUrl;

    const urls = variants
      .map(v => v?.url)
      .filter(Boolean);

    if (urls.length === 0) {
      const mapping = marketsConfig?.mappings?.[lc];
      if (mapping?.url) urls.push(mapping.url);
      else if (primaryUrl) urls.push(`${primaryUrl}/${lc}`);
    }

    // 去重并返回
    return Array.from(new Set(urls.map(normalizeUrl)));
  }, [marketsConfig]);

  const displayedAvailable = showAllAvailable ? filteredAvailable : filteredAvailable.slice(0, 10);

  const isLoading = navigation.state === 'loading';

  // Ensure edit modal Select has a valid option for the current locale
  const modalSelectOptions = useMemo(() => {
    if (modalMode !== 'edit' || !selectedLocale) return availableLocales;
    const exists = availableLocales.some(
      (opt) => (opt.value || '').toLowerCase() === selectedLocale.toLowerCase()
    );
    if (exists) return availableLocales;
    return [...availableLocales, { label: draftName || selectedLocale, value: selectedLocale }];
  }, [availableLocales, modalMode, selectedLocale, draftName]);

  const modalPrimaryAction = useMemo(() => {
    if (modalMode === 'edit') {
      return {
        content: t('actions.save', { defaultValue: 'Save' }),
        onAction: () => setIsModalOpen(false),
        disabled: !selectedLocale || !draftName,
        loading: false
      };
    }
    return {
      content: limitInfo.canAddPublished
        ? t('actions.addAndPublish', { defaultValue: 'Add & Publish' })
        : t('actions.createDraft', { defaultValue: 'Create Draft' }),
      onAction: handleCreateDraft,
      loading: fetcher.state !== 'idle',
      disabled: !selectedLocale || !draftName,
      tone: limitInfo.canAddPublished ? undefined : 'critical'
    };
  }, [modalMode, selectedLocale, draftName, limitInfo, t, handleCreateDraft, fetcher.state]);

  return (
    <Page fullWidth>
      <BlockStack gap="500">
        {showLimitBanner && (
          <Banner tone="warning" title={t('languageLimitExceededTitle', { defaultValue: 'Language limit exceeded' })}>
            <BlockStack gap="200">
              <Text variant="bodySm">
                {t('languageLimitExceededDesc', {
                  defaultValue: 'Please disable some languages before completing your plan change.',
                  count: mustDisableParam ? Number(mustDisableParam) : undefined
                })}
              </Text>
              <Text variant="bodySm" tone="subdued">
                {t('languageLimitActionHint', {
                  defaultValue: 'Disable or unpublish languages here, then retry the plan change in Billing.'
                })}
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Header Actions */}
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingLg" as="h1">
            {t('languageDomains.title', { defaultValue: 'Language Domains' })}
          </Text>
          <InlineStack gap="300">
            <Button
              icon={RefreshIcon}
              onClick={handleRefresh}
              loading={isSyncing}
            >
              {t('languageDomains.sync', { defaultValue: 'Sync' })}
            </Button>
            <Button onClick={handleMarketSettingsRedirect}>
              {t('languageDomains.marketSettings', { defaultValue: 'Market Settings' })}
            </Button>
            <Button variant="primary" onClick={() => {
              setModalMode('add');
              setSelectedLocale('');
              setDraftName('');
              if (planAtOrOverLimit) setIsUpgradeModalOpen(true);
              else setIsModalOpen(true);
            }}>
              {t('languageDomains.addLanguage', { defaultValue: 'Add Language' })}
            </Button>
          </InlineStack>
        </InlineStack>

        {/* Message banner */}
        {showMessage && fetcher.data?.message && (
          <Banner
            status={fetcher.data.success ? "success" : "critical"}
            onDismiss={() => setShowMessage(false)}
          >
            <p>{fetcher.data.message}</p>
          </Banner>
        )}
        {fetcher.state === 'idle' && fetcher.data && fetcher.data.success === false && fetcher.data.message && (
          <Banner status="critical">
            <p>{fetcher.data.message}</p>
          </Banner>
        )}

        {/* Error banner */}
        {error && (
          <Banner status="critical">
            <p>{error}</p>
          </Banner>
        )}

        {/* Capacity Indicators */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="800">
              {/* Store Capacity */}
              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={StoreIcon} tone="subdued" />
                  <Text variant="bodySm" color="subdued">{t('languageDomains.storeCapacity', { defaultValue: 'Store Capacity' })}</Text>
                </InlineStack>
                <Text variant="headingLg">
                  {limitInfo.publishedCount} <Text as="span" variant="bodyMd" color="subdued">/ {limitInfo.maxPublished}</Text>
                </Text>
              </BlockStack>
              {/* Plan Capacity */}
              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="center">
                  <Icon source={StarFilledIcon} tone="warning" />
                  <Text variant="bodySm" color="subdued">{t('languageDomains.translationPlan', { defaultValue: 'Translation Plan' })}</Text>
                </InlineStack>
                <Text variant="headingLg">
                  {limitInfo.planUsed} <Text as="span" variant="bodyMd" color="subdued">/ {Number.isFinite(limitInfo.planLimit) ? limitInfo.planLimit : '∞'}</Text>
                </Text>
              </BlockStack>
            </InlineStack>
            {planStrictlyOver && (
              <Banner status="warning" title={t('languageDomains.planLimitExceeded', { defaultValue: 'Plan Limit Exceeded' })}>
                <p>{t('languageDomains.planLimitExceededDesc', { defaultValue: 'You have exceeded your plan limit. Please upgrade to publish more languages.' })}</p>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* Default Language */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="400" blockAlign="center">
              <div style={{ width: '40px', height: '30px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #e1e3e5' }}>
            <FlagIcon flagCode={primaryLanguage?.flagCode} countryCode={primaryLanguage?.isoCode || 'us'} locale={primaryLanguage?.locale} size={40} />
              </div>
              <BlockStack gap="0">
                <Text variant="headingMd">{primaryLanguage?.name || 'English'}</Text>
                <Text variant="bodySm" color="subdued">{t('languageDomains.defaultLanguage', { defaultValue: 'Default Language' })}</Text>
              </BlockStack>
            </InlineStack>
            <Badge tone="success">{t('languageDomains.default', { defaultValue: 'Default' })}</Badge>
          </InlineStack>
        </Card>

        {/* Main Language List */}
        <Card padding="0">
          <Box padding="400">
            <Text variant="headingMd">{t('languageDomains.languagesTitle', { defaultValue: 'Languages' })}</Text>
          </Box>

          {/* Table Header */}
          <Box paddingInline="400" paddingBlockEnd="300" borderBlockEndWidth="1" borderColor="border-subdued">
            <div style={{ display: 'grid', gridTemplateColumns: '240px 80px minmax(0, 1fr) 100px', gap: '16px', fontWeight: 600, color: '#616161', fontSize: '13px' }}>
              <div>{t('languageDomains.colLanguage', { defaultValue: 'Language' })}</div>
              <div>{t('languageDomains.colPublish', { defaultValue: 'Publish' })}</div>
              <div>{t('languageDomains.colUrl', { defaultValue: 'URL' })}</div>
              <div style={{ textAlign: 'right' }}>{t('languageDomains.colAction', { defaultValue: 'Action' })}</div>
            </div>
          </Box>

          {/* Added Languages */}
          <Box paddingInline="400">
            {addedLanguages.map(lang => (
              <LanguageRow
                key={lang.locale}
                lang={lang}
                status={lang.status}
                onToggle={handleTogglePublish}
                onAction={handleEditAction}
                planAtOrOverLimit={planAtOrOverLimit}
                isProcessing={fetcher.state !== 'idle'}
              />
            ))}
          </Box>

          {/* Available Languages Header */}
          <Box padding="400" borderBlockStartWidth="1" borderColor="border-subdued" background="bg-surface-secondary">
            <BlockStack gap="200">
              <Text variant="headingSm" color="subdued">{t('languageDomains.availableLanguages', { defaultValue: 'Available Languages' })}</Text>
              <TextField
                prefix={<Icon source={SearchIcon} />}
                placeholder={t('languageDomains.searchPlaceholder', { defaultValue: 'Search languages...' })}
                value={searchTerm}
                onChange={setSearchTerm}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setSearchTerm('')}
              />
            </BlockStack>
          </Box>

          {/* Available Languages List */}
          <Box paddingInline="400" paddingBlockEnd="400">
            {isLoading ? (
              <BlockStack gap="400" padding="400">
                <SkeletonBodyText lines={3} />
              </BlockStack>
            ) : (
              <>
                {displayedAvailable.map(lang => (
                  <LanguageRow
                    key={lang.locale}
                    lang={lang}
                    status="available"
                    onToggle={() => { }}
                    onAction={handleAddAction}
                    planAtOrOverLimit={planAtOrOverLimit}
                    isProcessing={fetcher.state !== 'idle'}
                  />
                ))}
                {filteredAvailable.length > 10 && !showAllAvailable && (
                  <Box padding="400" display="flex" justifyContent="center">
                    <Button plain onClick={() => setShowAllAvailable(true)}>
                      {t('languageDomains.showAll', { defaultValue: 'Show all {{count}} languages', count: filteredAvailable.length })}
                    </Button>
                  </Box>
                )}
              </>
            )}
          </Box>
        </Card>
      </BlockStack>

      {/* Modals */}
      {/* Upgrade Modal */}
      <Modal
        open={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        title={t('languageDomains.upgradeTitle', { defaultValue: 'Upgrade Plan' })}
        primaryAction={{
          content: t('languageDomains.viewPlans', { defaultValue: 'View Plans' }),
          onAction: () => {
            // Redirect to pricing page
            const store = shopName.replace('.myshopify.com', '');
            window.open(`https://admin.shopify.com/store/${store}/apps/${process.env.SHOPIFY_API_KEY}/pricing`, '_blank');
            setIsUpgradeModalOpen(false);
          }
        }}
        secondaryActions={[{
          content: t('common.cancel', { defaultValue: 'Cancel' }),
          onAction: () => setIsUpgradeModalOpen(false),
        }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner status="warning">
              <p>{t('languageDomains.upgradeBody', { defaultValue: 'You have reached the maximum number of published languages for your current plan.' })}</p>
            </Banner>
            <Text as="p">
              {t('languageDomains.upgradeDesc', { defaultValue: 'Upgrade to the Ultra plan to unlock unlimited languages and advanced features.' })}
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Add/Edit Modal (Simplified for brevity, keep original logic) */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalMode === 'edit'
          ? t('actions.edit', { defaultValue: 'Edit Language' })
          : t('actions.add', { defaultValue: 'Add Language' })}
        primaryAction={modalPrimaryAction}
        secondaryActions={[
          {
            content: t('common.cancel', { defaultValue: 'Cancel' }),
            onAction: () => setIsModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            {/* Smart Warning Banner */}
            {modalMode === 'add' && !limitInfo.canAddPublished && (
              <Banner status="warning" title={t('drafts.limitReachedTitle', { defaultValue: 'Shopify limit reached (21/21)' })}>
                <p>
                  {t('drafts.limitReachedDesc', { defaultValue: 'This language will be created as a Draft. To publish it, you must first unpublish an existing language in Market Settings.' })}
                </p>
              </Banner>
            )}

            <Select
              label={t('drafts.selectLanguage', { defaultValue: 'Select Language' })}
              options={modalSelectOptions}
              onChange={(value) => {
                setSelectedLocale(value);
                const selected = availableLocales.find(l => l.value === value);
                if (selected) setDraftName(selected.label);
              }}
              value={selectedLocale}
              placeholder={t('drafts.selectPlaceholder', { defaultValue: 'Choose a language...' })}
              disabled={modalMode === 'edit'}
            />
            <TextField
              label={t('drafts.languageName', { defaultValue: 'Language Name' })}
              value={draftName}
              onChange={setDraftName}
              autoComplete="off"
            />

            {modalMode === 'add' && limitInfo.canAddPublished && (
              <BlockStack gap="200">
                <InlineStack gap="200" align="start">
                  <Icon source={AlertDiamondIcon} tone="critical" />
                  <Text variant="bodySm" color="critical">
                    {t('drafts.seoWarning', { defaultValue: 'Warning: Frequent swapping of published languages can negatively impact your SEO rankings.' })}
                  </Text>
                </InlineStack>
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

    </Page>
  );
}
