/**
 * 调试HTML保护机制
 */

import 'dotenv/config';

// 复制保护函数来调试
function debugProtectHtmlTags(text) {
  const protectionMap = new Map();
  let counter = 0;
  
  console.log('🔍 开始HTML保护过程...');
  console.log(`原始内容长度: ${text.length} 字符\n`);
  
  let protectedText = text;
  
  // 1. 保护自闭合媒体标签和iframe完整结构
  console.log('1. 保护iframe标签...');
  const iframeRegex = /<iframe[^>]*>.*?<\/iframe>/gis;
  const iframeMatches = text.match(iframeRegex);
  if (iframeMatches) {
    console.log(`   找到 ${iframeMatches.length} 个iframe`);
    iframeMatches.forEach((iframe, index) => {
      const placeholder = `__PROTECTED_IFRAME_${counter}__`;
      protectionMap.set(placeholder, iframe);
      protectedText = protectedText.replace(iframe, placeholder);
      console.log(`   保护iframe ${index + 1}: ${iframe.substring(0, 50)}...`);
      counter++;
    });
  } else {
    console.log('   未找到iframe');
  }
  
  console.log('\n2. 保护媒体标签...');
  const mediaRegex = /<(img|video|audio|source|track|embed|object)\s[^>]*\/?>/gi;
  const mediaMatches = protectedText.match(mediaRegex);
  if (mediaMatches) {
    console.log(`   找到 ${mediaMatches.length} 个媒体标签`);
    mediaMatches.forEach((media, index) => {
      const placeholder = `__PROTECTED_MEDIA_${counter}__`;
      protectionMap.set(placeholder, media);
      protectedText = protectedText.replace(media, placeholder);
      console.log(`   保护媒体 ${index + 1}: ${media.substring(0, 80)}...`);
      counter++;
    });
  } else {
    console.log('   未找到媒体标签');
  }
  
  console.log('\n3. 保护样式容器...');
  const styledContainerRegex = /<(div|span)\s[^>]*style[^>]*>.*?<\/\1>/gis;
  const containerMatches = protectedText.match(styledContainerRegex);
  if (containerMatches) {
    console.log(`   找到 ${containerMatches.length} 个样式容器`);
    containerMatches.forEach((container, index) => {
      const placeholder = `__PROTECTED_CONTAINER_${counter}__`;
      protectionMap.set(placeholder, container);
      protectedText = protectedText.replace(container, placeholder);
      console.log(`   保护容器 ${index + 1}: ${container.substring(0, 100)}...`);
      counter++;
    });
  } else {
    console.log('   未找到样式容器');
  }
  
  console.log('\n4. 保护列表结构...');
  const listRegex = /<(ul|ol)\s*[^>]*>.*?<\/\1>/gis;
  const listMatches = protectedText.match(listRegex);
  if (listMatches) {
    console.log(`   找到 ${listMatches.length} 个列表`);
    listMatches.forEach((list, index) => {
      const placeholder = `__PROTECTED_LIST_${counter}__`;
      protectionMap.set(placeholder, list);
      protectedText = protectedText.replace(list, placeholder);
      console.log(`   保护列表 ${index + 1}: ${list.substring(0, 100)}...`);
      counter++;
    });
  } else {
    console.log('   未找到列表');
  }
  
  console.log('\n5. 保护标题标签...');
  const headingRegex = /<(h[1-6])\s*[^>]*>.*?<\/\1>/gis;
  const headingMatches = protectedText.match(headingRegex);
  if (headingMatches) {
    console.log(`   找到 ${headingMatches.length} 个标题`);
    headingMatches.forEach((heading, index) => {
      const placeholder = `__PROTECTED_HEADING_${counter}__`;
      protectionMap.set(placeholder, heading);
      protectedText = protectedText.replace(heading, placeholder);
      console.log(`   保护标题 ${index + 1}: ${heading.substring(0, 50)}...`);
      counter++;
    });
  } else {
    console.log('   未找到标题');
  }
  
  console.log('\n6. 保护段落标签...');
  const styledPRegex = /<p\s[^>]+>.*?<\/p>/gis;
  const styledPMatches = protectedText.match(styledPRegex);
  if (styledPMatches) {
    console.log(`   找到 ${styledPMatches.length} 个样式段落`);
    styledPMatches.forEach((p, index) => {
      const placeholder = `__PROTECTED_PARAGRAPH_${counter}__`;
      protectionMap.set(placeholder, p);
      protectedText = protectedText.replace(p, placeholder);
      console.log(`   保护段落 ${index + 1}: ${p.substring(0, 80)}...`);
      counter++;
    });
  } else {
    console.log('   未找到样式段落');
  }
  
  console.log('\n7. 保护格式化标签...');
  const formatRegex = /<(strong|em|b|i|u|s|mark|small|sup|sub)\s*[^>]*>.*?<\/\1>/gis;
  const formatMatches = protectedText.match(formatRegex);
  if (formatMatches) {
    console.log(`   找到 ${formatMatches.length} 个格式化标签`);
    formatMatches.forEach((format, index) => {
      const placeholder = `__PROTECTED_FORMAT_${counter}__`;
      protectionMap.set(placeholder, format);
      protectedText = protectedText.replace(format, placeholder);
      console.log(`   保护格式 ${index + 1}: ${format.substring(0, 50)}...`);
      counter++;
    });
  } else {
    console.log('   未找到格式化标签');
  }
  
  console.log('\n8. 保护剩余标签...');
  const remainingTagRegex = /<[^>]+>/g;
  const remainingMatches = protectedText.match(remainingTagRegex);
  if (remainingMatches) {
    console.log(`   找到 ${remainingMatches.length} 个剩余标签`);
    remainingMatches.forEach((tag, index) => {
      const placeholder = `__PROTECTED_TAG_${counter}__`;
      protectionMap.set(placeholder, tag);
      protectedText = protectedText.replace(tag, placeholder);
      console.log(`   保护标签 ${index + 1}: ${tag}`);
      counter++;
    });
  } else {
    console.log('   未找到剩余标签');
  }
  
  console.log(`\n✅ HTML保护完成: 原始${text.length}字符 -> 保护后${protectedText.length}字符, 保护了${protectionMap.size}个元素`);
  
  console.log('\n📋 保护映射表:');
  let mapIndex = 1;
  for (const [placeholder, content] of protectionMap) {
    console.log(`   ${mapIndex}. ${placeholder} -> ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    mapIndex++;
  }
  
  console.log('\n📝 保护后的文本:');
  console.log(protectedText);
  
  return {
    text: protectedText,
    tagMap: protectionMap
  };
}

// 测试用的富媒体内容（简化版）
const testHtml = `<div class="product-description">
<h2>产品介绍</h2>
<p>这款革命性的蓝牙耳机采用最新的降噪技术。</p>

<img src="https://cdn.shopify.com/headphones-main.jpg" alt="智能蓝牙耳机主图" width="600" height="400" style="border-radius: 12px;" />

<h3>核心特性</h3>
<ul>
<li><strong>主动降噪</strong> - 先进的ANC技术</li>
<li><strong>长续航</strong> - 单次充电可连续播放30小时</li>
</ul>

<div class="gallery" style="display: grid; gap: 15px;">
<img src="https://cdn.shopify.com/detail-1.jpg" alt="耳机细节图1" width="200" height="200" style="border-radius: 8px;" />
<img src="https://cdn.shopify.com/detail-2.jpg" alt="耳机细节图2" width="200" height="200" style="border-radius: 8px;" />
<img src="https://cdn.shopify.com/detail-3.jpg" alt="耳机细节图3" width="200" height="200" style="border-radius: 8px;" />
</div>

<iframe width="560" height="315" src="https://www.youtube.com/embed/demo" frameborder="0"></iframe>
</div>`;

console.log('🧪 测试HTML保护机制...\n');
const result = debugProtectHtmlTags(testHtml);

console.log('\n🎯 关键发现:');
console.log(`- 原始内容有 ${(testHtml.match(/<img[^>]*>/g) || []).length} 个图片标签`);
console.log(`- 保护后剩余内容: ${result.text.includes('<img') ? '仍有img标签' : '无img标签'}`);
console.log(`- 保护映射中的图片数量: ${Array.from(result.tagMap.keys()).filter(k => k.includes('MEDIA')).length}`);