/**
 * 语言域名配置展示页面
 * 显示所有语言的URL映射配置
 */

import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import {
  Page,
  Card,
  DataTable,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Icon,
  EmptyState,
  Spinner,
  Banner,
  Box,
  Divider
} from "@shopify/polaris";
import { LanguageIcon, LinkIcon, RefreshIcon, GlobeIcon } from '@shopify/polaris-icons';
import { useCallback, useState, useEffect } from "react";

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server");
  const { syncMarketConfig, updateUrlConversionSettings } = await import("../services/market-urls.server");
  const { logger } = await import("../utils/logger.server");
  
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get('action');
  
  try {
    switch (action) {
      case 'sync':
        // 强制同步新配置
        const config = await syncMarketConfig(session.shop, admin);
        logger.info('手动同步Markets配置', { shop: session.shop });
        
        return json({ 
          success: true, 
          message: '配置同步成功',
          languageCount: config ? Object.keys(config.mappings || {}).length : 0
        });
        
      case 'updateSettings':
        // 更新URL转换设置
        const settings = {
          urlStrategy: formData.get('urlStrategy'),
          enableLinkConversion: formData.get('enableLinkConversion') === 'true'
        };
        
        await updateUrlConversionSettings(session.shop, settings);
        
        return json({
          success: true,
          message: '设置更新成功'
        });
        
      default:
        return json({ success: false, message: '未知操作' });
    }
  } catch (error) {
    logger.error('操作失败', error);
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
    getLanguageUrlsForDisplay,
    getUrlConversionSettings
  } = await import("../services/market-urls.server");
  const { getShopLocales } = await import("../services/shopify-locales.server");
  const { logger } = await import("../utils/logger.server");

  try {
    const { admin, session } = await authenticate.admin(request);

    logger.info('加载语言域名页面', { shop: session.shop });

    const marketsConfig = await getMarketConfigWithCache(session.shop, admin);

    const [shopLocales, languageUrls, urlSettings] = await Promise.all([
      getShopLocales(admin).catch(err => {
        logger.error('获取店铺语言失败', err);
        return [];
      }),
      getLanguageUrlsForDisplay(admin),
      getUrlConversionSettings(session.shop)
    ]);

    const mergeLocaleMeta = (localeKey, marketConfig, locales) => {
      const shopLocale = locales.find(l => l.locale === localeKey);
      return {
        locale: localeKey,
        name: shopLocale?.name || marketConfig.marketName || localeKey,
        primary: shopLocale?.primary || marketConfig.primary || false,
        published: shopLocale?.published || false,
        marketName: marketConfig.marketName,
        type: marketConfig.type || 'unknown',
        url: marketConfig.url || marketsConfig?.primaryUrl || '#',
        path: marketConfig.path,
        hasMarketConfig: true
      };
    };

    let enhancedLanguageData = [];

    if (marketsConfig?.mappings) {
      enhancedLanguageData = Object.entries(marketsConfig.mappings)
        .flatMap(([marketName, marketData]) => {
          const { locales = [], ...rest } = marketData;
          return locales.map(localeKey => {
            const localeInfo = mergeLocaleMeta(localeKey, { ...rest, marketName }, shopLocales);
            const urlInfo = languageUrls.find(item => item.locale === localeKey) || {};
            return {
              ...localeInfo,
              ...urlInfo,
              marketName,
              localeKey
            };
          });
        })
        .sort((a, b) => {
          if (a.primary) return -1;
          if (b.primary) return 1;
          return a.locale.localeCompare(b.locale);
        });
    }

    return json({
      languages: enhancedLanguageData,
      marketsConfig,
      shopName: marketsConfig?.shopName || session.shop,
      primaryDomain: marketsConfig?.primaryUrl || `https://${session.shop}`,
      hasMarketsConfig: !!marketsConfig,
      marketsCount: marketsConfig?.markets?.length || 0,
      urlSettings
    });
  } catch (error) {
    logger.error('加载语言域名页面失败', error);
    return json({
      languages: [],
      marketsConfig: null,
      shopName: '',
      primaryDomain: '',
      hasMarketsConfig: false,
      marketsCount: 0,
      error: error.message
    });
  }
};

