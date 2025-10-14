# 发布按钮灰度问题 - 生产部署指南

## 📋 问题背景

**现象**: UI 中所有发布按钮显示灰色不可点击

**根因**: `fix-translation-fields.mjs` 清理 translationFields 时未重置 syncStatus，导致：
- Fynony: 155 条记录保持 'synced' 状态
- OneWind: 26 条记录保持 'synced' 状态
- UI 统计显示 `pendingTranslations=0`，发布按钮被禁用

**解决方案**: 运行 `reset-option-sync-status.mjs` 重置这 181 条记录的 syncStatus 为 'pending'

---

## ⚙️ 环境准备

### 1. 本地环境检查

```bash
# 确认在项目根目录
pwd
# 应输出: /Users/elie/Downloads/translate/Lightsler-Ai

# 确认脚本存在
ls scripts/reset-option-sync-status.mjs
ls scripts/fix-translation-fields.mjs

# 确认备份目录权限
ls -ld backups/
# 应显示: drwx------ (700)
```

### 2. 智能 SSH 连接函数

复用现有的智能 SSH 脚本（绕过 VPN）：

```bash
# 使用现有的 /tmp/ssh_smart_connect.sh
# 已在之前部署中验证可用

# 测试连接
/tmp/ssh_smart_connect.sh "echo '✅ SSH 连接正常'"
```

---

## 🔍 阶段 1: 生产数据验证（只读）

### Fynony (shop1) 数据检查

```bash
# 查询 syncStatus 分布
/tmp/ssh_smart_connect.sh "cd /var/www/app1-fynony && sqlite3 prisma/dev.sqlite \"
SELECT syncStatus, COUNT(*) as count
FROM Translation
WHERE shopId='shop1'
GROUP BY syncStatus
ORDER BY syncStatus;
\""

# 查询 PRODUCT_OPTION 相关记录
/tmp/ssh_smart_connect.sh "cd /var/www/app1-fynony && sqlite3 prisma/dev.sqlite \"
SELECT t.id, t.syncStatus, t.syncedAt, r.resourceType
FROM Translation t
JOIN Resource r ON t.resourceId = r.id
WHERE t.shopId='shop1' AND r.resourceType='PRODUCT_OPTION'
LIMIT 10;
\""
```

**预期结果**:
```
syncStatus  count
----------  -----
failed      X
pending     0      ← 关键：应该是 0
synced      XXX    ← 包含需要重置的 155 条
```

### OneWind (shop2) 数据检查

```bash
# 查询 syncStatus 分布
/tmp/ssh_smart_connect.sh "cd /var/www/app2-onewind && sqlite3 prisma/dev.sqlite \"
SELECT syncStatus, COUNT(*) as count
FROM Translation
WHERE shopId='shop2'
GROUP BY syncStatus
ORDER BY syncStatus;
\""
```

**预期结果**:
```
syncStatus  count
----------  -----
pending     0      ← 关键：应该是 0
synced      XXX    ← 包含需要重置的 26 条
```

---

## 🧪 阶段 2: Dry-run 验证

### Fynony Dry-run

```bash
# 1. SSH 到服务器
ssh root@47.79.77.128

# 2. 进入 Fynony 目录
cd /var/www/app1-fynony

# 3. 设置环境变量（使用 Fynony 数据库）
export DATABASE_URL="file:./prisma/dev.sqlite"

# 4. 运行 dry-run
node scripts/reset-option-sync-status.mjs --dry-run
```

**检查输出**:
- ✅ 数据库连接掩码正确（密码被隐藏）
- ✅ shop1 检测到需要重置的记录数（应约等于 155）
- ✅ 显示受影响记录样本（ID、syncStatus → pending）
- ✅ 提示 "这是预览模式，没有实际修改数据"

### OneWind Dry-run

```bash
# 1. 进入 OneWind 目录
cd /var/www/app2-onewind

# 2. 设置环境变量
export DATABASE_URL="file:./prisma/dev.sqlite"

# 3. 运行 dry-run
node scripts/reset-option-sync-status.mjs --dry-run
```

