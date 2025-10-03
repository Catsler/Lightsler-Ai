# Worker进程修复指南

## 📋 当前状态

**部署时间**: 2025-10-02 23:18 - 23:26

**部署结果**:
- ✅ 代码同步完成（22.1MB）
- ✅ 数据库备份完成
- ✅ Shop1主应用启动成功（PID 126222）
- ✅ Shop2主应用启动成功（PID 126216）
- ❌ Shop1 Worker启动失败
- ❌ Shop2 Worker启动失败

**数据库备份位置**:
```
/var/www/backups/shop1-20251002_232011.db
/var/www/backups/shop2-20251002_232011.db
/var/www/app1-fynony/.env.backup.20251002_232124
/var/www/app2-onewind/.env.backup.20251002_232128
```

---

## 🚀 快速修复步骤

### 方案1：使用自动化脚本（推荐）

**第1步：诊断问题**
```bash
cd /Users/elie/Downloads/translate/Lightsler-Ai/阿里云轻量服务器部署文件
./diagnose-worker-issue.sh
```

**预期输出**:
- PM2进程状态
- Worker错误日志
- 环境变量配置
- Redis连接测试

**第2步：执行修复**
```bash
./fix-worker-and-verify.sh
```

**修复内容**:
1. 设置脚本执行权限
2. 验证环境变量完整性
3. 重启Worker进程
4. 验证初始化和Redis连接
5. 完整健康检查
6. 保存PM2配置

**预期结果**:
```
┌────┬───────────────────────────┬──────────┬─────────┐
│ id │ name                      │ status   │ memory  │
├────┼───────────────────────────┼──────────┼─────────┤
│ 0  │ shop2-onewind             │ online   │ ~200MB  │
│ 1  │ shop1-fynony              │ online   │ ~200MB  │
│ 2  │ shop1-translation-worker  │ online   │ ~150MB  │
│ 3  │ shop2-translation-worker  │ online   │ ~150MB  │
└────┴───────────────────────────┴──────────┴─────────┘
```

---

### 方案2：手动排查修复

**Step 1: SSH登录服务器**
```bash
# 自动检测可用IP
BIND_IP=$(ifconfig $(route -n get default | grep interface | awk '{print $2}') | grep "inet " | awk '{print $2}' | head -1)

# 登录
ssh -b $BIND_IP -i /Users/elie/Downloads/shopify.pem root@47.79.77.128
```

**Step 2: 查看Worker错误日志**
```bash
pm2 logs shop1-translation-worker --err --lines 50 --nostream
pm2 logs shop2-translation-worker --err --lines 50 --nostream
```

**Step 3: 根据错误类型修复**

#### 错误类型A：ESM模块导入错误
**症状**: `SyntaxError: Cannot use import statement`

**修复**:
```bash
# 检查脚本内容
head -20 /var/www/app1-fynony/scripts/translation-queue-worker.js

# 手动测试执行
cd /var/www/app1-fynony
node scripts/translation-queue-worker.js

# 如果显示错误，需要修改脚本或package.json
```

#### 错误类型B：Redis连接失败
**症状**: `Redis connection failed`, `ECONNREFUSED`

**修复**:
```bash
# 测试Redis连接
REDIS_URL=$(cat /var/www/app1-fynony/.env | grep '^REDIS_URL=' | cut -d= -f2 | tr -d '"')
redis-cli -u "$REDIS_URL" ping

# 检查环境变量
cat /var/www/app1-fynony/.env | grep REDIS
cat /var/www/app2-onewind/.env | grep REDIS
```

#### 错误类型C：环境变量缺失
**症状**: `SHOP_ID is undefined`

**修复**:
```bash
# 检查必需变量
cat /var/www/app1-fynony/.env | grep -E 'SHOP_ID|SHOP_PREFIX|REDIS_URL'

# 如果缺失，手动添加
echo 'SHOP_ID=shop1' >> /var/www/app1-fynony/.env
echo 'SHOP_PREFIX=shop1' >> /var/www/app1-fynony/.env
```

