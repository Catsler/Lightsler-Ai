import {
  Card,
  BlockStack,
  InlineGrid,
  Text,
  Badge,
  Button,
  Divider,
  Box,
  Collapsible,
  Link,
  Spinner,
  TextField,
  InlineStack
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";

// 专门处理 Theme 资源的渲染函数
function renderThemeResource(resource, renderFieldComparison) {
  // 检查是否有动态字段
  const hasDynamicFields = resource.contentFields?.dynamicFields;
  const hasTranslatableFields = resource.contentFields?.translatableFields;
  
  if (!hasDynamicFields && !hasTranslatableFields) {
    return (
      <Card>
        <BlockStack gap="400">
          <Text variant="headingLg" as="h3">Theme 资源</Text>
          <Text tone="subdued">暂无可翻译字段</Text>
        </BlockStack>
      </Card>
    );
  }
  
  const fieldsToRender = [];
  
  // 处理动态字段
  if (hasDynamicFields) {
    for (const [key, fieldData] of Object.entries(resource.contentFields.dynamicFields)) {
      const value = fieldData?.value || fieldData;
      if (value && typeof value === 'string' && value.trim()) {
        // 生成友好的标签名
        const label = key
          .split('.')
          .map(part => part.replace(/_/g, ' '))
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' - ');
        
        fieldsToRender.push({
          key,
          label,
          value,
          isHtml: value.includes('<') && value.includes('>')
        });
      }
    }
  }
  
  // 处理可翻译字段数组
  if (hasTranslatableFields && Array.isArray(resource.contentFields.translatableFields)) {
    for (const field of resource.contentFields.translatableFields) {
      if (field.value && typeof field.value === 'string' && field.value.trim()) {
        // 避免重复
        if (!fieldsToRender.find(f => f.key === field.key)) {
          const label = field.label || field.key
            .split('.')
            .map(part => part.replace(/_/g, ' '))
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' - ');
          
          fieldsToRender.push({
            key: field.key,
            label,
            value: field.value,
            isHtml: field.value.includes('<') && field.value.includes('>')
          });
        }
      }
    }
  }
  
  // 按 key 排序，将 global 开头的字段放在前面
  fieldsToRender.sort((a, b) => {
    if (a.key.startsWith('global') && !b.key.startsWith('global')) return -1;
    if (!a.key.startsWith('global') && b.key.startsWith('global')) return 1;
    return a.key.localeCompare(b.key);
  });
  
  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingLg" as="h3">
          Theme 资源字段 ({fieldsToRender.length} 个可翻译字段)
        </Text>
        
        {fieldsToRender.map(field => (
          renderFieldComparison(field.label, field.key, field.value, { isHtml: field.isHtml })
        ))}
        
        {fieldsToRender.length === 0 && (
          <Text tone="subdued">暂无可翻译的字段内容</Text>
        )}
      </BlockStack>
    </Card>
  );
}