**检查输出**:
- ✅ shop2 检测到需要重置的记录数（应约等于 26）

---

## 🚀 阶段 3: 执行修复（Fynony 先行）

### Fynony 执行

```bash
# 1. 确认在 Fynony 目录
pwd
# /var/www/app1-fynony

# 2. 执行修复（不带 --dry-run）
node scripts/reset-option-sync-status.mjs

# 3. 观察输出
# ✅ 备份文件路径和权限
# ✅ 每条记录重置成功提示
# ✅ 最终统计（成功/失败数量）
```

**验证修复结果**:

```bash
# 查询 pending 记录数
sqlite3 prisma/dev.sqlite "
SELECT COUNT(*) as pending_count
FROM Translation
WHERE shopId='shop1' AND syncStatus='pending';
"

# 应输出约 155（或更多，如果有其他待发布记录）
```

**检查备份文件**:

```bash
# 列出备份文件
ls -lh backups/

# 查看备份内容（确认可回滚）
cat backups/reset-sync-shop1-*.json | jq '.count'
# 应输出备份的记录数量
```

### OneWind 执行

```bash
# 1. 切换到 OneWind 目录
cd /var/www/app2-onewind

# 2. 设置环境变量
export DATABASE_URL="file:./prisma/dev.sqlite"

# 3. 执行修复
node scripts/reset-option-sync-status.mjs

# 4. 验证结果
sqlite3 prisma/dev.sqlite "
SELECT COUNT(*) as pending_count
FROM Translation
WHERE shopId='shop2' AND syncStatus='pending';
"
# 应输出约 26
```

---

## ✅ 阶段 4: UI 功能验证

### Fynony UI 测试

1. **访问 Shopify Admin**:
   ```
   https://admin.shopify.com/store/fynony-store/apps/translate-app
   ```

2. **检查统计信息**:
   - 页面顶部应显示 "待发布: XXX 条"（不再是 0）
   - 刷新页面确认数据持久化

3. **测试发布按钮**:
   - ✅ "立即发布（当前语言）" 按钮应为可点击状态（非灰色）
   - ✅ "批量发布（所有语言）" 按钮应为可点击状态

4. **执行一次发布测试**:
   - 点击 "立即发布" 按钮
   - 观察发布进度和结果
   - 确认发布成功后待发布数量减少

### OneWind UI 测试

重复上述步骤，访问 OneWind 的 Shopify Admin。

---

## 🔄 回滚方案

如果出现问题需要回滚：

### 方案 A: 使用备份文件恢复

```bash
# 1. 找到备份文件
ls backups/reset-sync-shop1-*.json

# 2. 查看备份内容
cat backups/reset-sync-shop1-TIMESTAMP.json | jq '.records[0]'

# 3. 编写回滚脚本（手动）
node -e "
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function rollback() {
  const backup = JSON.parse(fs.readFileSync('backups/reset-sync-shop1-TIMESTAMP.json'));

  for (const record of backup.records) {
    await prisma.translation.update({
      where: { id: record.id },
      data: {
        syncStatus: record.syncStatus,
        syncedAt: record.syncedAt ? new Date(record.syncedAt) : null
      }
    });
    console.log(\`✅ 回滚: \${record.id}\`);
  }

  await prisma.\$disconnect();
}

rollback();
"
```

### 方案 B: 手动 SQL 回滚

```bash
# 恢复到 synced 状态（如果确认原状态是 synced）
sqlite3 prisma/dev.sqlite "
UPDATE Translation
SET syncStatus='synced', syncedAt=datetime('now')
WHERE shopId='shop1' AND syncStatus='pending';
"
```

**⚠️ 回滚后需要**:
- 重启 PM2 进程（清除缓存）
- 刷新 UI 确认统计更新

---

## 🔍 常见问题排查

### 问题 1: 脚本报错 "必须在项目根目录执行"

**原因**: 脚本检测不到 `scripts/` 目录

**解决**:
```bash
# 确认当前目录
pwd

# 切换到正确目录
cd /var/www/app1-fynony

# 或使用绝对路径
node /var/www/app1-fynony/scripts/reset-option-sync-status.mjs
```

