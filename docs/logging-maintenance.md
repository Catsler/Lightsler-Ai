# Logging Maintenance Guide

本指南说明如何启用翻译系统的持久化日志、日常巡检步骤以及旧日志清理策略。

## 1. 启用持久化日志

1. 在部署环境的 `.env` 或平台配置中设置：
   ```ini
   LOGGING_FILE_ENABLED=true
   LOGGING_ENABLE_PERSISTENT_LOGGER=true
   LOGGING_LEVEL=info
   LOGGING_PERSISTENCE_LEVEL=INFO
   LOGGING_RETENTION_DAYS={"ERROR":30,"WARN":15,"INFO":7,"DEBUG":3}
   ```
2. 重启应用后，日志将写入 `logs/app.log` 并同步到持久化后端（若开启）。
3. 通过 `tail -f logs/app.log` 或查询 `PersistentTranslationLogger` 表确认日志是否持续写入。

## 2. 日常巡检流程

建议每周执行一次，重点关注翻译及关联模块：

1. **检索错误日志**
   ```bash
   jq 'select(.level=="ERROR" and .category=="TRANSLATION")' logs/app.log
   ```
2. **整理问题清单**：将产品选项/Metafield 相关的 WARN/ERROR 记录到工单或 TODO。
3. **复盘与修复**：定位根因（例如 GraphQL 限流、数据缺失），完成修复后在日志中记录 `fixed` 备注。
4. **复验**：手动触发一次翻译流程，确认日志输出恢复正常。

## 3. 日志清理策略

### 3.1 自动轮转

`LOGGING_RETENTION_DAYS` 会触发内置定时任务：
- 定期检查 `logs/app.log`，当文件超过配置的天数时自动改名归档（例如 `logs/app-2025-10-03T12-00-00.log`）。
- 归档文件保留在 `logs/` 目录，可用于审计。

### 3.2 定期清理脚本

对于归档文件，可使用 `scripts/cleanup-logs.js` 自动删除超期文件。建议通过 cron 每天执行一次：

```bash
0 3 * * * node scripts/cleanup-logs.js --path ./logs --days 30
```

脚本说明见 `scripts/cleanup-logs.js --help`。

## 4. 审计与追踪

- 修复完成后，将工单编号或摘要记录到日志（INFO 级别），便于后续查询。
- 每月导出一次错误统计，关注 `relatedSummary.status='partial_failure'`、`翻译失败` 等关键字段。
- 对重复出现的错误，在 TODO 或运维文档中建立长期优化计划。

## 5. 参考资料

- `.env.example` 中的 Logging 配置示例
- `app/utils/base-logger.server.js`：日志输出与轮转实现
- `TODO.md`：日志持久化任务进度
