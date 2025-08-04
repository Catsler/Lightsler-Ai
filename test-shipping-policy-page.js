/**
 * 测试Shipping Policy页面的翻译（包含style标签）
 */
import { PrismaClient } from '@prisma/client';
import { translateResource } from './app/services/translation.server.js';

const prisma = new PrismaClient();

async function testShippingPolicyTranslation() {
  console.log('=== 测试Shipping Policy页面翻译（包含style标签） ===\n');

  try {
    // 1. 获取Shipping Policy页面
    const shippingPage = await prisma.resource.findFirst({
      where: {
        title: 'Shipping Policy'
      }
    });

    if (!shippingPage) {
      console.error('未找到Shipping Policy页面');
      return;
    }

    console.log('1. Shipping Policy页面信息:');
    console.log('- 标题:', shippingPage.title);
    console.log('- ID:', shippingPage.resourceId);
    console.log('- 内容长度:', shippingPage.descriptionHtml?.length || 0);
    
    // 检查style标签
    const styleMatches = shippingPage.descriptionHtml?.match(/<style[^>]*>.*?<\/style>/gis) || [];
    console.log('- 包含style标签数量:', styleMatches.length);
    
    if (styleMatches.length > 0) {
      console.log('- style标签预览:');
      styleMatches.forEach((style, index) => {
        console.log(`  Style ${index + 1}: ${style.substring(0, 100)}...`);
      });
    }

    // 2. 执行翻译
    console.log('\n2. 执行翻译到日语...');
    const translation = await translateResource(shippingPage, 'ja');
    
    console.log('\n3. 翻译结果:');
    console.log('- 状态:', translation.status || 'success');
    console.log('- 标题翻译:', translation.titleTrans);
    console.log('- 内容翻译长度:', translation.descTrans?.length || 0);
    
    if (translation.error) {
      console.error('- 错误:', translation.error);
      return;
    }

    // 3. 检查HTML保护是否生效
    if (translation.descTrans) {
      const translatedStyleMatches = translation.descTrans.match(/<style[^>]*>.*?<\/style>/gis) || [];
      console.log('\n4. HTML保护验证:');
      console.log('- 原始style标签数量:', styleMatches.length);
      console.log('- 翻译后style标签数量:', translatedStyleMatches.length);
      console.log('- Style标签是否被保护:', styleMatches.length === translatedStyleMatches.length ? '是' : '否');
      
      // 检查style内容是否保持不变
      if (translatedStyleMatches.length > 0) {
        const originalStyle = styleMatches[0];
        const translatedStyle = translatedStyleMatches[0];
        console.log('- Style内容是否保持不变:', originalStyle === translatedStyle ? '是' : '否');
      }
      
      // 检查是否有日文字符
      const japaneseRegex = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/;
      const hasJapanese = japaneseRegex.test(translation.descTrans);
      console.log('- 包含日文字符:', hasJapanese);
      
      // 显示一些翻译后的文本片段（不包含HTML）
      const textOnly = translation.descTrans
        .replace(/<style[^>]*>.*?<\/style>/gis, '') // 移除style标签
        .replace(/<[^>]*>/g, '') // 移除其他HTML标签
        .trim();
      console.log('- 纯文本预览:', textOnly.substring(0, 200) + '...');
      
      // 统计翻译比例
      const originalText = shippingPage.descriptionHtml
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<[^>]*>/g, '')
        .trim();
      const japaneseChars = (textOnly.match(japaneseRegex) || []).length;
      console.log('- 日文字符数量:', japaneseChars);
      console.log('- 原文字符数量:', originalText.length);
      console.log('- 翻译覆盖率:', Math.round(japaneseChars / originalText.length * 100) + '%');
    }

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行测试
testShippingPolicyTranslation();