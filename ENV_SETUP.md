# 🔐 环境变量配置指南

## 重要说明
⚠️ **`.env` 文件包含敏感信息，绝对不要上传到 GitHub！**

## 配置方法

### 方法1：部署时直接创建（推荐）

在服务器上手动创建 `.env` 文件：

```bash
# SSH 连接到服务器后
cd /root/shopify-app

# 创建 .env 文件
cat > .env << 'EOF'
SHOPIFY_API_KEY=你的实际密钥
SHOPIFY_API_SECRET=你的实际密码
GPT_API_KEY=sk-你的OpenAI密钥
GPT_API_URL=https://api.openai.com/v1
REDIS_URL=redis://localhost:6379
NODE_ENV=production
PORT=3000
EOF
```

### 方法2：使用模板文件

```bash
# 复制模板文件
cp .env.example .env

# 编辑并填入实际值
vim .env
```

### 方法3：使用环境变量管理工具

创建一个本地的 `deploy-secrets.sh` 文件（不要提交到Git）：

```bash
#!/bin/bash
# deploy-secrets.sh - 本地保存，不要上传到Git

# 你的实际密钥
export SHOPIFY_API_KEY="8102af9807fd9df0b322a44f500a1d0e"
export SHOPIFY_API_SECRET="0f2fc13c5b8a126e1c5fde1200fdf266"
export GPT_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxx"

# SSH到服务器并创建.env
ssh root@服务器IP << 'ENDSSH'
cd /root/shopify-app
cat > .env << EOF
SHOPIFY_API_KEY=$SHOPIFY_API_KEY
SHOPIFY_API_SECRET=$SHOPIFY_API_SECRET
GPT_API_KEY=$GPT_API_KEY
GPT_API_URL=https://api.openai.com/v1
REDIS_URL=redis://localhost:6379
NODE_ENV=production
PORT=3000
EOF
pm2 restart shopify-app
ENDSSH
```

### 方法4：使用密钥管理服务

对于团队协作，可以使用：
- **1Password** - 团队密码管理
- **AWS Secrets Manager** - AWS密钥管理
- **HashiCorp Vault** - 企业级密钥管理

## 获取各种密钥

### 1. Shopify API 密钥

1. 登录 [Shopify Partners](https://partners.shopify.com)
2. 进入你的应用
3. 在"应用设置"中找到：
   - Client ID → `SHOPIFY_API_KEY`
   - Client Secret → `SHOPIFY_API_SECRET`

### 2. OpenAI API 密钥

1. 登录 [OpenAI Platform](https://platform.openai.com)
2. 进入 API keys 页面
3. 创建新密钥 → `GPT_API_KEY`

### 3. 使用兼容 API（可选）

如果使用其他兼容的API服务：
```env
# Cursor AI API
GPT_API_URL=https://api.cursorai.art/v1
GPT_API_KEY=你的密钥

# 其他兼容服务
GPT_API_URL=你的API地址
GPT_API_KEY=你的密钥
```

## 安全最佳实践

### ✅ 应该做的

1. **使用 .gitignore**
   ```gitignore
   .env
   .env.local
   .env.production
   ```

2. **使用强密码**
   ```bash
   # 生成随机密钥
   openssl rand -hex 32
   ```

3. **定期轮换密钥**
   - 每3-6个月更换一次
   - 记录密钥版本

4. **限制密钥权限**
   ```bash
   chmod 600 .env
   ```

### ❌ 不要做的

1. **不要硬编码密钥**
   ```javascript
   // 错误示例
   const apiKey = "sk-xxxxx"; // 永远不要这样做！
   ```

2. **不要提交到Git**
   ```bash
   # 如果不小心提交了，立即：
   git rm --cached .env
   git commit -m "Remove .env file"
   # 然后立即更换所有密钥！
   ```

3. **不要在日志中打印**
   ```javascript
   // 错误示例
   console.log(process.env.GPT_API_KEY); // 危险！
   ```

## 故障排查

### 环境变量未加载

```bash
# 检查文件是否存在
ls -la .env

# 检查权限
chmod 644 .env

# 手动加载测试
node -e "require('dotenv').config(); console.log(process.env.SHOPIFY_API_KEY ? '✓ Loaded' : '✗ Not loaded')"
```

### PM2 环境变量问题

```bash
# 方法1：重启PM2
pm2 restart shopify-app --update-env

# 方法2：删除并重新启动
pm2 delete shopify-app
pm2 start npm --name shopify-app -- start

# 方法3：使用ecosystem文件
pm2 start ecosystem.config.js
```

## 快速检查清单

部署前确认：
- [ ] `.env.example` 文件已创建
- [ ] `.env` 在 `.gitignore` 中
- [ ] 没有将真实密钥提交到 Git
- [ ] 准备好所有必需的密钥
- [ ] 知道如何在服务器上创建 `.env`

## 示例：完整的部署流程

```bash
# 1. 在本地准备密钥（保存到安全的地方）
SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx
GPT_API_KEY=sk-xxx

# 2. SSH 到服务器
ssh root@服务器IP

# 3. 克隆项目
git clone https://github.com/Catsler/Lightsler-Ai.git shopify-app
cd shopify-app

# 4. 创建 .env 文件
vim .env
# 粘贴你的密钥配置

# 5. 安装和启动
npm install
npm run setup
npm run build
pm2 start npm --name shopify-app -- start
```

---
记住：**密钥安全是最重要的！**