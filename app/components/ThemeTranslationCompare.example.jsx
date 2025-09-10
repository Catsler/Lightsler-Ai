import { useState } from 'react';
import { Page, BlockStack } from '@shopify/polaris';
import ThemeTranslationCompare from './ThemeTranslationCompare';

/**
 * ThemeTranslationCompare组件使用示例
 * 
 * 展示如何在实际项目中使用Theme翻译对比组件
 */
export default function ThemeTranslationCompareExample() {
  // 模拟数据
  const [originalData] = useState({
    header: {
      title: "Welcome to Our Store",
      subtitle: "Find the best products for you",
      menu: {
        home: "Home",
        products: "Products",
        about: "About Us",
        contact: "Contact"
      }
    },
    footer: {
      copyright: "© 2025 Your Store. All rights reserved.",
      links: {
        privacy: "Privacy Policy",
        terms: "Terms of Service",
        support: "Customer Support"
      }
    },
    product: {
      addToCart: "Add to Cart",
      buyNow: "Buy Now", 
      outOfStock: "Out of Stock",
      price: "$99.99",
      description: "This is a fantastic product that will meet all your needs."
    }
  });

  const [translatedData, setTranslatedData] = useState({
    "header.title": "欢迎来到我们的商店",
    "header.menu.home": "首页",
    "header.menu.products": "产品",
    "footer.copyright": "© 2025 您的商店。保留所有权利。",
    "product.addToCart": "添加到购物车"
  });

  const [loading, setLoading] = useState(false);
  const [translationProgress, setTranslationProgress] = useState(0);

  // 可用语言配置
  const availableLanguages = [
    { code: 'zh-CN', name: '简体中文' },
    { code: 'zh-TW', name: '繁體中文' },
    { code: 'ja', name: '日本語' },
    { code: 'ko', name: '한국어' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'es', name: 'Español' },
    { code: 'pt', name: 'Português' }
  ];

  // 处理保存翻译
  const handleSave = async ({ language, translations }) => {
    console.log('保存翻译:', { language, translations });
    
    // 模拟API调用
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 更新翻译数据
    setTranslatedData(prev => ({
      ...prev,
      ...translations
    }));
    
    setLoading(false);
  };

  // 处理单个或批量翻译
  const handleTranslate = async ({ language, fields, selectedPaths }) => {
    console.log('执行翻译:', { language, fields, selectedPaths });
    
    setLoading(true);
    setTranslationProgress(0);
    
    // 模拟翻译进度
    const totalFields = selectedPaths.length;
    for (let i = 0; i <= totalFields; i++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setTranslationProgress(Math.round((i / totalFields) * 100));
    }
    
    // 模拟翻译结果
    const mockTranslations = {};
    selectedPaths.forEach(path => {
      const originalValue = fields[path];
      // 简单的模拟翻译逻辑
      if (language === 'zh-CN') {
        mockTranslations[path] = `[中文] ${originalValue}`;
      } else if (language === 'ja') {
        mockTranslations[path] = `[日本語] ${originalValue}`;
      } else {
        mockTranslations[path] = `[${language}] ${originalValue}`;
      }
    });
    
    // 更新翻译数据
    setTranslatedData(prev => ({
      ...prev,
      ...mockTranslations
    }));
    
    setLoading(false);
    setTranslationProgress(100);
    
    // 3秒后重置进度
    setTimeout(() => {
      setTranslationProgress(0);
    }, 3000);
  };

  // 处理批量操作
  const handleBulkAction = async ({ action, language, fields, data, selectedPaths }) => {
    console.log('批量操作:', { action, language, fields, data, selectedPaths });
    
    switch (action) {
      case 'translate':
        return handleTranslate({ language, fields, selectedPaths });
      
      case 'export':
        // 模拟导出功能
        const exportData = {
          language,
          timestamp: new Date().toISOString(),
          data
        };
        
        // 创建下载链接
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `theme-translations-${language}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        break;
      
      case 'scan':
        // 模拟扫描操作
        console.log('触发Theme资源扫描');
        break;
      
      default:
        console.log('未知操作:', action);
    }
  };

  return (
    <Page
      title="Theme翻译对比组件示例"
      subtitle="演示Theme翻译对比组件的功能和用法"
    >
      <BlockStack gap="500">
        {/* 使用说明 */}
        <div style={{ 
          padding: '16px', 
          backgroundColor: '#f6f6f7', 
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <h3>功能演示：</h3>
          <ul>
            <li>✅ 双栏对比布局：左侧原文，右侧翻译</li>
            <li>✅ 字段级别编辑和批量操作</li>
            <li>✅ 搜索和过滤功能</li>
            <li>✅ 语言切换和进度显示</li>
            <li>✅ 导出选中字段数据</li>
            <li>✅ 响应式设计适配</li>
          </ul>
        </div>

        {/* Theme翻译对比组件 */}
        <ThemeTranslationCompare
          originalData={originalData}
          translatedData={translatedData}
          targetLanguage="zh-CN"
          availableLanguages={availableLanguages}
          loading={loading}
          translationProgress={translationProgress}
          onSave={handleSave}
          onTranslate={handleTranslate}
          onBulkAction={handleBulkAction}
        />
      </BlockStack>
    </Page>
  );
}