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
          heading={hasTranslatedData ? "暂无原始数据" : "暂无Theme数据"}
          action={{
            content: hasTranslatedData ? '重新扫描' : '开始翻译',
            onAction: () => onBulkAction?.({
              action: hasTranslatedData ? 'scan' : 'translate_all'
            })
          }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <Text variant="bodyMd" tone="subdued">
            {hasTranslatedData
              ? '请先扫描获取Theme资源的原始数据'
              : `当前目标语言：${targetLanguage}，点击上方按钮开始翻译`
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
              <Text variant="headingMd">Theme翻译对比</Text>
              <Select
                label="目标语言"
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
                已翻译
              </Text>
            </InlineStack>
          </InlineStack>

          {/* 进度条 */}
          {(translationProgress > 0 || loading) && (
            <BlockStack gap="100">
              <InlineStack align="space-between">
                <Text variant="bodySm">翻译进度</Text>
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
              label="搜索字段"
              labelHidden
              placeholder="搜索字段路径或内容..."
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
              保存更改 ({Object.keys(editedTranslations).length})
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* 简化的字段列表 - 按顺序展示 */}
      {loading && processedFields.length === 0 ? (
        <Card>
          <BlockStack gap="200" inlineAlign="center">
            <Spinner size="large" />
            <Text variant="headingSm">加载中...</Text>
          </BlockStack>
        </Card>
      ) : processedFields.length === 0 ? (
        <Card>
          <EmptyState
            heading="没有找到匹配的字段"
            action={{
              content: '清除搜索',
              onAction: () => setSearchTerm('')
            }}
          >
            <Text variant="bodyMd" tone="subdued">
              尝试调整搜索条件
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
                        {field.displayType?.label || '文本'}
                      </Badge>
                    </InlineStack>
                    <InlineStack gap="100">
                      {field.hasTranslation ? (
                        <Badge tone="success">已翻译</Badge>
                      ) : (
                        <Badge tone="warning">未翻译</Badge>
                      )}
                      {field.isEdited && (
                        <Badge tone="attention">已编辑</Badge>
                      )}
                      {field.isChanged && (
                        <Badge tone="info">已变更</Badge>
                      )}
                    </InlineStack>
                  </BlockStack>

                  <Button
                    variant="tertiary"
                    size="slim"
                    onClick={() => handleSingleTranslate(field.path, field.originalValue)}
                    disabled={loading}
                  >
                    AI翻译
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
                  <BlockStack gap="100">
                    <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                      Reference
                    </Text>
                    <TextField
                      label="原文内容"
                      labelHidden
                      value={String(field.originalValue || '')}
                      multiline={String(field.originalValue || '').length > 50}
                      readOnly
                      autoComplete="off"
                    />
                  </BlockStack>

                  {/* 翻译栏 */}
                  <BlockStack gap="100">
                    <InlineStack align="space-between">
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                        {currentLanguage}
                      </Text>
                      {field.isEdited && (
                        <Text variant="bodySm" tone="attention">
                          未保存
                        </Text>
                      )}
                    </InlineStack>
                    <TextField
                      label="翻译内容"
                      labelHidden
                      value={String(
                        editedTranslations[field.path] !== undefined
                          ? editedTranslations[field.path]
                          : field.translatedValue || ''
                      )}
                      onChange={(value) => handleTranslationEdit(field.path, value)}
                      multiline={String(field.originalValue || '').length > 50}
                      placeholder="请输入翻译内容..."
                      autoComplete="off"
                    />
                  </BlockStack>
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
              共 {globalStats.total} 个字段
            </Text>
            <InlineStack gap="200">
              <Text variant="bodySm" tone="subdued">
                翻译完成率: {globalStats.progress}%
              </Text>
              <Text variant="bodySm" tone="subdued">
                未翻译: {globalStats.untranslated}
              </Text>
              <Text variant="bodySm" tone="subdued">
                已变更: {globalStats.changed}
              </Text>
            </InlineStack>
          </InlineStack>
        </Card>
      )}
    </BlockStack>
  );
}