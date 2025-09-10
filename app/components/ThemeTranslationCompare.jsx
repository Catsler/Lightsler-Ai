import { useState, useCallback, useMemo } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  ProgressBar,
  Badge,
  Checkbox,
  Select,
  Spinner,
  EmptyState,
  Divider,
  Box
} from '@shopify/polaris';

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
  availableLanguages = [],
  loading = false,
  translationProgress = 0
}) {
  // 状态管理
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [currentLanguage, setCurrentLanguage] = useState(targetLanguage);
  const [editedTranslations, setEditedTranslations] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyUntranslated, setShowOnlyUntranslated] = useState(false);

  // 扁平化JSON数据为字段路径
  const flattenObject = useCallback((obj, prefix = '') => {
    const flattened = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const path = prefix ? `${prefix}.${key}` : key;
        
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(flattened, flattenObject(obj[key], path));
        } else {
          flattened[path] = obj[key];
        }
      }
    }
    
    return flattened;
  }, []);

  // 处理后的字段数据
  const processedFields = useMemo(() => {
    const originalFlat = flattenObject(originalData);
    const translatedFlat = flattenObject(translatedData);
    const editedFlat = flattenObject(editedTranslations);
    
    const fields = [];
    
    Object.keys(originalFlat).forEach(path => {
      const originalValue = originalFlat[path];
      const translatedValue = editedFlat[path] || translatedFlat[path];
      const hasTranslation = Boolean(translatedValue);
      const isEdited = Boolean(editedFlat[path]);
      
      // 搜索过滤
      if (searchTerm && !path.toLowerCase().includes(searchTerm.toLowerCase()) && 
          !String(originalValue).toLowerCase().includes(searchTerm.toLowerCase())) {
        return;
      }
      
      // 只显示未翻译项过滤
      if (showOnlyUntranslated && hasTranslation) {
        return;
      }
      
      fields.push({
        path,
        originalValue,
        translatedValue,
        hasTranslation,
        isEdited,
        isSelected: selectedFields.has(path)
      });
    });
    
    return fields;
  }, [originalData, translatedData, editedTranslations, searchTerm, showOnlyUntranslated, selectedFields, flattenObject]);

  // 统计数据
  const stats = useMemo(() => {
    const total = processedFields.length;
    const translated = processedFields.filter(f => f.hasTranslation).length;
    const edited = processedFields.filter(f => f.isEdited).length;
    const selected = selectedFields.size;
    
    return {
      total,
      translated,
      edited,
      selected,
      progress: total > 0 ? Math.round((translated / total) * 100) : 0
    };
  }, [processedFields, selectedFields]);

  // 语言选择选项
  const languageOptions = useMemo(() => 
    availableLanguages.map(lang => ({
      label: lang.name,
      value: lang.code
    }))
  , [availableLanguages]);

  // 事件处理函数
  const handleSelectAll = useCallback(() => {
    const allPaths = new Set(processedFields.map(f => f.path));
    setSelectedFields(allPaths);
  }, [processedFields]);

  const handleSelectNone = useCallback(() => {
    setSelectedFields(new Set());
  }, []);

  const handleSelectUntranslated = useCallback(() => {
    const untranslatedPaths = new Set(
      processedFields.filter(f => !f.hasTranslation).map(f => f.path)
    );
    setSelectedFields(untranslatedPaths);
  }, [processedFields]);

  const handleFieldSelect = useCallback((path) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedFields(newSelected);
  }, [selectedFields]);

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
    setSelectedFields(new Set());
  }, []);

  const handleBulkTranslate = useCallback(() => {
    if (selectedFields.size === 0) return;
    
    const selectedData = {};
    processedFields.forEach(field => {
      if (selectedFields.has(field.path)) {
        selectedData[field.path] = field.originalValue;
      }
    });
    
    onBulkAction?.({
      action: 'translate',
      language: currentLanguage,
      fields: selectedData,
      selectedPaths: Array.from(selectedFields)
    });
  }, [selectedFields, processedFields, currentLanguage, onBulkAction]);

  const handleSaveChanges = useCallback(() => {
    if (Object.keys(editedTranslations).length === 0) return;
    
    onSave?.({
      language: currentLanguage,
      translations: editedTranslations
    });
    
    // 保存后清空编辑状态
    setEditedTranslations({});
  }, [editedTranslations, currentLanguage, onSave]);

  const handleExportSelected = useCallback(() => {
    const selectedData = {};
    processedFields.forEach(field => {
      if (selectedFields.has(field.path)) {
        selectedData[field.path] = {
          original: field.originalValue,
          translated: field.translatedValue
        };
      }
    });
    
    onBulkAction?.({
      action: 'export',
      language: currentLanguage,
      data: selectedData
    });
  }, [selectedFields, processedFields, currentLanguage, onBulkAction]);

  // 单个字段翻译
  const handleSingleTranslate = useCallback((path, originalValue) => {
    onTranslate?.({
      language: currentLanguage,
      fields: { [path]: originalValue },
      selectedPaths: [path]
    });
  }, [currentLanguage, onTranslate]);

  // 如果没有数据，显示空状态
  if (!originalData || Object.keys(originalData).length === 0) {
    return (
      <Card>
        <EmptyState
          heading="暂无Theme数据"
          action={{
            content: '扫描Theme资源',
            onAction: () => onBulkAction?.({ action: 'scan' })
          }}
          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
        >
          <Text variant="bodyMd" tone="subdued">
            请先扫描获取Theme相关资源数据
          </Text>
        </EmptyState>
      </Card>
    );
  }

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
              <Badge tone="success">{stats.translated}/{stats.total}</Badge>
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

          {/* 搜索和过滤 */}
          <InlineStack gap="200" blockAlign="end">
            <Box minWidth="240px">
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
            
            <Checkbox
              label="只显示未翻译"
              checked={showOnlyUntranslated}
              onChange={setShowOnlyUntranslated}
            />
          </InlineStack>

          <Divider />

          {/* 批量操作按钮 */}
          <InlineStack gap="200" wrap>
            <InlineStack gap="100">
              <Button
                variant="tertiary"
                size="slim"
                onClick={handleSelectAll}
                disabled={loading}
              >
                全选 ({processedFields.length})
              </Button>
              <Button
                variant="tertiary"
                size="slim"
                onClick={handleSelectNone}
                disabled={loading || selectedFields.size === 0}
              >
                清除选择
              </Button>
              <Button
                variant="tertiary"
                size="slim"
                onClick={handleSelectUntranslated}
                disabled={loading}
              >
                选择未翻译 ({processedFields.filter(f => !f.hasTranslation).length})
              </Button>
            </InlineStack>
            
            <InlineStack gap="100">
              <Button
                variant="primary"
                size="slim"
                loading={loading}
                disabled={selectedFields.size === 0}
                onClick={handleBulkTranslate}
              >
                批量翻译 ({stats.selected})
              </Button>
              <Button
                variant="secondary"
                size="slim"
                disabled={Object.keys(editedTranslations).length === 0}
                onClick={handleSaveChanges}
              >
                保存更改 ({stats.edited})
              </Button>
              <Button
                variant="tertiary"
                size="slim"
                disabled={selectedFields.size === 0}
                onClick={handleExportSelected}
              >
                导出选中
              </Button>
            </InlineStack>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* 翻译对比列表 */}
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
              onAction: () => {
                setSearchTerm('');
                setShowOnlyUntranslated(false);
              }
            }}
          >
            <Text variant="bodyMd" tone="subdued">
              尝试调整搜索条件或过滤器
            </Text>
          </EmptyState>
        </Card>
      ) : (
        <BlockStack gap="200">
          {processedFields.map((field) => (
            <Card key={field.path}>
              <BlockStack gap="300">
                {/* 字段标题和状态 */}
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Checkbox
                      checked={field.isSelected}
                      onChange={() => handleFieldSelect(field.path)}
                    />
                    <BlockStack gap="050">
                      <Text variant="bodySm" fontWeight="semibold">
                        {field.path}
                      </Text>
                      <InlineStack gap="100">
                        {field.hasTranslation && (
                          <Badge tone="success">已翻译</Badge>
                        )}
                        {field.isEdited && (
                          <Badge tone="attention">已编辑</Badge>
                        )}
                        {!field.hasTranslation && (
                          <Badge>待翻译</Badge>
                        )}
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>
                  
                  <Button
                    variant="tertiary"
                    size="slim"
                    onClick={() => handleSingleTranslate(field.path, field.originalValue)}
                    disabled={loading}
                  >
                    AI翻译
                  </Button>
                </InlineStack>

                {/* 双栏对比内容 */}
                <InlineStack gap="400" blockAlign="start">
                  {/* 原文栏 */}
                  <Box minWidth="50%">
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                        原文 (源语言)
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
                  </Box>

                  {/* 翻译栏 */}
                  <Box minWidth="50%">
                    <BlockStack gap="100">
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="semibold" tone="subdued">
                          翻译 ({currentLanguage})
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
                  </Box>
                </InlineStack>
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
              显示 {processedFields.length} 个字段，已选择 {stats.selected} 个
            </Text>
            <Text variant="bodySm" tone="subdued">
              翻译完成率: {stats.progress}%
            </Text>
          </InlineStack>
        </Card>
      )}
    </BlockStack>
  );
}