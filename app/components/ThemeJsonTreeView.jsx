import { useState, useMemo, useCallback } from 'react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  InlineStack,
  Text,
  TextField
} from '@shopify/polaris';
import { ChevronDownIcon, ChevronRightIcon, SearchIcon } from '@shopify/polaris-icons';

/**
 * JSON tree viewer - pro
 * 用于Theme资源的结构化显示，支持任意层级嵌套和高级功能
 * 
 * @param {Object} data - JSON数据对象
 * @param {string} searchTerm - 搜索关键词
 * @param {boolean} editable - 是否可Edit
 * @param {Function} onEdit - Edit回调函数 (path, oldValue, newValue) => void
 * @param {boolean} highlightTranslatable - 高亮Translatable字段
 * @param {number} maxDepth - 最大显示深度，防止过深嵌套
 * @param {Array<string>} expandedPaths - default expanded paths
 */
export function ThemeJsonTreeView({
  data = {},
  searchTerm = '',
  editable = false,
  onEdit,
  highlightTranslatable = true,
  maxDepth = 10,
  expandedPaths = []
}) {
  const [expandedNodes, setExpandedNodes] = useState(() => {
    // 初始化展开状态
    const initial = {};
    expandedPaths.forEach(path => {
      initial[path] = true;
    });
    return initial;
  });

  const [editingPath, setEditingPath] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  // Translatable字段的模式匹配
  const translatablePatterns = useMemo(() => [
    /^(title|name|label|text|content|description|placeholder|alt)$/i,
    /^(button_text|link_text|heading|subtitle|caption)$/i,
    /^.*_(title|text|label|content|description|placeholder|alt)$/i,
    /^(settings|blocks)\.\w+\.(title|text|label|content|description|placeholder|alt)$/i
  ], []);

  // 判断字段是否Translatable
  const isTranslatableField = useCallback((key, path, value) => {
    // 只有字符串值才Translatable
    if (typeof value !== 'string') return false;
    
    // 排除技术字段
    if (/^(id|handle|type|tag|url|class|style|src|href|data-|aria-)/.test(key)) return false;
    
    // 检查模式匹配
    return translatablePatterns.some(pattern => pattern.test(key) || pattern.test(path));
  }, [translatablePatterns]);

  // 过滤数据基于搜索词
  const filterData = useCallback((obj, path = '', depth = 0) => {
    if (depth > maxDepth) return null;
    
    const filtered = {};
    let hasMatches = false;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const keyMatches = !searchTerm || key.toLowerCase().includes(searchTerm.toLowerCase());
      const valueMatches = !searchTerm || (
        typeof value === 'string' && value.toLowerCase().includes(searchTerm.toLowerCase())
      );

      if (keyMatches || valueMatches) {
        filtered[key] = value;
        hasMatches = true;
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedFiltered = filterData(value, currentPath, depth + 1);
        if (nestedFiltered && Object.keys(nestedFiltered).length > 0) {
          filtered[key] = nestedFiltered;
          hasMatches = true;
        }
      }
    }

    return hasMatches ? filtered : null;
  }, [searchTerm, maxDepth]);

  const filteredData = useMemo(() => {
    return searchTerm ? (filterData(data) || {}) : data;
  }, [data, filterData, searchTerm]);

  // 切换节点展开状态
  const toggleNode = useCallback((path) => {
    setExpandedNodes(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  }, []);

  // 开始Edit
  const startEdit = useCallback((path, value) => {
    if (!editable || !onEdit) return;
    setEditingPath(path);
    setEditingValue(String(value));
  }, [editable, onEdit]);

  // SaveEdit
  const saveEdit = useCallback(() => {
    if (!editingPath || !onEdit) return;
    
    const pathParts = editingPath.split('.');
    const oldValue = pathParts.reduce((obj, key) => obj?.[key], data);
    
    onEdit(editingPath, oldValue, editingValue);
    setEditingPath(null);
    setEditingValue('');
  }, [editingPath, editingValue, onEdit, data]);

  // CancelEdit
  const cancelEdit = useCallback(() => {
    setEditingPath(null);
    setEditingValue('');
  }, []);

  // 获取值类型的显示标记
  const getValueTypeBadge = useCallback((value) => {
    if (value === null) return <Badge tone="subdued">null</Badge>;
    if (value === undefined) return <Badge tone="subdued">undefined</Badge>;
    if (typeof value === 'boolean') return <Badge tone={value ? 'success' : 'critical'}>{String(value)}</Badge>;
    if (typeof value === 'number') return <Badge tone="info">number</Badge>;
    if (typeof value === 'string') return <Badge>string</Badge>;
    if (Array.isArray(value)) return <Badge tone="attention">array[{value.length}]</Badge>;
    if (typeof value === 'object') return <Badge tone="warning">object</Badge>;
    return <Badge tone="subdued">unknown</Badge>;
  }, []);

  // 渲染树节点
  const renderTreeNode = useCallback((obj, path = '', depth = 0) => {
    if (depth > maxDepth) {
      return (
        <Text variant="bodySm" tone="subdued">
          ... (max depth {maxDepth} reached)
        </Text>
      );
    }

    return Object.entries(obj).map(([key, value]) => {
      const currentPath = path ? `${path}.${key}` : key;
      const isExpanded = expandedNodes[currentPath];
      const isObject = value && typeof value === 'object' && !Array.isArray(value);
      const isTranslatable = isTranslatableField(key, currentPath, value);
      const isEditing = editingPath === currentPath;

      return (
        <Box key={currentPath} paddingInlineStart={depth > 0 ? "400" : "0"}>
          <BlockStack gap="200">
            {/* 节点标题行 */}
            <Box
              padding="200"
              background={isTranslatable && highlightTranslatable ? 'bg-surface-success-subdued' : undefined}
              borderRadius="200"
            >
              <InlineStack gap="200" align="space-between" wrap={false}>
                <InlineStack gap="200" blockAlign="center">
                  {isObject && (
                    <Button
                      variant="plain"
                      size="micro"
                      onClick={() => toggleNode(currentPath)}
                      icon={isExpanded ? ChevronDownIcon : ChevronRightIcon}
                    />
                  )}
                  
                  <Text variant="bodySm" fontWeight="semibold">
                    {key}
                  </Text>
                  
                  <Text variant="bodyXs" tone="subdued">
                    {currentPath}
                  </Text>
                  
                  {isTranslatable && highlightTranslatable && (
                    <Badge tone="success" size="small">Translatable</Badge>
                  )}
                </InlineStack>

                <InlineStack gap="100" blockAlign="center">
                  {getValueTypeBadge(value)}
                  
                  {!isObject && (
                    <>
                      {isEditing ? (
                        <InlineStack gap="100">
                          <Button
                            size="micro"
                            variant="primary"
                            onClick={saveEdit}
                          >
                            Save
                          </Button>
                          <Button
                            size="micro"
                            variant="tertiary"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </Button>
                        </InlineStack>
                      ) : (
                        editable && onEdit && (
                          <Button
                            size="micro"
                            variant="plain"
                            onClick={() => startEdit(currentPath, value)}
                          >
                            Edit
                          </Button>
                        )
                      )}
                    </>
                  )}
                </InlineStack>
              </InlineStack>

              {/* 值显示区域 */}
              {!isObject && (
                <Box paddingBlockStart="200">
                  {isEditing ? (
                    <TextField
                      value={editingValue}
                      onChange={setEditingValue}
                      multiline={typeof value === 'string' && value.length > 50}
                      autoComplete="off"
                    />
                  ) : (
                    <Box
                      padding="200"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <Text variant="bodySm" as="pre" style={{ whiteSpace: 'pre-wrap' }}>
                        {typeof value === 'string' 
                          ? value 
                          : JSON.stringify(value, null, 2)
                        }
                      </Text>
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            {/* 嵌套对象展示 */}
            {isObject && (
              <Collapsible
                open={isExpanded}
                id={`tree-node-${currentPath}`}
                transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}
              >
                <Box paddingInlineStart="300">
                  {renderTreeNode(value, currentPath, depth + 1)}
                </Box>
              </Collapsible>
            )}
          </BlockStack>
        </Box>
      );
    });
  }, [
    expandedNodes, 
    toggleNode, 
    maxDepth, 
    isTranslatableField, 
    highlightTranslatable,
    editingPath,
    editingValue,
    startEdit,
    saveEdit,
    cancelEdit,
    editable,
    onEdit,
    getValueTypeBadge
  ]);

  // 统计信息
  const stats = useMemo(() => {
    const calculateStats = (obj, path = '', depth = 0) => {
      let totalNodes = 0;
      let translatableNodes = 0;
      let maxDepthReached = depth;

      for (const [key, value] of Object.entries(obj)) {
        totalNodes++;
        const currentPath = path ? `${path}.${key}` : key;
        
        if (isTranslatableField(key, currentPath, value)) {
          translatableNodes++;
        }

        if (value && typeof value === 'object' && !Array.isArray(value) && depth < maxDepth) {
          const nested = calculateStats(value, currentPath, depth + 1);
          totalNodes += nested.totalNodes;
          translatableNodes += nested.translatableNodes;
          maxDepthReached = Math.max(maxDepthReached, nested.maxDepthReached);
        }
      }

      return { totalNodes, translatableNodes, maxDepthReached };
    };

    return calculateStats(filteredData);
  }, [filteredData, isTranslatableField, maxDepth]);

  // 展开所有节点
  const expandAll = useCallback(() => {
    const collectAllPaths = (obj, path = '', paths = new Set()) => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          paths.add(currentPath);
          collectAllPaths(value, currentPath, paths);
        }
      }
      return paths;
    };

    const allPaths = collectAllPaths(filteredData);
    const newExpanded = {};
    allPaths.forEach(path => {
      newExpanded[path] = true;
    });
    setExpandedNodes(newExpanded);
  }, [filteredData]);

  // 折叠所有节点
  const collapseAll = useCallback(() => {
    setExpandedNodes({});
  }, []);

  return (
    <BlockStack gap="400">
      {/* 控制面板 */}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" wrap={false}>
            <Text variant="headingMd">JSON structure browser</Text>
            <InlineStack gap="200">
              <Button size="slim" variant="tertiary" onClick={expandAll}>
                Expand all
              </Button>
              <Button size="slim" variant="tertiary" onClick={collapseAll}>
                Collapse all
              </Button>
            </InlineStack>
          </InlineStack>

          {/* 统计信息 */}
          <InlineStack gap="200" wrap>
            <Badge tone="info">Total nodes: {stats.totalNodes}</Badge>
            <Badge tone="success">Translatable: {stats.translatableNodes}</Badge>
            <Badge>Max depth: {stats.maxDepthReached}</Badge>
            {searchTerm && (
              <Badge tone="attention">Searching: "{searchTerm}"</Badge>
            )}
          </InlineStack>
        </BlockStack>
      </Card>

      {/* 树形结构展示 */}
      <Card>
        <Box
          padding="400"
          style={{
            maxHeight: '600px',
            overflowY: 'auto',
            border: '1px solid var(--p-color-border-subdued)',
            borderRadius: 'var(--p-border-radius-200)'
          }}
        >
          {Object.keys(filteredData).length === 0 ? (
            <Box padding="400">
              <InlineStack gap="200" align="center">
                <SearchIcon />
                <Text variant="bodyMd" tone="subdued" alignment="center">
                  {searchTerm 
                    ? `No content found containing "${searchTerm}"`
                    : 'No data to display'
                  }
                </Text>
              </InlineStack>
            </Box>
          ) : (
            <BlockStack gap="100">
              {renderTreeNode(filteredData)}
            </BlockStack>
          )}
        </Box>
      </Card>

      {/* Editing guide */}
      {editable && (
        <Card>
          <BlockStack gap="200">
            <Text variant="headingSm">Editing guide</Text>
            <Text variant="bodySm" tone="subdued">
              • Click "Edit" beside non-object fields to change values
            </Text>
            <Text variant="bodySm" tone="subdued">
              • Green background indicates translatable content
            </Text>
            <Text variant="bodySm" tone="subdued">
              • Changes are passed via onEdit(path, oldValue, newValue)
            </Text>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}

export default ThemeJsonTreeView;
