# 安全执行指南 - 环境隔离检查清单

> ⚠️ **警告**: 绝对不要在本地执行连接生产数据库的操作！

## 🔒 环境隔离配置

### 本地开发环境（MacBook）
```bash
目录: /Users/elie/Downloads/translate/Lightsler-Ai
SHOP_ID: devshop
Redis DB: 13
DATABASE_URL: file:./dev.sqlite
用途: 开发和测试，禁止连接生产
```

### Fynony 生产环境（阿里云）
```bash
目录: /var/www/app1-fynony
SHOP_ID: shop1
Redis DB: 11
DATABASE_URL: file:./prisma/dev.sqlite
SHOPIFY_API_KEY: f97170933cde079c914f7df7e90cd806
用途: Fynony 店铺生产数据
```

### OneWind 生产环境（阿里云）
```bash
目录: /var/www/app2-onewind
SHOP_ID: shop2
Redis DB: 12
DATABASE_URL: file:./prisma/dev.sqlite
SHOPIFY_API_KEY: 8102af9807fd9df0b322a44f500a1d0e
用途: OneWind 店铺生产数据
```

---

## ✅ 执行前检查清单

### 步骤 1: 验证执行位置

```bash
# 确认当前服务器和目录
hostname
pwd

# 预期输出（Fynony）:
# iZuf6fskzvezh7khobgd1gZ  (或类似阿里云主机名)
# /var/www/app1-fynony

# 预期输出（OneWind）:
# iZuf6fskzvezh7khobgd1gZ
# /var/www/app2-onewind

# ❌ 如果输出是本地路径，立即停止！
# /Users/elie/Downloads/... ← 本地环境，禁止执行
```

### 步骤 2: 验证环境变量

```bash
# 检查 SHOP_ID
echo $SHOP_ID

# Fynony 应输出: shop1
# OneWind 应输出: shop2
# 本地应输出: devshop 或空

# 检查 Redis DB（从 REDIS_URL 提取）
echo $REDIS_URL | grep -oE '/[0-9]+$'

# Fynony 应输出: /11
# OneWind 应输出: /12
# 本地应输出: /13 或空
```

### 步骤 3: 显式设置 DATABASE_URL

```bash
# ⚠️ 关键：每次执行前必须设置

# Fynony
export DATABASE_URL="file:./prisma/dev.sqlite"

# OneWind
export DATABASE_URL="file:./prisma/dev.sqlite"

# 验证
echo $DATABASE_URL
# 应输出: file:./prisma/dev.sqlite

# 验证文件存在
ls -lh prisma/dev.sqlite
# 应显示文件大小和时间戳
```

### 步骤 4: 验证不会误用配置文件

```bash
# 检查当前目录的 .env 文件（应存在且正确）
cat .env | grep "SHOP_ID"

# Fynony 应输出: SHOP_ID=shop1
# OneWind 应输出: SHOP_ID=shop2

# 检查 shopify.app.toml（应存在且正确）
cat shopify.app.toml | grep "client_id"

# Fynony 应输出: client_id = "f97170933cde079c914f7df7e90cd806"
# OneWind 应输出: client_id = "8102af9807fd9df0b322a44f500a1d0e"

# ❌ 如果输出不匹配，立即停止！
```

---

## 🚀 安全执行步骤（Fynony 示例）

### 阶段 1: SSH 连接验证

```bash
# 使用智能 SSH（绕过 VPN）
/tmp/ssh_smart_connect.sh "hostname && pwd"

# 预期输出:
# ✅ 使用绑定IP: xxx.xxx.xxx.xxx (绕过VPN)
# iZuf6fskzvezh7khobgd1gZ
# /root
```

### 阶段 2: 进入正确目录

```bash
# SSH 连接
ssh root@47.79.77.128

# 进入 Fynony 目录
cd /var/www/app1-fynony

# 验证
pwd
# 应输出: /var/www/app1-fynony

ls scripts/reset-option-sync-status.mjs
# 应显示文件存在
```

