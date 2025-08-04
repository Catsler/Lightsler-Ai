/**
 * 直接测试Page资源翻译 V2
 */
import { PrismaClient } from '@prisma/client';
import { translateResource } from './app/services/translation.server.js';
import { fetchAllPages, updateResourceTranslation, RESOURCE_TYPES } from './app/services/shopify-graphql.server.js';
import { saveResources } from './app/services/database.server.js';

const prisma = new PrismaClient();

// 模拟认证后的admin对象
async function getMockAdmin(shopDomain) {
  const session = await prisma.session.findFirst({
    where: { shop: shopDomain }
  });
  
  if (!session) {
    throw new Error('未找到会话信息');
  }

  return {
    graphql: async (query, options) => {
      const response = await fetch(`https://${shopDomain}/admin/api/2025-07/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': session.accessToken
        },
        body: JSON.stringify({
          query,
          variables: options?.variables || {}
        })
      });
      
      return {
        json: async () => response.json()
      };
    }
  };
}

async function testPageTranslation() {
  console.log('=== 直接测试Page资源翻译（带style标签保护） ===\n');

  try {
    // 1. 获取店铺信息
    const shop = await prisma.shop.findFirst();
    if (!shop) {
      console.error('未找到店铺信息');
      return;
    }
    console.log('店铺:', shop.domain);

    // 2. 获取admin对象
    const admin = await getMockAdmin(shop.domain);

    // 3. 扫描Page资源
    console.log('\n1. 扫描Page资源...');
    const pages = await fetchAllPages(admin);
    console.log(`扫描完成: 找到 ${pages.length} 个Page资源`);

    if (pages.length > 0) {
      // 保存到数据库
      await saveResources(shop.id, pages);
      console.log('资源已保存到数据库');
    }

    // 4. 获取第一个Page资源进行测试
    const pageResource = await prisma.resource.findFirst({
      where: {
        shopId: shop.id,
        resourceType: 'page'
      }
    });

    if (!pageResource) {
      console.log('未找到Page资源');
      return;
    }

    console.log('\n2. Page资源信息:');
    console.log('- 标题:', pageResource.title);
    console.log('- ID:', pageResource.resourceId);
    console.log('- 内容长度:', pageResource.descriptionHtml?.length || 0);
    
    // 检查是否包含style标签
    const hasStyleTag = pageResource.descriptionHtml?.includes('<style');
    console.log('- 包含style标签:', hasStyleTag);
    
    if (hasStyleTag) {
      const styleMatch = pageResource.descriptionHtml.match(/<style[^>]*>.*?<\/style>/is);
      if (styleMatch) {
        console.log('- style标签预览:', styleMatch[0].substring(0, 100) + '...');
      }
    }

    // 5. 执行翻译
    console.log('\n3. 执行翻译到日语...');
    const translation = await translateResource(pageResource, 'ja');
    
    console.log('\n4. 翻译结果:');
    console.log('- 状态:', translation.status);
    console.log('- 标题翻译:', translation.titleTrans);
    console.log('- 内容翻译长度:', translation.descTrans?.length || 0);
    
    if (translation.error) {
      console.error('- 错误:', translation.error);
    }

    // 6. 检查HTML保护是否生效
    if (translation.descTrans) {
      const hasStyle = translation.descTrans.includes('<style');
      const hasScript = translation.descTrans.includes('<script');
      console.log('\n5. HTML保护检查:');
      console.log('- 翻译后包含style标签:', hasStyle);
      console.log('- 翻译后包含script标签:', hasScript);
      
      // 检查是否有日文字符
      const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/;
      const hasJapanese = japaneseRegex.test(translation.descTrans);
      console.log('- 包含日文字符:', hasJapanese);
      
      // 统计日文字符数量
      const japaneseChars = translation.descTrans.match(japaneseRegex) || [];
      console.log('- 日文字符数量:', japaneseChars.length);
      
      // 显示一些翻译后的文本片段（不包含HTML）
      const textOnly = translation.descTrans.replace(/<[^>]*>/g, '').trim();
      console.log('- 纯文本预览:', textOnly.substring(0, 200) + '...');
    }

    // 7. 保存翻译到数据库
    if (translation.status === 'success') {
      await prisma.translation.create({
        data: {
          resourceId: pageResource.id,
          targetLang: 'ja',
          titleTrans: translation.titleTrans,
          descTrans: translation.descTrans,
          handleTrans: translation.handleTrans,
          seoTitleTrans: translation.seoTitleTrans,
          seoDescTrans: translation.seoDescTrans,
          status: 'completed'
        }
      });
      console.log('\n6. 翻译已保存到数据库');

      // 8. 更新到Shopify
      console.log('\n7. 更新翻译到Shopify...');
      try {
        const updateResult = await updateResourceTranslation(
          admin,
          pageResource.gid,
          {
            titleTrans: translation.titleTrans,
            descTrans: translation.descTrans,
            handleTrans: translation.handleTrans,
            seoTitleTrans: translation.seoTitleTrans,
            seoDescTrans: translation.seoDescTrans
          },
          'ja',
          RESOURCE_TYPES.PAGE
        );
        console.log('更新结果:', updateResult.success ? '成功' : '失败');
        if (!updateResult.success) {
          console.error('更新详情:', updateResult);
        } else {
          console.log('更新详情:', updateResult.details);
        }
      } catch (updateError) {
        console.error('更新到Shopify时出错:', updateError.message);
      }
    }

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
testPageTranslation();