import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { getOrCreateShop, saveResources } from "../services/database.server.js";
import { withErrorHandling } from "../utils/api-response.server.js";

// 全局进度存储
if (!global.scanProgress) {
  global.scanProgress = {};
}

/**
 * 简化的智能扫描API
 * 基于scan-all的逻辑，添加进度跟踪
 */
export const action = async ({ request }) => {
  return withErrorHandling(async () => {
    // 动态导入避免Vite构建错误
    const { 
      fetchResourcesByType,
      fetchThemeResources,
      fetchProductOptions,
      fetchSellingPlans,
      fetchShopInfo,
      RESOURCE_TYPES 
    } = await import("../services/shopify-graphql.server.js");
    
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const language = formData.get('language') || 'zh-CN';
    
    // 生成会话ID
    const sessionId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    
    console.log(`[Sequential Scan] 开始扫描 - 店铺: ${session.shop}, 语言: ${language}`);
    
    // 初始化进度
    global.scanProgress[sessionId] = {
      progress: 0,
      phase: 'scanning',
      scannedResources: 0,
      totalResources: 0,
      currentResource: null,
      thinkingChain: []
    };
    
    const updateProgress = (updates) => {
      if (global.scanProgress[sessionId]) {
        global.scanProgress[sessionId] = {
          ...global.scanProgress[sessionId],
          ...updates
        };
      }
    };
    
    // 定义要扫描的主要资源类型
    const mainResourceTypes = [
      'PRODUCT',
      'COLLECTION',
      'ARTICLE',
      'BLOG',
      'PAGE',
      'MENU',
      'LINK',
      'FILTER'
    ];
    
    const scanResults = {
      success: [],
      failed: [],
      total: 0,
      byType: {},
      categories: {}
    };
    
    updateProgress({ 
      phase: 'scanning', 
      progress: 10,
      thinkingChain: [{ thought: '开始扫描资源' }]
    });
    
    // 计算进度增量
    const progressIncrement = 70 / mainResourceTypes.length;
    let currentProgress = 10;
    
    // 扫描主要资源类型
    for (const resourceType of mainResourceTypes) {
      updateProgress({
        currentResource: { title: resourceType },
        progress: currentProgress
      });
      
      try {
        console.log(`[Sequential Scan] 正在扫描 ${resourceType}...`);
        const resources = await fetchResourcesByType(admin, resourceType);
        
        if (resources && resources.length > 0) {
          await saveResources(shop.id, resources);
          scanResults.byType[resourceType] = resources.length;
          scanResults.total += resources.length;
          scanResults.success.push({
            type: resourceType,
            count: resources.length
          });
          console.log(`✓ ${resourceType}: 扫描并保存了 ${resources.length} 个资源`);
        } else {
          console.log(`✓ ${resourceType}: 没有找到资源`);
        }
      } catch (error) {
        console.error(`✗ ${resourceType} 扫描失败:`, error);
        scanResults.failed.push({
          type: resourceType,
          error: error.message
        });
      }
      
      currentProgress += progressIncrement;
      updateProgress({
        scannedResources: scanResults.total,
        totalResources: scanResults.total,
        progress: Math.min(currentProgress, 85)
      });
    }
    
    // 扫描主题相关资源
    updateProgress({ 
      currentResource: { title: 'THEME' },
      progress: 90
    });
    
    try {
      console.log(`[Sequential Scan] 正在扫描主题资源...`);
      const themeResources = await fetchThemeResources(admin, 'ONLINE_STORE_THEME');
      if (themeResources && themeResources.length > 0) {
        await saveResources(shop.id, themeResources);
        scanResults.byType['THEME'] = themeResources.length;
        scanResults.total += themeResources.length;
      }
    } catch (error) {
      console.error(`✗ THEME 扫描失败:`, error);
    }
    
    // 完成
    updateProgress({ 
      phase: 'completing',
      progress: 100,
      stats: scanResults,
      thinkingChain: [
        { thought: '开始扫描资源' },
        { thought: `扫描完成，共 ${scanResults.total} 个资源` }
      ]
    });
    
    // 延迟清理进度（让前端有时间获取最终状态）
    setTimeout(() => {
      delete global.scanProgress[sessionId];
    }, 60000); // 60秒后清理
    
    console.log(`[Sequential Scan] 扫描完成:`, scanResults);
    
    return json({
      success: true,
      message: `扫描完成！共扫描 ${scanResults.total} 个资源`,
      data: {
        sessionId,
        stats: scanResults,
        thinkingChain: [
          { thought: '开始扫描资源' },
          { thought: `扫描完成，共 ${scanResults.total} 个资源` }
        ]
      }
    });
  }, "扫描资源", request.headers.get("shopify-shop-domain") || "");
};

/**
 * 获取扫描进度
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  
  if (!sessionId || !global.scanProgress?.[sessionId]) {
    return json({ 
      success: false, 
      error: '会话不存在或已过期' 
    });
  }
  
  return json({
    success: true,
    data: global.scanProgress[sessionId]
  });
};