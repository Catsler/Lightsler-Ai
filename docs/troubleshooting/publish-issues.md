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

## PRODUCT_OPTION 翻译限制（已知平台限制）

### 问题描述

**症状**:
- 翻译记录显示为 `partial` 状态（黄色警告Badge）
- syncError 包含警告：`部分字段发布成功`
- 仅 PRODUCT_OPTION 类型资源出现此状态

**根本原因**:
这是 **Shopify Translation API 的平台限制**，非系统Bug：
- ✅ PRODUCT_OPTION 的 `name` 字段（如 "Size"、"Color"）**可以发布**
- ❌ PRODUCT_OPTION 的 `values` 字段（如 "S, M, L"）**无法发布**

**技术原因**:
Shopify Translation API 的 `translatableContent` 中，PRODUCT_OPTION 类型只包含 `name` 字段，不包含 `values` 字段：

```graphql
translatableContent {
  key: "name"
  value: "Size"  # ✅ 可翻译
  locale: "en"
}
# values: ["S", "M", "L"]  # ❌ 不在 translatableContent 中，无法通过API发布
```

### 系统行为

从 **2025-10-14** 起，系统引入了 **partial 同步状态** 来正确反映这一限制：

1. **翻译阶段**：
   - 系统会翻译所有字段（包括 name 和 values）
   - Translation 记录保存完整的翻译结果

2. **发布阶段**：
   - `name` 字段成功发布到 Shopify ✅
   - `values` 字段被 API 拒绝，系统智能跳过 ⚠️
   - Translation 记录标记为 `partial` 状态（部分成功）

3. **错误记录**：
   ```json
   {
     "message": "部分字段发布成功",
     "warnings": [
       {
         "field": "values",
         "reason": "FIELD_NOT_IN_TRANSLATABLE_CONTENT",
         "message": "字段 values 不在 Shopify translatableContent 中，已跳过"
       }
     ]
   }
   ```

### UI 表现

**主页翻译列表**:
- 显示黄色 `partial` Badge（警告色调）
- 状态含义：部分字段成功发布

**资源详情页**:
- Product Options 展开区域有友好的 Banner 说明
- 详细解释哪些字段可发布、哪些不可发布
- 明确说明这是 Shopify 平台限制，非系统错误

**批量发布结果**:
- 成功发布后显示说明消息
- 例如：`ℹ️ 产品选项翻译说明: 已发布 15 个选项名称。选项值（如 S/M/L）因 Shopify API 限制无法发布，这些记录会显示为 partial 状态（部分成功），这是正常现象。`

### 诊断步骤

1. **确认是否为预期行为**:
   ```bash
   # 查询 partial 状态的 PRODUCT_OPTION 翻译
   sqlite3 prisma/dev.db "
     SELECT r.resourceType, t.language, t.syncStatus, t.syncError
     FROM Translation t
     JOIN Resource r ON t.resourceId = r.id
     WHERE t.syncStatus = 'partial'
     AND r.resourceType = 'PRODUCT_OPTION'
     LIMIT 5;
   "
   ```

2. **查看警告详情**:
   ```bash
   # 解析 syncError JSON
   sqlite3 prisma/dev.db "
     SELECT json_extract(syncError, '$.warnings')
     FROM Translation
     WHERE syncStatus = 'partial'
     LIMIT 1;
   "
   ```

3. **验证 name 字段已发布**:
   - 在 Shopify Admin 中打开对应产品
   - 切换到目标语言
   - 确认选项名称（如 "Size" → "Taille"）已正确翻译
   - 选项值保持原语言（这是预期行为）

### 替代方案

由于这是 Shopify API 限制，目前无程序化解决方案：

1. **手动翻译选项值**:
   - 在 Shopify Admin 中手动编辑产品
   - 修改选项值为目标语言

2. **接受限制**:
   - 选项值通常是标准化的（S/M/L、颜色名等）
   - 国际通用，可能不需要翻译
   - `partial` 状态表示系统已尽力发布

3. **向 Shopify 反馈**:
   - 在 [Shopify Community](https://community.shopify.com/) 提交功能请求
   - 请求 Translation API 支持 PRODUCT_OPTION values 字段

### 与其他发布问题的区别

| 问题类型 | syncStatus | 原因 | 解决方案 |
|---------|-----------|------|---------|
| GID 格式错误 | `failed` | 临时GID保存错误 | 运行 `fix-option-gids.mjs` |
| API 权限不足 | `failed` | Shopify权限配置问题 | 检查 `shopify.app.toml` |
| **values 字段限制** | **`partial`** | **Shopify API 限制** | **无法解决，这是预期行为** |
| 网络超时 | `failed` | 网络或API响应慢 | 重试发布 |

**关键区分**:
- `failed` = 错误，需要修复
- `partial` = 警告，部分成功，通常是平台限制

### 统计与影响

运行以下查询了解影响范围：

```bash
# 统计 partial 状态的 PRODUCT_OPTION 数量
sqlite3 prisma/dev.db "
  SELECT
    COUNT(*) as partial_count,
    COUNT(DISTINCT t.resourceId) as affected_resources
  FROM Translation t
  JOIN Resource r ON t.resourceId = r.id
  WHERE t.syncStatus = 'partial'
  AND r.resourceType = 'PRODUCT_OPTION';
"
```

**预期影响**:
- 每个产品的每个选项在每个语言都会有一个 `partial` 记录
- 例如：1个产品 × 2个选项 × 3个语言 = 6个 `partial` 记录
- 这不影响其他字段的翻译，只是 values 无法发布

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
