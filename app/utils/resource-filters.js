/**
 * 资源过滤配置 - 统一管理主列表显示逻辑
 *
 * 设计原则：
 * - 将产品关联资源（Options、Metafields）从主列表隐藏
 * - 通过产品详情页统一管理，保持一致的用户体验
 * - 批量翻译产品时自动包含这些关联资源
 */

/**
 * 在主列表中隐藏的资源类型
 *
 * 这些资源类型不会在主资源列表中显示，而是通过其父资源进行管理：
 * - PRODUCT_OPTION: 产品选项，在产品详情页的"产品扩展"区域展示
 * - PRODUCT_OPTION_VALUE: 产品选项值，随产品选项一起管理
 * - PRODUCT_METAFIELD: 产品元字段，在产品详情页的"产品扩展"区域展示
 *
 * 注意：如果未来需要在主列表中单独管理这些资源类型，
 * 请从此数组中移除对应类型，或为其提供专门的管理界面
 */
export const HIDDEN_IN_LIST_TYPES = [
  'PRODUCT_OPTION',
  'PRODUCT_OPTION_VALUE',
  'PRODUCT_METAFIELD'
];

/**
 * 判断资源类型是否应该在主列表中隐藏
 *
 * @param {string} resourceType - 资源类型，如 'PRODUCT', 'COLLECTION' 等
 * @returns {boolean} true 表示应该隐藏，false 表示应该显示
 */
export function shouldHideInList(resourceType) {
  const normalizedType = String(resourceType || '').toUpperCase();
  return HIDDEN_IN_LIST_TYPES.includes(normalizedType);
}

/**
 * 过滤资源数组，移除应该在主列表中隐藏的资源
 *
 * @param {Array} resources - 资源数组
 * @returns {Array} 过滤后的资源数组
 */
export function filterResourcesForList(resources) {
  if (!Array.isArray(resources)) {
    return [];
  }

  return resources.filter(resource => {
    const resourceType = resource?.resourceType || resource?.type;
    return !shouldHideInList(resourceType);
  });
}

/**
 * 获取被隐藏的资源统计信息
 *
 * @param {Array} resources - 原始资源数组
 * @returns {Object} 包含隐藏资源的统计信息
 */
export function getHiddenResourcesStats(resources) {
  if (!Array.isArray(resources)) {
    return { total: 0, byType: {} };
  }

  const hiddenResources = resources.filter(resource => {
    const resourceType = resource?.resourceType || resource?.type;
    return shouldHideInList(resourceType);
  });

  const byType = {};
  hiddenResources.forEach(resource => {
    const type = String(resource?.resourceType || resource?.type || 'UNKNOWN').toUpperCase();
    byType[type] = (byType[type] || 0) + 1;
  });

  return {
    total: hiddenResources.length,
    byType
  };
}