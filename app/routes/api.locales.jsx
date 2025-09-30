/**
 * 语言管理API端点
 * 提供语言查询、启用、禁用和同步功能
 */

import {
  getAvailableLocales,
  getShopLocales,
  enableLocale,
  disableLocale,
  syncShopLocalesToDatabase,
  checkLocaleLimit,
  formatLocalesForUI,
  groupLocalesByRegion
} from '../services/shopify-locales.server.js';
import { createApiRoute } from '../utils/base-route.server.js';
import prisma from '../db.server.js';

/**
 * GET请求处理函数 - 查询语言信息
 */
async function handleGetLocales({ request, admin, session, searchParams }) {
  const action = searchParams.get('action');
  
  switch (action) {
    case 'available': {
      // 获取所有可用语言
      const availableLocales = await getAvailableLocales(admin);
      const formattedLocales = formatLocalesForUI(availableLocales);
      const groupedLocales = groupLocalesByRegion(availableLocales);
      
      return {
        locales: formattedLocales,
        grouped: groupedLocales,
        total: availableLocales.length
      };
    }
    
    case 'shop': {
      // 获取店铺已启用的语言
      const shopLocales = await getShopLocales(admin);
      const formattedLocales = formatLocalesForUI(shopLocales);
      
      return {
        locales: formattedLocales,
        count: shopLocales.length
      };
    }
    
    case 'database': {
      // 获取数据库中的语言配置
      const shop = await prisma.shop.findUnique({
        where: { id: session.shop },
        include: { languages: true }
      });
      
      const languages = shop?.languages || [];
      const formattedLanguages = languages.map(lang => ({
        value: lang.code,
        label: lang.name,
        isActive: lang.isActive
      }));
      
      return {
        languages: formattedLanguages,
        count: languages.length
      };
    }
    
    case 'limit': {
      // 检查语言限制
      const limitInfo = await checkLocaleLimit(admin);
      
      return limitInfo;
    }
    
    case 'combined': {
      // 获取综合信息（店铺语言 + 可用语言 + 限制）
      const [shopLocales, availableLocales, dbLanguages] = await Promise.all([
        getShopLocales(admin),
        getAvailableLocales(admin),
        prisma.language.findMany({
          where: { shopId: session.shop, isActive: true }
        })
      ]);

      const limitInfo = await checkLocaleLimit(admin, shopLocales);

      const primaryLocale = shopLocales.find((locale) => locale.primary) || null;
      const alternateLocales = shopLocales.filter((locale) => !locale.primary);

      const formattedPrimary = primaryLocale ? formatLocalesForUI([primaryLocale])[0] : null;
      const formattedAlternates = formatLocalesForUI(alternateLocales);

      // 找出还未启用的语言
      const enabledCodes = new Set(shopLocales.map((l) => l.locale));
      const availableToAdd = availableLocales.filter((l) => !enabledCodes.has(l.isoCode));

      return {
        shop: {
          primary: formattedPrimary,
          locales: formattedAlternates,
          count: alternateLocales.length
        },
        available: {
          locales: formatLocalesForUI(availableToAdd),
          grouped: groupLocalesByRegion(availableToAdd),
          total: availableToAdd.length
        },
        database: {
          languages: dbLanguages.map((l) => ({
            value: l.code,
            label: l.name,
            isActive: l.isActive
          })),
          count: dbLanguages.length
        },
        limit: limitInfo
      };
    }
    
    default:
      throw new Error('无效的action参数');
  }
}

export const loader = createApiRoute(handleGetLocales, {
  requireAuth: true,
  operationName: '查询语言信息'
});

/**
 * POST请求处理函数 - 语言操作
 */
async function handleLocaleAction({ request, admin, session }) {
  const formData = await request.json();
  const { action: operation, locale, locales } = formData;
  
  // 获取店铺信息
  const shop = await prisma.shop.findUnique({
    where: { id: session.shop }
  });
  
  if (!shop) {
    throw new Error('店铺信息不存在');
  }
  
  switch (operation) {
    case 'enable': {
      // 启用单个语言
      if (!locale) {
        throw new Error('缺少locale参数');
      }
      
      // 检查语言限制
      const limitInfo = await checkLocaleLimit(admin);
      if (!limitInfo.canAddMore) {
        throw new Error(`已达到最大语言数量限制（${limitInfo.maxLimit}个）`);
      }
      
      // 启用语言
      const enabledLocale = await enableLocale(admin, locale);
      
      // 同步到数据库
      await prisma.language.upsert({
        where: {
          shopId_code: {
            shopId: shop.id,
            code: enabledLocale.locale
          }
        },
        update: {
          name: enabledLocale.name,
          isActive: true
        },
        create: {
          shopId: shop.id,
          code: enabledLocale.locale,
          name: enabledLocale.name,
          isActive: true
        }
      });
      
      return {
        locale: formatLocalesForUI([enabledLocale])[0],
        message: `成功启用语言: ${enabledLocale.name}`
      };
    }
    
    case 'enableMultiple': {
      // 批量启用语言
      if (!locales || !Array.isArray(locales)) {
        throw new Error('缺少locales参数');
      }
      
      // 检查语言限制
      const limitInfo = await checkLocaleLimit(admin);
      if (locales.length > limitInfo.remainingSlots) {
        throw new Error(`无法添加 ${locales.length} 个语言，仅剩 ${limitInfo.remainingSlots} 个位置`);
      }
      
      const results = [];
      const errors = [];
      
      for (const localeCode of locales) {
        try {
          const enabledLocale = await enableLocale(admin, localeCode);
          results.push(enabledLocale);
          
          // 同步到数据库
          await prisma.language.upsert({
            where: {
              shopId_code: {
                shopId: shop.id,
                code: enabledLocale.locale
              }
            },
            update: {
              name: enabledLocale.name,
              isActive: true
            },
            create: {
              shopId: shop.id,
              code: enabledLocale.locale,
              name: enabledLocale.name,
              isActive: true
            }
          });
        } catch (error) {
          errors.push({ locale: localeCode, error: error.message });
        }
      }
      
      return {
        enabled: formatLocalesForUI(results),
        errors,
        message: `成功启用 ${results.length} 个语言${errors.length > 0 ? `，${errors.length} 个失败` : ''}`
      };
    }
    
    case 'disable': {
      // 禁用语言
      if (!locale) {
        throw new Error('缺少locale参数');
      }
      
      const result = await disableLocale(admin, locale);
      
      // 更新数据库
      await prisma.language.update({
        where: {
          shopId_code: {
            shopId: shop.id,
            code: locale
          }
        },
        data: {
          isActive: false
        }
      });
      
      return {
        locale: result.locale,
        message: `成功禁用语言: ${locale}`
      };
    }
    
    case 'sync': {
      // 同步店铺语言到数据库
      const syncedLanguages = await syncShopLocalesToDatabase(shop.id, admin);
      
      return {
        languages: syncedLanguages.map(l => ({
          value: l.code,
          label: l.name,
          isActive: l.isActive
        })),
        count: syncedLanguages.length,
        message: '语言同步成功'
      };
    }
    
    default:
      throw new Error('无效的操作');
  }
}

export const action = createApiRoute(handleLocaleAction, {
  requireAuth: true,
  operationName: '语言操作'
});