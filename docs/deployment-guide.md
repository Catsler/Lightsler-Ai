# 生产环境部署指南

本文档说明如何将 Shopify 翻译应用部署到生产环境。

## 📋 部署前检查清单

### 1. 环境准备

- [ ] Node.js 18.20+ / 20.10+ / 21.0+
- [ ] Redis服务（推荐Railway、Upstash等云服务）
- [ ] PostgreSQL数据库（可选，SQLite也支持）
- [ ] SSL证书和域名
- [ ] Shopify Partner账号

### 2. 配置文件

```bash
# 1. 复制配置模板
cp .env.example .env
cp .env.shared.example .env.shared

# 2. 多店铺配置（可选）
cp shop1/.env.example shop1/.env
cp shop2/.env.example shop2/.env

# 3. 填写必需字段
# - SHOPIFY_API_KEY
# - SHOPIFY_API_SECRET  
# - SHOPIFY_APP_SESSION_SECRET
# - GPT_API_KEY
# - REDIS_URL
# - DATABASE_URL
```

## 🚀 部署步骤

### 方案A：单店铺部署

#### 1. 配置环境变量

编辑 `.env`：

```bash
# Shopify配置
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_SESSION_SECRET=$(openssl rand -hex 32)
SHOPIFY_APP_URL=https://your-domain.com

# 数据库
DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# Redis
REDIS_ENABLED=true
REDIS_URL=redis://default:pass@host:6379/0

# 翻译服务
GPT_API_KEY=sk-your-key
GPT_MODEL=gpt-4o-mini

# 队列配置
QUEUE_CONCURRENCY=3
```

#### 2. 初始化数据库

```bash
npx prisma migrate deploy
npx prisma generate
```

#### 3. 构建应用

```bash
npm run build
```

#### 4. 启动服务

```bash
# 生产模式
NODE_ENV=production npm start

# 使用PM2（推荐）
pm2 start npm --name "shopify-translator" -- start
pm2 save
```

### 方案B：多店铺部署

#### 1. 配置共享环境

编辑 `.env.shared`：

```bash
# 所有店铺共享的配置
GPT_API_KEY=sk-your-key
REDIS_URL=redis://default:pass@host:6379
QUEUE_CONCURRENCY=2
NODE_ENV=production
```

#### 2. 配置各店铺

**shop1/.env:**

```bash
SHOPIFY_API_KEY=shop1_api_key
SHOPIFY_API_SECRET=shop1_secret
SHOPIFY_APP_SESSION_SECRET=$(openssl rand -hex 32)
SHOPIFY_APP_URL=https://shop1.your-domain.com
DATABASE_URL="postgresql://user:pass@host:5432/shop1_db"
REDIS_URL=redis://default:pass@host:6379/0
SHOP_ID=shop1
PORT=3000
```

**shop2/.env:**

```bash
SHOPIFY_API_KEY=shop2_api_key
SHOPIFY_API_SECRET=shop2_secret
SHOPIFY_APP_SESSION_SECRET=$(openssl rand -hex 32)
SHOPIFY_APP_URL=https://shop2.your-domain.com
DATABASE_URL="postgresql://user:pass@host:5432/shop2_db"
REDIS_URL=redis://default:pass@host:6379/1
SHOP_ID=shop2
PORT=3001
```

#### 3. 启动多实例

```bash
# Shop 1
SHOP_ID=shop1 PORT=3000 npm start &

# Shop 2
SHOP_ID=shop2 PORT=3001 npm start &

# 或使用PM2
pm2 start ecosystem.config.js
```

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [
    {
      name: 'shop1-translator',
      script: 'npm',
      args: 'start',
      env: {
        SHOP_ID: 'shop1',
        PORT: 3000,
        NODE_ENV: 'production'
      }
    },
    {
      name: 'shop2-translator',
      script: 'npm',
      args: 'start',
      env: {
        SHOP_ID: 'shop2',
        PORT: 3001,
        NODE_ENV: 'production'
      }
    }
  ]
};
```

## 🔧 Redis队列配置

### 推荐云服务

1. **Railway Redis**
   ```bash
   REDIS_URL=redis://default:password@redis.railway.internal:6379/0
   ```

2. **Upstash Redis**
   ```bash
   REDIS_URL=rediss://default:password@region.upstash.io:6379/0
   ```

3. **阿里云Redis**
   ```bash
   REDIS_URL=redis://user:password@r-xxx.redis.rds.aliyuncs.com:6379/0
   ```

### 数据隔离策略

- **单店铺**: 使用 DB 0
- **多店铺**: 
  - Shop1 → DB 0
  - Shop2 → DB 1
  - Shop3 → DB 2
  - 依此类推（Redis支持0-15共16个DB）

### 验证队列状态

```bash
# 检查Redis连接
node scripts/verify-redis-queue.mjs

