#!/usr/bin/env node

import prisma from '../../app/db.server.js';

async function auditThemeTranslations() {
  console.log('🔍 Theme 翻译问题诊断\n');

  try {
    const skipReasons = await prisma.$queryRaw`
      SELECT 
        json_extract(context, '$.skipReason') AS reason,
        json_extract(context, '$.fieldPath') AS fieldPath,
        COUNT(*) AS count
      FROM ErrorLog
      WHERE errorCode = 'THEME_FIELD_SKIPPED'
        AND datetime(createdAt) > datetime('now', '-7 day')
      GROUP BY reason, fieldPath
      ORDER BY count DESC
      LIMIT 20;
    `;

    if (skipReasons.length) {
      console.log('📊 TOP 跳过字段/原因 (近7天):');
      console.table(skipReasons);
    } else {
      console.log('📊 近7天未记录字段跳过。');
    }

    const urlErrors = await prisma.$queryRaw`
      SELECT 
        message,
        COUNT(*) AS count,
        MIN(createdAt) AS firstSeen,
        MAX(createdAt) AS lastSeen
      FROM ErrorLog
      WHERE (message LIKE '%link_url%' OR message LIKE '%URL%')
        AND datetime(createdAt) > datetime('now', '-7 day')
      GROUP BY message
      ORDER BY count DESC
      LIMIT 10;
    `;

    console.log('\n🔗 URL 相关错误 (近7天):');
    if (urlErrors.length) {
      console.table(urlErrors);
    } else {
      console.log('无 URL 相关错误记录。');
    }

    const protectionErrors = await prisma.$queryRaw`
      SELECT 
        errorCode,
        COUNT(*) AS count,
        MIN(createdAt) AS firstSeen,
        MAX(createdAt) AS lastSeen
      FROM ErrorLog
      WHERE errorCode IN ('BRAND_WORD_ALTERED', 'HTML_TAG_COUNT_MISMATCH')
        AND datetime(createdAt) > datetime('now', '-7 day')
      GROUP BY errorCode
      ORDER BY count DESC;
    `;

    console.log('\n🛡️ 品牌词 / HTML 保护触发统计 (近7天):');
    if (protectionErrors.length) {
      console.table(protectionErrors);
    } else {
      console.log('未触发品牌词或 HTML 保护。');
    }

    console.log('\n💡 建议下一步：');
    console.log('1. 调整 URL 字段匹配与验证策略，防止非法 URL 发布。');
    console.log('2. 分析品牌词/HTML 触发记录，更新品牌词词典与标签校验策略。');
    console.log('3. 按 OneWind → Fynony → 全量 顺序执行灰度验证。');
  } catch (error) {
    console.error('诊断失败:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

auditThemeTranslations();
