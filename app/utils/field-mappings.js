// 统一的字段映射配置
// 确保前后端字段名称一致

// Shopify GraphQL 字段到数据库字段的映射
export const GRAPHQL_TO_DB_FIELD_MAP = {
  // 基础字段
  'title': 'titleTrans',
  'body_html': 'descTrans',
  'handle': 'handleTrans',
  'meta_title': 'seoTitleTrans',
  'meta_description': 'seoDescTrans',
  'summary': 'summaryTrans',
  'label': 'labelTrans',
  // 产品特定字段
  'vendor': 'vendorTrans',
  'product_type': 'productTypeTrans',
  'tags': 'tagsTrans'
};

// 数据库字段到前端显示字段的映射
export const DB_TO_FRONTEND_FIELD_MAP = {
  'titleTrans': 'title',
  'descTrans': 'body_html',
  'handleTrans': 'handle',
  'seoTitleTrans': 'meta_title',
  'seoDescTrans': 'meta_description',
  'summaryTrans': 'summary',
  'labelTrans': 'label',
  'vendorTrans': 'vendor',
  'productTypeTrans': 'product_type',
  'tagsTrans': 'tags'
};

// 前端显示字段到数据库字段的反向映射
export const FRONTEND_TO_DB_FIELD_MAP = Object.fromEntries(
  Object.entries(DB_TO_FRONTEND_FIELD_MAP).map(([db, frontend]) => [frontend, db])
);

// 资源类型到可翻译字段的映射
export const RESOURCE_TYPE_FIELDS = {
  'product': ['title', 'body_html', 'handle', 'meta_title', 'meta_description', 'vendor', 'product_type', 'tags'],
  'collection': ['title', 'body_html', 'handle', 'meta_title', 'meta_description'],
  'article': ['title', 'body_html', 'handle', 'summary', 'meta_title', 'meta_description'],
  'blog': ['title', 'handle', 'meta_title', 'meta_description'],
  'page': ['title', 'body_html', 'handle', 'meta_title', 'meta_description'],
  'filter': ['label'],
  'shop': ['meta_title', 'meta_description'],
  'shop_policy': ['title', 'body']
};

// 字段标签映射（用于前端显示）
export const FIELD_LABELS = {
  'title': '标题',
  'body_html': '描述',
  'handle': 'URL Handle',
  'meta_title': 'SEO标题',
  'meta_description': 'SEO描述',
  'summary': '摘要',
  'label': '标签',
  'vendor': '供应商',
  'product_type': '产品类型',
  'tags': '标签',
  // Theme 特定字段
  'global.title_tag': '全局标题标签',
  'global.description_tag': '全局描述标签'
};

// 特殊字段处理规则
export const SPECIAL_FIELD_RULES = {
  // Theme 资源的动态字段不需要映射，直接使用原始 key
  isThemeDynamicField: (key) => {
    return key.includes('.') || key.includes('global');
  },
  
  // Metafield 字段的识别
  isMetafieldKey: (key) => {
    return key.startsWith('metafield_');
  },
  
  // 变体字段的识别
  isVariantKey: (key) => {
    return key.startsWith('variant_');
  },
  
  // 获取字段的实际 key（去除前缀）
  getActualFieldKey: (key) => {
    if (SPECIAL_FIELD_RULES.isMetafieldKey(key)) {
      // metafield_namespace_key -> namespace.key
      const parts = key.replace('metafield_', '').split('_');
      if (parts.length >= 2) {
        return `${parts[0]}.${parts.slice(1).join('_')}`;
      }
    }
    if (SPECIAL_FIELD_RULES.isVariantKey(key)) {
      // variant_id_field -> field
      const parts = key.split('_');
      return parts[parts.length - 1];
    }
    return key;
  }
};

// 导出统一的字段映射函数
export function mapFieldsForDatabase(fields, resourceType) {
  const mapped = {};
  
  for (const [key, value] of Object.entries(fields)) {
    // Theme 动态字段直接使用原始 key
    if (SPECIAL_FIELD_RULES.isThemeDynamicField(key)) {
      mapped[key] = value;
    }
    // 标准字段使用映射
    else if (GRAPHQL_TO_DB_FIELD_MAP[key]) {
      mapped[GRAPHQL_TO_DB_FIELD_MAP[key]] = value;
    }
    // 其他字段保持原样
    else {
      mapped[key] = value;
    }
  }
  
  return mapped;
}

export function mapFieldsForFrontend(dbFields) {
  const mapped = {};
  
  for (const [key, value] of Object.entries(dbFields)) {
    // 使用映射表转换字段名
    const frontendKey = DB_TO_FRONTEND_FIELD_MAP[key] || key;
    mapped[frontendKey] = value;
  }
  
  return mapped;
}

// 获取字段的显示标签
export function getFieldLabel(fieldKey) {
  // 优先使用预定义标签
  if (FIELD_LABELS[fieldKey]) {
    return FIELD_LABELS[fieldKey];
  }
  
  // Theme 动态字段的处理
  if (SPECIAL_FIELD_RULES.isThemeDynamicField(fieldKey)) {
    // 格式化 key 为可读标签
    return fieldKey
      .split('.')
      .map(part => part.replace(/_/g, ' '))
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' - ');
  }
  
  // Metafield 的处理
  if (SPECIAL_FIELD_RULES.isMetafieldKey(fieldKey)) {
    const actualKey = SPECIAL_FIELD_RULES.getActualFieldKey(fieldKey);
    return `自定义字段: ${actualKey}`;
  }
  
  // 默认处理：将下划线转换为空格，首字母大写
  return fieldKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}