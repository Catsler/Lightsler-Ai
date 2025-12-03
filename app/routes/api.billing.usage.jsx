import { createApiRoute } from "../utils/base-route.server.js";
import prisma from "../db.server.js";

const DAYS_RANGE = 30;

async function handleGetUsage({ session }) {
  const shopId = session.shop;
  const since = new Date(Date.now() - DAYS_RANGE * 24 * 60 * 60 * 1000);

  const [byLanguage, byResourceType, topResources, recentCount, lifetimeCount] = await Promise.all([
    prisma.creditUsage.groupBy({
      by: ['targetLanguage'],
      where: {
        shopId,
        usageDate: { gte: since },
        status: 'completed'
      },
      _sum: { creditsUsed: true },
      orderBy: { _sum: { creditsUsed: 'desc' } }
    }),
    prisma.creditUsage.groupBy({
      by: ['resourceType'],
      where: {
        shopId,
        usageDate: { gte: since },
        status: 'completed'
      },
      _sum: { creditsUsed: true },
      orderBy: { _sum: { creditsUsed: 'desc' } }
    }),
    prisma.creditUsage.groupBy({
      by: ['resourceType', 'resourceId'],
      where: {
        shopId,
        usageDate: { gte: since },
        status: 'completed'
      },
      _sum: { creditsUsed: true },
      orderBy: { _sum: { creditsUsed: 'desc' } },
      take: 10
    }),
    prisma.creditUsage.count({
      where: {
        shopId,
        usageDate: { gte: since },
        status: 'completed'
      }
    }),
    prisma.creditUsage.count({
      where: {
        shopId,
        status: 'completed'
      }
    })
  ]);

  const totalLanguageCredits = byLanguage.reduce((sum, item) => sum + (item._sum.creditsUsed || 0), 0);
  const totalResourceCredits = byResourceType.reduce((sum, item) => sum + (item._sum.creditsUsed || 0), 0);

  return {
    rangeDays: DAYS_RANGE,
    hasAnyHistory: lifetimeCount > 0,
    totalTranslations: recentCount,
    byLanguage: byLanguage.map((item) => ({
      language: item.targetLanguage || 'unknown',
      credits: item._sum.creditsUsed || 0,
      percentage: totalLanguageCredits > 0 ? Math.round(((item._sum.creditsUsed || 0) / totalLanguageCredits) * 100) : 0
    })),
    byResourceType: byResourceType.map((item) => ({
      resourceType: item.resourceType || 'UNKNOWN',
      credits: item._sum.creditsUsed || 0,
      percentage: totalResourceCredits > 0 ? Math.round(((item._sum.creditsUsed || 0) / totalResourceCredits) * 100) : 0
    })),
    topResources: topResources.map((item) => ({
      resourceType: item.resourceType || 'UNKNOWN',
      resourceId: item.resourceId || 'unknown',
      credits: item._sum.creditsUsed || 0
    }))
  };
}

export const loader = createApiRoute(handleGetUsage, {
  requireAuth: true,
  operationName: 'billing:usage',
  metricKey: 'billing.usage.loader'
});
