/**
 * 资源类型适配器系统 - Linus哲学实现
 * 原则：数据结构决定一切，消除特殊逻辑
 * 目标：新增资源类型只需添加配置，不改代码
 */

// 资源类型配置 - 纯数据，无逻辑
const RESOURCE_CONFIGS = {
  // 产品类资源
  PRODUCT: {
    icon: '📦',
    category: 'products',
    primaryFields: ['title', 'descriptionHtml', 'handle'],
    translatableFields: ['title', 'description', 'seoTitle', 'seoDescription'],
    requiresRichText: true,
    supportsSEO: true
  },
  
  COLLECTION: {
    icon: '📁',
    category: 'products',
    primaryFields: ['title', 'descriptionHtml', 'handle'],
    translatableFields: ['title', 'description', 'seoTitle', 'seoDescription'],
    requiresRichText: true,
    supportsSEO: true
  },
  
  // 内容类资源
  ARTICLE: {
    icon: '📝',
    category: 'content',
    primaryFields: ['title', 'summary', 'descriptionHtml'],
    translatableFields: ['title', 'summary', 'description', 'seoTitle', 'seoDescription'],
    requiresRichText: true,
    supportsSEO: true
  },
  
  BLOG: {
    icon: '📚',
    category: 'content',
    primaryFields: ['title', 'handle'],
    translatableFields: ['title', 'seoTitle', 'seoDescription'],
    requiresRichText: false,
    supportsSEO: true
  },
  
  PAGE: {
    icon: '📄',
    category: 'content',
    primaryFields: ['title', 'descriptionHtml', 'handle'],
    translatableFields: ['title', 'description', 'seoTitle', 'seoDescription'],
    requiresRichText: true,
    supportsSEO: true
  },
  
  // 导航类资源
  MENU: {
    icon: '🗂️',
    category: 'navigation',
    primaryFields: ['title', 'handle'],
    translatableFields: ['title'],
    requiresRichText: false,
    supportsSEO: false
  },
  
  LINK: {
    icon: '🔗',
    category: 'navigation',
    primaryFields: ['title', 'handle'],
    translatableFields: ['title'],
    requiresRichText: false,
    supportsSEO: false
  },
  
  FILTER: {
    icon: '🔍',
    category: 'navigation',
    primaryFields: ['label'],
    translatableFields: ['label'],
    requiresRichText: false,
    supportsSEO: false
  },
  
  // Theme类资源 - 动态字段
  ONLINE_STORE_THEME: {
    icon: '🎨',
    category: 'theme',
    primaryFields: ['title'],
    translatableFields: [], // 动态确定
    requiresRichText: false,
    supportsSEO: false,
    isDynamic: true
  },
  
  ONLINE_STORE_THEME_JSON_TEMPLATE: {
    icon: '📋',
    category: 'theme',
    primaryFields: ['title'],
    translatableFields: [], // 动态确定
    requiresRichText: false,
    supportsSEO: false,
    isDynamic: true,
    isJSON: true
  },
  
  ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS: {
    icon: '⚙️',
    category: 'theme',
    primaryFields: ['title'],
    translatableFields: [], // 动态确定
    requiresRichText: false,
    supportsSEO: false,
    isDynamic: true
  },
  
  // 产品扩展类
  PRODUCT_OPTION: {
    icon: '🏷️',
    category: 'product_extensions',
    primaryFields: ['name'],
    translatableFields: ['name', 'values'],
    requiresRichText: false,
    supportsSEO: false
  },
  
  SELLING_PLAN: {
    icon: '💳',
    category: 'product_extensions',
    primaryFields: ['name', 'description'],
    translatableFields: ['name', 'description'],
    requiresRichText: false,
    supportsSEO: false
  },
  
  // 店铺设置类
  SHOP: {
    icon: '🏪',
    category: 'shop_settings',
    primaryFields: ['name', 'description'],
    translatableFields: ['name', 'description', 'announcement'],
    requiresRichText: false,
    supportsSEO: false
  },
  
  SHOP_POLICY: {
    icon: '📜',
    category: 'shop_settings',
    primaryFields: ['title', 'body'],
    translatableFields: ['title', 'body'],
    requiresRichText: true,
    supportsSEO: false
  }
};

// 默认配置 - 用于未知资源类型
const DEFAULT_CONFIG = {
  icon: '📄',
  category: 'others',
  primaryFields: ['title', 'description'],
  translatableFields: ['title', 'description'],
  requiresRichText: false,
  supportsSEO: false
};

/**
 * 统一的资源适配器类
 * 核心原则：配置驱动，零条件分支
 */
class UnifiedResourceAdapter {
  constructor(resourceType) {
    // 获取配置，无特殊逻辑
    this.config = RESOURCE_CONFIGS[resourceType] || DEFAULT_CONFIG;
    this.resourceType = resourceType;
  }
  
  // 获取显示配置
  getDisplayConfig() {
    return {
      icon: this.config.icon,
      category: this.config.category,
      categoryLabel: this.getCategoryLabel(),
      showRichTextEditor: this.config.requiresRichText,
      showSEOFields: this.config.supportsSEO,
      isDynamic: this.config.isDynamic || false,
      isJSON: this.config.isJSON || false
    };
  }
  
