/**
 * 产品关联内容翻译增强服务
 *
 * 提供产品options和metafields的自动翻译功能
 * 基于现有架构，最小改动实现关联翻译
 *
 * @version 1.0.0
 * @author Claude Code
 */

import { translateResource } from './translation.server.js';
import { fetchMetafieldsForProduct, fetchOptionsForProduct } from './shopify-graphql.server.js';
import prisma from '../db.server.js';
import { logger } from '../utils/logger.server.js';

function resolveProductIdentifiers(product) {
  if (!product) {
    return { stableId: '', stableGid: null };
  }

  const numericId = product.resourceId || product.originalResourceId;

  let gid = typeof product.gid === 'string' ? product.gid : null;
  if (!gid && numericId) {
    gid = `gid://shopify/Product/${numericId}`;
  } else if (!gid && typeof product.id === 'string' && product.id.startsWith('gid://')) {
    gid = product.id;
  }

  let extractedId = numericId;
  if (!extractedId && gid && gid.includes('/')) {
    const parts = gid.split('/');
    extractedId = parts[parts.length - 1];
  }
  if (!extractedId && product.id) {
    extractedId = String(product.id);
  }

  const stableId = extractedId ? String(extractedId) : '';
  const stableGid = gid || (stableId ? `gid://shopify/Product/${stableId}` : null);

  return { stableId, stableGid };
}

function buildDerivedResourceId(product, typeSegment, uniqueSegment) {
  const { stableId } = resolveProductIdentifiers(product);
  const base = stableId || (product?.id ? String(product.id) : 'product');
  const segment = uniqueSegment == null ? '' : String(uniqueSegment);
  const raw = segment.trim() || 'item';
  const sanitized = raw.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  return `${base}-${typeSegment}-${sanitized}`;
}

/**
 * 产品关联翻译的配置
 */
const RELATED_TRANSLATION_CONFIG = {
  // 是否启用关联翻译（通过环境变量控制）
  enabled: process.env.ENABLE_PRODUCT_RELATED_TRANSLATION === 'true',

  // 超时时间（毫秒）
  timeout: 30000,

  // 是否记录详细日志
  verboseLogging: process.env.NODE_ENV === 'development'
};

/**
 * 增强版产品翻译函数
 * 在翻译产品主体的同时，异步翻译其options和metafields
 *
 * @param {Object} product - 产品资源对象
 * @param {string} targetLang - 目标语言
 * @param {Object} admin - Shopify Admin API客户端
 * @returns {Promise<Object>} 翻译结果
 */
export async function translateProductWithRelated(product, targetLang, admin) {
  logger.info(`开始增强版产品翻译: ${product.title || product.id}`, {
    productId: product.id,
    productGid: product.gid,
    targetLanguage: targetLang,
    relatedTranslationEnabled: RELATED_TRANSLATION_CONFIG.enabled
  });

  // 1. 翻译产品主体（保持原有逻辑不变）
  const startTime = Date.now();
  const mainTranslation = await translateResource(product, targetLang);
  const mainTranslationTime = Date.now() - startTime;

  logger.info(`产品主体翻译完成: ${product.title || product.id}`, {
    productId: product.id,
    duration: `${mainTranslationTime}ms`,
    success: true
  });

  const shouldTranslateRelated = RELATED_TRANSLATION_CONFIG.enabled || product.forceRelatedTranslation || product.userRequested;

  if (!shouldTranslateRelated) {
    if (RELATED_TRANSLATION_CONFIG.verboseLogging) {
      logger.debug(`跳过产品关联内容翻译: ${product.id}`, {
        productId: product.id,
        relatedTranslationEnabled: RELATED_TRANSLATION_CONFIG.enabled,
        forceRelated: product.forceRelatedTranslation || false
      });
    }
    return mainTranslation;
  }

  const runRelatedTranslation = async () => {
    try {
      await Promise.race([
        translateRelatedContent(product, targetLang, admin),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('关联翻译超时')), RELATED_TRANSLATION_CONFIG.timeout)
        )
      ]);
    } catch (error) {
      logger.warn(`产品 ${product.id} 关联内容翻译失败，但不影响主体翻译`, {
        productId: product.id,
        error: error.message,
        stack: RELATED_TRANSLATION_CONFIG.verboseLogging ? error.stack : undefined
      });
    }
  };

  if (product.forceRelatedTranslation) {
    await runRelatedTranslation();
  } else {
    setImmediate(runRelatedTranslation);
  }

  return mainTranslation;
}

