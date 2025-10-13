# 诊断脚本使用指南

## 概述

本目录包含用于诊断生产环境翻译发布问题的脚本。所有脚本输出JSON格式，便于自动化分析。

## 运行环境

- **Node.js**: >=18.20
- **依赖**: sqlite3（通过Prisma访问）
- **部署**: 需部署到生产服务器执行
- **权限**: 需要访问应用数据库（prisma/dev.sqlite）

## 脚本列表

### 1. check-pending-translations.mjs

**用途**: 检查待发布翻译数量和状态

**命令**:
```bash
cd /var/www/app2-onewind
node scripts/diagnostics/check-pending-translations.mjs --shop=shop2
```

**输出示例**:
```json
{
  "shop": "shop2",
  "timestamp": "2025-10-13T10:30:00.000Z",
  "totalTranslations": 1250,
  "pendingCount": 0,
  "syncedCount": 1200,
  "syncingCount": 0,
  "failedCount": 50,
  "analysis": "无待发布翻译，可能原因：1) 所有翻译已同步 2) 未扫描新资源 3) syncStatus异常"
}
```

### 2. check-sync-status-distribution.mjs

**用途**: 查看翻译状态分布详情

**命令**:
```bash
cd /var/www/app2-onewind
node scripts/diagnostics/check-sync-status-distribution.mjs --shop=shop2
```

**输出示例**:
```json
{
  "shop": "shop2",
  "timestamp": "2025-10-13T10:30:00.000Z",
  "statusDistribution": {
    "synced": 1200,
    "failed": 50,
    "pending": 0,
    "syncing": 0
  },
  "byResourceType": {
    "PRODUCT": {"synced": 800, "failed": 20, "pending": 0},
    "COLLECTION": {"synced": 300, "failed": 10, "pending": 0},
    "PRODUCT_OPTION": {"synced": 100, "failed": 20, "pending": 0}
  },
  "recentFailures": [
    {"resourceId": 123, "resourceType": "PRODUCT_OPTION", "language": "fr", "error": "GID format invalid"}
  ]
}
```

### 3. check-gid-format-issues.mjs

**用途**: 检查资源GID格式问题（Fynony 0%问题诊断）

**命令**:
```bash
cd /var/www/app1-fynony
node scripts/diagnostics/check-gid-format-issues.mjs --shop=shop1
```

**输出示例**:
```json
{
  "shop": "shop1",
  "timestamp": "2025-10-13T10:30:00.000Z",
  "totalResources": 500,
  "invalidGidCount": 15,
  "invalidGids": [
    {
      "resourceId": 123,
      "resourceType": "PRODUCT_OPTION",
      "gid": "gid://shopify/ProductOption/123-temp",
      "issue": "contains '-temp' suffix",
      "recommendation": "run fix-option-gids.mjs"
    },
    {
      "resourceId": 456,
      "resourceType": "PRODUCT_OPTION",
      "gid": "cm3abcdef",
      "issue": "cuid format instead of Shopify GID",
      "recommendation": "run fix-option-gids.mjs"
    }
  ],
  "affectedTranslations": 45,
  "summary": "Found 15 resources with invalid GID format, affecting 45 pending translations"
}
```

## 故障排查流程

### OneWind 发布按钮灰色

1. 运行 `check-pending-translations.mjs` 确认待发布数量
2. 若 `pendingCount = 0`，运行 `check-sync-status-distribution.mjs` 查看状态分布
3. 根据输出判断：
   - 所有翻译已同步 → 正常，需扫描新资源
   - 大量 `failed` 状态 → 查看 `recentFailures` 字段定位错误
   - 状态分布异常 → 检查数据库完整性

### Fynony 发布显示0%

1. 运行 `check-gid-format-issues.mjs` 检查GID问题
2. 若 `invalidGidCount > 0`，按推荐运行修复脚本：
   ```bash
   node scripts/fix-option-gids.mjs --shop=shop1 --dry-run  # 预览
   node scripts/fix-option-gids.mjs --shop=shop1            # 执行修复
   ```
3. 修复后重启进程：`pm2 restart shop1-fynony shop1-worker`

## 开发说明

- 所有脚本需要导入 Prisma 客户端访问数据库
- 使用 `--shop` 参数过滤特定店铺数据
- 输出必须为有效JSON格式
- 包含 `timestamp` 字段记录执行时间
- 错误信息输出到 stderr，JSON输出到 stdout

## 相关文档

- [故障排查文档](../../docs/troubleshooting/publish-issues.md)
- [GID修复文档](../../docs/OPTION-GID-FIX-VALIDATION.md)
- [部署文档](../../阿里云轻量服务器部署文件/轻量服务器稳定操作说明.md)
