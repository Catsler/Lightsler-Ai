# 多店铺部署说明

本文档详细说明如何配置和部署多个Shopify店铺实例。

## 🏗️ 架构设计

### 配置层次结构

```
.env.shared          # 所有店铺共享配置
  ├── shop1/.env     # Shop1专属配置（覆盖共享配置）
  ├── shop2/.env     # Shop2专属配置
  └── shop3/.env     # Shop3专属配置
```

### 数据隔离策略

| 组件 | 隔离方式 | 说明 |
|------|---------|------|
| **数据库** | 独立数据库/Schema | 每个店铺使用独立数据库 |
| **Redis** | DB索引隔离 | Shop1→DB0, Shop2→DB1... |
| **队列** | 前缀隔离 | `bull:shop1:*`, `bull:shop2:*` |
| **日志** | 文件分离 | `logs/shop1.log`, `logs/shop2.log` |

## 📝 配置步骤

### 1. 创建共享配置

创建 `.env.shared`:

```bash
# ========== 所有店铺共享配置 ==========

# 翻译服务（共享API）
GPT_API_KEY=sk-your-shared-key
GPT_API_URL=https://api.openai.com/v1
GPT_MODEL=gpt-4o-mini

# Redis连接（共享服务器）
REDIS_ENABLED=true
REDIS_URL=redis://default:password@your-redis-host:6379

# 队列配置
QUEUE_CONCURRENCY=3

# 应用环境
NODE_ENV=production
NODE_TLS_REJECT_UNAUTHORIZED=0

# 日志配置
LOGGING_LEVEL=info
LOGGING_FILE_ENABLED=true
LOGGING_ENABLE_PERSISTENT_LOGGER=true
LOGGING_RETENTION_DAYS={"ERROR":30,"WARN":15,"INFO":7,"DEBUG":3}

# 性能设置
PERFORMANCE_MONITORING=true
MEMORY_CACHE_LIMIT=100

# 功能开关
ENABLE_PRODUCT_RELATED_TRANSLATION=true
LINK_CONVERSION_ENABLED=false
```

### 2. 创建店铺配置

#### Shop1 配置 (`shop1/.env`):

```bash
# ========== Shop1 专属配置 ==========

# Shopify应用
SHOPIFY_API_KEY=shop1_api_key_xxx
SHOPIFY_API_SECRET=shop1_secret_xxx
SHOPIFY_APP_SESSION_SECRET=shop1_session_secret
SHOPIFY_APP_URL=https://shop1.yourdomain.com

# 数据库（独立）
DATABASE_URL="postgresql://user:pass@host:5432/shop1_db"

# Redis DB（使用DB 0）
REDIS_URL=redis://default:password@your-redis-host:6379/0

# 店铺标识
SHOP_ID=shop1
SHOP_PREFIX=shop1

# 端口
PORT=3000
```

#### Shop2 配置 (`shop2/.env`):

```bash
# ========== Shop2 专属配置 ==========

# Shopify应用
SHOPIFY_API_KEY=shop2_api_key_xxx
SHOPIFY_API_SECRET=shop2_secret_xxx
SHOPIFY_APP_SESSION_SECRET=shop2_session_secret
SHOPIFY_APP_URL=https://shop2.yourdomain.com

# 数据库（独立）
DATABASE_URL="postgresql://user:pass@host:5432/shop2_db"

# Redis DB（使用DB 1）
REDIS_URL=redis://default:password@your-redis-host:6379/1

# 店铺标识
SHOP_ID=shop2
SHOP_PREFIX=shop2

# 端口
PORT=3001
```

### 3. 环境加载机制

应用启动时按以下顺序加载配置：

```javascript
// 1. 检查 SHOP_ID 环境变量
const shopId = process.env.SHOP_ID;

// 2. 加载共享配置
dotenv.config({ path: '.env.shared' });

// 3. 加载店铺专属配置（覆盖同名变量）
dotenv.config({ path: `${shopId}/.env`, override: true });

// 4. 验证必需变量
validateRequiredEnv([
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET',
  'DATABASE_URL',
  'REDIS_URL'
]);
```

