# Shopify可翻译资源映射翻译单元参考

## 核心产品和集合资源

### PRODUCT (产品)
- `title` - 产品标题
- `body_html` - 产品描述（HTML格式）
- `handle` - 产品句柄（URL标识符）
- `product_type` - 产品类型
- `meta_title` - SEO标题
- `meta_description` - SEO描述

### COLLECTION (集合)
- `title` - 集合标题
- `body_html` - 集合描述（HTML格式）
- `handle` - 集合句柄
- `meta_title` - SEO标题
- `meta_description` - SEO描述

### PRODUCT_OPTION (产品选项)
- `name` - 选项名称

## 内容管理资源

### ARTICLE (文章/博客文章)
- `title` - 文章标题
- `body_html` - 文章内容（HTML格式）
- `summary_html` - 文章摘要（HTML格式）
- `handle` - 文章句柄
- `meta_title` - SEO标题
- `meta_description` - SEO描述

### BLOG (博客)
- `title` - 博客标题
- `handle` - 博客句柄
- `meta_title` - SEO标题
- `meta_description` - SEO描述

### PAGE (页面)
- `title` - 页面标题
- `body_html` - 页面内容（HTML格式）
- `handle` - 页面句柄
- `meta_title` - SEO标题
- `meta_description` - SEO描述

## 导航和链接资源

### MENU (菜单)
- `title` - 菜单标题

### LINK (链接)
- `title` - 链接标题

## 自定义数据资源

### METAFIELD (元字段)
- `value` - 元字段值

### METAOBJECT (元对象)
- 翻译单元：基于元对象类型动态确定

## 模板和通信资源

### EMAIL_TEMPLATE (邮件模板)
- `title` - 模板标题
- `body_html` - 模板内容（HTML格式）

### PACKING_SLIP_TEMPLATE (装箱单模板)
- `body` - 模板内容

## 支付和配送资源

### PAYMENT_GATEWAY (支付网关)
- `name` - 支付网关名称
- `message` - 支付消息
- `before_payment_instructions` - 支付前说明

### DELIVERY_METHOD_DEFINITION (配送方式定义)
- `name` - 配送方式名称

## 过滤器资源

### FILTER (过滤器)
- `label` - 过滤器标签

## 主题相关资源
所有主题相关资源的翻译单元都是基于主题数据的动态键名：

- `ONLINE_STORE_THEME` - 在线商店主题
- `ONLINE_STORE_THEME_APP_EMBED` - 主题应用嵌入
- `ONLINE_STORE_THEME_JSON_TEMPLATE` - 主题JSON模板
- `ONLINE_STORE_THEME_LOCALE_CONTENT` - 主题本地化内容
- `ONLINE_STORE_THEME_SECTION_GROUP` - 主题区块组
- `ONLINE_STORE_THEME_SETTINGS_CATEGORY` - 主题设置分类
- `ONLINE_STORE_THEME_SETTINGS_DATA_SECTIONS` - 主题设置数据区块

## GraphQL查询示例

### 查询单个资源翻译
```graphql
query {
  translatableResource(resourceId: "gid://shopify/Product/123") {
    resourceId
    translations(locale: "fr") {
      key
      value
    }
  }
}
```

### 批量查询资源翻译
```graphql
query {
  translatableResourcesByIds(resourceIds: ["gid://shopify/Product/123"]) {
    edges {
      node {
        resourceId
        translatableContent {
          key
          value
          digest
          locale
        }
      }
    }
  }
}
```

### 创建/更新翻译
```graphql
mutation {
  translationsRegister(
    resourceId: "gid://shopify/Product/123"
    translations: [
      {
        key: "title"
        value: "翻译后的产品标题"
        locale: "zh-CN"
      }
    ]
  ) {
    translations {
      key
      value
      locale
    }
    userErrors {
      field
      message
    }
  }
}
```

## 使用说明

1. **访问权限**：需要 `read_translations` 和 `write_translations` 权限
2. **资源ID格式**：使用GraphQL全局ID格式 `gid://shopify/ResourceType/ID`
3. **语言代码**：使用ISO语言代码，如 `zh-CN`, `fr`, `de` 等
4. **动态字段**：主题相关资源的翻译键名基于具体主题数据动态生成

## 数据来源
信息来自Shopify官方文档：https://shopify.dev/docs/api/admin-graphql/latest/enums/TranslatableResourceType