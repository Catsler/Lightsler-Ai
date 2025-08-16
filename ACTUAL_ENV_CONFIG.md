# 🔑 实际环境变量配置说明

## 重要提示
本项目使用**第三方中转API**（vveai.com），不是OpenAI官方API。

## 完整的 .env 配置

部署时，需要在服务器上创建以下完整的 `.env` 文件：

```bash
# ===========================================
# Shopify 应用配置 (必需)
# ===========================================
SHOPIFY_API_KEY=8102af9807fd9df0b322a44f500a1d0e
SHOPIFY_API_SECRET=0f2fc13c5b8a126e1c5fde1200fdf266

# 应用URL (改为你的服务器IP或域名)
SHOPIFY_APP_URL=http://你的服务器IP

# API权限范围 (必需)
SCOPES=read_content,read_files,read_locales,read_online_store_pages,read_products,read_themes,read_translations,write_content,write_files,write_locales,write_products,write_themes,write_translations,write_online_store_pages

# ===========================================
# 数据库配置 (必需)
# ===========================================
DATABASE_URL=file:./dev.db

# ===========================================
# AI翻译服务配置 (使用vveai.com中转API)
# ===========================================
# 注意：这是第三方中转API，不是OpenAI官方
OPENAI_API_KEY=sk-su9oTJ7eVzgdcNNDF5775fD84656419b83544f058bFe8f74
OPENAI_BASE_URL=https://us.vveai.com/v1
OPENAI_MODEL=gpt-3.5-turbo

# GPT翻译API配置 (应用使用这个变量名)
GPT_API_KEY=sk-su9oTJ7eVzgdcNNDF5775fD84656419b83544f058bFe8f74
GPT_API_URL=https://us.vveai.com/v1
GPT_MODEL=gpt-4o-mini

# ===========================================
# Redis缓存配置 (推荐配置)
# ===========================================
REDIS_ENABLED=true
# 如果使用本地Redis
REDIS_URL=redis://localhost:6379
# 如果使用Redis Cloud (根据你的实际配置)
# REDIS_URL=redis://default:XNq0vHP6GUnDmVzX3rDr4Cc2x1VtcPdk@redis-16910.c258.us-east-1-4.ec2.redns.redis-cloud.com:16910

# ===========================================
# 品牌保护配置
# ===========================================
ENABLE_BRAND_PROTECTION=true
# 你的品牌名称（这些不会被翻译）
CUSTOM_BRANDS=Onewind,fynony,ease-joy
SMART_BRAND_DETECTION=true
PROTECT_PRODUCT_MODELS=true
PROTECT_SKU=true
PROTECT_MATERIALS=true

# ===========================================
# Webhook自动翻译配置
# ===========================================
WEBHOOK_AUTO_TRANSLATE_ENABLED=true
WEBHOOK_TRANSLATE_DELAY=5000
WEBHOOK_BATCH_THRESHOLD=10
WEBHOOK_DEDUP_WINDOW=60
WEBHOOK_EVENT_RETENTION_DAYS=30
WEBHOOK_PRODUCT_PRIORITY=HIGH
WEBHOOK_COLLECTION_PRIORITY=HIGH
WEBHOOK_PAGE_PRIORITY=NORMAL
WEBHOOK_ARTICLE_PRIORITY=NORMAL
WEBHOOK_THEME_PRIORITY=LOW
WEBHOOK_ERROR_NOTIFICATION=true

# ===========================================
# 日志配置
# ===========================================
LOG_LEVEL=info
LOG_FORMAT=json
LOG_DIR=logs

# ===========================================
# 环境设置
# ===========================================
NODE_ENV=production
```

## 部署步骤（使用实际配置）

### 1. SSH连接服务器
```bash
ssh root@你的服务器IP
```

### 2. 克隆项目
```bash
git clone https://github.com/Catsler/Lightsler-Ai.git shopify-app
cd shopify-app
```

### 3. 创建完整的 .env 文件
```bash
cat > .env << 'EOF'
# 粘贴上面的完整配置
# 记得修改 SHOPIFY_APP_URL 为你的服务器IP
EOF
```

或者直接编辑：
```bash
vim .env
# 粘贴完整配置
```

### 4. 安装依赖并启动
```bash
npm install
npm run setup
npm run build
pm2 start npm --name shopify-app -- start
```

## 关键配置说明

### 1. **中转API配置**
- **API地址**: `https://us.vveai.com/v1`
- **不是** OpenAI官方API
- 支持 GPT-3.5 和 GPT-4 模型
- 价格通常比官方便宜

### 2. **品牌保护**
已配置的品牌：
- Onewind
- fynony
- ease-joy

这些品牌名在翻译时会被保护，不会被翻译成其他语言。

### 3. **Redis配置**
- 本地Redis: `redis://localhost:6379`
- Redis Cloud: 使用你的实际Redis Cloud连接字符串

### 4. **Webhook自动翻译**
- 已启用自动翻译
- 产品和集合优先级设为HIGH
- 5秒延迟避免频繁触发

## 注意事项

1. **API密钥安全**
   - 不要将真实的 `.env` 文件提交到Git
   - 密钥只在服务器上配置

2. **中转API限制**
   - 检查vveai.com的使用限制
   - 可能有请求频率限制
   - 余额用完需要充值

3. **服务器IP配置**
   - 记得将 `SHOPIFY_APP_URL` 改为你的实际服务器IP
   - 格式：`http://xxx.xxx.xxx.xxx` 或 `https://你的域名.com`

## 快速部署命令（一行搞定）

在服务器上执行：
```bash
wget https://raw.githubusercontent.com/Catsler/Lightsler-Ai/main/aliyun-deploy.sh && chmod +x aliyun-deploy.sh && ./aliyun-deploy.sh
```

然后编辑 `.env` 文件，粘贴上面的完整配置即可。