  // 获取分类标签
  getCategoryLabel() {
    const labels = {
      products: '产品与集合',
      content: '内容管理',
      navigation: '导航结构',
      theme: '主题资源',
      product_extensions: '产品扩展',
      shop_settings: '店铺设置',
      others: '其他资源'
    };
    return labels[this.config.category] || '未分类';
  }
  
  // 获取主要字段列表
  getPrimaryFields() {
    return this.config.primaryFields;
  }
  
  // 获取可翻译字段
  getTranslatableFields(contentFields = null) {
    // 动态资源从contentFields获取
    if (this.config.isDynamic && contentFields) {
      if (contentFields.translatableFields) {
        return contentFields.translatableFields;
      }
      // 从dynamicFields推断
      if (contentFields.dynamicFields) {
        return Object.keys(contentFields.dynamicFields).filter(key => {
          const value = contentFields.dynamicFields[key];
          return typeof value === 'string' && value.length > 0;
        });
      }
    }
    return this.config.translatableFields;
  }
  
  // 验证资源数据完整性
  validateResource(resource) {
    const errors = [];
    
    // 检查必需字段
    this.config.primaryFields.forEach(field => {
      if (!resource[field] && !resource.contentFields?.[field]) {
        errors.push(`缺少必需字段: ${field}`);
      }
    });
    
    // 检查富文本字段
    if (this.config.requiresRichText && !resource.descriptionHtml) {
      errors.push('缺少富文本内容');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  // 格式化资源用于显示
  formatForDisplay(resource) {
    const formatted = {
      ...resource,
      displayTitle: this.getDisplayTitle(resource),
      displayCategory: this.getCategoryLabel(),
      icon: this.config.icon,
      badges: this.getBadges(resource)
    };
    
    // 处理动态字段
    if (this.config.isDynamic && resource.contentFields) {
      formatted.dynamicContent = this.formatDynamicContent(resource.contentFields);
    }
    
    return formatted;
  }
  
  // 获取显示标题
  getDisplayTitle(resource) {
    // 优先使用配置的第一个主要字段
    const primaryField = this.config.primaryFields[0];
    if (resource[primaryField]) {
      return resource[primaryField];
    }
    
    // 尝试从contentFields获取
    if (resource.contentFields?.[primaryField]) {
      return resource.contentFields[primaryField];
    }
    
    // 使用resourceId作为后备
    return resource.resourceId || `${this.resourceType} #${resource.id?.slice(-6)}`;
  }
  
  // 获取状态徽章
  getBadges(resource) {
    const badges = [];
    
    // 翻译状态
    if (resource.translations?.length > 0) {
      const synced = resource.translations.filter(t => t.syncStatus === 'synced').length;
      badges.push({
        type: 'translation',
        label: `${synced}/${resource.translations.length} 已同步`,
        tone: synced === resource.translations.length ? 'success' : 'warning'
      });
    }
    
    // 风险评分
    if (resource.riskScore > 0.7) {
      badges.push({
        type: 'risk',
        label: '高风险',
        tone: 'critical'
      });
    }
    
    // 错误次数
    if (resource.errorCount > 0) {
      badges.push({
        type: 'error',
        label: `${resource.errorCount} 个错误`,
        tone: 'warning'
      });
    }
    
    return badges;
  }
  
  // 格式化动态内容
  formatDynamicContent(contentFields) {
    if (!contentFields) return null;
    
    // JSON类型资源特殊处理
    if (this.config.isJSON && contentFields.themeData) {
      try {
        const parsed = typeof contentFields.themeData === 'string' 
          ? JSON.parse(contentFields.themeData)
          : contentFields.themeData;
        return {
          type: 'json',
          data: parsed,
          fieldCount: Object.keys(parsed).length
        };
      } catch (e) {
        return {
          type: 'json',
          error: '无效的JSON数据'
        };
      }
    }
    
    // 其他动态内容
    return {
      type: 'dynamic',
      fields: contentFields.dynamicFields || {},
      fieldCount: Object.keys(contentFields.dynamicFields || {}).length
    };
  }
}

// 工厂函数 - 创建适配器实例
export function createResourceAdapter(resourceType) {
  return new UnifiedResourceAdapter(resourceType);
}

// 获取所有资源类型配置
export function getAllResourceConfigs() {
  return RESOURCE_CONFIGS;
}

// 获取资源类型分组
export function getResourceCategories() {
  const categories = {};
  
  Object.entries(RESOURCE_CONFIGS).forEach(([type, config]) => {
    if (!categories[config.category]) {
      categories[config.category] = [];
    }
    categories[config.category].push({
      type,
      icon: config.icon,
      isDynamic: config.isDynamic || false
    });
  });
  
  return categories;
}

// 检查资源类型是否需要特殊处理
export function requiresSpecialHandling(resourceType) {
  const config = RESOURCE_CONFIGS[resourceType];
  return config?.isDynamic || config?.isJSON || false;
}

// 导出适配器类和配置
export { UnifiedResourceAdapter, RESOURCE_CONFIGS, DEFAULT_CONFIG };