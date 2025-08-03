import { useState } from "react";
import { json } from "@remix-run/node";
import { useActionData, Form } from "@remix-run/react";
import { Page, Card, Button, TextField, Text, Banner, Spinner } from "@shopify/polaris";
import { translateText } from "../services/translation.server.js";

export const action = async ({ request }) => {
  const formData = await request.formData();
  const text = formData.get("text");
  const language = formData.get("language") || "en";

  try {
    console.log("开始测试翻译:", { textLength: text.length, language });
    const translated = await translateText(text, language);
    console.log("翻译完成:", { resultLength: translated.length });
    
    return json({
      success: true,
      original: text,
      translated: translated,
      language: language,
      originalLength: text.length,
      translatedLength: translated.length
    });
  } catch (error) {
    console.error("翻译测试失败:", error);
    return json({
      success: false,
      error: error.message,
      original: text
    });
  }
};

export default function TranslationFixTest() {
  const actionData = useActionData();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 测试用富媒体内容
  const richMediaSample = `<div class="product-description">
<h2>产品介绍</h2>
<p>这是一款革新性的智能产品，专为现代生活设计。</p>

<img src="https://cdn.shopify.com/s/files/1/product-main.jpg" alt="主要产品图片" width="600" height="400" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />

<h3>核心特性</h3>
<ul>
<li><strong>智能控制</strong> - 通过手机APP远程操控</li>
<li><strong>节能环保</strong> - 采用最新节能技术</li>
<li><strong>安全可靠</strong> - 通过多项安全认证</li>
</ul>

<p>观看产品演示视频：</p>
<iframe width="560" height="315" src="https://www.youtube.com/embed/demo-video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 12px; margin: 20px 0;">
<h4 style="margin-top: 0;">特别优惠</h4>
<p style="margin-bottom: 0;">现在购买即可享受<strong>8折优惠</strong>，并免费获得配套配件！</p>
</div>

<p>更多产品细节图片：</p>
<div class="image-gallery" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0;">
<img src="https://cdn.shopify.com/s/files/1/detail-1.jpg" alt="产品细节1" width="200" height="200" style="border-radius: 8px;" />
<img src="https://cdn.shopify.com/s/files/1/detail-2.jpg" alt="产品细节2" width="200" height="200" style="border-radius: 8px;" />
<img src="https://cdn.shopify.com/s/files/1/detail-3.jpg" alt="产品细节3" width="200" height="200" style="border-radius: 8px;" />
</div>

<video width="100%" height="auto" controls style="border-radius: 8px; margin: 20px 0;">
<source src="https://cdn.shopify.com/videos/product-demo.mp4" type="video/mp4">
您的浏览器不支持视频播放。
</video>

<p style="text-align: center; font-style: italic; margin-top: 30px;">
<em>立即体验未来科技，改变您的生活方式！</em>
</p>
</div>`;

  return (
    <Page title="富媒体翻译修复测试" primaryAction={{content: "返回", url: "/"}}>
      <Card>
        <Banner status="info">
          <p>测试修复后的富媒体内容翻译功能，验证图片、视频、样式是否正确保留</p>
        </Banner>

        <div style={{ margin: "20px 0" }}>
          <Form method="post" onSubmit={() => setIsSubmitting(true)}>
            <div style={{ marginBottom: "20px" }}>
              <Text variant="headingMd" as="h3">原始内容（富媒体HTML）</Text>
              <TextField
                name="text"
                multiline={10}
                value={richMediaSample}
                helpText="可以编辑此内容进行测试"
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <Text variant="headingMd" as="h3">目标语言</Text>
              <TextField
                name="language"
                value="en"
                helpText="输入目标语言代码，如：en, ja, ko, fr"
              />
            </div>

            <Button submit primary loading={isSubmitting}>
              {isSubmitting ? "翻译中..." : "测试翻译"}
            </Button>
          </Form>
        </div>

        {actionData && (
          <div style={{ marginTop: "30px" }}>
            {actionData.success ? (
              <div>
                <Banner status="success">
                  <p>翻译成功！原文 {actionData.originalLength} 字符 → 译文 {actionData.translatedLength} 字符</p>
                </Banner>

                <div style={{ marginTop: "20px" }}>
                  <Text variant="headingMd" as="h3">翻译结果</Text>
                  <div style={{
                    background: "#f6f6f7",
                    padding: "15px",
                    borderRadius: "8px",
                    marginTop: "10px",
                    fontFamily: "monospace",
                    fontSize: "14px",
                    maxHeight: "300px",
                    overflow: "auto"
                  }}>
                    <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                      {actionData.translated}
                    </pre>
                  </div>
                </div>

                <div style={{ marginTop: "20px" }}>
                  <Text variant="headingMd" as="h3">渲染效果对比</Text>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "15px" }}>
                    <div>
                      <Text variant="headingSm" as="h4">原始内容</Text>
                      <div style={{
                        border: "1px solid #ddd",
                        padding: "15px",
                        borderRadius: "8px",
                        maxHeight: "400px",
                        overflow: "auto"
                      }} dangerouslySetInnerHTML={{ __html: actionData.original }} />
                    </div>
                    
                    <div>
                      <Text variant="headingSm" as="h4">翻译结果</Text>
                      <div style={{
                        border: "1px solid #ddd",
                        padding: "15px",
                        borderRadius: "8px",
                        maxHeight: "400px",
                        overflow: "auto"
                      }} dangerouslySetInnerHTML={{ __html: actionData.translated }} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <Banner status="critical">
                <p>翻译失败：{actionData.error}</p>
                <details style={{ marginTop: "10px" }}>
                  <summary>查看原始内容</summary>
                  <pre style={{ 
                    background: "#f6f6f7", 
                    padding: "10px", 
                    borderRadius: "4px",
                    marginTop: "10px",
                    whiteSpace: "pre-wrap",
                    fontSize: "12px"
                  }}>
                    {actionData.original}
                  </pre>
                </details>
              </Banner>
            )}
          </div>
        )}
      </Card>
    </Page>
  );
}