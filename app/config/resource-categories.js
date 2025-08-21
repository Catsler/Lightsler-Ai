/**
 * 资源分类配置
 * 定义资源的分类层级和归属关系
 */

export const RESOURCE_CATEGORIES = {
  // 产品和集合
  PRODUCTS_COLLECTIONS: {
    name: '产品与集合',
    icon: '📦',
    subcategories: {
      PRODUCTS: {
        name: '产品',
        resources: ['PRODUCT', 'PRODUCT_OPTION', 'PRODUCT_OPTION_VALUE']
      },
      COLLECTIONS: {
        name: '集合',
        resources: ['COLLECTION']
      },
      SELLING_PLANS: {
        name: '销售计划',
        resources: ['SELLING_PLAN', 'SELLING_PLAN_GROUP']
      }
    }
  },
  
  // 筛选器（独立分类）
  FILTERS: {
    name: '筛选器',
    icon: '🔍',
    subcategories: {
      PRODUCT_FILTERS: {
        name: '产品筛选器',
        resources: ['FILTER']
      }
    }
  },
  
  // 内容管理
  CONTENT: {
    name: '内容管理',
    icon: '📝',
    subcategories: {
      ARTICLES_BLOGS: {
        name: '文章与博客',
        resources: ['ARTICLE', 'BLOG']
      },
      PAGES: {
        name: '页面',
        resources: ['PAGE']
      }
    }
  },
  
  // 导航
  NAVIGATION: {
    name: '导航',
    icon: '🧭',
    subcategories: {
      MENUS: {
        name: '菜单',
        resources: ['MENU', 'LINK']
      }
    }
  },
  
  // 主题
  THEME: {
    name: '主题',
    icon: '🎨',
    subcategories: {
      THEME_CORE: {
        name: '主题核心',
        resources: ['ONLINE_STORE_THEME']
      },
      THEME_COMPONENTS: {
        name: '主题组件',
        resources: [
          'ONLINE_STORE_THEME_APP_EMBED',
          'ONLINE_STORE_THEME_JSON_TEMPLATE',
          'ONLINE_STORE_THEME_SECTION_GROUP'
        ]
      },
      THEME_SETTINGS: {
        name: '主题设置',
        resources: [
          'ONLINE_STORE_THEME_LOCALE_CONTENT',
          'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
          'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS'
        ]
      }
    }
  },
  
  // 店铺设置
  SHOP_SETTINGS: {
    name: '店铺设置',
    icon: '⚙️',
    subcategories: {
      SHOP_INFO: {
        name: '店铺信息',
        resources: ['SHOP', 'SHOP_POLICY']
      }
    }
  }
};;

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