# 查看队列统计
npm run queue:stats

# 清理失败任务
npm run queue:clean
```

## 🌐 Nginx反向代理

### 单店铺配置

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 多店铺配置

```nginx
# Shop 1
server {
    listen 443 ssl http2;
    server_name shop1.your-domain.com;

    ssl_certificate /path/to/shop1-cert.pem;
    ssl_certificate_key /path/to/shop1-key.pem;

    location / {
        proxy_pass http://localhost:3000;
        # ... 其他配置同上
    }
}

# Shop 2
server {
    listen 443 ssl http2;
    server_name shop2.your-domain.com;

    ssl_certificate /path/to/shop2-cert.pem;
    ssl_certificate_key /path/to/shop2-key.pem;

    location / {
        proxy_pass http://localhost:3001;
        # ... 其他配置同上
    }
}
```

## 🔍 健康检查

### 应用健康检查

```bash
# 基础健康检查
curl https://your-domain.com/api/status

# Redis队列检查
curl https://your-domain.com/api/queue/stats
```

### PM2监控

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs shopify-translator

# 重启应用
pm2 restart shopify-translator

# 查看监控面板
pm2 monit
```

## 🐛 故障排查

### 1. 队列无法工作

```bash
# 检查Redis连接
node scripts/verify-redis-queue.mjs

# 查看错误日志
tail -f logs/app.log | jq 'select(.level==50)'

# 重启队列
pm2 restart all
```

### 2. 翻译失败

```bash
# 查看错误模式
npm run errors:analyze

# 检查API配置
echo $GPT_API_KEY | head -c 10
curl -H "Authorization: Bearer $GPT_API_KEY" $GPT_API_URL/models
```

### 3. 数据库问题

```bash
# 检查连接
npx prisma db pull

# 查看迁移状态
npx prisma migrate status

# 重新生成客户端
npx prisma generate
```

## 📊 性能优化

### 1. 队列并发优化

```bash
# 根据服务器性能调整
QUEUE_CONCURRENCY=3  # 2核CPU推荐2-3
QUEUE_CONCURRENCY=5  # 4核CPU推荐4-5
QUEUE_CONCURRENCY=8  # 8核CPU推荐6-8
```

### 2. 数据库连接池

```bash
# PostgreSQL连接池
DATABASE_URL="postgresql://user:pass@host/db?connection_limit=10&pool_timeout=20"
```

### 3. Redis优化

```bash
# 启用连接池
REDIS_MAX_CONNECTIONS=50
REDIS_MIN_CONNECTIONS=10
```

## 🔐 安全建议

1. **环境变量保护**
   ```bash
   chmod 600 .env shop*/.env
   ```

2. **密钥轮换**
   ```bash
   # 定期更新session密钥
   SHOPIFY_APP_SESSION_SECRET=$(openssl rand -hex 32)
   ```

3. **访问控制**
   ```bash
   # Nginx IP白名单
   allow 203.0.113.0/24;
   deny all;
   ```

4. **日志安全**
   ```bash
   # 定期清理敏感日志
   npm run logs:cleanup
   ```

## 📝 维护任务

### 每日

- [ ] 检查应用状态 `pm2 status`
- [ ] 查看错误日志 `tail -f logs/app.log`
- [ ] 监控队列堆积 `npm run queue:stats`

### 每周

- [ ] 清理完成任务 `npm run queue:clean`
- [ ] 数据库备份 `pg_dump > backup.sql`
- [ ] 检查磁盘空间 `df -h`

### 每月

- [ ] 更新依赖 `npm audit && npm update`
- [ ] 审查错误模式 `npm run errors:analyze`
- [ ] 性能分析 `npm run perf:report`

## 🆘 紧急恢复

### 应用崩溃

```bash
# 1. 重启应用
pm2 restart all

# 2. 检查日志
pm2 logs --lines 100

# 3. 回滚版本（如需要）
git checkout <previous-commit>
npm run build
pm2 restart all
```

### 数据丢失

```bash
# 1. 停止应用
pm2 stop all

# 2. 恢复数据库
psql < backup.sql

# 3. 重新启动
pm2 restart all
```

### Redis队列堆积

```bash
# 1. 暂停新任务
pm2 stop all

# 2. 清理队列
redis-cli FLUSHDB

# 3. 重启应用
pm2 restart all
```

## 📞 支持

- 文档: `/docs`
- Issues: GitHub Issues
- 日志分析: `npm run logs:analyze`