## 🚀 启动多实例

### 方式1: 手动启动

```bash
# 终端1 - Shop1
SHOP_ID=shop1 PORT=3000 npm start

# 终端2 - Shop2
SHOP_ID=shop2 PORT=3001 npm start

# 终端3 - Shop3
SHOP_ID=shop3 PORT=3002 npm start
```

### 方式2: PM2管理

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'shop1-translator',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/translator',
      env: {
        SHOP_ID: 'shop1',
        PORT: 3000,
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/shop1-error.log',
      out_file: 'logs/shop1-out.log'
    },
    {
      name: 'shop2-translator',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/translator',
      env: {
        SHOP_ID: 'shop2',
        PORT: 3001,
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/shop2-error.log',
      out_file: 'logs/shop2-out.log'
    }
  ]
};
```

启动：

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 方式3: Docker Compose

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  shop1:
    build: .
    ports:
      - "3000:3000"
    environment:
      - SHOP_ID=shop1
      - PORT=3000
    env_file:
      - .env.shared
      - shop1/.env
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  shop2:
    build: .
    ports:
      - "3001:3001"
    environment:
      - SHOP_ID=shop2
      - PORT=3001
    env_file:
      - .env.shared
      - shop2/.env
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

启动：

```bash
docker-compose up -d
```

## 🔧 Nginx配置

### 多域名配置

```nginx
# Shop 1
server {
    listen 443 ssl http2;
    server_name shop1.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/shop1.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shop1.yourdomain.com/privkey.pem;

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

# Shop 2
server {
    listen 443 ssl http2;
    server_name shop2.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/shop2.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shop2.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        # ... 同上
    }
}
```

### 路径前缀配置（单域名）

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    location /shop1/ {
        rewrite ^/shop1(/.*)$ $1 break;
        proxy_pass http://localhost:3000;
        # ... proxy配置
    }

    location /shop2/ {
        rewrite ^/shop2(/.*)$ $1 break;
        proxy_pass http://localhost:3001;
        # ... proxy配置
    }
}
```

## 🗄️ 数据库管理

### PostgreSQL多数据库

```bash
# 创建数据库
psql -U postgres
CREATE DATABASE shop1_db;
CREATE DATABASE shop2_db;
CREATE DATABASE shop3_db;

# 运行迁移
SHOP_ID=shop1 npx prisma migrate deploy
SHOP_ID=shop2 npx prisma migrate deploy
SHOP_ID=shop3 npx prisma migrate deploy
```

### SQLite多文件

```bash
# Shop1
DATABASE_URL="file:./prisma/shop1.sqlite"

# Shop2
DATABASE_URL="file:./prisma/shop2.sqlite"
```

## 📊 监控多店铺

### 验证Redis隔离

```bash
# Shop1队列
SHOP_ID=shop1 node scripts/verify-redis-queue.mjs

# Shop2队列
SHOP_ID=shop2 node scripts/verify-redis-queue.mjs
```

预期输出：

```
🔍 验证 Redis 队列状态
📍 店铺: shop1
🔗 连接: redis-host:6379 (DB 0)
✅ Redis 连接成功

📊 队列统计:
  📁 bull:shop1:translation_shop1:wait: 5 个任务
  📁 bull:shop1:translation_shop1:active: 2 个任务
```

### PM2监控面板

```bash
pm2 monit
```

### 健康检查脚本

```bash
#!/bin/bash
# health-check.sh

SHOPS=("shop1:3000" "shop2:3001" "shop3:3002")

for shop in "${SHOPS[@]}"; do
    IFS=':' read -r name port <<< "$shop"
    status=$(curl -s "http://localhost:$port/api/status" | jq -r '.status')
    
    if [ "$status" = "ok" ]; then
        echo "✅ $name: OK"
    else
        echo "❌ $name: FAILED"
        pm2 restart "$name-translator"
    fi
done
```

