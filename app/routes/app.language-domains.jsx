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
  Divider,
  Collapsible,
  Checkbox,
  ChoiceList
} from "@shopify/polaris";
import { LanguageIcon, LinkIcon, RefreshIcon, GlobeIcon, ChevronDownIcon, ChevronUpIcon } from '@shopify/polaris-icons';
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
    getMarketsLanguagesGrouped,
    getUrlConversionSettings
  } = await import("../services/market-urls.server");
  const { logger } = await import("../utils/logger.server");

  try {
    const { admin, session } = await authenticate.admin(request);

    logger.info('加载语言域名页面', { shop: session.shop });

    const [marketsLanguages, marketsConfig, urlSettings] = await Promise.all([
      getMarketsLanguagesGrouped(admin),
      getMarketConfigWithCache(session.shop, admin),
      getUrlConversionSettings(session.shop)
    ]);

    const totalLanguages = marketsLanguages.reduce((sum, m) => sum + m.languageCount, 0);

    logger.info('语言域名页面数据加载完成', {
      marketsCount: marketsLanguages.length,
      totalLanguages,
      markets: marketsLanguages.map(m => `${m.marketName}(${m.languageCount})`).join(', ')
    });

    return json({
      marketsLanguages,
      marketsConfig,
      shopName: marketsConfig?.shopName || session.shop,
      primaryDomain: marketsConfig?.primaryUrl || `https://${session.shop}`,
      hasMarketsConfig: !!marketsConfig && marketsLanguages.length > 0,
      marketsCount: marketsLanguages.length,
      totalLanguages,
      urlSettings
    });
  } catch (error) {
    logger.error('加载语言域名页面失败', error);
    return json({
      marketsLanguages: [],
      marketsConfig: null,
      shopName: '',
      primaryDomain: '',
      hasMarketsConfig: false,
      marketsCount: 0,
      totalLanguages: 0,
      error: error.message
    });
  }
};

