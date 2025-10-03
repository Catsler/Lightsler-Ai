# 本地 Redis 队列环境配置指南

为了在本地重现轻量服务器的队列行为，请按照下列步骤准备 Redis 服务和环境变量。整个过程不会改动现有服务启动方式，仍然保持 `shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000`。

## 1. 启动本地 Redis（Docker 方式）

```bash
# 进入项目根目录
cd /Users/elie/Downloads/translate/Lightsler-Ai

# 启动本地 Redis（密码与服务器一致、端口 6379）
docker run -d --name lightsler-redis \
  -p 6379:6379 \
  -e REDIS_PASSWORD=gedTtMvRpnZNccvqCpgjBdDycKIiLOFR \
  redis:7-alpine \
  redis-server --requirepass gedTtMvRpnZNccvqCpgjBdDycKIiLOFR
```

> 若本地已有同端口的 Redis，可在 `-p` 后调整到其他端口（同时本文示例中也要同步调整）。

## 2. 准备本地环境变量

在项目根目录创建 `.env.local`（不会纳入版本控制），内容示例：

```bash
# Shopify / App 基础配置
NODE_ENV=development
SHOP_ID=shop1
SHOP_PREFIX=shop1

# Redis 与队列
REDIS_ENABLED=true
REDIS_URL=redis://default:gedTtMvRpnZNccvqCpgjBdDycKIiLOFR@127.0.0.1:6379
QUEUE_CONCURRENCY=2

# 其他必要配置（示例，按需填写）
SHOPIFY_API_KEY=xxxxxxxx
SHOPIFY_API_SECRET=xxxxxxxx
GPT_API_KEY=xxxxxxxx
```

> 如果需要同时测试多个店铺，可为另一个终端设置 `SHOP_ID=shop2`、`SHOP_PREFIX=shop2`。

## 3. 本地启动流程

```bash
# 终端 1：安装依赖并执行构建（或保持现有启动方式）
npm install
npm run build

# 终端 2：加载环境后运行 Remix 应用（保持既有命令）
source .env.local
shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000

# 终端 3：加载环境后启动队列 Worker
source .env.local
node scripts/translation-queue-worker.js
```

## 4. 验证队列消费

打开第三个终端观察日志，当在前端触发翻译操作时，应能看到：

```
[Worker] 开始翻译: resourceId=...
```

同时可使用以下命令确认队列深度变化：

```bash
redis-cli -a gedTtMvRpnZNccvqCpgjBdDycKIiLOFR \
  -n 11 LLEN "bull:translation_shop1:wait"
```

若 `LLEN` 数值随着任务处理逐步减少（最终归零），说明本地 Redis 队列配置与线上一致，Worker 正常消费任务。

## 5. 清理

测试完成后，如需停用本地 Redis：

```bash
docker stop lightsler-redis && docker rm lightsler-redis
```

---

按照以上步骤，即可在本地模拟轻量服务器的 Redis 队列环境，对队列行为进行调试和验证。