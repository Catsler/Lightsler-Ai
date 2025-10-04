import prisma from "../db.server";
import { createApiRoute } from "../utils/base-route.server.js";

/**
 * 统一资源详情API - Linus哲学实现
 * 原则：消除26个特殊情况，使用统一接口
 * 目标：响应时间 < 100ms
 */

// 资源类型到表字段的统一映射
const RESOURCE_FIELD_MAP = {
  // 标准字段（所有资源共有）
  standard: ['id', 'shopId', 'resourceType', 'resourceId', 'gid', 'title', 'status', 'createdAt', 'updatedAt'],
  
  // 内容字段（根据资源类型动态）
  content: ['description', 'descriptionHtml', 'handle', 'seoTitle', 'seoDescription', 'summary', 'label'],
  
  // 扩展字段（JSON格式）
  extended: ['contentFields'],
  
  // 质量字段（Sequential Thinking相关）
  quality: ['contentHash', 'contentVersion', 'riskScore', 'errorCount', 'lastScannedAt']
};

// 标准字段映射表 - 单一事实来源
export const STANDARD_TRANSLATION_MAP = {
  title: 'titleTrans',
  description: 'descTrans',
  descriptionHtml: 'descTrans',
  handle: 'handleTrans',
  seoTitle: 'seoTitleTrans',
  seoDescription: 'seoDescTrans',
  summary: 'summaryTrans',
  label: 'labelTrans'
};

// 统一的资源详情接口
class ResourceDetailAdapter {
  constructor(resource) {
    this.resource = resource;
  }

  // 转换为统一格式 - 核心方法，消除特殊情况
  transform() {
    return {
      // 基础信息
      id: this.resource.id,
      type: this.resource.resourceType,
      title: this.resource.title || this.getDefaultTitle(),
      
      // 动态字段
      fields: {
        standard: this.getStandardFields(),
        content: this.getContentFields(),
        extended: this.getExtendedFields()
      },
      
      // 翻译信息
      translations: this.getTranslations(),
      
      // 元数据
      metadata: {
        canEdit: this.canEdit(),
        canTranslate: this.canTranslate(),
        lastModified: this.resource.updatedAt,
        contentHash: this.resource.contentHash,
        riskScore: this.resource.riskScore || 0,
        errorCount: this.resource.errorCount || 0
      }
    };
  }
  
  getDefaultTitle() {
    // 智能标题生成 - 不依赖资源类型
    const { resourceId, resourceType } = this.resource;
    if (resourceId) {
      return resourceId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return `${resourceType.replace(/_/g, ' ').toLowerCase()} #${this.resource.id.slice(-6)}`;
  }
  
  getStandardFields() {
    const fields = {};
    RESOURCE_FIELD_MAP.standard.forEach(field => {
      if (this.resource[field] !== undefined) {
        fields[field] = this.resource[field];
      }
    });
    return fields;
  }
  
  getContentFields() {
    const fields = {};
    RESOURCE_FIELD_MAP.content.forEach(field => {
      // 保留null值，只过滤undefined（KISS原则）
      if (this.resource[field] !== undefined) {
        fields[field] = this.resource[field];
      }
    });
    return fields;
  }
  
  getExtendedFields() {
    // 处理contentFields中的动态内容
    const contentFields = this.resource.contentFields || {};
    
    // Theme资源的特殊字段直接返回
    if (this.resource.resourceType?.includes('THEME')) {
      return {
        dynamicFields: contentFields.dynamicFields || {},
        translatableFields: contentFields.translatableFields || [],
        themeData: contentFields.themeData || null
      };
    }
    
    // 其他资源的扩展字段
    return contentFields;
  }
  
  getTranslations() {
    const translations = {};
    if (this.resource.translations) {
      this.resource.translations.forEach(trans => {
        translations[trans.language] = {
          id: trans.id,
          status: trans.status,
          syncStatus: trans.syncStatus,
          fields: this.getTranslationFields(trans),
          qualityScore: trans.qualityScore || 0,
          lastSync: trans.syncedAt
        };
      });
    }
    return translations;
  }
  
  getTranslationFields(translation) {
    // 合并所有翻译字段
    const fields = {};
    
    // 标准翻译字段
    const standardTransFields = [
      'titleTrans', 'descTrans', 'handleTrans', 
      'summaryTrans', 'labelTrans', 'seoTitleTrans', 'seoDescTrans'
    ];
    
    standardTransFields.forEach(field => {
      // 保留null/空值，确保字段完整性
      if (translation[field] !== undefined) {
        fields[field] = translation[field];
      }
    });
    
    // 动态翻译字段
    if (translation.translationFields) {
      Object.assign(fields, translation.translationFields);
    }
    
    return fields;
  }
  
  canEdit() {
    // 基于风险评分和错误次数判断
    return this.resource.riskScore < 0.7 && this.resource.errorCount < 3;
  }
  
  canTranslate() {
    // 有内容且状态允许
    return this.resource.status !== 'processing' && 
           (this.resource.description || this.resource.contentFields);
  }
}

/**
 * GET请求处理函数 - 获取资源详情
 */
async function handleResourceDetail({ request, session, searchParams }) {
  const resourceId = searchParams.get('id');
  const resourceType = searchParams.get('type');
  
  if (!resourceId) {
    throw new Error('Resource ID is required');
  }
  // 查询资源及其翻译 - 单次查询，优化性能
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: {
      translations: {
        orderBy: { updatedAt: 'desc' }
      },
      errorLogs: {
        take: 5,
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!resource) {
    throw new Error('Resource not found');
  }

  // 验证店铺权限 - 智能匹配shopId（兼容不同格式）
  const normalizeShopId = (id) => {
    if (!id) return '';
    // 移除 .myshopify.com 后缀进行比较
    return id.replace(/\.myshopify\.com$/, '').toLowerCase();
  };

  if (normalizeShopId(resource.shopId) !== normalizeShopId(session.shop)) {
    console.error('[AUTH] Shop mismatch in API:', {
      resourceShopId: resource.shopId,
      sessionShop: session.shop
    });
    throw new Error('Unauthorized');
  }

  // 使用适配器转换为统一格式
  const adapter = new ResourceDetailAdapter(resource);
  const unifiedResource = adapter.transform();

  // 添加性能监控数据
  const endTime = Date.now();
  const startTime = parseInt(searchParams.get('_start') || Date.now());
  const responseTime = endTime - startTime;

  return {
    data: unifiedResource,
    performance: {
      responseTime: `${responseTime}ms`,
      cacheHit: false, // 后续实现缓存
      queryCount: 1
    }
  };
}

/**
 * POST请求处理函数 - 批量获取资源详情
 */
async function handleResourceDetailBatch({ request, session }) {
  const { resourceIds } = await request.json();

  if (!resourceIds || !Array.isArray(resourceIds)) {
    throw new Error('Resource IDs array is required');
  }

  // 批量查询 - 优化数据库访问
  const resources = await prisma.resource.findMany({
    where: {
      id: { in: resourceIds },
      shopId: session.shop
    },
    include: {
      translations: true
    }
  });

  // 批量转换
  const unifiedResources = resources.map(resource => {
    const adapter = new ResourceDetailAdapter(resource);
    return adapter.transform();
  });

  return {
    data: unifiedResources,
    count: unifiedResources.length
  };
}

export const loader = createApiRoute(handleResourceDetail, {
  requireAuth: true,
  operationName: '获取资源详情'
});

export const action = createApiRoute(handleResourceDetailBatch, {
  requireAuth: true,
  operationName: '批量获取资源详情'
});

// 导出适配器供其他模块使用
export { ResourceDetailAdapter };