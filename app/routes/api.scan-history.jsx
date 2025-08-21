import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server.js";
import { prisma } from "../db.server.js";
import { withErrorHandling } from "../utils/api-response.server.js";

/**
 * 获取扫描历史
 */
export const loader = withErrorHandling(async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  
  console.log(`[ScanHistory API] 获取扫描历史 - 店铺: ${shopId}`);
  
  // 获取所有扫描历史记录
  const history = await prisma.scanHistory.findMany({
    where: { shopId },
    select: {
      language: true,
      lastScanned: true,
      resourceCount: true,
      status: true,
      scanDuration: true
    }
  });
  
  // 转换为对象格式，方便前端使用
  const historyMap = {};
  history.forEach(h => {
    historyMap[h.language] = {
      lastScanned: h.lastScanned.toISOString(),
      resourceCount: h.resourceCount,
      status: h.status,
      scanDuration: h.scanDuration
    };
  });
  
  console.log(`[ScanHistory API] 返回 ${history.length} 条历史记录`);
  
  return json({ 
    success: true, 
    data: historyMap 
  });
});

/**
 * 更新扫描历史
 */
export const action = withErrorHandling(async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  
  const formData = await request.formData();
  const language = formData.get('language');
  const resourceCount = parseInt(formData.get('resourceCount') || '0');
  const status = formData.get('status') || 'completed';
  const scanDuration = formData.get('scanDuration') ? 
    parseInt(formData.get('scanDuration')) : null;
  
  console.log(`[ScanHistory API] 更新扫描历史 - 店铺: ${shopId}, 语言: ${language}`);
  
  // 使用 upsert 创建或更新记录
  const scanHistory = await prisma.scanHistory.upsert({
    where: {
      shopId_language: {
        shopId,
        language
      }
    },
    update: {
      lastScanned: new Date(),
      resourceCount,
      status,
      scanDuration,
      updatedAt: new Date()
    },
    create: {
      shopId,
      language,
      resourceCount,
      status,
      scanDuration
    }
  });
  
  console.log(`[ScanHistory API] 扫描历史已更新:`, {
    language,
    resourceCount,
    status,
    lastScanned: scanHistory.lastScanned
  });
  
  return json({ 
    success: true, 
    data: {
      language: scanHistory.language,
      lastScanned: scanHistory.lastScanned.toISOString(),
      resourceCount: scanHistory.resourceCount,
      status: scanHistory.status,
      scanDuration: scanHistory.scanDuration
    }
  });
});

/**
 * 删除扫描历史（可选功能）
 */
export const DELETE = withErrorHandling(async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopId = session.shop;
  
  const url = new URL(request.url);
  const language = url.searchParams.get('language');
  
  if (language) {
    // 删除特定语言的历史
    await prisma.scanHistory.deleteMany({
      where: {
        shopId,
        language
      }
    });
    
    console.log(`[ScanHistory API] 删除 ${language} 的扫描历史`);
    
    return json({ 
      success: true, 
      message: `已删除 ${language} 的扫描历史` 
    });
  } else {
    // 删除所有历史
    await prisma.scanHistory.deleteMany({
      where: { shopId }
    });
    
    console.log(`[ScanHistory API] 删除所有扫描历史`);
    
    return json({ 
      success: true, 
      message: '已删除所有扫描历史' 
    });
  }
});