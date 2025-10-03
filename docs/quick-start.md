# 快速开始指南

## 📦 安装依赖

```bash
npm install
```

## ⚙️ 环境配置

### 1. 基础配置（单店铺）

```bash
# 复制配置模板
cp .env.example .env

# 编辑 .env
nano .env
```

必需配置项：

```bash
# Shopify应用信息（从Partner Dashboard获取）
SHOPIFY_API_KEY=fa2e9f646301c483f81570613924c495
SHOPIFY_API_SECRET=your_secret

# 翻译服务
GPT_API_KEY=sk-your-openai-key

# Redis（可选，不配置则使用内存队列）
REDIS_URL=redis://localhost:6379/0
```

### 2. 多店铺配置

```bash
# 复制共享配置
cp .env.shared.example .env.shared

# 复制店铺配置
cp shop1/.env.example shop1/.env
cp shop2/.env.example shop2/.env

# 编辑配置文件
nano .env.shared
nano shop1/.env
nano shop2/.env
```

## 🗄️ 数据库初始化

```bash
# 运行数据库迁移
npx prisma migrate dev

# 生成Prisma客户端
npx prisma generate
```

## 🚀 启动开发服务器

### 单店铺模式

```bash
npm run dev
```

### 多店铺模式

```bash
# 启动Shop 1
SHOP_ID=shop1 PORT=3000 npm run dev

# 启动Shop 2（新终端）
SHOP_ID=shop2 PORT=3001 npm run dev
```

## ✅ 验证安装

### 1. 检查应用状态

```bash
curl http://localhost:3000/api/status
```

预期响应：

```json
{
  "status": "ok",
  "version": "1.0.0",
  "environment": "development",
  "queue": {
    "type": "redis",
    "connected": true
  }
}
```

### 2. 验证Redis队列

```bash
node scripts/verify-redis-queue.mjs
```

### 3. 检查数据库

```bash
npx prisma studio
```

## 🧪 测试翻译功能

### 1. 扫描资源

```bash
curl -X POST http://localhost:3000/api/scan-resources \
  -H "Content-Type: application/json" \
  -d '{"resourceType": "PRODUCT"}'
```

### 2. 启动翻译

```bash
curl -X POST http://localhost:3000/api/translate-queue \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "your-resource-id",
    "language": "ja"
  }'
```

### 3. 查看任务状态

```bash
curl http://localhost:3000/api/queue/stats
```

## 🔍 常见问题

### Redis连接失败

**问题**: `ECONNREFUSED 127.0.0.1:6379`

**解决**:

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis

# 或设置为内存队列模式
REDIS_ENABLED=false npm run dev
```

### 数据库错误

**问题**: `Error: P1001: Can't reach database server`

**解决**:

```bash
# 检查数据库文件权限
ls -la prisma/dev.sqlite

# 重新初始化
rm prisma/dev.sqlite
npx prisma migrate dev
```

### 翻译API失败

**问题**: `401 Unauthorized`

**解决**:

```bash
# 验证API密钥
echo $GPT_API_KEY

# 测试连接
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $GPT_API_KEY"
```

## 📚 下一步

- 📖 阅读 [部署指南](./deployment-guide.md)
- 🔧 查看 [配置说明](../CLAUDE.md)
- 🐛 学习 [故障排查](./troubleshooting.md)
- 📊 了解 [性能优化](./performance-optimization.md)

## 🆘 获取帮助

```bash
# 查看日志
tail -f logs/app.log

# 运行诊断
npm run diagnose

# 查看错误统计
npm run errors:summary
```