/**
 * 翻译产品的关联内容（options + metafields）
 * @param {Object} product - 产品资源对象
 * @param {string} targetLang - 目标语言
 * @param {Object} admin - Shopify Admin API客户端
 */
async function translateRelatedContent(product, targetLang, admin) {
  const relatedStartTime = Date.now();

  logger.info(`开始翻译产品关联内容: ${product.id}`, {
    productId: product.id,
    targetLanguage: targetLang
  });

  const results = await Promise.allSettled([
    translateProductOptionsIfExists(product, targetLang, admin),
    translateProductMetafieldsIfExists(product, targetLang, admin)
  ]);

  // 统计结果
  const optionsResult = results[0];
  const metafieldsResult = results[1];

  const relatedTranslationTime = Date.now() - relatedStartTime;

  logger.info(`产品关联内容翻译完成: ${product.id}`, {
    productId: product.id,
    duration: `${relatedTranslationTime}ms`,
    optionsSuccess: optionsResult.status === 'fulfilled',
    metafieldsSuccess: metafieldsResult.status === 'fulfilled',
    optionsError: optionsResult.status === 'rejected' ? optionsResult.reason?.message : null,
    metafieldsError: metafieldsResult.status === 'rejected' ? metafieldsResult.reason?.message : null
  });

  // 如果有失败的，记录详细信息（但不抛出错误）
  if (optionsResult.status === 'rejected') {
    logger.error(`产品选项翻译失败: ${product.id}`, {
      productId: product.id,
      error: optionsResult.reason?.message,
      stack: RELATED_TRANSLATION_CONFIG.verboseLogging ? optionsResult.reason?.stack : undefined
    });
  }

  if (metafieldsResult.status === 'rejected') {
    logger.error(`产品metafields翻译失败: ${product.id}`, {
      productId: product.id,
      error: metafieldsResult.reason?.message,
      stack: RELATED_TRANSLATION_CONFIG.verboseLogging ? metafieldsResult.reason?.stack : undefined
    });
  }
}

/**
 * 翻译产品选项（如果存在）
 * @param {Object} product - 产品资源对象
 * @param {string} targetLang - 目标语言
 * @param {Object} admin - Shopify Admin API客户端（预留，暂时未使用）
 */

