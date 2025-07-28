# Shopify翻译应用

这是一个基于Shopify的嵌入式翻译应用，用于自动翻译店铺的产品和集合内容。

## 🎯 功能特性

- ✅ **资源扫描**: 自动扫描店铺的产品和集合
- ✅ **智能翻译**: 使用GPT API翻译内容
- ✅ **批量处理**: 支持批量翻译和任务队列
- ✅ **实时同步**: 翻译结果自动同步到Shopify
- ✅ **简洁界面**: 基础的测试界面用于操作

## 🏗️ 技术架构

- **后端**: Node.js + Remix + Prisma + SQLite
- **前端**: React + Polaris Web Components
- **队列**: Bull + Redis (可选)
- **API集成**: Shopify GraphQL + GPT翻译API

## 📋 环境要求

- Node.js 18.20+ 或 20.10+ 或 21.0+
- npm 或 yarn
- Redis (可选，用于任务队列)
- Shopify合作伙伴账户

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 环境配置

复制环境变量示例文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置必需的环境变量：

```bash
# Shopify应用配置 (必需)
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret

# GPT翻译API配置 (推荐)
GPT_API_URL=https://api-gpt-ge.apifox.cn
GPT_API_KEY=your_gpt_api_key

# Redis配置 (可选)
REDIS_URL=redis://localhost:6379
```

### 3. 数据库设置

```bash
# 生成Prisma客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate dev
```

### 4. 启动开发服务器

```bash
npm run dev
```

应用将在本地启动，通过Shopify CLI连接到你的开发店铺。

## 📖 使用说明

### 基本操作流程

1. **选择目标语言**: 在下拉菜单中选择要翻译的目标语言
2. **扫描资源**: 点击"扫描产品"或"扫描集合"获取店铺数据
3. **选择资源**: 在资源列表中选择要翻译的项目（或全选）
4. **开始翻译**: 点击"开始翻译"按钮执行翻译任务
5. **查看结果**: 在操作日志中查看翻译进度和结果

### API接口

应用提供以下API接口：

- `POST /api/scan-products` - 扫描产品
- `POST /api/scan-collections` - 扫描集合
- `POST /api/translate` - 同步翻译
- `POST /api/translate-queue` - 异步翻译（队列）
- `GET /api/status` - 获取状态
- `POST /api/clear` - 清理数据
- `GET /api/config` - 获取配置信息

## 🛠️ 开发信息

### 项目结构

```
app/
├── routes/                 # Remix路由
│   ├── app._index.jsx     # 主页面
│   └── api.*.jsx          # API路由
├── services/              # 业务服务
│   ├── translation.server.js
│   ├── shopify-graphql.server.js
│   ├── database.server.js
│   └── queue.server.js
└── utils/                 # 工具函数
    ├── api-response.server.js
    └── config.server.js

prisma/
├── schema.prisma          # 数据模型
└── migrations/            # 数据库迁移
```

### 数据模型

- **Shop**: 店铺信息
- **Resource**: 待翻译资源（产品/集合）
- **Translation**: 翻译结果
- **Language**: 支持的语言

### 环境变量说明

| 变量名 | 必需 | 默认值 | 说明 |
|--------|------|--------|------|
| `SHOPIFY_API_KEY` | ✅ | - | Shopify应用API密钥 |
| `SHOPIFY_API_SECRET` | ✅ | - | Shopify应用密钥 |
| `GPT_API_URL` | ⚠️ | https://api-gpt-ge.apifox.cn | GPT翻译API地址 |
| `GPT_API_KEY` | ⚠️ | - | GPT API密钥 |
| `REDIS_URL` | ❌ | - | Redis连接URL（可选） |
| `DATABASE_URL` | ❌ | file:dev.sqlite | 数据库连接URL |

## 🔧 功能配置

### Redis队列（可选）

如果配置了Redis，应用将使用任务队列处理翻译任务：

```bash
# 启动Redis（macOS）
brew services start redis

# 启动Redis（Windows/WSL）
redis-server
```

### 翻译API

应用支持自定义翻译API。默认使用提供的GPT API，你也可以：

1. 修改 `app/services/translation.server.js`
2. 适配你的翻译API接口格式
3. 更新环境变量配置

## 📝 后续开发建议

### 优化功能
1. **UI优化**: 重新设计更美观的用户界面
2. **性能优化**: 添加缓存和优化查询
3. **错误处理**: 完善错误处理和用户提示
4. **权限管理**: 添加用户权限和访问控制

### 扩展功能
1. **更多资源类型**: 支持页面、博客文章翻译
2. **翻译管理**: 翻译历史、版本控制
3. **质量控制**: 翻译质量评估和人工审核
4. **自动化**: 自动检测内容变更并翻译

## 📊 当前状态

✅ **已完成功能**:
- 后端API完整实现
- 数据库结构设计
- Redis任务队列
- 基础前端界面
- Shopify GraphQL集成
- GPT翻译API集成

🔧 **待优化项目**:
- UI界面美化
- 错误处理完善
- 性能优化
- 功能测试

## 🤝 开发指南

应用已具备完整的后端功能，前端提供基础测试界面。你可以：

1. **直接使用**: 配置环境变量后即可开始翻译
2. **UI定制**: 基于现有API重新设计界面
3. **功能扩展**: 添加更多翻译相关功能
4. **性能优化**: 根据使用情况优化性能