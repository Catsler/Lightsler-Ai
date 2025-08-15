import { useState } from 'react';
import {
  Badge, 
  BlockStack, 
  Box, 
  Button, 
  Card, 
  Checkbox,
  Collapsible,
  Grid,
  InlineStack,
  Text,
  ProgressBar
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronRightIcon } from '@shopify/polaris-icons';
import { RESOURCE_CATEGORIES, organizeResourcesByCategory } from '../config/resource-categories';

/**
 * 资源分类展示组件 - 网格布局版本
 * @param {Array} resources - 资源数组
 * @param {Function} onResourceClick - 资源点击回调
 * @param {Array} selectedResources - 已选中的资源ID数组
 * @param {Function} onSelectionChange - 资源选择改变回调
 * @param {String} currentLanguage - 当前选择的语言
 */
export function ResourceCategoryDisplay({ 
  resources = [], 
  onResourceClick, 
  selectedResources = [],
  onSelectionChange,
  currentLanguage = 'zh-CN',
  onTranslateCategory,
  onSyncCategory,
  translatingCategories = new Set(),
  syncingCategories = new Set(),
  clearCache = false
}) {
  const [expandedSubcategories, setExpandedSubcategories] = useState({});
  
  // 按分类组织资源
  const organizedResources = organizeResourcesByCategory(resources);
  
  // 切换子分类展开状态
  const toggleSubcategory = (categoryKey, subcategoryKey) => {
    const key = `${categoryKey}_${subcategoryKey}`;
    setExpandedSubcategories(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };
  
  // 获取资源显示名称
  const getResourceDisplayName = (resource) => {
    return resource.title || resource.handle || resource.name || resource.gid;
  };
  
  // 获取资源状态标签
  const getResourceStatusBadge = (resource) => {
    if (resource.translationCount > 0) {
      return <Badge tone="success">已翻译</Badge>;
    }
    return <Badge tone="attention">待翻译</Badge>;
  };
  
  // 获取语言标签
  const getLanguageBadge = () => {
    const languageMap = {
      'zh-CN': '简体中文',
      'zh-TW': '繁体中文',
      'en': 'English',
      'ja': '日本語',
      'ko': '한국어',
      'fr': 'Français',
      'de': 'Deutsch',
      'es': 'Español'
    };
    return languageMap[currentLanguage] || currentLanguage;
  };
  
  // 选择分类内所有资源
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
  
  // 检查分类是否全选
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
  
  // 翻译整个分类
  const handleTranslateCategory = (categoryKey, category) => {
    if (!onTranslateCategory) return;
    
    // 收集该分类下所有资源的ID
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
  
  // 如果没有资源，显示空状态
  if (resources.length === 0) {
    return (
      <Card>
        <Text as="p" tone="subdued" alignment="center">
          暂无资源数据，请先执行扫描操作
        </Text>
      </Card>
    );
  }
  
  return (
    <BlockStack gap="4">
      {/* 总体统计卡片 */}
      <Card>
        <InlineStack align="space-between">
          <BlockStack gap="2">
            <Text as="h2" variant="headingMd">
              资源分类总览
            </Text>
            <InlineStack gap="3">
              <Badge tone="info">
                总计: {resources.length} 个资源
              </Badge>
              <Badge tone="success">
                {Object.keys(organizedResources).length} 个分类
              </Badge>
              {selectedResources.length > 0 && (
                <Badge tone="attention">
                  已选择: {selectedResources.length} 个
                </Badge>
              )}
              <Badge>
                目标语言: {getLanguageBadge()}
              </Badge>
            </InlineStack>
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
              {selectedResources.length === resources.length ? '取消全选' : '全选所有'}
            </Button>
          )}
        </InlineStack>
      </Card>
      
      {/* 分类单列展示 */}
      <BlockStack gap="400">
        {Object.entries(organizedResources).map(([categoryKey, category]) => (
          <Card key={categoryKey}>
              {/* 分类标题栏 */}
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
                        {translatingCategories.has(categoryKey) ? '翻译中...' : '翻译'}
                      </Button>
                    )}
                    {onSyncCategory && (
                      <Button
                        size="slim"
                        variant="primary"
                        tone="success"
                        onClick={() => onSyncCategory(categoryKey, category)}
                        loading={syncingCategories.has(categoryKey)}
                        disabled={syncingCategories.has(categoryKey) || category.translatedCount === 0}
                      >
                        {syncingCategories.has(categoryKey) ? '发布中...' : '发布'}
                      </Button>
                    )}
                    {onSelectionChange && (
                      <Button
                        size="slim"
                        variant="plain"
                        onClick={() => selectCategoryResources(category, !isCategoryAllSelected(category))}
                      >
                        {isCategoryAllSelected(category) ? '取消' : '全选'}
                      </Button>
                    )}
                  </InlineStack>
                </InlineStack>
              </Box>
              
              {/* 固定高度的内容区域 */}
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
                    const isExpanded = expandedSubcategories[subKey] !== false; // 默认展开
                    
                    return (
                      <Box key={subcategoryKey}>
                        <BlockStack gap="2">
                          {/* 子分类标题 */}
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
                          
                          {/* 资源列表 */}
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
                                        {onResourceClick && (
                                          <Button
                                            size="micro"
                                            variant="plain"
                                            onClick={() => onResourceClick(resource)}
                                          >
                                            详情
                                          </Button>
                                        )}
                                      </InlineStack>
                                    </InlineStack>
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
              
              {/* 分类统计信息 */}
              <Box paddingBlockStart="3">
                <BlockStack gap="2">
                  {/* 进度条 */}
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
                      已选: {Object.values(category.subcategories).reduce((acc, sub) => 
                        acc + sub.items.filter(r => selectedResources.includes(r.id)).length, 0
                      )} / {category.totalCount}
                    </Text>
                    <Text as="span" variant="bodySm" tone="subdued">
                      已翻译: {category.translatedCount} / {category.totalCount}
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