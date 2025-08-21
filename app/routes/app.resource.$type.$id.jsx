import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useParams, useFetcher } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  InlineGrid,
  Text,
  Badge,
  Divider,
  Box,
  Banner,
  SkeletonBodyText,
  Spinner
} from "@shopify/polaris";
import { ChevronLeftIcon } from "@shopify/polaris-icons";
import { useState, useCallback, useEffect } from "react";
import { fetchResourceDetails } from "../services/shopify-graphql.server.js";
import { getTranslationByResourceId } from "../services/database.server.js";
import ResourceDetail from "../components/ResourceDetail";

// Loader函数 - 获取资源详细信息
export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { type, id } = params;
  
  try {
    // 获取资源详细信息
    const resourceDetails = await fetchResourceDetails(admin, type.toUpperCase(), id);
    
    // 获取所有语言的翻译
    const translations = await getTranslationByResourceId(session.shop, id);
    
    // 获取目标语言（从URL查询参数）
    const url = new URL(request.url);
    const targetLanguage = url.searchParams.get('lang') || 'zh-CN';
    
    return json({
      resource: resourceDetails,
      translations,
      targetLanguage,
      resourceType: type,
      resourceId: id
    });
  } catch (error) {
    console.error('加载资源详情失败:', error);
    return json({
      error: error.message,
      resourceType: type,
      resourceId: id
    }, { status: 500 });
  }
};

// Action函数 - 处理单字段翻译
export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const { type, id } = params;
  
  try {
    const formData = await request.formData();
    const fieldKey = formData.get('fieldKey');
    const fieldValue = formData.get('fieldValue');
    const targetLanguage = formData.get('targetLanguage');
    
    // 调用翻译服务
    const { translateTextEnhanced } = await import('../services/translation.server.js');
    const translatedText = await translateTextEnhanced(fieldValue, targetLanguage);
    
    // 保存翻译结果
    const { saveFieldTranslation } = await import('../services/database.server.js');
    await saveFieldTranslation({
      shopId: session.shop,
      resourceId: id,
      resourceType: type,
      language: targetLanguage,
      fieldKey,
      originalValue: fieldValue,
      translatedValue: translatedText
    });
    
    return json({
      success: true,
      fieldKey,
      translatedValue: translatedText
    });
  } catch (error) {
    console.error('翻译字段失败:', error);
    return json({
      error: error.message
    }, { status: 500 });
  }
};

export default function ResourceDetailPage() {
  const { resource, translations, targetLanguage, error } = useLoaderData();
  const navigate = useNavigate();
  const params = useParams();
  const fetcher = useFetcher();
  const [isTranslating, setIsTranslating] = useState({});
  const [localTranslations, setLocalTranslations] = useState(translations || {});

  // 处理返回按钮
  const handleBack = useCallback(() => {
    navigate('/app');
  }, [navigate]);

  // 处理单字段翻译
  const handleTranslateField = useCallback((fieldKey, fieldValue) => {
    setIsTranslating(prev => ({ ...prev, [fieldKey]: true }));
    
    fetcher.submit(
      {
        fieldKey,
        fieldValue,
        targetLanguage
      },
      { method: "post" }
    );
  }, [fetcher, targetLanguage]);

  // 更新本地翻译状态
  useEffect(() => {
    if (fetcher.data?.success) {
      setLocalTranslations(prev => ({
        ...prev,
        [targetLanguage]: {
          ...prev[targetLanguage],
          [fetcher.data.fieldKey]: fetcher.data.translatedValue
        }
      }));
      setIsTranslating(prev => ({ ...prev, [fetcher.data.fieldKey]: false }));
    }
  }, [fetcher.data, targetLanguage]);

  // 错误处理
  if (error) {
    return (
      <Page
        title="资源详情"
        backAction={{ content: "返回", onAction: handleBack }}
      >
        <Layout>
          <Layout.Section>
            <Banner
              title="加载资源失败"
              status="critical"
            >
              {error}
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // 加载中状态
  if (!resource) {
    return (
      <Page title="加载中...">
        <Layout>
          <Layout.Section>
            <Card>
              <SkeletonBodyText lines={5} />
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const resourceTypeName = params.type.charAt(0).toUpperCase() + params.type.slice(1);

  return (
    <Page
      title={`${resourceTypeName} 详情`}
      backAction={{ content: "返回列表", onAction: handleBack }}
      subtitle={resource.title || resource.name}
    >
      <Layout>
        <Layout.Section>
          <ResourceDetail
            resource={resource}
            translations={localTranslations}
            targetLanguage={targetLanguage}
            onTranslateField={handleTranslateField}
            isTranslating={isTranslating}
            resourceType={params.type}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}