### 阶段 3: 环境变量设置和验证

```bash
# 1. 显式设置 DATABASE_URL
export DATABASE_URL="file:./prisma/dev.sqlite"

# 2. 验证设置成功
echo "DATABASE_URL: $DATABASE_URL"
echo "SHOP_ID: $SHOP_ID"
echo "Redis DB: $(echo $REDIS_URL | grep -oE '/[0-9]+$')"

# 预期输出:
# DATABASE_URL: file:./prisma/dev.sqlite
# SHOP_ID: shop1
# Redis DB: /11

# 3. 验证数据库文件
ls -lh prisma/dev.sqlite
# 应显示正确的文件大小和修改时间

# 4. 快速查询验证（可选）
sqlite3 prisma/dev.sqlite "SELECT COUNT(*) FROM Translation WHERE shopId='shop1';"
# 应返回数字（记录总数）
```

### 阶段 4: Dry-run 执行

```bash
# 运行 dry-run
node scripts/reset-option-sync-status.mjs --dry-run

# 检查输出中的关键信息:
# ✅ "📍 处理店铺: shop1" ← 确认正确的 SHOP_ID
# ✅ "🔐 数据库连接: file:***" ← DATABASE_URL 已掩码
# ✅ "需要重置的记录数: 155" ← 约等于预期数量
# ✅ "这是预览模式，没有实际修改数据"

# ❌ 如果 SHOP_ID 不是 shop1，立即停止！
# ❌ 如果记录数量异常（如 0 或远超预期），停止并检查原因
```

### 阶段 5: 执行修复

```bash
# 最后确认
echo "即将修复 Fynony (shop1) 的 syncStatus"
echo "当前目录: $(pwd)"
echo "SHOP_ID: $SHOP_ID"
read -p "确认无误？(y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # 执行修复
    node scripts/reset-option-sync-status.mjs

    # 验证结果
    echo ""
    echo "验证修复结果..."
    sqlite3 prisma/dev.sqlite "SELECT COUNT(*) FROM Translation WHERE shopId='shop1' AND syncStatus='pending';"

    # 检查备份
    ls -lh backups/reset-sync-shop1-*.json
else
    echo "已取消执行"
fi
```

### 阶段 6: 验证和重启

```bash
# 1. 验证数据库状态
sqlite3 prisma/dev.sqlite "
SELECT syncStatus, COUNT(*) as count
FROM Translation
WHERE shopId='shop1'
GROUP BY syncStatus;
"

# 预期输出应包含:
# pending|155  (或更多)

# 2. 验证备份文件
ls -lh backups/
cat backups/reset-sync-shop1-*.json | jq '.count'
# 应输出备份的记录数

# 3. 重启 PM2 进程
pm2 restart shop1-fynony shop1-worker

# 4. 检查进程状态
pm2 status | grep shop1

# 5. 查看日志（无错误）
pm2 logs shop1-fynony --lines 20 --nostream
```

---

## 🔄 OneWind 执行（重复流程）

```bash
# 切换到 OneWind 目录
cd /var/www/app2-onewind

# 设置环境变量
export DATABASE_URL="file:./prisma/dev.sqlite"

# 验证
echo "SHOP_ID: $SHOP_ID"  # 应输出: shop2
echo "Redis DB: $(echo $REDIS_URL | grep -oE '/[0-9]+$')"  # 应输出: /12

# Dry-run
node scripts/reset-option-sync-status.mjs --dry-run

# 确认输出中 "📍 处理店铺: shop2"

# 执行修复
node scripts/reset-option-sync-status.mjs

# 重启
pm2 restart shop2-onewind shop2-worker
```

---

## ❌ 错误处理

### 错误 1: SHOP_ID 不匹配

