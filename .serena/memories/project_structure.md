# 项目结构

## 根目录文件
- `package.json` - 项目依赖和脚本配置
- `remix.config.js` - Remix框架配置
- `vite.config.js` - Vite构建工具配置
- `shopify.app.toml` - Shopify应用配置
- `tsconfig.json` - TypeScript配置
- `.eslintrc.cjs` - ESLint代码检查配置
- `.editorconfig` - 编辑器配置
- `README.md` - Shopify模板说明文档
- `PROJECT-README.md` - 项目具体功能说明

## 核心目录结构
```
app/
├── routes/                    # Remix路由文件
│   ├── app._index.jsx        # 应用主页面
│   ├── api.*.jsx             # API接口路由
│   └── webhooks.*.jsx        # Webhook处理路由
├── services/                  # 业务服务层
│   ├── translation.server.js  # 翻译服务
│   ├── shopify-graphql.server.js # Shopify GraphQL操作
│   ├── database.server.js    # 数据库操作
│   ├── queue.server.js       # Redis队列管理
│   └── memory-queue.server.js # 内存队列（Redis备选）
├── utils/                     # 工具函数
│   ├── api-response.server.js # API响应工具
│   └── config.server.js      # 配置管理
├── shopify.server.js         # Shopify应用初始化
├── db.server.js              # Prisma客户端
└── root.jsx                  # 应用根组件

prisma/
├── schema.prisma             # 数据库模型定义
└── migrations/               # 数据库迁移文件

public/                       # 静态资源
extensions/                   # Shopify扩展
.shopify/                     # Shopify CLI配置
```

## 数据模型
- **Session**: Shopify会话管理
- **Shop**: 店铺信息
- **Language**: 支持的语言
- **Resource**: 待翻译资源（产品/集合）
- **Translation**: 翻译结果