# 🚀 多店铺Shopify翻译应用部署指南

修复轻量服务器问题的完整部署方案。

## 📋 部署清单

### 必备条件
- ✅ 4GB+ 内存的云服务器
- ✅ Node.js 18+
- ✅ PM2 进程管理器
- ✅ Railway Redis 服务
- ✅ Shopify 应用凭证

### 预期改进
- 🔧 修复Redis连接问题
- 🔧 解决多店铺数据冲突
- 🔧 优化内存使用降低50%
- 🔧 增强UI稳定性
- 🔧 实现队列降级保护

## 🎯 快速部署

### 1. 准备Railway Redis

```bash
# 安装Railway CLI
npm install -g @railway/cli

# 登录Railway
railway login

# 创建Redis服务
railway new shopify-redis
railway add  # 选择Redis

# 获取连接URL
railway variables
# 复制 REDIS_URL 值
```

### 2. 服务器升级

在云服务商控制台：
- 内存：2GB → 4GB
- 预计费用增加：+20-30元/月

### 3. 代码部署

```bash
# 进入项目目录
cd /Users/elie/Downloads/translate/Lightsler-Ai

# 配置环境变量
cp .env.template .env
nano .env  # 填入实际配置

# 安装依赖
npm install

# 运行数据库迁移
npx prisma migrate deploy

# 启动应用
./start-multi-shop.sh
```

## 📝 环境变量配置

```bash
# === Redis配置 ===
REDIS_URL=redis://default:password@host:port
REDIS_ENABLED=true

# === Shopify配置 ===
SHOPIFY_API_KEY=your-key
SHOPIFY_API_SECRET=your-secret

# === 翻译服务 ===
GPT_API_KEY=your-openai-key
GPT_API_URL=https://api.cursorai.art/v1

# === 性能优化 ===
QUEUE_CONCURRENCY=2
MAX_CACHE_SIZE=500
```

## 🏗️ 架构改进

### 核心修复

**1. 数据隔离**
```javascript
// 每个店铺使用独立的Redis数据库
shop1 -> Redis DB 0
shop2 -> Redis DB 1

// 内存缓存添加店铺前缀
shop:shop1:trans:resourceId:language
shop:shop2:trans:resourceId:language
```

**2. 内存优化**
- 缓存限制：10000 → 1000条
- TTL缩短：7天 → 1小时
- 进程内存限制：1.5GB/进程

**3. 队列降级**
```
Redis可用 → 使用Redis队列
Redis失败 → 自动降级到内存队列
Redis恢复 → 自动迁移回Redis
```

**4. UI保护**
- 防抖：1-2秒延迟
- 操作锁：避免并发冲突
- 错误边界：防止崩溃

## 🔧 运维命令

### PM2管理
```bash
# 查看状态
pm2 list

# 监控实时状态
pm2 monit

# 查看日志
pm2 logs shop1-lightsler
pm2 logs shop2-onewind

# 重启应用
pm2 restart ecosystem.config.js

# 重载配置
pm2 reload ecosystem.config.js
```

### 健康检查
```bash
# 检查应用状态
curl http://localhost:3001/api/status  # Shop1
curl http://localhost:3002/api/status  # Shop2

# 检查Redis连接
redis-cli -u $REDIS_URL ping

# 检查内存使用
free -h
ps aux | grep node
```

### 故障排查
```bash
# 查看错误日志
tail -f ./logs/shop1-error.log
tail -f ./logs/shop2-error.log

# 数据库状态
npx prisma studio

# 队列状态
pm2 logs | grep -i queue
```

## 📊 监控指标

### 性能指标
- **内存使用**: <3GB (4GB服务器)
- **Redis连接**: >99% 可用性
- **翻译成功率**: >95%
- **UI响应时间**: <2秒

### 告警阈值
- 内存使用 >80%
- Redis错误 >5次/分钟
- 进程重启 >3次/小时
- 队列积压 >100个任务

## 🚨 应急处理

### Redis服务中断
```bash
# 系统会自动降级到内存模式
# 检查降级状态
pm2 logs | grep "内存模式"

# 手动切换到内存模式（如需要）
export REDIS_ENABLED=false
pm2 restart ecosystem.config.js
```

### 内存不足
```bash
# 紧急重启
pm2 restart all

# 清理缓存
curl -X POST http://localhost:3001/api/clear
curl -X POST http://localhost:3002/api/clear

# 降低并发
# 编辑ecosystem.config.js，减少QUEUE_CONCURRENCY
pm2 reload ecosystem.config.js
```

### 应用无响应
```bash
# 强制重启
pm2 delete all
./start-multi-shop.sh

# 检查端口占用
lsof -i :3001
lsof -i :3002
```

## 📈 扩容建议

### 垂直扩容（推荐）
- **8GB内存**: 支持4-6个店铺
- **16GB内存**: 支持10+个店铺
- **专用Redis**: 2GB独立实例

### 水平扩容
- **多服务器**: 每服务器2个店铺
- **负载均衡**: Nginx代理
- **Redis集群**: 主从配置

## 🔐 安全建议

1. **环境变量**：使用密钥管理服务
2. **网络安全**：配置防火墙规则
3. **访问控制**：限制Redis访问IP
4. **日志安全**：避免记录敏感信息
5. **定期更新**：保持依赖项最新

## 📞 技术支持

### 常见问题
- **Q**: Railway Redis免费额度够用吗？
- **A**: 500MB对2个店铺充足，命令数无限制

- **Q**: 为什么要升级到4GB？
- **A**: 2GB不足以同时运行2个Node.js进程+Redis

- **Q**: 如何添加第3个店铺？
- **A**: 在ecosystem.config.js中添加新配置，端口3003

### 紧急联系
出现严重问题时：
1. 立即停止所有进程：`pm2 stop all`
2. 检查日志：`pm2 logs`
3. 重新部署：`./start-multi-shop.sh`

## 📚 相关文档

- [PM2官方文档](https://pm2.keymetrics.io/docs/)
- [Railway Redis配置](https://docs.railway.app/databases/redis)
- [Shopify App开发指南](https://shopify.dev/apps)
- [Node.js内存优化](https://nodejs.org/en/docs/guides/buffer-constructor-deprecation/)

---

**部署完成后，预期解决所有现有问题，实现稳定的多店铺翻译服务！** 🎉