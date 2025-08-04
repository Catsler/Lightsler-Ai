/**
 * 直接测试Page资源翻译
 */
import { PrismaClient } from '@prisma/client';
import { scanResourcesByType } from './app/services/scanner.server.js';
import { translateResource } from './app/services/translation.server.js';
import { updateResourceTranslation, RESOURCE_TYPES } from './app/services/shopify-graphql.server.js';
import { authenticate } from './app/shopify.server.js';

const prisma = new PrismaClient();

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

    // 2. 创建模拟的admin对象
    const admin = {
      graphql: async (query, options) => {
        const { shopify } = await authenticate.admin({ 
          request: new Request(`https://${shop.domain}/admin`)
        });
        return shopify.admin.graphql(query, options);
      }
    };

    // 3. 扫描Page资源
    console.log('\n1. 扫描Page资源...');
    const scanResult = await scanResourcesByType(admin, shop.id, RESOURCE_TYPES.PAGE);
    console.log(`扫描完成: 找到 ${scanResult.count} 个Page资源`);

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
    console.log('- 内容预览:', pageResource.descriptionHtml?.substring(0, 200) + '...');

    // 5. 执行翻译
    console.log('\n3. 执行翻译到日语...');
    const translation = await translateResource(pageResource, 'ja');
    
    console.log('\n4. 翻译结果:');
    console.log('- 状态:', translation.status);
    console.log('- 标题翻译:', translation.titleTrans);
    console.log('- 内容翻译预览:', translation.descTrans?.substring(0, 200) + '...');
    
    if (translation.error) {
      console.error('- 错误:', translation.error);
    }

    // 6. 检查HTML保护是否生效
    if (translation.descTrans) {
      const hasStyle = translation.descTrans.includes('<style');
      const hasScript = translation.descTrans.includes('<script');
      console.log('\n5. HTML保护检查:');
      console.log('- 包含style标签:', hasStyle);
      console.log('- 包含script标签:', hasScript);
      
      // 检查是否有日文字符
      const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(translation.descTrans);
      console.log('- 包含日文字符:', hasJapanese);
    }

    // 7. 更新到Shopify
    if (translation.status === 'success') {
      console.log('\n6. 更新翻译到Shopify...');
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
        console.error('更新错误:', updateResult);
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