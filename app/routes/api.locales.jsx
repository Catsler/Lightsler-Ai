/**
 * 语言管理API端点
 * 提供语言查询、启用、禁用和同步功能
 */

import { json } from '@remix-run/node';
import { authenticate } from '../shopify.server.js';
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
import { withErrorHandling } from '../utils/error-handler.server.js';
import { createApiResponse } from '../utils/api-response.server.js';
import prisma from '../db.server.js';

/**
 * GET请求处理 - 查询语言信息
 */
export const loader = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  
  try {
    switch (action) {
      case 'available': {
        // 获取所有可用语言
        const availableLocales = await getAvailableLocales(admin);
        const formattedLocales = formatLocalesForUI(availableLocales);
        const groupedLocales = groupLocalesByRegion(availableLocales);
        
        return json(createApiResponse({
          locales: formattedLocales,
          grouped: groupedLocales,
          total: availableLocales.length
        }));
      }
      
      case 'shop': {
        // 获取店铺已启用的语言
        const shopLocales = await getShopLocales(admin);
        const formattedLocales = formatLocalesForUI(shopLocales);
        
        return json(createApiResponse({
          locales: formattedLocales,
          count: shopLocales.length
        }));
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
        
        return json(createApiResponse({
          languages: formattedLanguages,
          count: languages.length
        }));
      }
      
      case 'limit': {
        // 检查语言限制
        const limitInfo = await checkLocaleLimit(admin);
        
        return json(createApiResponse(limitInfo));
      }
      
      case 'combined': {
        // 获取综合信息（店铺语言 + 可用语言 + 限制）
        const [shopLocales, availableLocales, limitInfo, dbLanguages] = await Promise.all([
          getShopLocales(admin),
          getAvailableLocales(admin),
          checkLocaleLimit(admin),
          prisma.language.findMany({
            where: { shopId: session.shop, isActive: true }
          })
        ]);
        
        // 找出还未启用的语言
        const enabledCodes = new Set(shopLocales.map(l => l.locale));
        const availableToAdd = availableLocales.filter(l => !enabledCodes.has(l.isoCode));
        
        return json(createApiResponse({
          shop: {
            locales: formatLocalesForUI(shopLocales),
            count: shopLocales.length
          },
          available: {
            locales: formatLocalesForUI(availableToAdd),
            grouped: groupLocalesByRegion(availableToAdd),
            total: availableToAdd.length
          },
          database: {
            languages: dbLanguages.map(l => ({
              value: l.code,
              label: l.name,
              isActive: l.isActive
            })),
            count: dbLanguages.length
          },
          limit: limitInfo
        }));
      }
      
      default:
        return json(createApiResponse(null, '无效的action参数', false), { status: 400 });
    }
  } catch (error) {
    console.error('[api.locales] 查询失败:', error);
    return json(createApiResponse(null, error.message, false), { status: 500 });
  }
});

/**
 * POST请求处理 - 语言操作
 */
export const action = withErrorHandling(async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.json();
  const { action: operation, locale, locales } = formData;
  
  try {
    // 获取店铺信息
    const shop = await prisma.shop.findUnique({
      where: { id: session.shop }
    });
    
    if (!shop) {
      return json(createApiResponse(null, '店铺信息不存在', false), { status: 404 });
    }
    
    switch (operation) {
      case 'enable': {
        // 启用单个语言
        if (!locale) {
          return json(createApiResponse(null, '缺少locale参数', false), { status: 400 });
        }
        
        // 检查语言限制
        const limitInfo = await checkLocaleLimit(admin);
        if (!limitInfo.canAddMore) {
          return json(createApiResponse(
            null, 
            `已达到最大语言数量限制（${limitInfo.maxLimit}个）`, 
            false
          ), { status: 400 });
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
        
        return json(createApiResponse({
          locale: formatLocalesForUI([enabledLocale])[0],
          message: `成功启用语言: ${enabledLocale.name}`
        }));
      }
      
      case 'enableMultiple': {
        // 批量启用语言
        if (!locales || !Array.isArray(locales)) {
          return json(createApiResponse(null, '缺少locales参数', false), { status: 400 });
        }
        
        // 检查语言限制
        const limitInfo = await checkLocaleLimit(admin);
        if (locales.length > limitInfo.remainingSlots) {
          return json(createApiResponse(
            null, 
            `无法添加 ${locales.length} 个语言，仅剩 ${limitInfo.remainingSlots} 个位置`, 
            false
          ), { status: 400 });
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
        
        return json(createApiResponse({
          enabled: formatLocalesForUI(results),
          errors,
          message: `成功启用 ${results.length} 个语言${errors.length > 0 ? `，${errors.length} 个失败` : ''}`
        }));
      }
      
      case 'disable': {
        // 禁用语言
        if (!locale) {
          return json(createApiResponse(null, '缺少locale参数', false), { status: 400 });
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
        
        return json(createApiResponse({
          locale: result.locale,
          message: `成功禁用语言: ${locale}`
        }));
      }
      
      case 'sync': {
        // 同步店铺语言到数据库
        const syncedLanguages = await syncShopLocalesToDatabase(shop.id, admin);
        
        return json(createApiResponse({
          languages: syncedLanguages.map(l => ({
            value: l.code,
            label: l.name,
            isActive: l.isActive
          })),
          count: syncedLanguages.length,
          message: '语言同步成功'
        }));
      }
      
      default:
        return json(createApiResponse(null, '无效的操作', false), { status: 400 });
    }
  } catch (error) {
    console.error('[api.locales] 操作失败:', error);
    return json(createApiResponse(null, error.message, false), { status: 500 });
  }
});