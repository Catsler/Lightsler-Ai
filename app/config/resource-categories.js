/**
 * 资源分类配置（对齐 Shopify Translate & Adapt）
 * 仅列出可翻译资源；带感叹号提示的官方非翻译项不纳入此表
 */

export const RESOURCE_CATEGORIES = {
  // Products
  PRODUCTS: {
    name: 'Products',
    icon: '📦',
    subcategories: {
      COLLECTIONS: { name: 'Collections', resources: ['COLLECTION'] },
      PRODUCTS: { name: 'Products', resources: ['PRODUCT'] },
      // 可选扩展：产品扩展（不直接作为翻译主类目）
      PRODUCT_EXT: { name: 'Product extensions', resources: ['PRODUCT_OPTION', 'PRODUCT_OPTION_VALUE', 'PRODUCT_METAFIELD', 'SELLING_PLAN', 'SELLING_PLAN_GROUP'] }
    }
  },

  // Online Store
  ONLINE_STORE: {
    name: 'Online Store',
    icon: '🛍️',
    subcategories: {
      BLOG_POSTS: { name: 'Blog posts', resources: ['ARTICLE'] },
      BLOG_TITLES: { name: 'Blog titles', resources: ['BLOG'] },
      FILTERS: { name: 'Filters', resources: ['FILTER'] },
      PAGES: { name: 'Pages', resources: ['PAGE'] },
      POLICIES: { name: 'Policies', resources: ['SHOP_POLICY'] },
      STORE_METADATA: { name: 'Store metadata', resources: ['SHOP'] }
      // Cookie banner（非翻译项）不纳入
      // Metaobjects（按要求先隐藏）不纳入
    }
  },

  // Content
  CONTENT: {
    name: 'Content',
    icon: '📝',
    subcategories: {
      MENU: { name: 'Menu', resources: ['MENU'] },
      LINKS: { name: 'Links', resources: ['LINK'] }
      // Links 已加入，支持导航链接翻译
    }
  },

  // Theme
  THEME: {
    name: 'Theme',
    icon: '🎨',
    subcategories: {
      APP_EMBEDS: { name: 'App embeds', resources: ['ONLINE_STORE_THEME_APP_EMBED'] },
      SECTION_GROUPS: { name: 'Section groups', resources: ['ONLINE_STORE_THEME_SECTION_GROUP'] },
      STATIC_SECTIONS: { name: 'Static sections', resources: ['ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS'] },
      TEMPLATES: { name: 'Templates', resources: ['ONLINE_STORE_THEME_JSON_TEMPLATE'] },
      THEME_SETTINGS: { name: 'Theme settings', resources: ['ONLINE_STORE_THEME_SETTINGS_CATEGORY'] },
      LOCALE_CONTENT: { name: 'Locale content', resources: ['ONLINE_STORE_THEME_LOCALE_CONTENT'] }
      // Default theme content（非翻译项）不纳入
    }
  }
  // Settings（Notifications/Shipping 非翻译项）不纳入
};

/**
 * 获取资源所属的分类信息
 * @param {string} resourceType 资源类型
 * @returns {object|null} 返回 {category, subcategory} 或 null
 */
export function getResourceCategory(resourceType) {
  // 标准化资源类型为大写，支持大小写兼容
  const normalizedType = resourceType ? resourceType.toUpperCase() : '';
  
  for (const [categoryKey, category] of Object.entries(RESOURCE_CATEGORIES)) {
    for (const [subcategoryKey, subcategory] of Object.entries(category.subcategories)) {
      if (subcategory.resources.includes(normalizedType)) {
        return {
          categoryKey,
          categoryName: category.name,
          categoryIcon: category.icon,
          subcategoryKey,
          subcategoryName: subcategory.name
        };
      }
    }
  }
  
  // 调试日志：输出未匹配的资源类型
  console.warn(`[getResourceCategory] 未找到匹配的分类 - resourceType: "${resourceType}", normalized: "${normalizedType}"`);
  return null;
}

/**
 * 将资源数组按分类组织
 * @param {Array} resources 资源数组
 * @returns {object} 按分类组织的资源对象
 */
