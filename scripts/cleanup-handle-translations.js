#!/usr/bin/env node

/**
 * 清理数据库中的 URL handle 翻译数据
 *
 * 背景：
 * URL handle 不应被翻译（SEO最佳实践），需要清理历史翻译数据
 * 避免这些数据在未来被意外同步到 Shopify
 *
 * 执行：
 * node scripts/cleanup-handle-translations.js
 *
 * 创建日期：2025-01-19
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupHandleTranslations() {
  console.log('🧹 开始清理 URL handle 翻译数据...');

  try {
    // 查询当前有多少条记录包含 handleTrans
    const beforeCount = await prisma.translation.count({
      where: {
        handleTrans: {
          not: null
        }
      }
    });

    console.log(`📊 发现 ${beforeCount} 条包含 handleTrans 的记录`);

    if (beforeCount === 0) {
      console.log('✅ 数据库中没有需要清理的 handleTrans 数据');
      return;
    }

    // 清理所有 handleTrans 字段
    const result = await prisma.translation.updateMany({
      where: {
        handleTrans: {
          not: null
        }
      },
      data: {
        handleTrans: null
      }
    });

    console.log(`✅ 成功清理 ${result.count} 条 handleTrans 记录`);

    // 验证清理结果
    const afterCount = await prisma.translation.count({
      where: {
        handleTrans: {
          not: null
        }
      }
    });

    if (afterCount === 0) {
      console.log('🎉 所有 handleTrans 数据已完全清理');
    } else {
      console.warn(`⚠️  仍有 ${afterCount} 条记录包含 handleTrans，请检查`);
    }

  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupHandleTranslations()
    .then(() => {
      console.log('✅ URL handle 翻译数据清理完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 清理失败:', error);
      process.exit(1);
    });
}

export { cleanupHandleTranslations };