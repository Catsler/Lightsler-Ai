import { useEffect, useState } from "react";
import { Page, Card, Button, TextField, Text, Banner } from "@shopify/polaris";

export default function RichMediaTest() {
  const [testHtml, setTestHtml] = useState("");
  const [protectedResult, setProtectedResult] = useState("");
  const [translatedResult, setTranslatedResult] = useState("");

  // 模拟Shopify富文本内容
  const sampleRichText = `<div class="rich-text">
<h2>产品特性</h2>
<p>这是一个优质产品，具有以下特点：</p>
<img src="https://cdn.shopify.com/image1.jpg" alt="产品图片" width="500" height="300" style="border-radius: 8px; margin: 10px 0;" />
<ul>
<li>高品质材料</li>
<li>精湛工艺</li>
<li>持久耐用</li>
</ul>
<p>观看产品演示视频：</p>
<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
<div style="background: #f5f5f5; padding: 15px; margin: 10px 0; border-left: 4px solid #007ace;">
<p><strong>重要提示：</strong>此产品需要专业安装。</p>
</div>
<p>更多产品图片：</p>
<div class="image-gallery" style="display: flex; gap: 10px; flex-wrap: wrap;">
<img src="https://cdn.shopify.com/image2.jpg" alt="产品细节1" width="200" height="200" style="border: 1px solid #ddd;" />
<img src="https://cdn.shopify.com/image3.jpg" alt="产品细节2" width="200" height="200" style="border: 1px solid #ddd;" />
<img src="https://cdn.shopify.com/image4.jpg" alt="产品细节3" width="200" height="200" style="border: 1px solid #ddd;" />
</div>
</div>`;

  // 当前的protectHtmlTags函数（简化版本）
  const currentProtectHtmlTags = (text) => {
    const tagMap = new Map();
    let counter = 0;
    const htmlTagRegex = /<[^>]+>/g;
    let protectedText = text;
    
    const matches = text.match(htmlTagRegex);
    if (matches) {
      matches.forEach(tag => {
        const placeholder = `__HTML_TAG_${counter}__`;
        tagMap.set(placeholder, tag);
        protectedText = protectedText.replace(tag, placeholder);
        counter++;
      });
    }
    
    return { text: protectedText, tagMap };
  };

  // 改进的protectHtmlTags函数
  const improvedProtectHtmlTags = (text) => {
    const protectionMap = new Map();
    let counter = 0;
    
    // 1. 保护完整的HTML元素（包括内容）
    const elementRegex = /<(img|iframe|video|audio|embed|object)[^>]*\/?>|<(div|span|p|h[1-6]|ul|ol|li|strong|em|b|i)[^>]*>.*?<\/\2>/gms;
    
    // 2. 保护单个标签
    const tagRegex = /<[^>]+>/g;
    
    let protectedText = text;
    
    // 先保护完整元素
    const elementMatches = text.match(elementRegex);
    if (elementMatches) {
      elementMatches.forEach(element => {
        const placeholder = `__PROTECTED_ELEMENT_${counter}__`;
        protectionMap.set(placeholder, element);
        protectedText = protectedText.replace(element, placeholder);
        counter++;
      });
    }
    
    // 再保护剩余的单个标签
    const remainingTags = protectedText.match(tagRegex);
    if (remainingTags) {
      remainingTags.forEach(tag => {
        const placeholder = `__PROTECTED_TAG_${counter}__`;
        protectionMap.set(placeholder, tag);
        protectedText = protectedText.replace(tag, placeholder);
        counter++;
      });
    }
    
    return { text: protectedText, tagMap: protectionMap };
  };

  const testProtection = () => {
    // 测试当前保护机制
    const currentResult = currentProtectHtmlTags(testHtml || sampleRichText);
    
    // 测试改进保护机制  
    const improvedResult = improvedProtectHtmlTags(testHtml || sampleRichText);
    
    setProtectedResult(`
当前保护机制结果：
保护后文本长度: ${currentResult.text.length}
占位符数量: ${currentResult.tagMap.size}
保护后内容预览:
${currentResult.text.substring(0, 500)}...

改进保护机制结果：
保护后文本长度: ${improvedResult.text.length}  
占位符数量: ${improvedResult.tagMap.size}
保护后内容预览:
${improvedResult.text.substring(0, 500)}...
    `);
  };

  useEffect(() => {
    setTestHtml(sampleRichText);
  }, []);

  return (
    <Page title="富文本翻译测试">
      <Card>
        <Banner status="info">
          <p>测试Shopify富文本内容的HTML保护机制</p>
        </Banner>
        
        <div style={{ margin: "20px 0" }}>
          <Text variant="headingMd" as="h3">原始富文本内容</Text>
          <TextField
            multiline={8}
            value={testHtml}
            onChange={setTestHtml}
            placeholder="输入或修改富文本HTML内容..."
          />
        </div>

        <div style={{ margin: "20px 0" }}>
          <Button onClick={testProtection} primary>
            测试HTML保护机制
          </Button>
        </div>

        {protectedResult && (
          <div style={{ margin: "20px 0" }}>
            <Text variant="headingMd" as="h3">保护机制测试结果</Text>
            <div style={{ 
              background: "#f6f6f7", 
              padding: "15px", 
              borderRadius: "4px",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              fontSize: "12px"
            }}>
              {protectedResult}
            </div>
          </div>
        )}

        <div style={{ margin: "20px 0" }}>
          <Text variant="headingMd" as="h3">富文本预览效果</Text>
          <div 
            style={{ 
              border: "1px solid #ddd", 
              padding: "15px", 
              borderRadius: "4px" 
            }}
            dangerouslySetInnerHTML={{ __html: testHtml }}
          />
        </div>
      </Card>
    </Page>
  );
}