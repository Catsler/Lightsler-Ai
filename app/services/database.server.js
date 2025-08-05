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

  for (const resource of resources) {
    // 构建更新和创建的数据对象
    const resourceData = {
      gid: resource.gid,
      title: resource.title,
      description: resource.description,
      descriptionHtml: resource.descriptionHtml,
      handle: resource.handle,
      seoTitle: resource.seoTitle,
      seoDescription: resource.seoDescription,
      summary: resource.summary || null,
      label: resource.label || null,
      contentFields: resource.contentFields || null,
      // 为主题资源添加原始ID支持
      ...(resource.originalId && { 
        originalResourceId: resource.originalId  // 存储原始ID用于API调用
      }),
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
export async function getAllResources(shopId) {
  return await prisma.resource.findMany({
    where: { shopId: shopId },
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
  // 构建翻译数据对象
  const translationData = {
    titleTrans: translations.titleTrans || null,
    descTrans: translations.descTrans || null,
    handleTrans: translations.handleTrans || null,
    summaryTrans: translations.summaryTrans || null,
    labelTrans: translations.labelTrans || null,
    seoTitleTrans: translations.seoTitleTrans || null,
    seoDescTrans: translations.seoDescTrans || null,
    translationFields: translations.translationFields || null,
    status: 'completed'
  };

  return await prisma.translation.upsert({
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