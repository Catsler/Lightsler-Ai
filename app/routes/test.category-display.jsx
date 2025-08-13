import { ResourceCategoryDisplay } from "../components/ResourceCategoryDisplay";
import { Page } from "@shopify/polaris";
import { useState } from "react";

// 模拟资源数据
const mockResources = [
  // 产品
  { id: '1', resourceType: 'PRODUCT', title: 'T-Shirt', handle: 't-shirt', translationCount: 2 },
  { id: '2', resourceType: 'PRODUCT', title: 'Jeans', handle: 'jeans', translationCount: 0 },
  { id: '3', resourceType: 'PRODUCT_OPTION', title: 'Size', handle: 'size', translationCount: 1 },
  
  // 集合
  { id: '4', resourceType: 'COLLECTION', title: 'Summer Collection', handle: 'summer', translationCount: 1 },
  { id: '5', resourceType: 'FILTER', title: 'Price Filter', handle: 'price', translationCount: 0 },
  
  // 内容
  { id: '6', resourceType: 'ARTICLE', title: 'How to Choose Size', handle: 'size-guide', translationCount: 2 },
  { id: '7', resourceType: 'BLOG', title: 'Fashion Blog', handle: 'fashion', translationCount: 1 },
  { id: '8', resourceType: 'PAGE', title: 'About Us', handle: 'about', translationCount: 0 },
  
  // 导航
  { id: '9', resourceType: 'MENU', title: 'Main Menu', handle: 'main-menu', translationCount: 1 },
  { id: '10', resourceType: 'LINK', title: 'Contact Link', handle: 'contact', translationCount: 0 },
  
  // 主题
  { id: '11', resourceType: 'ONLINE_STORE_THEME', title: 'Dawn Theme', handle: 'dawn', translationCount: 3 },
  { id: '12', resourceType: 'ONLINE_STORE_THEME_JSON_TEMPLATE', title: 'Product Template', handle: 'product-template', translationCount: 1 },
  
  // 店铺
  { id: '13', resourceType: 'SHOP', title: 'My Shop', handle: 'my-shop', translationCount: 2 },
  { id: '14', resourceType: 'SHOP_POLICY', title: 'Refund Policy', handle: 'refund-policy', translationCount: 1 },
  
  // 更多产品选项
  { id: '15', resourceType: 'PRODUCT_OPTION_VALUE', title: 'Small', handle: 'small', translationCount: 0 },
  { id: '16', resourceType: 'SELLING_PLAN', title: 'Monthly Subscription', handle: 'monthly', translationCount: 1 },
];

export default function TestCategoryDisplay() {
  const [selectedResources, setSelectedResources] = useState([]);
  const [currentLanguage, setCurrentLanguage] = useState('zh-CN');
  
  const handleResourceSelection = (resourceId, checked) => {
    if (checked) {
      setSelectedResources(prev => [...prev, resourceId]);
    } else {
      setSelectedResources(prev => prev.filter(id => id !== resourceId));
    }
  };
  
  const handleResourceClick = (resource) => {
    console.log('Resource clicked:', resource);
  };
  
  return (
    <Page title="资源分类展示测试">
      <ResourceCategoryDisplay
        resources={mockResources}
        selectedResources={selectedResources}
        onSelectionChange={handleResourceSelection}
        currentLanguage={currentLanguage}
        onResourceClick={handleResourceClick}
      />
    </Page>
  );
}