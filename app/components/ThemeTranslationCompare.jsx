import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  ProgressBar,
  Badge,
  Select,
  Spinner,
  EmptyState,
  Divider,
  Box
} from '@shopify/polaris';
import { shouldShowField, getFieldDisplayType, getModuleDisplayName } from '../config/theme-field-config.js';

/**
 * Theme翻译对比视图组件
 * 
 * 功能特性：
 * - 双栏对比布局：左侧原文，右侧翻译
 * - 字段级别的对比展示和编辑
 * - 批量操作工具栏
 * - 进度指示器
 * - 语言切换支持
 * - 响应式设计
 */
export default function ThemeTranslationCompare({
  originalData = {},
  translatedData = {},
  targetLanguage = 'zh-CN',
  onSave,
  onTranslate,
  onBulkAction,
  onLanguageChange,
  availableLanguages = [],
  loading = false,
  translationProgress = 0
}) {
  // 状态管理
  const [currentLanguage, setCurrentLanguage] = useState(targetLanguage);
  const [editedTranslations, setEditedTranslations] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (targetLanguage && targetLanguage !== currentLanguage) {
      setCurrentLanguage(targetLanguage);
      setEditedTranslations({});
    }
  }, [targetLanguage, currentLanguage]);

  // 扁平化JSON数据为字段路径 - 增强版支持数组
  const flattenObject = useCallback((obj, prefix = '') => {
    const flattened = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const path = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (Array.isArray(value)) {
          // 处理数组：为每个元素生成路径
          if (value.length === 0) {
            flattened[path] = '[]'; // 空数组
          } else {
            value.forEach((item, index) => {
              if (typeof item === 'object' && item !== null) {
                Object.assign(flattened, flattenObject(item, `${path}[${index}]`));
              } else {
                flattened[`${path}[${index}]`] = item;
              }
            });
          }
        } else if (typeof value === 'object' && value !== null) {
          // 处理对象：递归展开
          const nested = flattenObject(value, path);
          if (Object.keys(nested).length === 0) {
            flattened[path] = '{}'; // 空对象
          } else {
            Object.assign(flattened, nested);
          }
        } else {
          // 处理基本类型
          flattened[path] = value === null ? 'null' :
                           value === undefined ? 'undefined' :
                           String(value);
        }
      }
    }

    return flattened;
  }, []);

  // 确保translatedData是对象，兜底为空对象
  const safeTranslatedData = useMemo(() => {
    return translatedData && typeof translatedData === 'object' ? translatedData : {};
  }, [translatedData]);

  // 简化的字段数据处理 - 按原始顺序展示所有字段
  const processedFields = useMemo(() => {
    if (!originalData || typeof originalData !== 'object') {
      return [];
    }

    const originalFlat = flattenObject(originalData);
    const translatedFlat = flattenObject(safeTranslatedData);
    const editedFlat = flattenObject(editedTranslations);

    const fields = [];

    // 按原始JSON的键顺序展示所有字段
    Object.keys(originalFlat).forEach(path => {
      const originalValue = originalFlat[path] || '';
      const translatedValue = editedFlat[path] || translatedFlat[path] || '';

      // 智能字段过滤：跳过技术字段和无关内容
      if (!shouldShowField(path, originalValue)) {
        return;
      }

      const hasTranslation = Boolean(translatedValue && translatedValue.trim());
      const isEdited = Boolean(editedFlat[path]);
      const isChanged = hasTranslation &&
        originalValue.trim() !== translatedValue.trim();

      // 搜索过滤
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        if (!path.toLowerCase().includes(searchLower) &&
            !String(originalValue).toLowerCase().includes(searchLower) &&
            !String(translatedValue).toLowerCase().includes(searchLower)) {
          return;
        }
      }

      fields.push({
        path,
        originalValue,
        translatedValue,
        hasTranslation,
        isEdited,
        isChanged,
        displayType: getFieldDisplayType(originalValue)
      });
    });

    return fields;
  }, [originalData, safeTranslatedData, editedTranslations, searchTerm, flattenObject]);

  // 整体统计数据
  const globalStats = useMemo(() => {
    const total = processedFields.length;
    const translated = processedFields.filter(f => f.hasTranslation).length;
    const changed = processedFields.filter(f => f.isChanged).length;
    const untranslated = total - translated;
    const progress = total > 0 ? Math.round((translated / total) * 100) : 0;

    return {
      total,
      translated,
      changed,
      untranslated,
      progress
    };
  }, [processedFields]);

  // 语言选择选项
  const normalizedLanguages = useMemo(() => {
    const map = new Map();

    (availableLanguages || []).forEach((lang) => {
      if (!lang || !lang.code) return;
      map.set(lang.code, lang.name || lang.code);
    });

    if (targetLanguage && !map.has(targetLanguage)) {
      map.set(targetLanguage, targetLanguage);
    }

    return Array.from(map.entries()).map(([code, name]) => ({
      code,
      name
    }));
  }, [availableLanguages, targetLanguage]);

  const languageOptions = useMemo(() =>
    normalizedLanguages.map(lang => ({
      label: lang.name,
      value: lang.code
    }))
  , [normalizedLanguages]);


  // 事件处理函数

  const handleTranslationEdit = useCallback((path, value) => {
    setEditedTranslations(prev => ({
      ...prev,
      [path]: value
    }));
  }, []);

  const handleLanguageChange = useCallback((value) => {
    setCurrentLanguage(value);
    // 清空已编辑的翻译
    setEditedTranslations({});
    // 通知父组件语言变更
    onLanguageChange?.(value);
  }, [onLanguageChange]);


  const handleSaveChanges = useCallback(() => {
    if (Object.keys(editedTranslations).length === 0) return;
    
    onSave?.({
      language: currentLanguage,
      translations: editedTranslations
    });
    
    // 保存后清空编辑状态
    setEditedTranslations({});
  }, [editedTranslations, currentLanguage, onSave]);


  // 单个字段翻译
  const handleSingleTranslate = useCallback((path, originalValue) => {
    onTranslate?.({
      language: currentLanguage,
      fields: { [path]: originalValue },
      selectedPaths: [path]
    });
  }, [currentLanguage, onTranslate]);

  // 如果没有原始数据，显示空状态
  if (!originalData || Object.keys(originalData).length === 0) {
    // 检查是否有翻译数据但没有原始数据
    const hasTranslatedData = translatedData && Object.keys(translatedData).length > 0;

    return (
      <Card>
        <EmptyState
          heading={hasTranslatedData ? "No source data" : "No theme data"}
          action={{
            content: hasTranslatedData ? 'Rescan' : 'Start translation',
            onAction: () => onBulkAction?.({
              action: hasTranslatedData ? 'scan' : 'translate_all'
            })
          }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <Text variant="bodyMd" tone="subdued">
            {hasTranslatedData
              ? 'Please scan to fetch theme source data first.'
              : `Target language: ${targetLanguage}. Click the button above to start translating.`
            }
          </Text>
        </EmptyState>
      </Card>
    );
  }

  // 仅当原始数据也为空时才显示EmptyState，确保有原文时始终显示双栏框架
  // 即使译文为空，也要显示完整结构让用户看到需要翻译的字段

  return (
    <BlockStack gap="400">
      {/* 工具栏 */}
      <Card>
        <BlockStack gap="300">
          {/* 语言选择和统计信息 */}
          <InlineStack align="space-between">
            <InlineStack gap="300" blockAlign="center">
              <Text variant="headingMd">Theme translation compare</Text>
              <Select
                label="Target language"
                labelHidden
                options={languageOptions}
                value={currentLanguage}
                onChange={handleLanguageChange}
                disabled={loading}
              />
            </InlineStack>

              <InlineStack gap="100" blockAlign="center">
                <Badge tone="success">{globalStats.translated}/{globalStats.total}</Badge>
                <Text variant="bodySm" tone="subdued">
                  Translated
                </Text>
              </InlineStack>
            </InlineStack>

          {/* 进度条 */}
          {(translationProgress > 0 || loading) && (
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text variant="bodySm">Translation progress</Text>
                <Text variant="bodySm">{translationProgress}%</Text>
              </InlineStack>
              <ProgressBar 
                progress={translationProgress} 
                tone={translationProgress === 100 ? "success" : "primary"}
                animated={loading && translationProgress < 100}
              />
            </BlockStack>
          )}

          {/* 简单的搜索框 */}
          <Box minWidth="300px">
            <TextField
              label="Search fields"
              labelHidden
              placeholder="Search field path or content..."
              value={searchTerm}
              onChange={setSearchTerm}
              clearButton
              onClearButtonClick={() => setSearchTerm('')}
            />
          </Box>

          <Divider />

          {/* 保存按钮 */}
          <InlineStack gap="100">
            <Button
              variant="primary"
              size="slim"
              disabled={Object.keys(editedTranslations).length === 0}
              onClick={handleSaveChanges}
            >
              Save changes ({Object.keys(editedTranslations).length})
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* 简化的字段列表 - 按顺序展示 */}
      {loading && processedFields.length === 0 ? (
        <Card>
          <BlockStack gap="200" inlineAlign="center">
            <Spinner size="large" />
            <Text variant="headingSm">Loading...</Text>
          </BlockStack>
        </Card>
      ) : processedFields.length === 0 ? (
        <Card>
          <EmptyState
            heading="No matching fields"
            action={{
              content: 'Clear search',
              onAction: () => setSearchTerm('')
            }}
          >
            <Text variant="bodyMd" tone="subdued">
              Try adjusting the search criteria
            </Text>
          </EmptyState>
        </Card>
      ) : (
        <BlockStack gap="200">
          {processedFields.map((field) => (
            <Card key={field.path}>
              <BlockStack gap="200">
                {/* 字段路径和状态 */}
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <InlineStack gap="100" blockAlign="center">
                      <Text variant="bodySm" fontWeight="semibold">
                        {field.path.length > 80
                          ? `...${field.path.slice(-77)}`
                          : field.path
                        }
                      </Text>
                      <Badge tone="subdued" size="small">
                        {field.displayType?.label || 'Text'}
                      </Badge>
                    </InlineStack>
                    <InlineStack gap="100">
                      {field.hasTranslation ? (
                        <Badge tone="success">Translated</Badge>
                      ) : (
                        <Badge tone="warning">Untranslated</Badge>
                      )}
                      {field.isEdited && (
                        <Badge tone="attention">Edited</Badge>
                      )}
                      {field.isChanged && (
                        <Badge tone="info">Changed</Badge>
                      )}
                    </InlineStack>
                  </BlockStack>

                  <Button
                    variant="tertiary"
                    size="slim"
                    onClick={() => handleSingleTranslate(field.path, field.originalValue)}
                    disabled={loading}
                  >
                    AI translate
                  </Button>
                </InlineStack>

                {/* 双栏对比内容 - 简洁的左右布局 */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  alignItems: 'start'
                }}>
                  {/* 原文栏 */}
                  <div style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    width: '100%'
                  }}>
                    <BlockStack gap="100" style={{ width: '100%' }}>
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                        Reference
                      </Text>
                      <div className="theme-translation-field html-content" style={{ width: '100%' }}>
                      <TextField
                          label="Source content"
                          labelHidden
                          value={String(field.originalValue || '')}
                          multiline={String(field.originalValue || '').length > 50}
                          readOnly
                          autoComplete="off"
                        />
                      </div>
                    </BlockStack>
                  </div>

                  {/* 翻译栏 */}
                  <div style={{
                    minWidth: 0,
                    overflow: 'hidden',
                    width: '100%'
                  }}>
                    <BlockStack gap="100" style={{ width: '100%' }}>
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                          {currentLanguage}
                        </Text>
                        {field.isEdited && (
                          <Text variant="bodySm" tone="attention">
                            Unsaved
                          </Text>
                        )}
                      </InlineStack>
                      <div className="theme-translation-field html-content" style={{ width: '100%' }}>
                        <TextField
                          label="Translated content"
                          labelHidden
                          value={String(
                            editedTranslations[field.path] !== undefined
                              ? editedTranslations[field.path]
                              : field.translatedValue || ''
                          )}
                          onChange={(value) => handleTranslationEdit(field.path, value)}
                          multiline={String(field.originalValue || '').length > 50}
                          placeholder="Enter translated content..."
                          autoComplete="off"
                        />
                      </div>
                    </BlockStack>
                  </div>
                </div>
              </BlockStack>
            </Card>
          ))}
        </BlockStack>
      )}

      {/* 底部状态栏 */}
      {processedFields.length > 0 && (
        <Card>
          <InlineStack align="space-between">
            <Text variant="bodySm" tone="subdued">
              Total {globalStats.total} fields
            </Text>
            <InlineStack gap="200">
              <Text variant="bodySm" tone="subdued">
                Translation completion: {globalStats.progress}%
              </Text>
              <Text variant="bodySm" tone="subdued">
                Untranslated: {globalStats.untranslated}
              </Text>
              <Text variant="bodySm" tone="subdued">
                Changed: {globalStats.changed}
              </Text>
            </InlineStack>
          </InlineStack>
        </Card>
      )}
    </BlockStack>
  );
}
