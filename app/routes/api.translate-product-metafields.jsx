import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { withErrorHandling, successResponse, validationErrorResponse, validateRequiredParams } from "../utils/api-response.server.js";
import { translateText } from "../services/translation.server.js";

// 可翻译的metafield类型白名单
const TRANSLATABLE_METAFIELD_TYPES = [
  'single_line_text_field',
  'multi_line_text_field',
  'rich_text'
];

export const action = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  // 参数验证
  const params = {
    productGid: formData.get("productGid"),
    targetLanguage: formData.get("targetLanguage") || "zh-CN"
  };

  const validationErrors = validateRequiredParams(params, ['productGid', 'targetLanguage']);
  if (validationErrors.length > 0) {
    return validationErrorResponse(validationErrors);
  }

  const { productGid, targetLanguage } = params;

  try {
    console.log(`🚀 开始翻译产品metafields: ${productGid} -> ${targetLanguage}`);

    // 动态导入服务函数
    const { fetchMetafieldsForProduct, updateMetafieldTranslation } = await import("../services/shopify-graphql.server.js");

    // 第一步：获取产品的所有metafields
    console.log('📋 第一步：获取产品metafields...');
    const allMetafields = await fetchMetafieldsForProduct(admin, productGid);
    console.log(`✅ 获取到 ${allMetafields.length} 个metafields`);

    // 第二步：过滤可翻译的metafields
    const translatableMetafields = allMetafields.filter(metafield =>
      TRANSLATABLE_METAFIELD_TYPES.includes(metafield.type) &&
      metafield.value &&
      metafield.value.trim().length > 0
    );

    console.log(`🔍 过滤后的可翻译metafields: ${translatableMetafields.length} 个`);
    console.log('📝 可翻译metafields详情:', translatableMetafields.map(m => ({
      id: m.id,
      namespace: m.namespace,
      key: m.key,
      type: m.type,
      valuePreview: m.value.substring(0, 50) + '...'
    })));

    if (translatableMetafields.length === 0) {
      return successResponse({
        message: '没有找到可翻译的metafields',
        stats: { total: allMetafields.length, translatable: 0, success: 0, failed: 0 },
        details: {
          allTypes: [...new Set(allMetafields.map(m => m.type))],
          supportedTypes: TRANSLATABLE_METAFIELD_TYPES
        }
      });
    }

    // 第三步：翻译每个metafield
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    console.log('🔄 第三步：开始翻译metafields...');

    for (const metafield of translatableMetafields) {
      try {
        console.log(`🔧 翻译metafield: ${metafield.namespace}.${metafield.key} (${metafield.type})`);

        // 翻译内容
        let translatedValue;
        if (metafield.type === 'rich_text') {
          // 对于富文本，使用HTML保护的翻译
          const { translateTextEnhanced } = await import("../services/translation.server.js");
          translatedValue = await translateTextEnhanced(metafield.value, targetLanguage);
        } else {
          // 对于纯文本字段
          translatedValue = await translateText(metafield.value, targetLanguage);
        }

        console.log(`✅ 翻译完成: ${metafield.value.substring(0, 50)}... -> ${translatedValue.substring(0, 50)}...`);

        // 注册翻译到Shopify
        const registerResult = await updateMetafieldTranslation(
          admin,
          metafield.id,
          translatedValue,
          targetLanguage
        );

        results.push({
          metafieldId: metafield.id,
          namespace: metafield.namespace,
          key: metafield.key,
          type: metafield.type,
          originalValue: metafield.value,
          translatedValue,
          success: registerResult.success,
          message: registerResult.message,
          errors: registerResult.errors || null
        });

        if (registerResult.success) {
          successCount++;
          console.log(`✅ Metafield ${metafield.namespace}.${metafield.key} 翻译成功`);
        } else {
          failedCount++;
          console.error(`❌ Metafield ${metafield.namespace}.${metafield.key} 翻译失败:`, registerResult.message);
        }

      } catch (error) {
        failedCount++;
        console.error(`❌ 翻译metafield ${metafield.namespace}.${metafield.key} 时出错:`, error);
        results.push({
          metafieldId: metafield.id,
          namespace: metafield.namespace,
          key: metafield.key,
          type: metafield.type,
          originalValue: metafield.value,
          translatedValue: null,
          success: false,
          message: `翻译失败: ${error.message}`,
          errors: [{ message: error.message }]
        });
      }
    }

    // 返回结果
    const stats = {
      total: allMetafields.length,
      translatable: translatableMetafields.length,
      success: successCount,
      failed: failedCount
    };

    console.log(`🎯 翻译完成，统计信息:`, stats);

    return successResponse({
      message: `Metafields翻译完成：成功 ${successCount} 个，失败 ${failedCount} 个`,
      stats,
      results,
      details: {
        productGid,
        targetLanguage,
        supportedTypes: TRANSLATABLE_METAFIELD_TYPES
      }
    });

  } catch (error) {
    console.error('❌ translate-product-metafields API错误:', error);
    return json({
      success: false,
      message: `翻译产品metafields失败: ${error.message}`,
      error: error.message
    }, { status: 500 });
  }
}, "translate product metafields");