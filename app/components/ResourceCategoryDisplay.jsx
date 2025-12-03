import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getResourceDisplayTitle } from '../utils/resource-display-helpers.js';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  Collapsible,
  Grid,
  Icon,
  InlineStack,
  Text,
  Tooltip,
  ProgressBar
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronRightIcon, InfoIcon } from '@shopify/polaris-icons';
import { RESOURCE_CATEGORIES, organizeResourcesByCategory } from '../config/resource-categories';
import { filterResourcesForList } from '../utils/resource-filters';
import { parseSyncError } from '../utils/sync-error-helper';

/**
 * Resource category display component (grid layout)
 * @param {Array} resources - resource list
 * @param {Function} onResourceClick - resource click handler
 * @param {Array} selectedResources - selected resource IDs
 * @param {Function} onSelectionChange - selection change handler
 * @param {String} currentLanguage - current language
 */
export function ResourceCategoryDisplay({
  resources = [],
  onResourceClick,
  selectedResources = [],
  onSelectionChange,
  currentLanguage = 'zh-CN',
  onTranslateCategory,
  onSyncCategory, // deprecated, use publish management instead
  translatingCategories = new Set(),
  syncingCategories = new Set(), // deprecated
  clearCache = false,
  showOtherLanguageHints = true // whether to show other-language translation hints
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  // Deprecated notice: keep plain text to avoid template issues
  if (onSyncCategory && typeof onSyncCategory === 'function') {
    console.warn('[Deprecated] onSyncCategory prop is deprecated. Please use the publish management flow.');
  }
  const [expandedSubcategories, setExpandedSubcategories] = useState({});
  const [expandedProducts, setExpandedProducts] = useState({}); // productId -> bool
  const [productOptionsMap, setProductOptionsMap] = useState({}); // productId -> { loading, options }
  
  // Filter out product-linked resources (options/metafields) and manage them in the product detail page
  // Use a shared filter helper for maintainability
  const filteredResources = filterResourcesForList(resources);

  // Organize resources by category
  const organizedResources = organizeResourcesByCategory(filteredResources);
  
  // Toggle subcategory expand state
  const toggleSubcategory = (categoryKey, subcategoryKey) => {
    const key = `${categoryKey}_${subcategoryKey}`;
    setExpandedSubcategories(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isProduct = (resource) => String(resource?.resourceType || '').toUpperCase() === 'PRODUCT';

  const toggleProductOptions = useCallback(async (resource) => {
    const pid = resource.id;
    setExpandedProducts(prev => ({ ...prev, [pid]: !prev[pid] }));
    // Lazy-load on first expand
    if (!productOptionsMap[pid] && resource.gid) {
      setProductOptionsMap(prev => ({ ...prev, [pid]: { loading: true, options: [] } }));
      try {
        const res = await fetch(`/api/product-options?gid=${encodeURIComponent(resource.gid)}`);
        const data = await res.json();
        const options = data?.data?.options || [];
        setProductOptionsMap(prev => ({ ...prev, [pid]: { loading: false, options } }));
      } catch (e) {
        setProductOptionsMap(prev => ({ ...prev, [pid]: { loading: false, options: [] } }));
        // Ignore errors to avoid blocking the page
      }
    }
  }, [productOptionsMap]);
  
  // Get resource display name
  const getResourceDisplayName = (resource) => {
    return getResourceDisplayTitle(resource, locale, t) || resource.handle || resource.name || resource.gid;
  };
  
  // Status badge per language
  const getResourceStatusBadge = (resource) => {
    // If current language has translation
    if (resource.hasTranslationForLanguage) {
      // Map sync status
      if (resource.translationSyncStatus === 'synced') {
        return <Badge tone="success">{t('resources.status.synced')}</Badge>;
      }
      if (resource.translationSyncStatus === 'partial') {
        const { warnings, message } = parseSyncError(resource.translationSyncError);
        const tooltipContent = warnings.length > 0
          ? warnings.map(w => w.message || t('resources.status.partialField', { field: w.field || t('resources.status.field') })).join('\n')
          : (message || t('resources.status.partialDefault'));
        return (
          <Tooltip content={tooltipContent}>
            <Badge tone="attention">{t('resources.status.partial')}</Badge>
          </Tooltip>
        );
      }
      if (resource.translationSyncStatus === 'pending') {
        return <Badge tone="warning">{t('resources.status.pending')}</Badge>;
      }
      if (resource.translationSyncStatus === 'syncing') {
        return <Badge tone="info">{t('resources.status.syncing')}</Badge>;
      }
      if (resource.translationSyncStatus === 'failed') {
        return <Badge tone="critical">{t('resources.status.failed')}</Badge>;
      }
      // Unknown translation status but translation exists
      return <Badge tone="info">{t('resources.status.processing')}</Badge>;
    }

    // If current language lacks translations, optionally show hints from other languages
    if (showOtherLanguageHints && resource.hasOtherLanguageTranslations) {
      const otherCount = resource.totalTranslationCount || 0;
      return (
        <InlineStack gap="100" wrap={false} blockAlign="center">
          <Badge tone="attention">{t('resources.status.notTranslated')}</Badge>
          <Tooltip content={t('resources.tooltip.otherTranslations', { count: otherCount })}>
            <Icon source={InfoIcon} tone="subdued" />
          </Tooltip>
        </InlineStack>
      );
    }

    // No translations available
    return <Badge tone="attention">{t('resources.status.notTranslated')}</Badge>;
  };
  
  // Get language label
  const getLanguageBadge = () => {
    const languageMap = {
      'zh-CN': t('resources.languages.zh-CN'),
      'zh-TW': t('resources.languages.zh-TW'),
      'en': t('resources.languages.en'),
      'ja': t('resources.languages.ja'),
      'ko': t('resources.languages.ko'),
      'fr': t('resources.languages.fr'),
      'de': t('resources.languages.de'),
      'es': t('resources.languages.es')
    };
    return languageMap[currentLanguage] || currentLanguage;
  };
  
  // Select all resources in a category
  const selectCategoryResources = (category, select) => {
    if (!onSelectionChange) return;
    
    Object.values(category.subcategories).forEach(subcategory => {
      subcategory.items.forEach(resource => {
        if (select && !selectedResources.includes(resource.id)) {
          onSelectionChange(resource.id, true);
        } else if (!select && selectedResources.includes(resource.id)) {
          onSelectionChange(resource.id, false);
        }
      });
    });
  };
  
  // Check if a category is fully selected
  const isCategoryAllSelected = (category) => {
    let totalItems = 0;
    let selectedItems = 0;
    
    Object.values(category.subcategories).forEach(subcategory => {
      subcategory.items.forEach(resource => {
        totalItems++;
        if (selectedResources.includes(resource.id)) {
          selectedItems++;
        }
      });
    });
    
    return totalItems > 0 && totalItems === selectedItems;
  };
  
  // Translate an entire category
  const handleTranslateCategory = (categoryKey, category) => {
    if (!onTranslateCategory) return;
    
    // Collect all resource IDs under the category
    const categoryResourceIds = [];
    Object.values(category.subcategories).forEach(subcategory => {
      subcategory.items.forEach(resource => {
        categoryResourceIds.push(resource.id);
      });
    });
    
    if (categoryResourceIds.length > 0) {
      onTranslateCategory(categoryKey, categoryResourceIds);
    }
  };
  
  // Empty state
  if (resources.length === 0) {
    return (
      <Card>
        <Text as="p" tone="subdued" alignment="center">
          {t('resources.empty')}
        </Text>
      </Card>
    );
  }
  
  return (
    <BlockStack gap="4">
            <Card>
        <InlineStack align="space-between">
          <BlockStack gap="2">
            <Text as="h2" variant="headingMd">
              {t('resources.overview.title')}
            </Text>
            <InlineStack gap="3">
              <Badge tone="info">
                {t('resources.overview.total', { count: resources.length })}
              </Badge>
              <Badge tone="success">
                {t('resources.overview.categories', { count: Object.keys(organizedResources).length })}
              </Badge>
              {selectedResources.length > 0 && (
                <Badge tone="attention">
                  {t('resources.overview.selected', { count: selectedResources.length })}
                </Badge>
              )}
              <Badge>
                {t('resources.overview.targetLanguage', { language: getLanguageBadge() })}
              </Badge>
            </InlineStack>
                        <Box padding="200" background="bg-surface-secondary" borderRadius="200">
              <Text variant="bodySm" tone="subdued">
                {t('resources.overview.tip')}
              </Text>
            </Box>
          </BlockStack>
          {onSelectionChange && (
            <Button
              variant="tertiary"
              onClick={() => {
                const allResourceIds = resources.map(r => r.id);
                const allSelected = selectedResources.length === resources.length;
                
                if (allSelected) {
                  allResourceIds.forEach(id => {
                    if (selectedResources.includes(id)) {
                      onSelectionChange(id, false);
                    }
                  });
                } else {
                  allResourceIds.forEach(id => {
                    if (!selectedResources.includes(id)) {
                      onSelectionChange(id, true);
                    }
                  });
                }
              }}
            >
              {selectedResources.length === resources.length ? t('resources.actions.unselectAll') : t('resources.actions.selectAll')}
            </Button>
          )}
        </InlineStack>
      </Card>
      
            <BlockStack gap="400">
        {Object.entries(organizedResources).map(([categoryKey, category]) => (
          <Card key={categoryKey}>
                            <Box paddingBlockEnd="3">
                <InlineStack align="space-between">
                  <InlineStack gap="2" blockAlign="center">
                    <Text as="h3" variant="headingMd">
                      {category.icon} {category.name}
                    </Text>
                    <Badge>{category.totalCount}</Badge>
                    <Badge tone={
                      category.translationProgress === 100 ? "success" :
                      category.translationProgress === 0 ? "critical" :
                      "warning"
                    }>
                      {category.translationProgress}%
                    </Badge>
                  </InlineStack>
                  <InlineStack gap="2">
                    {onTranslateCategory && (
                      <Button
                        size="slim"
                        variant="primary"
                        onClick={() => handleTranslateCategory(categoryKey, category)}
                        loading={translatingCategories.has(categoryKey)}
                        disabled={translatingCategories.has(categoryKey) || category.totalCount === 0}
                      >
                        {translatingCategories.has(categoryKey) ? t('resources.actions.translating') : t('resources.actions.translate')}
                      </Button>
                    )}
                                        {onSelectionChange && (
                      <Button
                        size="slim"
                        variant="plain"
                        onClick={() => selectCategoryResources(category, !isCategoryAllSelected(category))}
                      >
                        {isCategoryAllSelected(category) ? t('resources.actions.unselect') : t('resources.actions.select')}
                      </Button>
                    )}
                  </InlineStack>
                </InlineStack>
                                {category.translatedCount > 0 && (
                  <Box paddingBlockStart="2">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t('resources.overview.publishReminder')}
                  </Text>
                  </Box>
                )}
              </Box>
              
                            <Box 
                style={{
                  maxHeight: '350px',
                  overflowY: 'auto',
                  border: '1px solid var(--p-color-border-subdued)',
                  borderRadius: 'var(--p-border-radius-200)',
                  padding: 'var(--p-space-300)'
                }}
              >
                <BlockStack gap="3">
                  {Object.entries(category.subcategories).map(([subcategoryKey, subcategory]) => {
                    const subKey = `${categoryKey}_${subcategoryKey}`;
                    const isExpanded = expandedSubcategories[subKey] !== false; // expanded by default
                    
                    return (
                      <Box key={subcategoryKey}>
                        <BlockStack gap="2">
                                                    <Button
                            variant="plain"
                            onClick={() => toggleSubcategory(categoryKey, subcategoryKey)}
                            fullWidth
                            textAlign="start"
                            size="slim"
                          >
                            <InlineStack gap="2" blockAlign="center">
                              <Box>
                                {isExpanded ? 
                                  <ChevronDownIcon /> : 
                                  <ChevronRightIcon />
                                }
                              </Box>
                              <Text as="span" variant="headingSm">
                                {subcategory.name}
                              </Text>
                              <Badge tone="neutral">{subcategory.count}</Badge>
                            </InlineStack>
                          </Button>
                          
                                                    <Collapsible
                            open={isExpanded}
                            id={`subcategory-${subKey}`}
                            transition={{duration: '150ms', timingFunction: 'ease-in-out'}}
                          >
                            <Box paddingInlineStart="4">
                              <BlockStack gap="1">
                                {subcategory.items.map((resource, index) => (
                                  <Box 
                                    key={resource.id || index} 
                                    padding="2"
                                    background={selectedResources.includes(resource.id) ? 'bg-surface-selected' : undefined}
                                    borderRadius="200"
                                  >
                                    <InlineStack gap="2" align="space-between" wrap={false}>
                                      <InlineStack gap="2" blockAlign="center">
                                        {onSelectionChange && (
                                          <Checkbox
                                            checked={selectedResources.includes(resource.id)}
                                            onChange={(checked) => onSelectionChange(resource.id, checked)}
                                          />
                                        )}
                                        <Box minWidth="0" style={{flex: 1}}>
                                          <Text 
                                            as="span" 
                                            variant="bodyMd"
                                            truncate
                                          >
                                            {getResourceDisplayName(resource)}
                                          </Text>
                                        </Box>
                                      </InlineStack>
                                      <InlineStack gap="1">
                                        {getResourceStatusBadge(resource)}
                                        {isProduct(resource) && resource.gid && (
                                          <Button size="micro" variant="plain" onClick={() => toggleProductOptions(resource)}>
                                            {expandedProducts[resource.id] ? t('resources.actions.collapseOptions') : t('resources.actions.expandOptions')}
                                          </Button>
                                        )}
                                        {onResourceClick && (
                                          <Button
                                            size="micro"
                                            variant="plain"
                                            onClick={() => onResourceClick(resource)}
                                          >
                                            {t('resources.actions.detail')}
                                          </Button>
                                        )}
                                      </InlineStack>
                                    </InlineStack>
                                    {isProduct(resource) && expandedProducts[resource.id] && (
                                      <Box padding="2" paddingInlineStart="8">
                                        <BlockStack gap="1">
                                          {productOptionsMap[resource.id]?.loading && (
                                            <Text variant="bodySm" tone="subdued">{t('resources.options.loading')}</Text>
                                          )}
                                          {!productOptionsMap[resource.id]?.loading && (
                                            (productOptionsMap[resource.id]?.options || []).length > 0 ? (
                                              productOptionsMap[resource.id].options.map((opt, i) => (
                                                <Text key={i} variant="bodySm">
                                                  {opt.name}: {Array.isArray(opt.values) ? opt.values.slice(0, 5).join(', ') : ''}
                                                  {Array.isArray(opt.values) && opt.values.length > 5 ? ' …' : ''}
                                                </Text>
                                              ))
                                            ) : (
                                              <Text variant="bodySm" tone="subdued">{t('resources.options.empty')}</Text>
                                            )
                                          )}
                                        </BlockStack>
                                      </Box>
                                    )}
                                  </Box>
                                ))}
                              </BlockStack>
                            </Box>
                          </Collapsible>
                        </BlockStack>
                      </Box>
                    );
                  })}
                </BlockStack>
              </Box>
              
                            <Box paddingBlockStart="3">
                <BlockStack gap="2">
                                    <ProgressBar 
                    progress={category.translationProgress / 100}
                    tone={
                      category.translationProgress === 100 ? "success" :
                      category.translationProgress === 0 ? "critical" :
                      "primary"
                    }
                    size="small"
                  />
                  <InlineStack gap="2" align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">
                      {t('resources.overview.selectedProgress', {
                        selected: Object.values(category.subcategories).reduce((acc, sub) =>
                          acc + sub.items.filter(r => selectedResources.includes(r.id)).length, 0
                        ),
                        total: category.totalCount
                      })}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      {t('resources.overview.translatedProgress', {
                        translated: category.translatedCount,
                        total: category.totalCount
                      })}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>
        ))}
      </BlockStack>
    </BlockStack>
  );
}
