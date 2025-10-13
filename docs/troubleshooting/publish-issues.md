# 发布问题故障排查指南

本文档记录了轻量服务器两个店铺的发布问题诊断流程和解决方案。

## 问题概述

**服务器**: 阿里云轻量服务器 (47.79.77.128)
**发现时间**: 2025-10-13
**影响范围**: 两个生产店铺

### OneWind (shop2) - 发布按钮灰色

**症状**:
- 前端发布按钮不可点击（灰色状态）
- UI显示 "立即发布 (当前语言 0)"

**根因**:
- 数据库中 `Translation` 表的 `syncStatus='pending'` 记录数为 0
- 前端按钮禁用条件: `disabled={!stats.pendingTranslations}`
- API查询: `prisma.translation.count({ where: { syncStatus: 'pending' } })` 返回 0

### Fynony (shop1) - 发布显示0%

**症状**:
- 批量发布操作成功但日志显示 "0/N 成功 (0%)"
- 翻译记录实际存在但未能发布

**根因**:
- 资源GID格式问题（PRODUCT_OPTION类型）
- GID包含 `-temp` 后缀或 cuid 格式（例如: `cm3abcdef`）
- `ensureValidResourceGid` 验证失败，所有翻译被跳过
- 已知bug: `product-translation-enhanced.server.js` 保存了临时字符串而非真实GID

## 诊断流程

### 前置步骤：SSH连接（绕过VPN）

若本地VPN劫持服务器路由，需要手动添加静态路由：

```bash
# 1. 检查当前路由
route -n get 47.79.77.128

# 2. 若显示 interface: utun* 则被VPN劫持，需添加静态路由
# 获取默认网关
DEFAULT_GW=$(route -n get default | grep gateway | awk '{print $2}')

# 3. 删除VPN路由并添加静态路由（需sudo审批）
sudo route delete 47.79.77.128
sudo route add 47.79.77.128 $DEFAULT_GW

# 4. 验证
route -n get 47.79.77.128  # 应显示物理网卡接口（en0等）

# 5. SSH连接
ssh root@47.79.77.128
```

**智能绕过脚本** (已部署):
- `/tmp/ssh_smart_connect.sh` - 自动检测并绕过VPN
- `/tmp/ssh_auto_route.sh` - 自动配置静态路由

### OneWind诊断步骤

#### 1. 检查待发布翻译数量

```bash
ssh root@47.79.77.128
cd /var/www/app2-onewind
node scripts/diagnostics/check-pending-translations.mjs --shop=shop2
```

**预期输出**:
```json
{
  "shop": "shop2",
  "pendingCount": 0,
  "totalTranslations": 1250,
  "analysis": "无待发布翻译，可能原因：..."
}
```

**分析**:
- `pendingCount = 0` → 按钮禁用符合预期
- `totalTranslations > 0` → 数据库有翻译记录

#### 2. 查看状态分布详情

```bash
cd /var/www/app2-onewind
node scripts/diagnostics/check-sync-status-distribution.mjs --shop=shop2
```

**预期输出**:
```json
{
  "statusDistribution": {
    "synced": 1200,
    "failed": 50,
    "pending": 0,
    "syncing": 0
  },
  "recentFailures": [...]
}
```

**结论**:
- 所有翻译已同步 → 正常，需要扫描新资源或修改内容
- 大量 `failed` 状态 → 需要修复失败原因
- 分布异常 → 检查数据库完整性

### Fynony诊断步骤

#### 1. 检查GID格式问题

```bash
ssh root@47.79.77.128
cd /var/www/app1-fynony
node scripts/diagnostics/check-gid-format-issues.mjs --shop=shop1
```

**预期输出**:
```json
{
  "shop": "shop1",
  "invalidGidCount": 15,
  "invalidGids": [
    {
      "resourceId": 123,
      "resourceType": "PRODUCT_OPTION",
      "gid": "gid://shopify/ProductOption/123-temp",
      "issue": "contains '-temp' suffix",
      "affectedTranslations": 3
    }
  ],
  "severity": "high"
}
```

**分析**:
- `invalidGidCount > 0` → 存在GID格式问题
- `severity: high` → 影响待发布翻译，需要立即修复
- `affectedTranslations` → 受影响的翻译数量

#### 2. 修复GID问题

