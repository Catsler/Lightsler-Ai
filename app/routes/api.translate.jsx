import { authenticate } from "../shopify.server.js";
import { translateResourceWithLogging, getTranslationStats, translationLogger } from "../services/translation.server.js";
import { translateThemeResource } from "../services/theme-translation.server.js";
import { updateResourceTranslation } from "../services/shopify-graphql.server.js";
import { getOrCreateShop, saveTranslation, updateResourceStatus, getAllResources } from "../services/database.server.js";
import { successResponse, withErrorHandling, validateRequiredParams, validationErrorResponse } from "../utils/api-response.server.js";

export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    
    // 参数验证
    const params = {
      language: formData.get("language") || "zh-CN",
      resourceIds: formData.get("resourceIds") || "[]",
      clearCache: formData.get("clearCache") === "true"
    };
    
    const validationErrors = validateRequiredParams(params, ['language']);
    if (validationErrors.length > 0) {
      return validationErrorResponse(validationErrors);
    }
    
    const targetLanguage = params.language;
    const clearCache = params.clearCache;
    let resourceIds;
    try {
      resourceIds = JSON.parse(params.resourceIds);
    } catch (error) {
      return validationErrorResponse([{
        field: 'resourceIds',
        message: 'resourceIds 必须是有效的JSON格式'
      }]);
    }
    
    // 获取店铺记录
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    // 获取所有资源
    const allResources = await getAllResources(shop.id);
    
    // 筛选要翻译的资源 - 必须明确指定资源ID
    if (resourceIds.length === 0) {
      return validationErrorResponse([{
        field: 'resourceIds',
        message: '请选择要翻译的资源，不能为空'
      }]);
    }
    
    const resourcesToTranslate = allResources.filter(r => resourceIds.includes(r.id));
    
    console.log('翻译请求详情:', {
      targetLanguage,
      selectedResourceIds: resourceIds,
      foundResources: resourcesToTranslate.map(r => ({ id: r.id, title: r.title, status: r.status })),
      clearCache
    });
    
    if (resourcesToTranslate.length === 0) {
      return successResponse({
        results: [],
        stats: { total: 0, success: 0, failure: 0 }
      }, "没有找到需要翻译的资源");
    }
    
    // 如果需要清除缓存，先删除现有的翻译记录
    if (clearCache) {
      console.log('清除缓存：删除现有翻译记录');
      const { deleteTranslations } = await import("../services/database.server.js");
      
      for (const resource of resourcesToTranslate) {
        try {
          await deleteTranslations(resource.id, targetLanguage);
          console.log(`已清除资源 ${resource.id} 的 ${targetLanguage} 翻译缓存`);
        } catch (error) {
          console.error(`清除资源 ${resource.id} 缓存失败:`, error);
        }
      }
    }
    
    const results = [];
    
    for (const resource of resourcesToTranslate) {
      try {
        // 更新资源状态为处理中
        await updateResourceStatus(resource.id, 'processing');
        
        // 翻译资源内容（根据资源类型选择合适的翻译函数）
        let translations;
        
        // Theme相关资源和其他新资源类型使用专门的翻译函数
        const themeResourceTypes = [
          'ONLINE_STORE_THEME',
          'ONLINE_STORE_THEME_APP_EMBED',
          'ONLINE_STORE_THEME_JSON_TEMPLATE',
          'ONLINE_STORE_THEME_LOCALE_CONTENT',
          'ONLINE_STORE_THEME_SECTION_GROUP',
          'ONLINE_STORE_THEME_SETTINGS_CATEGORY',
          'ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS',
          'PRODUCT_OPTION',
          'PRODUCT_OPTION_VALUE',
          'SELLING_PLAN',
          'SELLING_PLAN_GROUP',
          'SHOP',
          'SHOP_POLICY'
        ];
        
        if (themeResourceTypes.includes(resource.resourceType)) {
          console.log(`使用Theme资源翻译函数处理: ${resource.resourceType}`);
          translations = await translateThemeResource(resource, targetLanguage);
        } else {
          // 使用标准翻译函数
          translations = await translateResourceWithLogging(resource, targetLanguage);
        }
        
        // 保存翻译结果到数据库
        await saveTranslation(resource.id, shop.id, targetLanguage, translations);
        
        // 使用保存的GID
        const gid = resource.gid;
        
        // 更新到Shopify - 使用通用函数
        const updateResult = await updateResourceTranslation(
          admin, 
          gid, 
          translations, 
          targetLanguage,
          resource.resourceType.toUpperCase()
        );
        
        // 更新资源状态为完成
        await updateResourceStatus(resource.id, 'completed');
        
        results.push({
          resourceId: resource.id,
          resourceType: resource.resourceType,
          title: resource.title,
          success: true,
          translations: translations
        });
        
      } catch (error) {
        console.error(`翻译资源 ${resource.id} 失败:`, error);
        
        // 更新资源状态为待处理
        await updateResourceStatus(resource.id, 'pending');
        
        results.push({
          resourceId: resource.id,
          resourceType: resource.resourceType,
          title: resource.title,
          success: false,
          error: error.message
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    // 获取翻译统计和日志
    const translationStats = getTranslationStats();
    const recentLogs = translationLogger.getRecentLogs(10);
    
    return successResponse({
      results: results,
      stats: {
        total: results.length,
        success: successCount,
        failure: failureCount
      },
      translationStats: translationStats,
      recentLogs: recentLogs
    }, `翻译完成: ${successCount} 成功, ${failureCount} 失败`);
    
  }, "批量翻译", request.headers.get("shopify-shop-domain") || "");
};