async function translateProductOptionsIfExists(product, targetLang, admin) {
  try {
    logger.debug(`检查产品选项: ${product.id}`);

    const { stableId, stableGid } = resolveProductIdentifiers(product);
    const optionTypes = ['PRODUCT_OPTION', 'product_option', 'PRODUCT_OPTION_VALUE', 'product_option_value'];
    const candidateIds = Array.from(new Set([
      stableId,
      product.resourceId,
      product.originalResourceId,
      product.id
    ].filter(Boolean).map(String)));

    const optionFilters = [];
    candidateIds.forEach((idValue) => {
      optionFilters.push({ resourceId: { startsWith: `${idValue}-` } });
      optionFilters.push({ resourceId: { endsWith: `-${idValue}` } });
      optionFilters.push({
        contentFields: {
          path: '$.productId',
          equals: idValue
        }
      });
    });

    const gidForFilter = stableGid || product.gid;
    if (gidForFilter) {
      optionFilters.push({
        contentFields: {
          path: '$.productGid',
          equals: gidForFilter
        }
      });
    }

    const optionWhereClause = {
      shopId: product.shopId,
      resourceType: { in: optionTypes }
    };

    if (optionFilters.length > 0) {
      optionWhereClause.OR = optionFilters;
    }

    let existingOptions = [];

    // 尝试从数据库查询，如果失败则使用GraphQL回退
    try {
      existingOptions = await prisma.resource.findMany({
        where: optionWhereClause
      });
      logger.debug(`数据库查询到 ${existingOptions.length} 个产品选项`);
    } catch (dbError) {
      logger.warn(`Prisma查询产品选项失败(SQLite JSON限制): ${dbError.message}`);

      if (admin) {
        try {
          logger.info(`尝试通过GraphQL获取产品选项: ${product.gid}`);
          const remoteOptions = await fetchOptionsForProduct(admin, product.gid);
          existingOptions = remoteOptions.map((option, index) => {
            const resourceId = buildDerivedResourceId(product, 'option', index);
            return {
              id: `${resourceId}-temp`,
              resourceId,
              resourceType: 'PRODUCT_OPTION',
              shopId: product.shopId,
              title: option.name || '',
              contentFields: {
                name: option.name || '',
                values: Array.isArray(option.values) ? option.values : [],
                productId: stableId || product.id || null,
                productResourceId: product.resourceId || product.originalResourceId || null,
                productGid: gidForFilter || null,
                optionName: option.name || '',
                legacyProductId: product.id || null
              },
              isTemporary: true
            };
          });

          logger.info(`GraphQL成功获取 ${existingOptions.length} 个产品选项`);
        } catch (graphqlError) {
          logger.error(`GraphQL获取产品选项也失败: ${graphqlError.message}`);
        }
      } else {
        logger.warn('无admin客户端，无法执行GraphQL回退');
      }
    }

    // 如果数据库查询成功但结果为空，且有admin客户端，也尝试GraphQL
    if (existingOptions.length === 0 && admin) {
      try {
        logger.info(`数据库无选项记录，尝试通过GraphQL获取: ${product.id}`);
        const remoteOptions = await fetchOptionsForProduct(admin, product.gid);
        existingOptions = remoteOptions.map((option, index) => {
          const resourceId = buildDerivedResourceId(product, 'option', index);
          return {
            id: `${resourceId}-temp`,
            resourceId,
            resourceType: 'PRODUCT_OPTION',
            shopId: product.shopId,
            title: option.name || '',
            contentFields: {
              name: option.name || '',
              values: Array.isArray(option.values) ? option.values : [],
              productId: stableId || product.id || null,
              productResourceId: product.resourceId || product.originalResourceId || null,
              productGid: gidForFilter || null,
              optionName: option.name || '',
              legacyProductId: product.id || null
            },
            isTemporary: true
          };
        });
        logger.info(`GraphQL获取到 ${existingOptions.length} 个产品选项`);
      } catch (fallbackError) {
        logger.warn(`GraphQL获取产品选项失败: ${product.id}`, {
          productId: product.id,
          error: fallbackError.message
        });
      }
    }

    if (!existingOptions || existingOptions.length === 0) {
      logger.debug(`产品 ${product.id} 没有找到关联的选项资源`);
      return;
    }

    const isStableMatch = (option) => {
      const content = option.contentFields || {};
      const optionRid = option.resourceId || option.id || '';
      return Boolean(
        (stableGid && content.productGid === stableGid) ||
        (stableId && (content.productId === stableId || optionRid.includes(stableId)))
      );
    };

    const matchesProduct = (option) => {
      const content = option.contentFields || {};
      if (isStableMatch(option)) return true;
      if (!stableId && product.id) {
        const optionRid = option.resourceId || option.id || '';
        return content.productId === product.id || optionRid.includes(product.id);
      }
      return false;
    };

    existingOptions = existingOptions.filter(matchesProduct);
    if (existingOptions.length === 0) {
      logger.debug(`产品 ${product.id} 的选项记录未匹配到当前标识`);
      return;
    }

    existingOptions.sort((a, b) => (isStableMatch(a) === isStableMatch(b) ? 0 : (isStableMatch(a) ? -1 : 1)));

    const dedupeMap = new Map();
    for (const option of existingOptions) {
      const content = option.contentFields || {};
      const baseName = (content.optionName || content.name || option.title || '').toLowerCase();
      const valuesSignature = JSON.stringify(content.values || []);
      const scope = content.productGid || stableGid || '';
      const key = `${scope}::${baseName}::${valuesSignature}`;
      if (!dedupeMap.has(key)) {
        dedupeMap.set(key, option);
      }
    }
    existingOptions = Array.from(dedupeMap.values());

    logger.info(`发现 ${existingOptions.length} 个产品选项，开始翻译`, {
      productId: product.id,
      optionCount: existingOptions.length
    });

    const forceTranslation = product.forceRelatedTranslation || product.userRequested;
    const { saveTranslation, saveResources } = await import('./database.server.js');

    for (const [index, option] of existingOptions.entries()) {
      try {
        const desiredResourceId = buildDerivedResourceId(product, 'option', index);
        let optionResourceId = option.id;
        const updatedContentFields = {
          ...(option.contentFields || {}),
          productId: stableId || product.id,
          productResourceId: product.resourceId || product.originalResourceId || null,
          productGid: gidForFilter || null,
          optionName: option.title || option.contentFields?.name || '',
          legacyProductId: product.id || null
        };

        if (option.isTemporary) {
          logger.debug(`保存临时Options资源到数据库: ${desiredResourceId}`);

          const resourceToSave = [{
            id: option.id && !option.id.endsWith('-temp') ? option.id : undefined,
            resourceType: 'PRODUCT_OPTION',
            gid: option.id,
            title: option.title || '',
            description: option.contentFields?.name || '',
            contentFields: updatedContentFields,
            resourceId: desiredResourceId
          }];

          const savedResources = await saveResources(product.shopId, resourceToSave);
          optionResourceId = savedResources[0].id;
          logger.debug(`临时Options资源保存成功，数据库ID: ${optionResourceId}`);
        } else {
          optionResourceId = option.id;

          const resourceToSave = [{
            id: option.id,
            resourceType: option.resourceType || 'PRODUCT_OPTION',
            gid: option.gid || option.id,
            title: option.title || '',
            description: option.contentFields?.name || '',
            contentFields: updatedContentFields,
            resourceId: option.resourceId || desiredResourceId
          }];

          await saveResources(product.shopId, resourceToSave);
        }

        const optionInput = {
          ...option,
          resourceType: option.resourceType || 'PRODUCT_OPTION',
          userRequested: forceTranslation || option.userRequested || false,
          resourceId: option.resourceId || desiredResourceId,
          contentFields: updatedContentFields
        };

        const translations = await translateResource(optionInput, targetLang);
        await saveTranslation(optionResourceId, product.shopId, targetLang, translations);

        logger.debug(`选项翻译并保存完成: ${option.title || optionInput.resourceId}`);
      } catch (error) {
        logger.error(`选项翻译失败: ${option.id}`, {
          optionId: option.id,
          error: error.message
        });
      }
    }

    logger.info(`产品选项翻译完成: ${product.id}`, {
      productId: product.id,
      translatedCount: existingOptions.length
    });

  } catch (error) {
    logger.error(`产品选项翻译过程失败: ${product.id}`, {
      productId: product.id,
      error: error.message
    });
    throw new Error(`产品选项翻译失败: ${error.message}`);
  }
}