```bash
cd /var/www/app1-fynony

# Dry-run（预览修复）
node scripts/fix-option-gids.mjs --shop=shop1 --dry-run

# 执行修复
node scripts/fix-option-gids.mjs --shop=shop1
```

#### 3. 重启服务

```bash
pm2 restart shop1-fynony shop1-worker
pm2 status | grep shop1
```

#### 4. 验证修复

再次运行诊断脚本确认 `invalidGidCount = 0`：
```bash
node scripts/diagnostics/check-gid-format-issues.mjs --shop=shop1
```

## 解决方案总结

### OneWind解决方案

**情况1: 所有翻译已同步**
- 解决方法: 扫描新资源或修改现有内容
- 操作: UI中点击 "扫描所有资源" 或修改产品/集合内容

**情况2: 大量翻译失败**
- 运行 `check-sync-status-distribution.mjs` 查看失败原因
- 根据 `recentFailures` 字段定位具体错误
- 修复错误后，翻译状态会自动变为 `pending`

**情况3: 数据库状态异常**
- 使用 Prisma Studio 检查数据完整性: `npx prisma studio`
- 手动修正异常的 `syncStatus` 值
- 或清空重新扫描翻译

### Fynony解决方案

**主要方案: 修复GID格式**

1. **检测问题**:
   ```bash
   node scripts/diagnostics/check-gid-format-issues.mjs --shop=shop1
   ```

2. **修复PRODUCT_OPTION的GID**:
   ```bash
   node scripts/fix-option-gids.mjs --shop=shop1
   ```

3. **重启进程**:
   ```bash
   pm2 restart shop1-fynony shop1-worker
   ```

4. **验证发布**:
   - 进入UI执行批量发布
   - 检查日志应显示成功率 > 0%
   - 新日志格式:
     ```
     📊 批量发布完成: 15/20 成功 (75.0%)
     ⏭️  跳过: 3 条
        - GID解析失败: RESOURCE_GID_UNRESOLVED: 2条
        - GID解析失败: PRODUCT_GID_UNAVAILABLE: 1条
     ❌ 失败: 2 条（同步错误）
     ```

## 预防措施

### 1. 定期健康检查

创建定期巡检脚本（建议每周执行）:

```bash
#!/bin/bash
# /var/www/check-health.sh

echo "=== OneWind (shop2) 健康检查 ==="
cd /var/www/app2-onewind
node scripts/diagnostics/check-pending-translations.mjs --shop=shop2 | jq '.pendingCount, .analysis'

echo -e "\n=== Fynony (shop1) 健康检查 ==="
cd /var/www/app1-fynony
node scripts/diagnostics/check-gid-format-issues.mjs --shop=shop1 | jq '.invalidGidCount, .severity'
```

### 2. 监控告警

在 `app/services/api-monitor.server.js` 中添加发布成功率监控：

```javascript
// 发布成功率低于60%时告警
if (successRate < 0.6 && total > 10) {
  logger.warn('批量发布成功率异常', { successRate, total, skipped });
}
```

### 3. 代码层面预防

**已修复** (2025-10-08):
- `product-translation-enhanced.server.js` 已修正GID保存逻辑
- 不再将临时字符串保存为GID
- 添加了 `isValidShopifyGid` 验证

**建议增强**:
- 在 `ensureValidResourceGid` 中添加更详细的错误信息
- 在UI中显示跳过的翻译数量和原因
- 批量发布失败时自动触发诊断脚本

### 4. 文档和培训

- 运维人员需熟悉诊断脚本位置和用法
- 了解 PM2 进程管理命令
- 掌握 VPN 绕过方法（静态路由配置）

## 相关文档

- [诊断脚本使用指南](../../scripts/diagnostics/README.md)
- [GID修复验证文档](../OPTION-GID-FIX-VALIDATION.md)
- [部署文档](../../阿里云轻量服务器部署文件/轻量服务器稳定操作说明.md)
- [API监控优化文档](../api-monitoring-optimization.md)

## 历史记录

- **2025-10-08**: 修复 PRODUCT_OPTION GID 保存错误
- **2025-10-13**: 完成两店铺发布问题诊断和修复
- **2025-10-13**: 创建诊断脚本和故障排查文档

## 联系方式

如遇到本文档未覆盖的问题，请：
1. 查看 `logs/app.log` 获取详细错误日志
2. 运行诊断脚本收集问题信息
3. 联系开发团队并提供诊断结果（JSON格式）
