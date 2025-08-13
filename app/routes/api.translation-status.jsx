/**
 * API端点：查询翻译状态
 * 提供翻译和同步的详细状态信息
 */

import { json } from "@remix-run/node";
import prisma from "../db.server.js";
import { getSyncStatusStats } from "../services/sync-to-shopify.server.js";
import { withErrorHandling } from "../utils/api-response.server.js";

/**
 * GET请求：获取翻译和同步状态统计
 */
export async function loader({ request }) {
  return withErrorHandling(async () => {
    const { authenticate } = await import("../shopify.server.js");
    const { session } = await authenticate.admin(request);
    
    const shopId = session.shop;
    const url = new URL(request.url);
    const detailed = url.searchParams.get("detailed") === "true";
    
    // 获取同步状态统计
    const syncStats = await getSyncStatusStats(shopId);
    
    // 获取翻译状态统计
    const [totalResources, translatedResources, pendingResources] = await Promise.all([
      prisma.resource.count({ where: { shopId } }),
      prisma.resource.count({
        where: {
          shopId,
          translations: {
            some: {
              status: 'completed'
            }
          }
        }
      }),
      prisma.resource.count({
        where: {
          shopId,
          status: 'pending'
        }
      })
    ]);
    
    // 按资源类型统计
    const resourceTypeStats = await prisma.resource.groupBy({
      by: ['resourceType'],
      where: { shopId },
      _count: {
        id: true
      }
    });
    
    // 按语言统计
    const languageStats = await prisma.translation.groupBy({
      by: ['language'],
      where: { 
        shopId,
        status: 'completed'
      },
      _count: {
        id: true
      }
    });
    
    const result = {
      success: true,
      stats: {
        resources: {
          total: totalResources,
          translated: translatedResources,
          pending: pendingResources,
          percentage: totalResources > 0 
            ? Math.round((translatedResources / totalResources) * 100) 
            : 0
        },
        sync: syncStats,
        byResourceType: resourceTypeStats.reduce((acc, item) => {
          acc[item.resourceType] = item._count.id;
          return acc;
        }, {}),
        byLanguage: languageStats.reduce((acc, item) => {
          acc[item.language] = item._count.id;
          return acc;
        }, {})
      }
    };
    
    // 如果需要详细信息，添加最近的翻译记录
    if (detailed) {
      const recentTranslations = await prisma.translation.findMany({
        where: { shopId },
        include: {
          resource: {
            select: {
              title: true,
              resourceType: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });
      
      const failedSync = await prisma.translation.findMany({
        where: { 
          shopId,
          syncStatus: 'failed'
        },
        include: {
          resource: {
            select: {
              title: true,
              resourceType: true,
              gid: true
            }
          }
        },
        take: 10
      });
      
      result.detailed = {
        recentTranslations: recentTranslations.map(t => ({
          id: t.id,
          resourceTitle: t.resource.title,
          resourceType: t.resource.resourceType,
          language: t.language,
          status: t.status,
          syncStatus: t.syncStatus,
          createdAt: t.createdAt
        })),
        failedSync: failedSync.map(t => ({
          id: t.id,
          resourceTitle: t.resource.title,
          resourceType: t.resource.resourceType,
          resourceGid: t.resource.gid,
          language: t.language,
          syncError: t.syncError,
          createdAt: t.createdAt
        }))
      };
    }
    
    return json(result);
  });
}