#!/usr/bin/env node
/**
 * 修复 Fynony 店铺语言配置问题
 * 问题：数据库 Language 表中 code 与 name 不匹配 (de vs nl)
 * 解决方案：通过 API 重新同步语言配置并清除缓存
 */

import fetch from 'node-fetch';

const SHOP_DOMAIN = 'fynony.myshopify.com';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function fixLanguageConfig() {
  console.log('🔧 开始修复 Fynony 店铺语言配置问题...\n');

  try {
    // 1. 查看当前数据库中的语言配置
    console.log('📊 查看当前数据库语言配置...');
    const dbResponse = await fetch(`${BASE_URL}/api/locales?action=database`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shop-Domain': SHOP_DOMAIN
      }
    });

    if (!dbResponse.ok) {
      throw new Error(`查询数据库语言失败: ${dbResponse.status}`);
    }

    const dbData = await dbResponse.json();
    console.log('当前数据库语言配置:');
    dbData.data.languages.forEach(lang => {
      console.log(`  - Code: ${lang.value}, Name: ${lang.label}, Active: ${lang.isActive}`);
    });
    console.log();

    // 2. 查看 Shopify 当前语言配置
    console.log('🛍️ 查看 Shopify 当前语言配置...');
    const shopResponse = await fetch(`${BASE_URL}/api/locales?action=shop`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shop-Domain': SHOP_DOMAIN
      }
    });

    if (!shopResponse.ok) {
      throw new Error(`查询 Shopify 语言失败: ${shopResponse.status}`);
    }

    const shopData = await shopResponse.json();
    console.log('Shopify 当前语言配置:');
    shopData.data.locales.forEach(locale => {
      console.log(`  - Code: ${locale.value}, Name: ${locale.label}`);
    });
    console.log();

    // 3. 执行语言同步
    console.log('🔄 执行语言同步...');
    const syncResponse = await fetch(`${BASE_URL}/api/locales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shop-Domain': SHOP_DOMAIN
      },
      body: JSON.stringify({
        action: 'sync'
      })
    });

    if (!syncResponse.ok) {
      throw new Error(`语言同步失败: ${syncResponse.status}`);
    }

    const syncData = await syncResponse.json();
    console.log('✅ 语言同步成功!');
    console.log(`同步结果: ${syncData.data.message}`);
    console.log(`更新的语言数量: ${syncData.data.count}`);
    console.log();

    // 4. 验证同步后的数据库配置
    console.log('🔍 验证同步后的数据库配置...');
    const verifyResponse = await fetch(`${BASE_URL}/api/locales?action=database`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shop-Domain': SHOP_DOMAIN
      }
    });

    if (!verifyResponse.ok) {
      throw new Error(`验证数据库语言失败: ${verifyResponse.status}`);
    }

    const verifyData = await verifyResponse.json();
    console.log('同步后数据库语言配置:');
    verifyData.data.languages.forEach(lang => {
      console.log(`  - Code: ${lang.value}, Name: ${lang.label}, Active: ${lang.isActive}`);
    });

    // 5. 检查是否还有不一致问题
    const inconsistencies = [];
    verifyData.data.languages.forEach(lang => {
      if (lang.value === 'de' && !lang.label.toLowerCase().includes('german') && !lang.label.includes('德语')) {
        inconsistencies.push(`德语配置异常: code=${lang.value}, name=${lang.label}`);
      }
      if (lang.value === 'nl' && !lang.label.toLowerCase().includes('dutch') && !lang.label.includes('荷兰语')) {
        inconsistencies.push(`荷兰语配置异常: code=${lang.value}, name=${lang.label}`);
      }
    });

    if (inconsistencies.length > 0) {
      console.log('\n⚠️ 检测到语言配置不一致:');
      inconsistencies.forEach(msg => console.log(`  - ${msg}`));
    } else {
      console.log('\n✅ 语言配置验证通过，所有 code 和 name 匹配正确!');
    }

    // 6. 清除前端语言偏好缓存
    console.log('\n🧹 语言偏好缓存清除指引:');
    console.log('请在浏览器中执行以下操作清除缓存:');
    console.log('1. 打开浏览器开发者工具 (F12)');
    console.log('2. 进入 Application/Storage → Local Storage');
    console.log(`3. 删除键: translate-${SHOP_DOMAIN}-language-preference`);
    console.log('4. 或者在 Console 中执行:');
    console.log(`   localStorage.removeItem('translate-${SHOP_DOMAIN}-language-preference')`);

    console.log('\n🎉 Fynony 店铺语言配置修复完成!');

  } catch (error) {
    console.error('❌ 修复过程中出现错误:', error.message);
    process.exit(1);
  }
}

// 运行修复脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  fixLanguageConfig();
}

export { fixLanguageConfig };