```bash
# 症状：dry-run 输出 "📍 处理店铺: devshop" 或其他错误 ID

# 原因：环境变量未正确设置

# 解决：
cd /var/www/app1-fynony  # 或 app2-onewind
source .env              # 重新加载环境变量
export DATABASE_URL="file:./prisma/dev.sqlite"  # 显式设置

# 验证
echo $SHOP_ID
```

### 错误 2: Redis 连接到错误的 DB

```bash
# 症状：队列数据混乱或无法连接

# 原因：REDIS_URL 指向错误的 DB

# 解决：
# 检查 .env 文件中的 REDIS_URL
cat .env | grep REDIS_URL

# Fynony 应以 /11 结尾
# OneWind 应以 /12 结尾

# 如果错误，手动修正（参考备份配置）
```

### 错误 3: 数据库文件不存在

```bash
# 症状：Prisma 报错 "Can't reach database"

# 原因：DATABASE_URL 路径错误

# 解决：
# 检查文件是否存在
ls -lh prisma/dev.sqlite

# 如果不存在，检查是否在错误目录
pwd

# 切换到正确目录
cd /var/www/app1-fynony  # 或 app2-onewind
```

---

## 🎯 最终验证清单

执行完成后，所有以下检查点必须通过：

- [ ] Fynony dry-run 检测到约 155 条记录
- [ ] Fynony 执行成功，无错误
- [ ] Fynony 备份文件已创建（权限 600）
- [ ] Fynony pending 记录数 > 0
- [ ] Fynony PM2 进程运行正常
- [ ] OneWind dry-run 检测到约 26 条记录
- [ ] OneWind 执行成功，无错误
- [ ] OneWind 备份文件已创建（权限 600）
- [ ] OneWind pending 记录数 > 0
- [ ] OneWind PM2 进程运行正常
- [ ] 本地开发环境未受影响（仍使用 devshop/DB13）

---

## 📞 紧急回滚

如果出现严重问题需要立即回滚：

```bash
# 1. 停止脚本执行（如果仍在运行）
Ctrl+C

# 2. 使用备份文件恢复
cd /var/www/app1-fynony  # 或 app2-onewind

# 3. 找到最新备份
ls -lt backups/reset-sync-*.json | head -1

# 4. 查看备份内容
cat backups/reset-sync-shop1-TIMESTAMP.json | jq '.records[0]'

# 5. SQL 快速回滚（恢复到 synced 状态）
sqlite3 prisma/dev.sqlite "
UPDATE Translation
SET syncStatus='synced', syncedAt=datetime('now')
WHERE shopId='shop1' AND syncStatus='pending'
  AND id IN (SELECT id FROM Translation WHERE ... );
"

# 6. 重启进程
pm2 restart shop1-fynony shop1-worker

# 7. 验证回滚
sqlite3 prisma/dev.sqlite "
SELECT syncStatus, COUNT(*)
FROM Translation
WHERE shopId='shop1'
GROUP BY syncStatus;
"
```

---

## 📋 执行记录模板

```
执行日期: 2025-01-12
操作人员: [姓名]

Fynony (shop1):
- [ ] 环境验证通过 (pwd, SHOP_ID, Redis DB)
- [ ] DATABASE_URL 显式设置
- [ ] Dry-run 成功 (约 155 条)
- [ ] 执行修复成功
- [ ] 备份文件: backups/reset-sync-shop1-[TIMESTAMP].json
- [ ] pending 记录数: [实际数量]
- [ ] PM2 重启成功

OneWind (shop2):
- [ ] 环境验证通过
- [ ] DATABASE_URL 显式设置
- [ ] Dry-run 成功 (约 26 条)
- [ ] 执行修复成功
- [ ] 备份文件: backups/reset-sync-shop2-[TIMESTAMP].json
- [ ] pending 记录数: [实际数量]
- [ ] PM2 重启成功

问题记录:
[如有问题，详细记录]

签字: ___________  日期: ___________
```