/**
 * 翻译产品元字段（如果存在）
 * @param {Object} product - 产品资源对象
 * @param {string} targetLang - 目标语言
 * @param {Object} admin - Shopify Admin API客户端
 */
async function translateProductMetafieldsIfExists(product, targetLang, admin) {
  try {
    logger.debug(`检查产品metafields: ${product.id}`);

    const { stableId, stableGid } = resolveProductIdentifiers(product);

    // 1. 获取产品的所有metafields
    const metafields = await fetchMetafieldsForProduct(admin, product.gid);

    if (!metafields || metafields.length === 0) {
      logger.debug(`产品 ${product.id} 没有metafields`);
      return;
    }

    logger.info(`发现 ${metafields.length} 个产品metafields，开始分析`, {
      productId: product.id,
      metafieldCount: metafields.length
    });

    const { analyzeMetafields } = await import('../utils/metafields.js');

    const analysis = analyzeMetafields(metafields);
    const forceTranslation = product.forceRelatedTranslation || product.userRequested;
    let translatableMetafields = analysis.results.filter(result => result.decision.translate);

    if (forceTranslation && translatableMetafields.length === 0) {
      translatableMetafields = metafields.map((metafield) => ({
        id: metafield.id,
        namespace: metafield.namespace,
        key: metafield.key
      }));
    }

    if (translatableMetafields.length === 0) {
      logger.info(`产品 ${product.id} 的 ${metafields.length} 个metafields都不需要翻译`, {
        productId: product.id,
        skippedReasons: analysis.stats.byReason
      });
      return;
    }

    logger.info(`将翻译 ${translatableMetafields.length} 个metafields`, {
      productId: product.id,
      translatableCount: translatableMetafields.length,
      totalCount: metafields.length
    });

    const { translateText } = await import('./translation.server.js');
    const { saveTranslation, saveResources } = await import('./database.server.js');

    let successCount = 0;
    let failedCount = 0;

    for (const metafieldResult of translatableMetafields) {
      try {
        const metafield = metafields.find(m => m.id === metafieldResult.id) || metafieldResult;
        if (!metafield) continue;

        const translatedValue = await translateText(metafield.value, targetLang);

        const derivedId = buildDerivedResourceId(product, 'metafield', `${metafield.namespace}-${metafield.key}`);
        const metafieldResources = [{
          id: derivedId,
          resourceType: 'PRODUCT_METAFIELD',
          gid: metafield.id,
          title: `${metafield.namespace}.${metafield.key}`,
          description: metafield.value,
          contentFields: {
            namespace: metafield.namespace,
            key: metafield.key,
            type: metafield.type,
            value: metafield.value,
            productId: stableId || product.id,
            productResourceId: product.resourceId || product.originalResourceId || null,
            productGid: stableGid || product.gid || null,
            legacyProductId: product.id || null
          }
        }];

        const savedMetafields = await saveResources(product.shopId, metafieldResources);
        const metafieldResource = savedMetafields[0];

        const translations = {
          titleTrans: `${metafield.namespace}.${metafield.key}`,
          descTrans: translatedValue,
          translationFields: {
            value: translatedValue
          }
        };

        await saveTranslation(metafieldResource.id, product.shopId, targetLang, translations);

        successCount++;
        logger.debug(`Metafield翻译并保存完成: ${metafield.namespace}.${metafield.key}`);
      } catch (error) {
        failedCount++;
        logger.error(`Metafield翻译失败: ${metafieldResult.namespace}.${metafieldResult.key}`, {
          error: error.message
        });
      }
    }

    logger.info(`产品metafields翻译完成: ${product.id}`, {
      productId: product.id,
      successCount,
      failedCount,
      totalAttempted: translatableMetafields.length
    });

  } catch (error) {
    logger.error(`产品metafields翻译过程失败: ${product.id}`, {
      productId: product.id,
      error: error.message
    });
    throw new Error(`产品metafields翻译失败: ${error.message}`);
  }
}

/**
 * 检查是否启用了关联翻译
 * @returns {boolean} 是否启用
 */
export function isRelatedTranslationEnabled() {
  return RELATED_TRANSLATION_CONFIG.enabled;
}

/**
 * 获取关联翻译配置
 * @returns {Object} 配置对象
 */
export function getRelatedTranslationConfig() {
  return { ...RELATED_TRANSLATION_CONFIG };
}
