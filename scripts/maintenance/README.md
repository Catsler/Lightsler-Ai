# 翻译数据维护脚本

本目录包含翻译数据的备份、回滚和验证脚本，用于安全地诊断和修复 syncStatus 不一致问题。

## 📁 脚本列表

| 脚本 | 位置 | 功能 |
|------|------|------|
| **备份脚本** | `backup-translations.sh` | 导出数据库和待发布翻译记录 |
| **回滚脚本** | `rollback-translations.sh` | 从备份恢复数据库 |
| **验证脚本** | `../verify-shopify-sync-status.mjs` | 对比DB与Shopify实际状态 |
| **分析脚本** | `../analyze-pending-updatedAt.mjs` | 分析pending翻译时间分布 |
| **修复脚本** | `../fix-sync-status-mismatch.mjs` | 修复syncStatus不一致记录 |

## 🚀 快速开始

### 标准诊断和修复流程

```bash
# ⚠️ 服务器环境：Fynony (shop1)
ssh root@47.79.77.128
cd /var/www/app1-fynony  # 注意：不是 app2-onewind

# 1. 备份当前数据（安全第一）
./scripts/maintenance/backup-translations.sh --shopId=shop1

# 2. 验证问题（对比DB和Shopify）
node scripts/verify-shopify-sync-status.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --language=da \
  --sample=5 \
  --resourceType=PRODUCT_OPTION

# 3. 分析时间分布（判断问题类型）
node scripts/analyze-pending-updatedAt.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --language=da,et,ja \
  --resourceType=PRODUCT_OPTION

# 4. 修复不一致记录（如验证发现问题）
#    假设验证脚本输出了 mismatched-ids.json
node scripts/fix-sync-status-mismatch.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --input=/var/backups/translations/shop1-2025-10-13_15-30-00/mismatched-ids.json \
  --dry-run  # 预览模式

# 5. 确认无误后，执行实际修复
node scripts/fix-sync-status-mismatch.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --input=/var/backups/translations/shop1-2025-10-13_15-30-00/mismatched-ids.json

# 6. 验证修复结果
node scripts/verify-shopify-sync-status.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --language=da \
  --sample=5
```

## 📦 备份脚本详解

### backup-translations.sh

**功能**：
- 停止应用进程（确保数据库一致性）
- 使用 `sqlite3 .dump` 导出完整数据库
- 导出 pending 状态的 PRODUCT_OPTION 翻译记录（JSON格式）
- 生成备份元信息（包含 shopId、时间戳等）
- 重启应用进程

**用法**：
```bash
# 标准备份（停止应用）
./scripts/maintenance/backup-translations.sh --shopId=shop1

# 不停止应用（数据库较小时）
./scripts/maintenance/backup-translations.sh --shopId=shop1 --no-stop

# OneWind店铺备份
# ⚠️ 注意：切换到 OneWind 目录
cd /var/www/app2-onewind
./scripts/maintenance/backup-translations.sh --shopId=shop2
```

**输出结构**：
```
/var/backups/translations/shop1-2025-10-13_15-30-00/
├── database.sql               # 完整数据库导出（约 50-100MB）
├── pending-translations.json  # 待发布翻译记录（JSON数组）
└── backup-info.json           # 备份元信息
```

**备份保留策略**：
- 位置：`/var/backups/translations/` (持久化目录，不会被自动清理)
- 建议：每次修复操作前备份，每周清理30天前的备份
- 清理命令：`find /var/backups/translations -type d -mtime +30 -exec rm -rf {} +`

## 🔄 回滚脚本详解

### rollback-translations.sh

**功能**：
- 验证备份文件完整性
- 备份当前数据库（二次安全保护）
- 从指定备份恢复数据库
- 重启应用
- 运行验证脚本确认状态

**用法**：
```bash
# 从备份回滚
./scripts/maintenance/rollback-translations.sh \
  --backup=/var/backups/translations/shop1-2025-10-13_15-30-00

# 回滚前会提示确认：
# 确认执行回滚操作？(yes/no): yes
```

**安全措施**：
- 回滚前备份当前数据库到 `dev.sqlite.before-rollback-YYYYMMDDHHMMSS`
- 如回滚失败，可从二次备份恢复
- 自动运行验证脚本确认回滚结果

## ✅ 验证脚本详解

### verify-shopify-sync-status.mjs

**功能**：
- 查询数据库中 `syncStatus='pending'` 的翻译记录
- 调用 Shopify GraphQL API 查询实际发布状态
- 对比 DB 状态与 Shopify 实际状态
- 输出不一致记录（表格 + JSON）

**用法**：
```bash
# 基础用法（5个样本）
node scripts/verify-shopify-sync-status.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --language=da \
  --sample=5

# 增加样本量（10个样本）
node scripts/verify-shopify-sync-status.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --language=da \
  --sample=10 \
  --resourceType=PRODUCT_OPTION
```

**输出示例**：
```
===== 验证结果 =====

⚠️  发现 3 条不一致记录：

ID                          Resource                    Lang    DB          Shopify
--------------------------------------------------------------------------------------------
cm3abc123...                Color                       da      pending     HAS_TRANSLATION
cm3abc456...                Size                        da      pending     HAS_TRANSLATION

不一致记录详情（JSON）:
[
  {
    "translationId": "cm3abc123...",
    "resourceTitle": "Color",
    "language": "da",
    "dbStatus": "pending",
    "shopifyStatus": "HAS_TRANSLATION",
    "mismatch": true
  }
]
```