### 问题 2: DATABASE_URL 连接失败

**原因**: 环境变量未设置或路径错误

**解决**:
```bash
# 检查环境变量
echo $DATABASE_URL

# 重新设置
export DATABASE_URL="file:./prisma/dev.sqlite"

# 验证文件存在
ls -lh prisma/dev.sqlite
```

### 问题 3: UI 仍显示 0 待发布

**原因**: 可能缓存未刷新

**解决**:
```bash
# 1. 重启 PM2 进程
pm2 restart shop1-fynony shop1-worker

# 2. 清除浏览器缓存
# Mac: Cmd + Shift + R
# Windows: Ctrl + Shift + F5

# 3. 验证数据库状态
sqlite3 prisma/dev.sqlite "
SELECT syncStatus, COUNT(*)
FROM Translation
WHERE shopId='shop1'
GROUP BY syncStatus;
"
```

### 问题 4: 部分记录重置失败

**原因**: 可能存在数据库约束或其他错误

**解决**:
```bash
# 查看错误日志
pm2 logs shop1-fynony --err --lines 50

# 查询失败记录的状态
sqlite3 prisma/dev.sqlite "
SELECT id, syncStatus, syncedAt
FROM Translation
WHERE id IN (失败的ID列表);
"

# 手动重置单条记录
sqlite3 prisma/dev.sqlite "
UPDATE Translation
SET syncStatus='pending', syncedAt=NULL
WHERE id='失败的ID';
"
```

---

## 📊 监控指标

### 修复后应验证的指标

1. **数据库统计**:
   ```bash
   # pending 记录数应 > 0
   SELECT COUNT(*) FROM Translation WHERE syncStatus='pending';

   # synced 记录数应减少约 181
   SELECT COUNT(*) FROM Translation WHERE syncStatus='synced';
   ```

2. **PM2 进程状态**:
   ```bash
   pm2 status
   # 所有进程应为 online 状态

   pm2 logs shop1-fynony --lines 20 --nostream
   # 无错误日志
   ```

3. **API 响应**:
   ```bash
   # 测试状态 API
   curl -s https://translate.ease-joy.fun/api/status | jq '.stats.database.pendingTranslations'
   # 应返回 > 0
   ```

4. **UI 行为**:
   - 发布按钮可点击
   - 待发布统计正确
   - 发布功能正常工作

---

## 🎯 成功标准

所有以下检查点通过视为部署成功：

- ✅ Fynony dry-run 检测到约 155 条记录
- ✅ OneWind dry-run 检测到约 26 条记录
- ✅ 备份文件已创建且权限正确（600）
- ✅ 执行修复无错误
- ✅ 数据库 pending 记录数 > 0
- ✅ UI 发布按钮可点击（非灰色）
- ✅ 执行一次发布测试成功
- ✅ PM2 进程运行正常
- ✅ 无错误日志

---

## 📝 部署记录模板

```
部署日期: 2025-10-12
操作人员: [姓名]
环境: Fynony + OneWind Production

执行步骤:
1. [ ] 生产数据验证（阶段 1）
2. [ ] Fynony dry-run（阶段 2）
3. [ ] OneWind dry-run（阶段 2）
4. [ ] Fynony 执行修复（阶段 3）
   - 备份文件: backups/reset-sync-shop1-[TIMESTAMP].json
   - 重置记录数: [实际数量]
5. [ ] OneWind 执行修复（阶段 3）
   - 备份文件: backups/reset-sync-shop2-[TIMESTAMP].json
   - 重置记录数: [实际数量]
6. [ ] Fynony UI 验证（阶段 4）
7. [ ] OneWind UI 验证（阶段 4）

验证结果:
- Fynony pending 记录数: [数量]
- OneWind pending 记录数: [数量]
- UI 发布按钮状态: [可点击/不可点击]
- 发布测试结果: [成功/失败]

问题记录:
[如有问题，记录详情和解决方案]

签字确认: ___________  日期: ___________
```
