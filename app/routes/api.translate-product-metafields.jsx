import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { withErrorHandling, successResponse, validationErrorResponse, validateRequiredParams } from "../utils/api-response.server.js";
import { translateText } from "../services/translation.server.js";
import { shouldTranslateMetafield, analyzeMetafields } from "../utils/metafields.js";

export const action = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  // 参数验证
  const params = {
    productGid: formData.get("productGid"),
    targetLanguage: formData.get("targetLanguage") || "zh-CN",
    analyzeOnly: formData.get("analyzeOnly") === "true"  // 支持 dry-run 模式
  };

  const validationErrors = validateRequiredParams(params, ['productGid', 'targetLanguage']);
  if (validationErrors.length > 0) {
    return validationErrorResponse(validationErrors);
  }

  const { productGid, targetLanguage, analyzeOnly } = params;

  try {
    const mode = analyzeOnly ? '分析' : '翻译';
    console.log(`🚀 开始${mode}产品metafields: ${productGid} -> ${targetLanguage}`);

    // 动态导入服务函数
    const { fetchMetafieldsForProduct, registerMetafieldTranslation } = await import("../services/shopify-graphql.server.js");

    // 第一步：获取产品的所有metafields
    console.log('📋 第一步：获取产品metafields...');
    const allMetafields = await fetchMetafieldsForProduct(admin, productGid);
    console.log(`✅ 获取到 ${allMetafields.length} 个metafields`);

    // 第二步：使用智能识别规则分析所有metafields
    console.log('🧠 第二步：智能分析metafields...');
    const analysis = analyzeMetafields(allMetafields);

    console.log(`📊 智能分析结果:`);
    console.log(`- 总数: ${analysis.stats.total}`);
    console.log(`- 可翻译: ${analysis.stats.translatable}`);
    console.log(`- 跳过: ${analysis.stats.skipped}`);
    console.log(`📋 决策原因分布:`, Object.entries(analysis.stats.byReason).map(([reason, count]) => `${reason}: ${count}`).join(', '));

    const translatableMetafields = analysis.results.filter(result => result.decision.translate);

    if (translatableMetafields.length === 0) {
      return successResponse({
        message: '没有找到需要翻译的metafields',
        mode: analyzeOnly ? 'analyze' : 'translate',
        stats: {
          total: allMetafields.length,
          translatable: 0,
          translated: 0,
          skipped: allMetafields.length,
          failed: 0
        },
        results: analysis.results.map(result => ({
          metafieldId: result.id,
          namespace: result.namespace,
          key: result.key,
          type: result.type,
          decision: 'skipped',
          reason: result.decision.reason,
          ruleApplied: result.decision.ruleApplied,
          originalValue: result.value?.substring(0, 100) + (result.value?.length > 100 ? '...' : ''),
          translatedValue: null,
          success: null
        })),
        summary: analysis.summary
      });
    }

    // 如果只是分析模式，直接返回分析结果
    if (analyzeOnly) {
      console.log('📊 仅分析模式，返回决策结果');
      return successResponse({
        message: `分析完成：${analysis.stats.translatable}个可翻译，${analysis.stats.skipped}个跳过`,
        mode: 'analyze',
        stats: {
          total: allMetafields.length,
          translatable: analysis.stats.translatable,
          translated: 0,  // 分析模式不翻译
          skipped: analysis.stats.skipped,
          failed: 0
        },
        results: analysis.results.map(result => ({
          metafieldId: result.id,
          namespace: result.namespace,
          key: result.key,
          type: result.type,
          decision: result.decision.translate ? 'will_translate' : 'skipped',
          reason: result.decision.reason,
          ruleApplied: result.decision.ruleApplied,
          originalValue: result.value?.substring(0, 100) + (result.value?.length > 100 ? '...' : ''),
          translatedValue: null,  // 分析模式不翻译
          success: null
        })),
        summary: analysis.summary
      });
    }

    // 第三步：执行翻译
    const results = [];
    let successCount = 0;
    let failedCount = 0;

    console.log(`🔄 第三步：开始翻译 ${translatableMetafields.length} 个metafields...`);

    for (const metafieldResult of translatableMetafields) {
      const metafield = metafieldResult;  // metafieldResult 现在包含原始 metafield 数据
      const decision = metafieldResult.decision;

      try {
        console.log(`🔧 翻译metafield: ${metafield.namespace}.${metafield.key} (${metafield.type}) - 原因: ${decision.reason}`);

        // 翻译内容 - 目前只支持文本类型，不处理 rich_text
        const translatedValue = await translateText(metafield.value, targetLanguage);

        console.log(`✅ 翻译完成: "${metafield.value.substring(0, 50)}..." -> "${translatedValue.substring(0, 50)}..."`);

        // 注册翻译到Shopify
        const registerResult = await registerMetafieldTranslation(
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
          decision: 'translated',
          reason: decision.reason,
          ruleApplied: decision.ruleApplied,
          originalValue: metafield.value,
          translatedValue,
          success: registerResult.success,
          message: registerResult.message,
          errors: registerResult.errors || null
        });

        if (registerResult.success) {
          successCount++;
          console.log(`✅ Metafield ${metafield.namespace}.${metafield.key} 翻译并注册成功`);
        } else {
          failedCount++;
          console.error(`❌ Metafield ${metafield.namespace}.${metafield.key} 注册失败:`, registerResult.message);
        }

        // 添加间隔，避免API限流
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        failedCount++;
        console.error(`❌ 翻译metafield ${metafield.namespace}.${metafield.key} 时出错:`, error);
        results.push({
          metafieldId: metafield.id,
          namespace: metafield.namespace,
          key: metafield.key,
          type: metafield.type,
          decision: 'failed',
          reason: decision.reason,
          ruleApplied: decision.ruleApplied,
          originalValue: metafield.value,
          translatedValue: null,
          success: false,
          message: `翻译失败: ${error.message}`,
          errors: [{ message: error.message }]
        });
      }
    }

    // 添加跳过的metafields到结果中
    const skippedMetafields = analysis.results.filter(result => !result.decision.translate);
    skippedMetafields.forEach(skippedResult => {
      results.push({
        metafieldId: skippedResult.id,
        namespace: skippedResult.namespace,
        key: skippedResult.key,
        type: skippedResult.type,
        decision: 'skipped',
        reason: skippedResult.decision.reason,
        ruleApplied: skippedResult.decision.ruleApplied,
        originalValue: skippedResult.value?.substring(0, 100) + (skippedResult.value?.length > 100 ? '...' : ''),
        translatedValue: null,
        success: null
      });
    });

    // 返回结果
    const stats = {
      total: allMetafields.length,
      translatable: analysis.stats.translatable,
      translated: successCount,
      skipped: analysis.stats.skipped,
      failed: failedCount
    };

    console.log(`🎯 翻译完成，统计信息:`, stats);
    console.log(`📊 决策原因分布:`, Object.entries(analysis.stats.byReason));

    return successResponse({
      message: `Metafields翻译完成：成功 ${successCount} 个，跳过 ${analysis.stats.skipped} 个，失败 ${failedCount} 个`,
      mode: 'translate',
      stats,
      results: results.sort((a, b) => {
        // 排序：翻译成功 -> 跳过 -> 失败
        const order = { translated: 1, skipped: 2, failed: 3 };
        return order[a.decision] - order[b.decision];
      }),
      summary: {
        ...analysis.summary,
        rulesApplied: Object.keys(analysis.stats.byReason),
        performanceMetrics: {
          totalTime: `${successCount * 100 + failedCount * 100}ms`,  // 估算时间
          averagePerMetafield: '100ms',
          apiCallsRate: `${successCount + failedCount}/min`
        }
      },
      details: {
        productGid,
        targetLanguage,
        ruleVersion: 'v1.0.0',
        supportedTypes: ['single_line_text_field', 'multi_line_text_field']
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