import { useState } from 'react';
import { Page, BlockStack, TextField, Checkbox } from '@shopify/polaris';
import { ThemeJsonTreeView } from './ThemeJsonTreeView';

// 示例JSON数据 - 模拟Theme资源结构
const exampleThemeData = {
  sections: {
    header: {
      type: "header",
      settings: {
        logo_width: 100,
        menu_type: "dropdown",
        announcement_text: "欢迎来到我们的商店！享受免费送货服务。",
        show_announcement: true
      },
      blocks: {
        menu_item_1: {
          type: "menu_item",
          settings: {
            title: "首页",
            url: "/",
            show_icon: false
          }
        },
        menu_item_2: {
          type: "menu_item", 
          settings: {
            title: "产品",
            url: "/collections/all",
            description: "浏览我们精选的所有产品"
          }
        }
      }
    },
    hero_banner: {
      type: "hero",
      settings: {
        heading: "发现我们的新系列",
        subheading: "时尚、品质与舒适的完美结合",
        button_text: "立即购买",
        button_url: "/collections/new",
        image_alt: "新系列产品展示图",
        background_color: "#ffffff",
        text_color: "#000000"
      }
    },
    product_grid: {
      type: "collection",
      settings: {
        collection_title: "热门产品",
        products_per_row: 4,
        show_vendor: true,
        show_price: true,
        quick_view_text: "快速查看",
        add_to_cart_text: "加入购物车"
      }
    }
  },
  locales: {
    "zh-CN": {
      general: {
        search_placeholder: "搜索产品...",
        cart_title: "购物车",
        checkout_button: "结账",
        continue_shopping: "继续购物"
      }
    },
    "en": {
      general: {
        search_placeholder: "Search products...",
        cart_title: "Cart", 
        checkout_button: "Checkout",
        continue_shopping: "Continue shopping"
      }
    }
  },
  config: {
    api_version: "2025-07",
    theme_name: "Modern Shop",
    supported_features: ["product_reviews", "wishlists", "quick_view"],
    color_schemes: {
      primary: "#2c5aa0",
      secondary: "#f8f9fa",
      accent: "#28a745"
    }
  }
};

/**
 * ThemeJsonTreeView 组件使用示例
 * 演示所有主要功能：搜索、编辑、高亮可翻译字段等
 */
export function ThemeJsonTreeViewExample() {
  const [searchTerm, setSearchTerm] = useState('');
  const [editable, setEditable] = useState(false);
  const [highlightTranslatable, setHighlightTranslatable] = useState(true);
  const [data, setData] = useState(exampleThemeData);

  // 处理编辑回调
  const handleEdit = (path, oldValue, newValue) => {
    console.log('编辑事件:', { path, oldValue, newValue });
    
    // 更新数据
    const pathParts = path.split('.');
    const newData = JSON.parse(JSON.stringify(data));
    
    let current = newData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = newValue;
    
    setData(newData);
    
    // 在实际应用中，这里会调用API保存到服务器
    // await saveThemeData(path, newValue);
  };

  return (
    <Page
      title="Theme JSON 树形组件示例"
      subtitle="演示JSON结构化显示的所有功能"
    >
      <BlockStack gap="400">
        {/* 控制面板 */}
        <BlockStack gap="300">
          <TextField
            label="搜索内容"
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="输入关键词搜索字段名或值..."
            clearButton
            onClearButtonClick={() => setSearchTerm('')}
          />
          
          <Checkbox
            label="启用编辑模式"
            checked={editable}
            onChange={setEditable}
            helpText="开启后可以直接编辑字段值"
          />
          
          <Checkbox
            label="高亮可翻译字段"
            checked={highlightTranslatable}
            onChange={setHighlightTranslatable}
            helpText="用绿色背景标识可能需要翻译的文本字段"
          />
        </BlockStack>

        {/* JSON 树形组件 */}
        <ThemeJsonTreeView
          data={data}
          searchTerm={searchTerm}
          editable={editable}
          onEdit={handleEdit}
          highlightTranslatable={highlightTranslatable}
          maxDepth={8}
          expandedPaths={['sections', 'sections.header', 'locales']}
        />
      </BlockStack>
    </Page>
  );
}

export default ThemeJsonTreeViewExample;