## 📊 分析脚本详解

### analyze-pending-updatedAt.mjs

**功能**：
- 分析 pending 翻译的 `updatedAt` 时间分布
- 按小时、天、语言分组统计
- 可视化分布（ASCII柱状图）
- 判断问题类型（集中问题 vs 系统性问题）

**用法**：
```bash
# 单语言分析
node scripts/analyze-pending-updatedAt.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --language=da

# 多语言分析
node scripts/analyze-pending-updatedAt.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --language=da,et,ja \
  --resourceType=PRODUCT_OPTION
```

**输出解读**：
- **集中问题** (>50% 记录在同一小时): 可能是批量操作中断，检查该时间段日志
- **分散问题** (记录分布多个时间段): 可能是系统性配置问题或代码逻辑错误

## 🔧 修复脚本详解

### fix-sync-status-mismatch.mjs

**功能**：
- 从文件读取待修复的翻译ID列表
- 支持 `--dry-run` 预览模式
- 使用 Prisma 事务批量更新 `syncStatus`
- 记录修复日志

**用法**：
```bash
# 1. 预览修复（dry-run）
node scripts/fix-sync-status-mismatch.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --input=/var/backups/translations/shop1-2025-10-13_15-30-00/mismatched-ids.json \
  --dry-run

# 2. 确认后执行实际修复
node scripts/fix-sync-status-mismatch.mjs \
  --shopId=sshvdt-ai.myshopify.com \
  --input=/var/backups/translations/shop1-2025-10-13_15-30-00/mismatched-ids.json
```

**输入文件格式** (从验证脚本输出提取):
```json
[
  {
    "translationId": "cm3abc123...",
    "resourceTitle": "Color",
    "language": "da",
    "dbStatus": "pending",
    "shopifyStatus": "HAS_TRANSLATION",
    "mismatch": true
  }
]
```

## ⚠️ 安全注意事项

### 执行前检查

1. **确认店铺目录**：
   - Fynony: `/var/www/app1-fynony`
   - OneWind: `/var/www/app2-onewind`
   - ⚠️ 不要混淆两个店铺的目录！

2. **确认 shopId 参数**：
   - Fynony: `--shopId=shop1` 或 `--shopId=sshvdt-ai.myshopify.com`
   - OneWind: `--shopId=shop2` 或 `--shopId=onewindoutdoors.myshopify.com`

3. **环境变量检查**：
   ```bash
   # 确认 SHOPIFY_API_SECRET 已设置
   echo $SHOPIFY_API_SECRET

   # 如未设置，从 .env 加载
   source .env
   ```

### 执行时安全措施

1. **必须先备份**：任何修复操作前先运行备份脚本
2. **使用 dry-run**：修复脚本先预览，确认无误再执行
3. **分批修复**：如不一致记录很多（>100条），分批修复避免长时间锁表
4. **验证修复**：修复后运行验证脚本确认状态正确

### 回滚策略

**如修复出现问题**：
```bash
# 1. 立即回滚到修复前备份
./scripts/maintenance/rollback-translations.sh \
  --backup=/var/backups/translations/shop1-2025-10-13_15-30-00

# 2. 检查应用日志
pm2 logs shop1-fynony --lines 100

# 3. 如回滚失败，从二次备份恢复
sqlite3 /var/www/app1-fynony/prisma/dev.sqlite < \
  /var/www/app1-fynony/prisma/dev.sqlite.before-rollback-20251013153000
```

## 🔍 故障排查

### 常见问题

**1. 脚本权限问题**
```bash
# 解决方案：添加执行权限
chmod +x scripts/maintenance/*.sh
```

**2. PM2 命令找不到**
```bash
# 解决方案：使用完整路径
/usr/local/bin/pm2 status
```

**3. jq 命令找不到**
```bash
# 解决方案：安装 jq
# CentOS: yum install jq
# Ubuntu: apt-get install jq
```

**4. SQLite 导出失败**
```bash
# 解决方案：检查磁盘空间
df -h /var/backups

# 清理旧备份
find /var/backups/translations -type d -mtime +30 -exec rm -rf {} +
```

**5. Shopify API 调用失败**
```bash
# 检查 API 密钥
echo $SHOPIFY_API_SECRET

# 检查网络连接
curl -I https://sshvdt-ai.myshopify.com/admin/api/2025-07/graphql.json
```

## 📝 日志和监控

### 备份日志

备份脚本会生成 `backup-info.json`，包含：
- 备份时间戳
- 店铺信息
- 数据库大小
- 待发布翻译数量

### 修复日志

修复脚本会输出 JSON 格式日志，包含：
- 修复时间戳
- 待修复记录数
- 实际修复数
- 翻译ID列表

建议保存修复日志：
```bash
node scripts/fix-sync-status-mismatch.mjs \
  --shopId=... \
  --input=... \
  > /var/log/translation-fix-$(date +%Y%m%d).log 2>&1
```

## 🔗 相关文档

- [发布问题故障排查指南](../../docs/troubleshooting/publish-issues.md)
- [PRODUCT_OPTION GID 修复验证](../../docs/OPTION-GID-FIX-VALIDATION.md)
- [项目主文档](../../CLAUDE.md)

## 📞 支持

如遇到本文档未覆盖的问题：
1. 检查应用日志：`pm2 logs shop1-fynony --lines 100`
2. 检查数据库状态：`npx prisma studio`
3. 运行诊断脚本收集问题信息
4. 联系开发团队并提供诊断结果（JSON格式）