#### 错误类型D：文件权限问题
**症状**: `EACCES: permission denied`

**修复**:
```bash
chmod +x /var/www/app1-fynony/scripts/translation-queue-worker.js
chmod +x /var/www/app2-onewind/scripts/translation-queue-worker.js
chown -R root:root /var/www/app1-fynony/scripts/
chown -R root:root /var/www/app2-onewind/scripts/
```

**Step 4: 重启Worker**
```bash
# 删除旧进程
pm2 delete shop1-translation-worker shop2-translation-worker

# 重新启动
pm2 start /var/www/ecosystem-simple.config.js --only shop1-translation-worker,shop2-translation-worker

# 检查状态
pm2 list

# 查看日志
pm2 logs shop1-translation-worker --lines 30
```

**Step 5: 验证成功**
```bash
# 1. 检查进程在线
pm2 list | grep -E 'shop1-translation-worker|shop2-translation-worker'

# 2. 检查初始化日志
pm2 logs shop1-translation-worker --lines 50 --nostream | grep -E 'ready|Redis'

# 3. 验证Redis队列
redis-cli --scan --pattern 'bull:translation_*'

# 4. 保存配置
pm2 save
```

---

## 🔍 常见问题FAQ

### Q1: Worker进程启动后立即停止？
**A**: 查看错误日志，通常是：
- 脚本语法错误（ESM import）
- 环境变量缺失
- Redis连接失败

### Q2: 如何确认Worker在使用Redis而非内存模式？
**A**:
```bash
pm2 logs shop1-translation-worker --lines 50 --nostream | grep -i redis
```
应该看到 "翻译队列使用 Redis 模式"，不应出现"内存模式"

### Q3: 主应用能访问，但异步翻译不工作？
**A**: Worker未启动。主应用可以处理同步翻译，但异步翻译需要Worker进程。

### Q4: 如何测试Worker是否正常工作？
**A**:
1. 在应用中触发翻译任务
2. 观察Worker日志：`pm2 logs shop1-translation-worker --lines 0`
3. 应该看到 "[Worker] 开始翻译" 的日志

### Q5: 网络连接不上服务器怎么办？
**A**:
```bash
# 检查VPN连接
# 尝试不同的绑定IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# 尝试直连（不绑定IP）
ssh -i /Users/elie/Downloads/shopify.pem root@47.79.77.128
```

---

## 📊 验证清单

完成修复后，逐项验证：

- [ ] 4个PM2进程全部显示 "online"
- [ ] Worker日志显示 "Translation queue worker ready"
- [ ] Worker日志显示 "翻译队列使用 Redis 模式"
- [ ] `/api/status` 端点返回200（Shop1和Shop2）
- [ ] Redis队列键存在（`bull:translation_shop1:*`）
- [ ] PM2配置已保存（`pm2 save`）
- [ ] 主应用可访问（fynony.ease-joy.fun、onewind.ease-joy.fun）

---

## 🚨 紧急回滚

如果修复失败需要回滚：

```bash
# 恢复数据库
cp /var/www/backups/shop1-20251002_232011.db /var/www/app1-fynony/prisma/prod.db
cp /var/www/backups/shop2-20251002_232011.db /var/www/app2-onewind/prisma/prod.db

# 恢复环境变量
cp /var/www/app1-fynony/.env.backup.20251002_232124 /var/www/app1-fynony/.env
cp /var/www/app2-onewind/.env.backup.20251002_232128 /var/www/app2-onewind/.env

# 重启应用
pm2 restart all
```

---

## 📞 技术支持

- **部署文档**: `/Users/elie/Downloads/translate/Lightsler-Ai/CLAUDE.md`
- **服务器操作**: `/Users/elie/Downloads/translate/Lightsler-Ai/阿里云轻量服务器部署文件/轻量服务器稳定操作说明.md`
- **项目仓库**: 查看 `.git/config`

---

*最后更新: 2025-10-02 23:30*