export default function LanguageDomains() {
  const {
    languages,
    marketsConfig,
    shopName,
    primaryDomain,
    hasMarketsConfig,
    marketsCount,
    error
  } = useLoaderData();

  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [showMessage, setShowMessage] = useState(false);

  // 监听同步成功后刷新数据
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      revalidator.revalidate();
      setShowMessage(true);
      // 3秒后自动隐藏消息
      const timer = setTimeout(() => setShowMessage(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const handleRefresh = useCallback(() => {
    fetcher.submit({ action: 'sync' }, { method: 'post' });
  }, [fetcher]);

  // 生成友好的市场-语言展示名称（保持小写）
  const getMarketLanguageDisplay = (locale, marketName) => {
    try {
      // 解析locale格式 (如 en-de, zh-cn) - 保持小写
      const parts = locale.toLowerCase().split('-');
      const languageCode = parts[0];
      const regionCode = parts[1];

      // 直接使用小写代码，不做转换
      const regionDisplay = regionCode || marketName?.toLowerCase() || '未知';
      const languageDisplay = languageCode;

      return `${regionDisplay} · ${languageDisplay}`;
    } catch (error) {
      // 降级处理：返回小写的locale
      return `${marketName?.toLowerCase() || '未知'} · ${locale.toLowerCase()}`;
    }
  };

  // 获取URL类型的徽章
  const getTypeBadge = (type) => {
    const typeConfig = {
      'primary': { status: 'info', label: '主域名' },
      'subfolder': { status: 'success', label: '子路径' },
      'subdomain': { status: 'attention', label: '子域名' },
      'domain': { status: 'warning', label: '独立域名' },
      'unknown': { status: 'critical', label: '未配置' }
    };

    const config = typeConfig[type] || typeConfig['unknown'];
    return <Badge status={config.status}>{config.label}</Badge>;
  };
  
  // 构建数据表格行
  const rows = languages.map(lang => [
    // 语言信息
    <InlineStack gap="200" blockAlign="center">
      <Box>
        <Icon source={LanguageIcon} />
      </Box>
      <BlockStack gap="0">
        <Text variant="bodyMd" fontWeight="semibold">
          {lang.name}
        </Text>
        <Text variant="bodySm" color="subdued">
          {lang.locale}
        </Text>
      </BlockStack>
      {lang.primary && <Badge status="info">默认</Badge>}
    </InlineStack>,

    // 市场说明（友好格式）
    <Text variant="bodyMd" fontWeight="semibold">
      {getMarketLanguageDisplay(lang.locale, lang.marketName)}
    </Text>,

    // URL配置
    <BlockStack gap="100">
      <InlineStack gap="100" blockAlign="center">
        <Box>
          <Icon source={LinkIcon} color="subdued" />
        </Box>
        <Text variant="bodySm" as="span" breakWord>
          {lang.url}
        </Text>
      </InlineStack>
      {lang.path && (
        <Text variant="bodySm" color="subdued">
          路径: {lang.path}
        </Text>
      )}
    </BlockStack>,

    // 类型
    getTypeBadge(lang.type),

    // 状态
    lang.published ?
      <Badge status="success">已发布</Badge> :
      <Badge status="critical">未发布</Badge>,

    // 操作
    <InlineStack gap="100">
      <Button
        size="slim"
        url={lang.url}
        external
        disabled={!lang.hasMarketConfig || lang.type === 'unknown'}
      >
        访问
      </Button>
    </InlineStack>
  ]);
  
  // 空状态
  if (!languages || languages.length === 0) {
    return (
      <Page
        title="语言域名配置"
        subtitle="查看所有语言的URL映射"
        backAction={{ url: "/app" }}
      >
        <EmptyState
          heading="尚未配置语言"
          action={{
            content: '前往Shopify设置',
            url: 'https://admin.shopify.com/settings/markets',
            external: true
          }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <p>请先在Shopify后台配置Markets和语言设置</p>
        </EmptyState>
      </Page>
    );
  }
  
  return (
    <Page
      title="语言域名配置"
      subtitle={`查看${shopName}的多语言URL映射`}
      backAction={{ url: "/app" }}
      primaryAction={{
        content: fetcher.state !== 'idle' ? '同步中...' : '刷新配置',
        icon: RefreshIcon,
        onAction: handleRefresh,
        loading: fetcher.state !== 'idle'
      }}
    >
      <BlockStack gap="300">
        {/* 简化的消息提示 */}
        {showMessage && fetcher.data?.message && (
          <Banner
            status={fetcher.data.success ? "success" : "critical"}
            onDismiss={() => setShowMessage(false)}
          >
            <p>{fetcher.data.message}</p>
          </Banner>
        )}

        {/* 只在真正有错误时显示 */}
        {error && !hasMarketsConfig && (
          <Banner status="critical">
            <p>{error}</p>
          </Banner>
        )}

        {/* 简化的概览信息 */}
        {hasMarketsConfig && (
          <Card>
            <InlineStack align="space-between">
              <InlineStack gap="600">
                <BlockStack gap="050">
                  <Text variant="bodySm" color="subdued">主域名</Text>
                  <Text variant="bodyMd" fontWeight="semibold">
                    {primaryDomain}
                  </Text>
                </BlockStack>

                <BlockStack gap="050">
                  <Text variant="bodySm" color="subdued">语言</Text>
                  <Text variant="bodyMd" fontWeight="semibold">
                    {languages.length} 种
                  </Text>
                </BlockStack>

                {marketsCount > 0 && (
                  <BlockStack gap="050">
                    <Text variant="bodySm" color="subdued">市场</Text>
                    <Text variant="bodyMd" fontWeight="semibold">
                      {marketsCount} 个
                    </Text>
                  </BlockStack>
                )}
              </InlineStack>

              {marketsConfig?.timestamp && (
                <Text variant="bodySm" color="subdued">
                  更新于 {new Date(marketsConfig.timestamp).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </Text>
              )}
            </InlineStack>
          </Card>
        )}
        
        {/* 语言域名映射表 */}
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd">语言域名映射</Text>
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
              headings={['语言', '市场说明', 'URL配置', '类型', '状态', '操作']}
              rows={rows}
              hoverable
            />
          </BlockStack>
        </Card>
        
        {/* 简化的配置说明 */}
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd">URL配置说明</Text>
            <InlineStack gap="400" wrap>
              <InlineStack gap="200" blockAlign="center">
                {getTypeBadge('subfolder')}
                <Text variant="bodySm">子路径</Text>
              </InlineStack>
              <InlineStack gap="200" blockAlign="center">
                {getTypeBadge('subdomain')}
                <Text variant="bodySm">子域名</Text>
              </InlineStack>
              <InlineStack gap="200" blockAlign="center">
                {getTypeBadge('domain')}
                <Text variant="bodySm">独立域名</Text>
              </InlineStack>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}