export default function ResourceDetail({
  resource,
  translations,
  targetLanguage,
  onTranslateField,
  isTranslating,
  resourceType
}) {
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    vendor: true,
    variants: false,
    seo: false,
    metafields: false
  });

  const toggleSection = useCallback((section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  }, []);

  // 获取字段的翻译值
  const getTranslation = useCallback((fieldKey) => {
    return translations?.[targetLanguage]?.[fieldKey] || '';
  }, [translations, targetLanguage]);

  // 渲染字段对比视图
  const renderFieldComparison = useCallback((label, fieldKey, originalValue, options = {}) => {
    const translatedValue = getTranslation(fieldKey);
    const isHtml = options.isHtml || false;
    const isLoading = isTranslating[fieldKey];
    
    if (!originalValue && !translatedValue) return null;

    return (
      <Box paddingBlockEnd="400" key={fieldKey}>
        <BlockStack gap="200">
          <Text variant="headingMd" as="h4">{label}</Text>
          <InlineGrid columns={2} gap="400">
            {/* 原始内容 */}
            <Card>
              <BlockStack gap="200">
                <Badge status="info">原始内容</Badge>
                {isHtml ? (
                  <div 
                    dangerouslySetInnerHTML={{ __html: originalValue }} 
                    style={{ maxHeight: '200px', overflow: 'auto' }}
                  />
                ) : (
                  <Text as="p">{originalValue || '（空）'}</Text>
                )}
              </BlockStack>
            </Card>
            
            {/* 翻译内容 */}
            <Card>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Badge status={translatedValue ? "success" : "attention"}>
                    {targetLanguage} 翻译
                  </Badge>
                  {!translatedValue && !isLoading && (
                    <Button
                      size="slim"
                      onClick={() => onTranslateField(fieldKey, originalValue)}
                      disabled={!originalValue}
                    >
                      翻译
                    </Button>
                  )}
                  {isLoading && <Spinner size="small" />}
                </InlineStack>
                {isHtml ? (
                  <div 
                    dangerouslySetInnerHTML={{ __html: translatedValue || '（未翻译）' }} 
                    style={{ maxHeight: '200px', overflow: 'auto' }}
                  />
                ) : (
                  <Text as="p" tone={translatedValue ? undefined : "subdued"}>
                    {translatedValue || '（未翻译）'}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </InlineGrid>
        </BlockStack>
      </Box>
    );
  }, [getTranslation, isTranslating, onTranslateField, targetLanguage]);

  // Theme 资源的特殊处理
  if (resourceType && resourceType.toLowerCase().includes('theme')) {
    return renderThemeResource(resource, renderFieldComparison);
  }

  // 产品类型的特殊处理
  if (resourceType === 'product') {
    return (
      <BlockStack gap="600">
        {/* 基础信息 */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="400" blockAlign="center">
              <Text variant="headingLg" as="h3">基础信息</Text>
              <Button
                icon={expandedSections.basic ? ChevronUpIcon : ChevronDownIcon}
                variant="plain"
                onClick={() => toggleSection('basic')}
              />
            </InlineStack>
            
            <Collapsible open={expandedSections.basic}>
              <BlockStack gap="400">
                {renderFieldComparison('产品标题', 'title', resource.title)}
                {renderFieldComparison('产品描述', 'body_html', resource.description, { isHtml: true })}
                {renderFieldComparison('产品类型', 'product_type', resource.productType)}
                {renderFieldComparison('URL Handle', 'handle', resource.handle)}
              </BlockStack>
            </Collapsible>
          </BlockStack>
        </Card>

        {/* 供应商信息（重点） */}
        {resource.vendor && (
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" blockAlign="center">
                <Text variant="headingLg" as="h3">
                  <Badge status="warning">重要</Badge> 供应商信息
                </Text>
                <Button
                  icon={expandedSections.vendor ? ChevronUpIcon : ChevronDownIcon}
                  variant="plain"
                  onClick={() => toggleSection('vendor')}
                />
              </InlineStack>
              
              <Collapsible open={expandedSections.vendor}>
                {renderFieldComparison('供应商', 'vendor', resource.vendor)}
              </Collapsible>
            </BlockStack>
          </Card>
        )}

        {/* 产品变体（重点） */}
        {resource.variants && resource.variants.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" blockAlign="center">
                <Text variant="headingLg" as="h3">
                  <Badge status="warning">重要</Badge> 产品变体 ({resource.variants.length})
                </Text>
                <Button
                  icon={expandedSections.variants ? ChevronUpIcon : ChevronDownIcon}
                  variant="plain"
                  onClick={() => toggleSection('variants')}
                />
              </InlineStack>
              
              <Collapsible open={expandedSections.variants}>
                <BlockStack gap="400">
                  {resource.variants.map((variant, index) => (
                    <Box key={variant.id} padding="400" background="bg-surface-secondary">
                      <BlockStack gap="300">
                        <InlineStack gap="200" wrap={false}>
                          <Badge>变体 {index + 1}</Badge>
                          <Text variant="headingSm">{variant.title}</Text>
                          <Badge status="info">SKU: {variant.sku || 'N/A'}</Badge>
                          <Badge status="success">{variant.price}</Badge>
                        </InlineStack>
                        
                        {variant.options && variant.options.length > 0 && (
                          <Box paddingInlineStart="400">
                            <InlineStack gap="300">
                              {variant.options.map(option => (
                                <Badge key={`${option.name}-${option.value}`}>
                                  {option.name}: {option.value}
                                </Badge>
                              ))}
                            </InlineStack>
                          </Box>
                        )}
                        
                        {renderFieldComparison(
                          `变体标题`, 
                          `variant_${variant.id}_title`, 
                          variant.title
                        )}
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Card>
        )}

        {/* SEO信息 */}
        {(resource.seo?.title || resource.seo?.description) && (
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" blockAlign="center">
                <Text variant="headingLg" as="h3">SEO信息</Text>
                <Button
                  icon={expandedSections.seo ? ChevronUpIcon : ChevronDownIcon}
                  variant="plain"
                  onClick={() => toggleSection('seo')}
                />
              </InlineStack>
              
              <Collapsible open={expandedSections.seo}>
                <BlockStack gap="400">
                  {renderFieldComparison('SEO标题', 'meta_title', resource.seo.title)}
                  {renderFieldComparison('SEO描述', 'meta_description', resource.seo.description)}
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Card>
        )}

        {/* 自定义Metafields */}
        {resource.metafields && Object.keys(resource.metafields).length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" blockAlign="center">
                <Text variant="headingLg" as="h3">自定义字段</Text>
                <Button
                  icon={expandedSections.metafields ? ChevronUpIcon : ChevronDownIcon}
                  variant="plain"
                  onClick={() => toggleSection('metafields')}
                />
              </InlineStack>
              
              <Collapsible open={expandedSections.metafields}>
                <BlockStack gap="400">
                  {Object.entries(resource.metafields).map(([namespace, fields]) => (
                    <Box key={namespace} padding="400" background="bg-surface-secondary">
                      <BlockStack gap="300">
                        <Badge status="info">Namespace: {namespace}</Badge>
                        {Object.entries(fields).map(([key, field]) => (
                          renderFieldComparison(
                            `${namespace}.${key}`,
                            `metafield_${namespace}_${key}`,
                            field.value
                          )
                        ))}
                      </BlockStack>
                    </Box>
                  ))}
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    );
  }

  // 其他资源类型的通用处理
  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingLg" as="h3">资源详情</Text>
        {resource.title && renderFieldComparison('标题', 'title', resource.title)}
        {resource.description && renderFieldComparison('描述', 'body_html', resource.description)}
        {resource.handle && renderFieldComparison('Handle', 'handle', resource.handle)}
        {resource.seoTitle && renderFieldComparison('SEO标题', 'meta_title', resource.seoTitle)}
        {resource.seoDescription && renderFieldComparison('SEO描述', 'meta_description', resource.seoDescription)}
      </BlockStack>
    </Card>
  );
}