export function organizeResourcesByCategory(resources) {
  const organized = {};
  const uncategorized = []; // 收集未分类的资源
  
  // 调试日志：显示资源总数和类型分布
  console.log(`[organizeResourcesByCategory] 开始组织 ${resources.length} 个资源`);
  const typeDistribution = {};
  resources.forEach(r => {
    typeDistribution[r.resourceType] = (typeDistribution[r.resourceType] || 0) + 1;
  });
  console.log('[organizeResourcesByCategory] 资源类型分布:', typeDistribution);
  
  // 初始化分类结构
  for (const [categoryKey, category] of Object.entries(RESOURCE_CATEGORIES)) {
    organized[categoryKey] = {
      ...category,
      subcategories: {},
      totalCount: 0,
      translatedCount: 0,
      translationProgress: 0
    };
    
    for (const [subcategoryKey, subcategory] of Object.entries(category.subcategories)) {
      organized[categoryKey].subcategories[subcategoryKey] = {
        ...subcategory,
        items: [],
        count: 0,
        translatedCount: 0,
        translationProgress: 0
      };
    }
  }
  
  // 将资源分配到对应分类
  resources.forEach(resource => {
    const categoryInfo = getResourceCategory(resource.resourceType);
    const isTranslated = resource.translationCount > 0;
    
    if (categoryInfo) {
      const { categoryKey, subcategoryKey } = categoryInfo;
      organized[categoryKey].subcategories[subcategoryKey].items.push(resource);
      organized[categoryKey].subcategories[subcategoryKey].count++;
      organized[categoryKey].totalCount++;
      
      // 更新翻译统计
      if (isTranslated) {
        organized[categoryKey].subcategories[subcategoryKey].translatedCount++;
        organized[categoryKey].translatedCount++;
      }
    } else {
      // 收集未分类的资源
      uncategorized.push(resource);
    }
  });
  
  // 计算翻译进度百分比
  for (const categoryKey of Object.keys(organized)) {
    const category = organized[categoryKey];
    
    // 计算分类的翻译进度
    if (category.totalCount > 0) {
      category.translationProgress = Math.round((category.translatedCount / category.totalCount) * 100);
    }
    
    // 计算子分类的翻译进度
    for (const subcategoryKey of Object.keys(category.subcategories)) {
      const subcategory = category.subcategories[subcategoryKey];
      if (subcategory.count > 0) {
        subcategory.translationProgress = Math.round((subcategory.translatedCount / subcategory.count) * 100);
      }
    }
  }
  
  // 如果有未分类的资源，创建一个"未分类"类别
  if (uncategorized.length > 0) {
    console.warn(`[organizeResourcesByCategory] 发现 ${uncategorized.length} 个未分类资源:`, 
      uncategorized.map(r => ({ type: r.resourceType, title: r.title || r.handle || r.name })));
    
    const translatedUncategorized = uncategorized.filter(r => r.translationCount > 0).length;
    
    organized.UNCATEGORIZED = {
      name: '未分类',
      icon: '❓',
      subcategories: {
        UNKNOWN: {
          name: '未知类型',
          items: uncategorized,
          count: uncategorized.length,
          translatedCount: translatedUncategorized,
          translationProgress: uncategorized.length > 0 ? 
            Math.round((translatedUncategorized / uncategorized.length) * 100) : 0,
          resources: []
        }
      },
      totalCount: uncategorized.length,
      translatedCount: translatedUncategorized,
      translationProgress: uncategorized.length > 0 ? 
        Math.round((translatedUncategorized / uncategorized.length) * 100) : 0
    };
  }
  
  // 移除空分类
  for (const categoryKey of Object.keys(organized)) {
    if (organized[categoryKey].totalCount === 0) {
      delete organized[categoryKey];
    } else {
      // 移除空子分类
      for (const subcategoryKey of Object.keys(organized[categoryKey].subcategories)) {
        if (organized[categoryKey].subcategories[subcategoryKey].count === 0) {
          delete organized[categoryKey].subcategories[subcategoryKey];
        }
      }
    }
  }
  
  // 调试日志：显示分类结果
  console.log('[organizeResourcesByCategory] 分类完成:', 
    Object.entries(organized).map(([key, cat]) => ({
      category: cat.name,
      totalCount: cat.totalCount,
      translatedCount: cat.translatedCount,
      progress: cat.translationProgress + '%',
      subcategories: Object.entries(cat.subcategories).map(([subKey, sub]) => ({
        name: sub.name,
        count: sub.count,
        translatedCount: sub.translatedCount,
        progress: sub.translationProgress + '%'
      }))
    }))
  );
  
  return organized;
}

/**
 * 获取分类统计信息
 * @param {Array} resources 资源数组
 * @returns {object} 统计信息
 */
export function getCategoryStatistics(resources) {
  const stats = {
    total: resources.length,
    byCategory: {},
    byResourceType: {}
  };
  
  // 按资源类型统计
  resources.forEach(resource => {
    if (!stats.byResourceType[resource.resourceType]) {
      stats.byResourceType[resource.resourceType] = 0;
    }
    stats.byResourceType[resource.resourceType]++;
    
    // 按分类统计
    const categoryInfo = getResourceCategory(resource.resourceType);
    if (categoryInfo) {
      const { categoryKey, subcategoryKey } = categoryInfo;
      
      if (!stats.byCategory[categoryKey]) {
        stats.byCategory[categoryKey] = {
          total: 0,
          subcategories: {}
        };
      }
      
      if (!stats.byCategory[categoryKey].subcategories[subcategoryKey]) {
        stats.byCategory[categoryKey].subcategories[subcategoryKey] = 0;
      }
      
      stats.byCategory[categoryKey].total++;
      stats.byCategory[categoryKey].subcategories[subcategoryKey]++;
    }
  });
  
  return stats;
}
