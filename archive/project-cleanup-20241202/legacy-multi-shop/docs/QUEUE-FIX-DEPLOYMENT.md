# 队列环境隔离修复 - 部署指南

## 📋 问题诊断结果

### ✅ 队列正常运行
- **Active任务**: 3个（正常处理中）
- **Waiting任务**: 419个（正在稳定处理）
- **结论**: Worker没有卡住，正在正常工作

### ⚠️ 发现的潜在风险
**多环境共享Redis队列**：
- 本地开发和远程服务器使用同一个Railway Redis
- 远程任务可能被本地Worker误拿
- 可能导致"资源不存在"错误

### 💡 关于"双语详情页没有翻译"
**这是正常的！**
- 数据库已有130条翻译（de/fi/ja/pt-PT）✅
- 用户查看的可能是法语(fr)
- 法语的419个任务还在队列中
- **等待处理完成即可**

---

## 🛠️ 已实施的修复

### 1. 环境隔离 (redis-parser.server.js)
明确的Redis DB分配：
```
本地开发 (lightsler-ai)      → DB 10
远程shop1 (fynony)           → DB 11
远程shop2 (onewind)          → DB 2
```

### 2. Worker配置同步 (translation-queue-worker.js)
Worker使用相同的DB分配逻辑

### 3. 错误处理增强 (queue.server.js)
资源不存在时返回失败而非抛异常，防止任务卡住

---

## 🚀 部署步骤

### 方式1：自动部署（推荐）

**前提条件**：
- 服务器在线且可SSH连接
- SSH密钥权限正确：`chmod 400 /Users/elie/Downloads/shopify.pem`

**执行部署**：
```bash
cd /Users/elie/Downloads/translate/Lightsler-Ai
./deploy-queue-fix.sh
```

部署脚本会自动：
1. 测试SSH连接
2. 同步3个修改的文件到shop1和shop2
3. 重启Worker进程
4. 显示PM2进程状态

---

### 方式2：手动部署

**如果自动部署失败**，按以下步骤手动操作：

#### 步骤1：上传文件到服务器

```bash
# 进入项目目录
cd /Users/elie/Downloads/translate/Lightsler-Ai

# 同步到shop1
scp -i /Users/elie/Downloads/shopify.pem \
    app/utils/redis-parser.server.js \
    root@47.79.77.128:/var/www/app1-fynony/app/utils/

scp -i /Users/elie/Downloads/shopify.pem \
    scripts/translation-queue-worker.js \
    root@47.79.77.128:/var/www/app1-fynony/scripts/

scp -i /Users/elie/Downloads/shopify.pem \
    app/services/queue.server.js \
    root@47.79.77.128:/var/www/app1-fynony/app/services/

# 同步到shop2
scp -i /Users/elie/Downloads/shopify.pem \
    app/utils/redis-parser.server.js \
    root@47.79.77.128:/var/www/app2-onewind/app/utils/

scp -i /Users/elie/Downloads/shopify.pem \
    scripts/translation-queue-worker.js \
    root@47.79.77.128:/var/www/app2-onewind/scripts/

scp -i /Users/elie/Downloads/shopify.pem \
    app/services/queue.server.js \
    root@47.79.77.128:/var/www/app2-onewind/app/services/
```

#### 步骤2：SSH登录服务器重启Worker

```bash
ssh -i /Users/elie/Downloads/shopify.pem root@47.79.77.128

# 在服务器上执行：
pm2 restart shop1-translation-worker
pm2 restart shop2-translation-worker

# 查看状态
pm2 list
pm2 logs worker --lines 20
```

---

## 📊 监控队列处理

### 实时监控脚本

```bash
# 查看队列状态
node check-queue-status.cjs

# 持续监控（每30秒刷新）
watch -n 30 "node check-queue-status.cjs"
```

### 预期结果

- **处理速度**: 约2-3个任务/分钟
- **预估完成**: 约2-3小时（419个任务）
- **失败任务**: 应该保持在0

---

## ⚠️ 故障排查

### 问题1：SSH连接失败

**症状**：`Can't assign requested address` 或 `Connection timeout`

**解决**：
1. 检查服务器是否在线：`ping 47.79.77.128`
2. 检查SSH密钥权限：`ls -la /Users/elie/Downloads/shopify.pem`
3. 应该显示 `-r--------`，如果不是执行：`chmod 400 /Users/elie/Downloads/shopify.pem`
4. 检查本地网络（是否在VPN等）

### 问题2：Worker未启动

**症状**：`pm2 list` 中看不到worker进程

**解决**：
```bash
# SSH到服务器
ssh -i /Users/elie/Downloads/shopify.pem root@47.79.77.128

# 启动Worker（如果未运行）
cd /var/www/app1-fynony
SHOP_ID=shop1 REDIS_URL="redis://..." node scripts/translation-queue-worker.js

cd /var/www/app2-onewind
SHOP_ID=onewind REDIS_URL="redis://..." node scripts/translation-queue-worker.js
```

### 问题3：任务处理缓慢

**症状**：队列waiting数量不下降

**检查**：
```bash
# 查看Worker日志
pm2 logs shop2-translation-worker --lines 50

# 检查是否有错误
pm2 logs shop2-translation-worker --err --lines 20
```

---

## ✅ 验证清单

部署后验证以下内容：

- [ ] SSH能够连接到服务器
- [ ] 文件成功上传到shop1和shop2目录
- [ ] Worker进程重启成功（`pm2 list`显示online）
- [ ] 队列waiting数量逐渐减少
- [ ] 没有新的failed任务产生
- [ ] Worker日志没有ERROR级别消息

---

## 📝 后续建议

### 立即操作
1. ✅ 部署环境隔离修复
2. ✅ 监控队列处理进度
3. ⏳ 等待419个任务处理完成（2-3小时）

### 长期优化
1. **清理调试日志**（1-2周后）
   - 将`logger.info`降级为`logger.debug`

2. **监控告警**
   - 设置队列积压告警（>100个任务）
   - 设置Worker异常告警

3. **文档更新**
   - 记录Redis DB分配规则
   - 更新部署文档

---

## 🆘 需要帮助？

如果遇到问题：
1. 查看Worker日志：`pm2 logs worker`
2. 查看应用日志：`tail -100 logs/app.log`
3. 检查队列状态：`node check-queue-status.js`

---

**部署时间**: $(date)
**修改文件**: 3个 (redis-parser, queue-worker, queue.server)
**影响范围**: 环境隔离、错误处理
**风险等级**: 低（只读逻辑优化，无破坏性更改）
