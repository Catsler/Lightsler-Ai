import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 数据库操作服务
 */

/**
 * 获取或创建店铺记录
 * @param {string} shopDomain - 店铺域名
 * @param {string} accessToken - 访问令牌
 * @returns {Promise<Object>} 店铺记录
 */
export async function getOrCreateShop(shopDomain, accessToken) {
  let shop = await prisma.shop.findUnique({
    where: { domain: shopDomain }
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: {
        id: shopDomain,
        domain: shopDomain,
        accessToken: accessToken,
      }
    });
  } else {
    // 更新访问令牌
    shop = await prisma.shop.update({
      where: { id: shop.id },
      data: { accessToken: accessToken }
    });
  }

  return shop;
}

/**
 * 批量保存资源到数据库
 * @param {string} shopId - 店铺ID
 * @param {Array} resources - 资源列表
 * @returns {Promise<Array>} 保存的资源记录
 */
export async function saveResources(shopId, resources) {
  const savedResources = [];
  let skippedCount = 0;

  for (const resource of resources) {
    // 跳过没有title且没有其他有效内容的资源
    const hasValidContent = resource.title || 
                           resource.description || 
                           resource.label || 
                           resource.summary ||
                           (resource.contentFields && Object.keys(resource.contentFields).length > 0);
    
    if (!hasValidContent) {
      skippedCount++;
      console.warn(`[跳过保存] 资源没有有效内容`, {
        resourceType: resource.resourceType,
        resourceId: resource.id,
        gid: resource.gid
      });
      continue;
    }
    
    // 数据验证和默认值处理
    const validatedTitle = resource.title || `Untitled ${resource.resourceType || 'Resource'}`;
    const validatedDescription = resource.description || '';
    const validatedHandle = resource.handle || '';
    
    // 构建更新和创建的数据对象
    const resourceData = {
      gid: resource.gid,
      title: validatedTitle,
      description: validatedDescription,
      descriptionHtml: resource.descriptionHtml || '',
      handle: validatedHandle,
      seoTitle: resource.seoTitle || '',
      seoDescription: resource.seoDescription || '',
      summary: resource.summary || null,
      label: resource.label || null,
      // 产品特定字段
      vendor: resource.vendor || null,
      productType: resource.productType || resource.product_type || null,
      tags: resource.tags || null,
      contentFields: resource.contentFields || null,
      status: 'pending'
    };

    const saved = await prisma.resource.upsert({
      where: {
        shopId_resourceType_resourceId: {
          shopId: shopId,
          resourceType: resource.resourceType,
          resourceId: resource.id
        }
      },
      update: resourceData,
      create: {
        shopId: shopId,
        resourceType: resource.resourceType,
        resourceId: resource.id,
        ...resourceData
      }
    });
    savedResources.push(saved);
  }

  if (skippedCount > 0) {
    console.log(`[保存统计] 跳过了 ${skippedCount} 个无效资源`);
  }

  return savedResources;
}

/**
 * 获取店铺的待翻译资源
 * @param {string} shopId - 店铺ID
 * @param {string} resourceType - 资源类型 (product, collection, 或 null 表示全部)
 * @returns {Promise<Array>} 资源列表
 */
