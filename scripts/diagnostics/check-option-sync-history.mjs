#!/usr/bin/env node
/**
 * 诊断脚本：检查 PRODUCT_OPTION 的历史同步状态
 *
 * 用途：验证 option values 是否曾经成功同步到 Shopify
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔍 PRODUCT_OPTION 同步历史诊断\n');
  console.log('━'.repeat(70));

  // 1. 统计各语言的同步状态分布
  console.log('\n📊 各语言同步状态分布:');
  const statusByLang = await prisma.$queryRaw`
    SELECT
      language,
      syncStatus,
      COUNT(*) as count
    FROM Translation
    WHERE resourceType IN ('PRODUCT_OPTION', 'product_option')
    GROUP BY language, syncStatus
    ORDER BY language, syncStatus
  `;

  console.table(statusByLang);

  // 2. 查找 syncStatus='synced' 的记录（声称成功的）
  console.log('\n✅ 声称已同步的记录:');
  const syncedCount = await prisma.translation.count({
    where: {
      resourceType: { in: ['PRODUCT_OPTION', 'product_option'] },
      syncStatus: 'synced'
    }
  });
  console.log(`总计: ${syncedCount} 条`);

  // 3. 抽样查看 synced 记录的 translationFields
  console.log('\n🔬 抽样检查 synced 记录 (前5条):');
  const syncedSamples = await prisma.translation.findMany({
    where: {
      resourceType: { in: ['PRODUCT_OPTION', 'product_option'] },
      syncStatus: 'synced'
    },
    include: {
      resource: {
        select: {
          gid: true,
          title: true,
          contentFields: true
        }
      }
    },
    take: 5
  });

  syncedSamples.forEach((t, i) => {
    console.log(`\n${i+1}. 翻译ID: ${t.id}`);
    console.log(`   资源: ${t.resource.title} (${t.resource.gid})`);
    console.log(`   语言: ${t.language}`);
    console.log(`   同步时间: ${t.syncedAt}`);
    console.log(`   translationFields:`, JSON.stringify(t.translationFields, null, 2));
    console.log(`   contentFields (原文):`, JSON.stringify(t.resource.contentFields, null, 2));
  });

  // 4. 检查是否有 translationFields.values 字段
  console.log('\n\n🎯 关键检查：translationFields 中是否包含 values 字段？');
  const withValues = syncedSamples.filter(t =>
    t.translationFields &&
    typeof t.translationFields === 'object' &&
    'values' in t.translationFields
  );

  console.log(`包含 values 字段: ${withValues.length}/${syncedSamples.length} 条`);

  if (withValues.length > 0) {
    console.log('\n📝 包含 values 的记录示例:');
    withValues.slice(0, 2).forEach((t, i) => {
      console.log(`\n${i+1}. ${t.resource.title} (${t.language})`);
      console.log(`   name: ${t.translationFields.name || 'N/A'}`);
      console.log(`   values: ${JSON.stringify(t.translationFields.values || [])}`);
    });
  }

  // 5. 检查最近的同步活动
  console.log('\n\n⏰ 最近的同步活动 (最近5条):');
  const recentSynced = await prisma.translation.findMany({
    where: {
      resourceType: { in: ['PRODUCT_OPTION', 'product_option'] },
      syncStatus: 'synced',
      syncedAt: { not: null }
    },
    orderBy: { syncedAt: 'desc' },
    take: 5,
    select: {
      id: true,
      language: true,
      syncedAt: true,
      resource: {
        select: { title: true }
      }
    }
  });

  console.table(recentSynced.map(r => ({
    语言: r.language,
    资源: r.resource.title,
    同步时间: r.syncedAt
  })));

  console.log('\n━'.repeat(70));
  console.log('\n✅ 诊断完成\n');
}

main()
  .catch(err => {
    console.error('\n❌ 错误:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