export default function LanguageDomains() {
  const {
    marketsLanguages,
    marketsConfig,
    shopName,
    primaryDomain,
    hasMarketsConfig,
    marketsCount,
    totalLanguages,
    urlSettings,
    error
  } = useLoaderData();

  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [showMessage, setShowMessage] = useState(false);
  const [openMarkets, setOpenMarkets] = useState({});

  // 🆕 链接转换设置状态
  const [enableLinkConversion, setEnableLinkConversion] = useState(
    urlSettings?.enableLinkConversion || false
  );
  const [urlStrategy, setUrlStrategy] = useState(
    urlSettings?.urlStrategy || 'conservative'
  );

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

  // 🆕 保存链接转换设置
  const handleSaveSettings = useCallback(() => {
    const formData = new FormData();
    formData.append('action', 'updateSettings');
    formData.append('enableLinkConversion', enableLinkConversion.toString());
    formData.append('urlStrategy', urlStrategy);
    fetcher.submit(formData, { method: 'post' });
  }, [fetcher, enableLinkConversion, urlStrategy]);

  // 默认展开primary市场
  useEffect(() => {
    if (marketsLanguages.length > 0 && Object.keys(openMarkets).length === 0) {
      const primaryMarket = marketsLanguages.find(m => m.isPrimaryMarket);
      if (primaryMarket) {
        setOpenMarkets({ [primaryMarket.marketId]: true });
      } else {
        // 如果没有primary市场，展开第一个
        setOpenMarkets({ [marketsLanguages[0].marketId]: true });
      }
    }
  }, [marketsLanguages]);

  // 切换市场折叠/展开
  const toggleMarket = useCallback((marketId) => {
    setOpenMarkets(prev => ({
      ...prev,
      [marketId]: !prev[marketId]
    }));
  }, []);

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

  // 空状态
  if (!marketsLanguages || marketsLanguages.length === 0) {
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
                  <Text variant="bodySm" color="subdued">市场</Text>
                  <Text variant="bodyMd" fontWeight="semibold">
                    {marketsCount} 个
                  </Text>
                </BlockStack>

                <BlockStack gap="050">
                  <Text variant="bodySm" color="subdued">总语言数</Text>
                  <Text variant="bodyMd" fontWeight="semibold">
                    {totalLanguages} 种
                  </Text>
                </BlockStack>
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

        {/* 🆕 链接转换设置 */}
        {hasMarketsConfig && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" fontWeight="semibold">
                    链接转换设置
                  </Text>
                  <Text variant="bodySm" color="subdued">
                    翻译时自动转换内链到对应语言的URL
                  </Text>
                </BlockStack>
              </InlineStack>

              <Divider />

              <BlockStack gap="400">
                <Checkbox
                  label="启用链接转换"
                  checked={enableLinkConversion}
                  onChange={setEnableLinkConversion}
                  helpText="翻译内容时自动将内部链接转换为目标语言的URL"
                />

                {enableLinkConversion && (
                  <ChoiceList
                    title="转换策略"
                    choices={[
                      {
                        label: '保守模式',
                        value: 'conservative',
                        helpText: '只转换明确匹配的域名和路径'
                      },
                      {
                        label: '激进模式',
                        value: 'aggressive',
                        helpText: '尝试转换更多链接，可能误转换外部链接'
                      }
                    ]}
                    selected={[urlStrategy]}
                    onChange={(value) => setUrlStrategy(value[0])}
                  />
                )}

                <InlineStack align="end">
                  <Button
                    onClick={handleSaveSettings}
                    loading={fetcher.state !== 'idle'}
                    variant="primary"
                  >
                    保存设置
                  </Button>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        )}

        {/* 按市场分组的语言配置 */}
        {marketsLanguages.map(market => (
          <Card key={market.marketId}>
            <BlockStack gap="300">
              {/* 市场头部 - 可点击展开/折叠 */}
              <Box
                as="button"
                onClick={() => toggleMarket(market.marketId)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Icon
                      source={openMarkets[market.marketId] ? ChevronUpIcon : ChevronDownIcon}
                    />
                    <Icon source={GlobeIcon} />
                    <Text variant="headingMd" fontWeight="semibold">
                      {market.marketName}
                    </Text>
                    <Badge>
                      {market.languageCount} 种语言
                    </Badge>
                    {market.isPrimaryMarket && (
                      <Badge status="success">主市场</Badge>
                    )}
                  </InlineStack>
                </InlineStack>
              </Box>

              {/* 语言列表 - 可折叠 */}
              <Collapsible
                open={openMarkets[market.marketId] || false}
                id={`market-${market.marketId}`}
                transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
              >
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['语言', 'URL配置', '类型', '状态', '操作']}
                  rows={market.languages.map(lang => [
                    // 语言信息
                    <InlineStack gap="200" blockAlign="center" key={`lang-${lang.locale}`}>
                      <Icon source={LanguageIcon} />
                      <BlockStack gap="0">
                        <Text variant="bodyMd" fontWeight="semibold">{lang.name}</Text>
                        <Text variant="bodySm" color="subdued">{lang.locale}</Text>
                      </BlockStack>
                      {lang.primary && <Badge status="info">默认</Badge>}
                      {lang.isAlternate && <Badge>备选</Badge>}
                    </InlineStack>,

                    // URL配置
                    <BlockStack gap="100" key={`url-${lang.locale}`}>
                      <InlineStack gap="100" blockAlign="center">
                        <Icon source={LinkIcon} color="subdued" />
                        <Text variant="bodySm" breakWord>{lang.url}</Text>
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
                    <Button
                      key={`action-${lang.locale}`}
                      size="slim"
                      url={lang.url}
                      external
                      disabled={lang.type === 'unknown'}
                    >
                      访问
                    </Button>
                  ])}
                  hoverable
                />
              </Collapsible>
            </BlockStack>
          </Card>
        ))}
        
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