export async function getPendingResources(shopId, resourceType = null) {
  const where = {
    shopId: shopId,
    status: 'pending'
  };

  if (resourceType) {
    where.resourceType = resourceType;
  }

  return await prisma.resource.findMany({
    where: where,
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * 获取店铺的所有资源
 * @param {string} shopId - 店铺ID
 * @returns {Promise<Array>} 资源列表
 */
export async function getAllResources(shopId, resourceType = null) {
  const whereClause = { shopId: shopId };
  
  // 如果指定了资源类型，添加到查询条件
  if (resourceType) {
    whereClause.resourceType = resourceType.toLowerCase();
  }
  
  return await prisma.resource.findMany({
    where: whereClause,
    include: {
      translations: true
    },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * 保存翻译结果
 * @param {string} resourceId - 资源ID
 * @param {string} shopId - 店铺ID
 * @param {string} language - 目标语言
 * @param {Object} translations - 翻译内容
 * @returns {Promise<Object>} 翻译记录
 */
export async function saveTranslation(resourceId, shopId, language, translations) {
  // 记录语言参数，帮助调试
  console.log(`[saveTranslation] 保存翻译 - 资源ID: ${resourceId}, 语言: ${language}, 店铺: ${shopId}`);
  
  // 构建翻译数据对象
  const translationData = {
    titleTrans: translations.titleTrans || null,
    descTrans: translations.descTrans || null,
    handleTrans: translations.handleTrans || null,
    summaryTrans: translations.summaryTrans || null,
    labelTrans: translations.labelTrans || null,
    seoTitleTrans: translations.seoTitleTrans || null,
    seoDescTrans: translations.seoDescTrans || null,
    // 产品特定字段翻译
    vendorTrans: translations.vendorTrans || null,
    productTypeTrans: translations.productTypeTrans || null,
    tagsTrans: translations.tagsTrans || null,
    translationFields: translations.translationFields || null,
    status: 'completed',
    syncStatus: 'pending' // 新翻译默认为待同步状态
  };
  
  try {
    const result = await prisma.translation.upsert({
      where: {
        resourceId_language: {
          resourceId: resourceId,
          language: language
        }
      },
      update: translationData,
      create: {
        resourceId: resourceId,
        shopId: shopId,
        language: language,
        ...translationData
      }
    });
    
    console.log(`[saveTranslation] 成功保存 ${language} 翻译，记录ID: ${result.id}`);
    return result;
    
  } catch (error) {
    console.error(`[saveTranslation] 保存翻译失败:`, error);
    
    // 记录到错误数据库
    if (typeof collectError !== 'undefined') {
      const { collectError, ERROR_TYPES } = await import('./error-collector.server.js');
      await collectError({
        errorType: ERROR_TYPES.DATABASE,
        errorCategory: 'DATABASE_ERROR',
        errorCode: 'SAVE_TRANSLATION_FAILED',
        message: `Failed to save translation: ${error.message}`,
        stack: error.stack,
        operation: 'saveTranslation',
        resourceId,
        severity: 4,
        retryable: true,
        context: {
          shopId,
          language,
          hasTranslations: !!translations,
          error: error.message
        }
      });
    }
    
    throw error;
  }
}

// 根据资源ID获取所有语言的翻译
export async function getTranslationByResourceId(shopDomain, resourceId) {
  try {
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain }
    });

    if (!shop) {
      return {};
    }

    const translations = await prisma.translation.findMany({
      where: {
        shopId: shop.id,
        resource: {
          OR: [
            { resourceId: resourceId },
            { originalResourceId: resourceId },
            { gid: { contains: resourceId } }
          ]
        }
      },
      include: {
        resource: true
      }
    });

    // 按语言组织翻译数据
    const translationsByLanguage = {};
    for (const translation of translations) {
      if (!translationsByLanguage[translation.language]) {
        translationsByLanguage[translation.language] = {};
      }
      
      // 映射数据库字段到前端期望的字段名
      const fieldMappings = {
        titleTrans: 'title',
        descTrans: 'body_html',
        handleTrans: 'handle',
        seoTitleTrans: 'meta_title',
        seoDescTrans: 'meta_description',
        summaryTrans: 'summary',
        labelTrans: 'label',
        vendorTrans: 'vendor',
        productTypeTrans: 'product_type',
        tagsTrans: 'tags'
      };
      
      // 映射基础字段
      for (const [dbField, frontendField] of Object.entries(fieldMappings)) {
        if (translation[dbField]) {
          translationsByLanguage[translation.language][frontendField] = translation[dbField];
        }
      }
      
      // 处理 translationFields JSON 字段（包含动态字段和 metafields）
      if (translation.translationFields) {
        const fields = typeof translation.translationFields === 'string' 
          ? JSON.parse(translation.translationFields) 
          : translation.translationFields;
        
        // 处理 Theme 资源的动态字段
        if (fields.dynamicFields) {
          for (const [key, value] of Object.entries(fields.dynamicFields)) {
            translationsByLanguage[translation.language][key] = value;
          }
        }
        
        // 处理 Theme 资源的可翻译字段数组
        if (fields.translatableFields && Array.isArray(fields.translatableFields)) {
          for (const field of fields.translatableFields) {
            if (field.key && field.translatedValue) {
              translationsByLanguage[translation.language][field.key] = field.translatedValue;
            }
          }
        }
        
        // 处理产品的 metafields
        if (fields.metafields) {
          for (const [namespace, nsFields] of Object.entries(fields.metafields)) {
            for (const [key, value] of Object.entries(nsFields)) {
              const metafieldKey = `metafield_${namespace}_${key}`;
              translationsByLanguage[translation.language][metafieldKey] = value;
            }
          }
        }
        
        // 处理产品变体
        if (fields.variants && Array.isArray(fields.variants)) {
          for (const variant of fields.variants) {
            if (variant.id && variant.translatedTitle) {
              const variantKey = `variant_${variant.id}_title`;
              translationsByLanguage[translation.language][variantKey] = variant.translatedTitle;
            }
          }
        }
        
        // 处理其他直接存储的字段
        for (const [key, value] of Object.entries(fields)) {
          if (!['dynamicFields', 'translatableFields', 'metafields', 'variants'].includes(key)) {
            translationsByLanguage[translation.language][key] = value;
          }
        }
      }
    }

    return translationsByLanguage;
  } catch (error) {
    console.error('获取资源翻译失败:', error);
    return {};
  }
}

// 保存单个字段的翻译
export async function saveFieldTranslation({
  shopId,
  resourceId,
  resourceType,
  language,
  fieldKey,
  originalValue,
  translatedValue
}) {
  try {
    const shop = await prisma.shop.findUnique({
      where: { domain: shopId }
    });

    if (!shop) {
      throw new Error('店铺不存在');
    }

    // 查找或创建资源
    let resource = await prisma.resource.findFirst({
      where: {
        shopId: shop.id,
        OR: [
          { resourceId: resourceId },
          { originalResourceId: resourceId },
          { gid: { contains: resourceId } }
        ]
      }
    });

    if (!resource) {
      // 如果资源不存在，创建一个基础记录
      resource = await prisma.resource.create({
        data: {
          shopId: shop.id,
          resourceType: resourceType.toUpperCase(),
          resourceId: resourceId,
          originalResourceId: resourceId,
          title: originalValue.substring(0, 100), // 使用字段值的前100字符作为标题
          status: 'processing'
        }
      });
    }

    // 查找或创建翻译记录
    let translation = await prisma.translation.findFirst({
      where: {
        resourceId: resource.id,
        language: language
      }
    });

    const currentFields = translation?.translatedFields 
      ? (typeof translation.translatedFields === 'string' 
          ? JSON.parse(translation.translatedFields) 
          : translation.translatedFields)
      : {};

    // 更新字段
    currentFields[fieldKey] = translatedValue;

    if (translation) {
      // 更新现有翻译
      await prisma.translation.update({
        where: { id: translation.id },
        data: {
          translatedFields: currentFields,
          // 如果是基础字段，也更新对应的列
          ...(fieldKey === 'title' && { translatedTitle: translatedValue }),
          ...(fieldKey === 'body_html' && { translatedDescriptionHtml: translatedValue }),
          ...(fieldKey === 'vendor' && { 
            translatedFields: { ...currentFields, vendor: translatedValue }
          })
        }
      });
    } else {
      // 创建新翻译
      await prisma.translation.create({
        data: {
          shopId: shop.id,
          resourceId: resource.id,
          language: language,
          translatedFields: currentFields,
          // 如果是基础字段，也设置对应的列
          ...(fieldKey === 'title' && { translatedTitle: translatedValue }),
          ...(fieldKey === 'body_html' && { translatedDescriptionHtml: translatedValue }),
          status: 'completed'
        }
      });
    }

    return { success: true };
  } catch (error) {
    console.error('保存字段翻译失败:', error);
    throw error;
  }
}

/**
 * 更新资源状态
 * @param {string} resourceId - 资源ID
 * @param {string} status - 新状态
 * @returns {Promise<Object>} 更新后的资源记录
 */
export async function updateResourceStatus(resourceId, status) {
  return await prisma.resource.update({
    where: { id: resourceId },
    data: { status: status }
  });
}

/**
 * 获取店铺的翻译统计
 * @param {string} shopId - 店铺ID
 * @returns {Promise<Object>} 统计信息
 */
export async function getTranslationStats(shopId) {
  const totalResources = await prisma.resource.count({
    where: { shopId: shopId }
  });

  const pendingResources = await prisma.resource.count({
    where: { shopId: shopId, status: 'pending' }
  });

  const completedResources = await prisma.resource.count({
    where: { shopId: shopId, status: 'completed' }
  });

  const totalTranslations = await prisma.translation.count({
    where: { shopId: shopId }
  });

  return {
    totalResources,
    pendingResources,
    completedResources,
    totalTranslations
  };
}

/**
 * 删除特定资源的翻译记录
 * @param {string} resourceId - 资源ID
 * @param {string} language - 语言代码（可选）
 * @returns {Promise<void>}
 */
export async function deleteTranslations(resourceId, language = null) {
  const where = { resourceId };
  
  if (language) {
    where.language = language;
  }
  
  await prisma.translation.deleteMany({ where });
}

/**
 * 清空店铺的所有资源和翻译
 * @param {string} shopId - 店铺ID
 * @returns {Promise<void>}
 */
export async function clearShopData(shopId) {
  // 删除翻译记录
  await prisma.translation.deleteMany({
    where: { shopId: shopId }
  });

  // 删除资源记录
  await prisma.resource.deleteMany({
    where: { shopId: shopId }
  });
}

export { prisma };