## 🔒 安全最佳实践

### 1. 独立密钥

```bash
# 每个店铺使用独立session密钥
shop1/.env: SHOPIFY_APP_SESSION_SECRET=$(openssl rand -hex 32)
shop2/.env: SHOPIFY_APP_SESSION_SECRET=$(openssl rand -hex 32)
```

### 2. 文件权限

```bash
chmod 600 .env.shared shop*/.env
chmod 700 shop*/
```

### 3. 防火墙规则

```bash
# 只允许Nginx访问应用端口
sudo ufw allow from 127.0.0.1 to any port 3000
sudo ufw allow from 127.0.0.1 to any port 3001
```

## 🐛 故障排查

### 配置冲突

**问题**: Shop2使用了Shop1的配置

**检查**:

```bash
# 确认环境变量
SHOP_ID=shop2 node -e "require('./app/load-env.server.js').loadEnvironment(); console.log(process.env.SHOPIFY_API_KEY)"

# 验证加载顺序
SHOP_ID=shop2 DEBUG=dotenv* npm start
```

### Redis DB冲突

**问题**: 两个店铺共用同一个Redis DB

**解决**:

```bash
# 检查DB配置
redis-cli -h host -a password
SELECT 0
KEYS bull:*

# 清理错误的键
redis-cli -h host -a password --scan --pattern "bull:shop2:*" | xargs redis-cli -h host -a password DEL
```

### 端口占用

**问题**: `Error: listen EADDRINUSE: address already in use :::3000`

**解决**:

```bash
# 查找占用进程
lsof -i :3000

# 杀死进程或更改端口
kill -9 <PID>
# 或
PORT=3003 SHOP_ID=shop1 npm start
```

## 📈 性能优化

### 1. 独立队列Worker

```bash
# 主应用（只负责接收请求）
SHOP_ID=shop1 QUEUE_ROLE=app PORT=3000 npm start

# 队列Worker（只负责处理任务）
SHOP_ID=shop1 QUEUE_ROLE=worker npm run worker
```

### 2. Redis连接池

```bash
# 增加连接池大小
REDIS_MAX_CONNECTIONS=50
REDIS_MIN_CONNECTIONS=10
```

### 3. 负载均衡

```nginx
upstream shop1_backend {
    least_conn;
    server localhost:3000 weight=1;
    server localhost:3010 weight=1;  # Shop1的第二个实例
}

server {
    location / {
        proxy_pass http://shop1_backend;
    }
}
```

## 📝 维护清单

### 每日

- [ ] 检查所有店铺状态 `pm2 status`
- [ ] 验证队列隔离 `./verify-all-shops.sh`
- [ ] 查看错误日志 `tail -f logs/shop*.log`

### 每周

- [ ] 清理各店铺队列 `npm run queue:clean`
- [ ] 备份所有数据库
- [ ] 检查磁盘使用 `df -h`

### 每月

- [ ] 更新依赖 `npm update`
- [ ] 审查安全配置
- [ ] 性能分析报告

## 🆘 紧急响应

### 某个店铺崩溃

```bash
# 1. 快速重启
pm2 restart shop1-translator

# 2. 检查日志
pm2 logs shop1-translator --lines 100

# 3. 隔离问题
pm2 stop shop1-translator  # 防止影响其他店铺
```

### 全部店铺崩溃

```bash
# 1. 检查共享资源
systemctl status redis
systemctl status postgresql

# 2. 重启所有服务
pm2 restart all

# 3. 回滚版本
git checkout <stable-commit>
npm run build
pm2 restart all
```

## 📞 获取帮助

- 配置问题: 检查 `app/load-env.server.js:16-90`
- Redis问题: 运行 `scripts/verify-redis-queue.mjs`
- 队列问题: 查看 `app/services/queue.server.js:52-122`
