# 🚀 部署到你的阿里云服务器

## 服务器信息
- **公网IP**: 47.79.77.128
- **私有IP**: 172.19.0.234
- **实例ID**: 24264022f32e498c937fd865b35dbc2b

## 快速部署步骤

### 步骤1：连接到服务器

打开终端（Mac）或 PowerShell（Windows），执行：

```bash
ssh root@47.79.77.128
```

输入你的服务器密码。

### 步骤2：执行一键部署脚本

连接成功后，复制并执行以下命令：

```bash
# 下载并执行部署脚本
wget https://raw.githubusercontent.com/Catsler/Lightsler-Ai/main/aliyun-deploy.sh
chmod +x aliyun-deploy.sh
./aliyun-deploy.sh
```

### 步骤3：配置环境变量

当脚本暂停并打开编辑器时，将以下内容完整粘贴进去：

```bash
# ===========================================
# Shopify 应用配置 (必需)
# ===========================================
SHOPIFY_API_KEY=8102af9807fd9df0b322a44f500a1d0e
SHOPIFY_API_SECRET=0f2fc13c5b8a126e1c5fde1200fdf266

# 应用URL - 使用你的服务器IP
SHOPIFY_APP_URL=http://47.79.77.128

# API权限范围 (必需)
SCOPES=read_content,read_files,read_locales,read_online_store_pages,read_products,read_themes,read_translations,write_content,write_files,write_locales,write_products,write_themes,write_translations,write_online_store_pages

# ===========================================
# 数据库配置 (必需)
# ===========================================
DATABASE_URL=file:./dev.db

# ===========================================
# AI翻译服务配置 (使用vveai.com中转API)
# ===========================================
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
REDIS_URL=redis://localhost:6379

# ===========================================
# 品牌保护配置
# ===========================================
ENABLE_BRAND_PROTECTION=true
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

**保存方法**：
- 按 `ESC` 键
- 输入 `:wq`
- 按回车

### 步骤4：等待部署完成

脚本会自动：
1. 安装 Node.js、PM2、Redis
2. 克隆项目代码
3. 安装依赖
4. 初始化数据库
5. 构建项目
6. 启动应用
7. 配置 Nginx

### 步骤5：验证部署

部署完成后，访问：
- **应用地址**: http://47.79.77.128
- **Shopify Admin**: http://47.79.77.128/app

## 常用运维命令

### 查看应用状态
```bash
pm2 status
```

### 查看实时日志
```bash
pm2 logs shopify-app
```

### 重启应用
```bash
pm2 restart shopify-app
```

### 更新代码
```bash
cd /root/shopify-app
git pull origin main
npm install
npm run build
pm2 restart shopify-app
```

### 查看错误日志
```bash
pm2 logs shopify-app --err
```

## 防火墙配置

确保阿里云安全组已开放以下端口：
- **22** (SSH)
- **80** (HTTP)
- **443** (HTTPS)
- **3000** (Node.js应用)

在阿里云控制台设置：
1. 进入ECS实例详情
2. 点击"安全组"
3. 添加规则：
   - 端口范围：80/80
   - 授权对象：0.0.0.0/0
   - 同样添加 443 和 3000

## 域名配置（可选）

如果你有域名，可以：

1. **添加DNS记录**
   - 类型：A
   - 主机记录：@
   - 记录值：47.79.77.128

2. **配置HTTPS**
   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d 你的域名.com
   ```

## 故障排查

### 无法访问应用
```bash
# 检查端口
netstat -tlnp | grep -E '80|3000'

# 检查防火墙
ufw status

# 检查Nginx
systemctl status nginx
```

### PM2应用未启动
```bash
# 手动启动
cd /root/shopify-app
pm2 start npm --name shopify-app -- start
```

### 数据库错误
```bash
cd /root/shopify-app
npx prisma migrate reset
npm run setup
```

## 监控建议

1. **设置自动重启**
   ```bash
   pm2 set pm2:max_memory_restart 1G
   ```

2. **定期备份**
   ```bash
   # 每天凌晨2点备份
   0 2 * * * sqlite3 /root/shopify-app/prisma/dev.db ".backup /root/backup-$(date +\%Y\%m\%d).db"
   ```

3. **日志轮转**
   ```bash
   pm2 install pm2-logrotate
   pm2 set pm2-logrotate:max_size 10M
   ```

## 需要帮助？

如果遇到问题：
1. 截图错误信息
2. 运行 `pm2 logs shopify-app --err`
3. 联系支持

---

**快速部署命令汇总**：

```bash
# 一行命令完成所有操作
ssh root@47.79.77.128 'wget https://raw.githubusercontent.com/Catsler/Lightsler-Ai/main/aliyun-deploy.sh && chmod +x aliyun-deploy.sh && ./aliyun-deploy.sh'
```

祝部署顺利！🎉