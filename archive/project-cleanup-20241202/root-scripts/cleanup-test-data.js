/**
 * 清理测试数据脚本
 * 删除 test-prisma-count.js 创建的测试产品和相关翻译
 */

import prisma from './app/db.server.js';

async function cleanupTestData() {
  console.log('🧹 清理测试数据...\n');

  try {
    // 1. 查找测试产品资源
    const testResource = await prisma.resource.findFirst({
      where: {
        resourceId: 'test-product-001'
      }
    });

    if (!testResource) {
      console.log('✅ 没有找到测试数据，无需清理');
      return;
    }

    console.log(`📦 找到测试资源: ${testResource.title}`);
    console.log(`   资源ID: ${testResource.id}`);

    // 2. 删除相关翻译
    const deleteTranslationsResult = await prisma.translation.deleteMany({
      where: {
        resourceId: testResource.id
      }
    });

    console.log(`   删除了 ${deleteTranslationsResult.count} 条翻译记录`);

    // 3. 删除测试资源
    await prisma.resource.delete({
      where: {
        id: testResource.id
      }
    });

    console.log('   删除了测试资源');

    // 4. 可选：删除测试店铺（如果确定是测试店铺）
    const testShop = await prisma.shop.findFirst({
      where: {
        id: 'test-shop.myshopify.com'
      }
    });

    if (testShop) {
      // 检查是否还有其他资源使用这个店铺
      const otherResources = await prisma.resource.count({
        where: {
          shopId: testShop.id
        }
      });

      if (otherResources === 0) {
        await prisma.shop.delete({
          where: {
            id: testShop.id
          }
        });
        console.log('   删除了测试店铺');
      } else {
        console.log(`   保留店铺（还有 ${otherResources} 个其他资源）`);
      }
    }

    console.log('\n✅ 测试数据清理完成！');

  } catch (error) {
    console.error('❌ 清理失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行清理
cleanupTestData();