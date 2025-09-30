# API监控系统优化需求文档

## 一、现状分析

### 1.1 系统能力评估

- **监控基础设施：完备 ✅**
  - `app/services/api-monitor.server.js` 提供滚动窗口统计与告警能力
  - `app/utils/base-route.server.js` 已在成功、验证失败与异常路径调用 `recordApiCall`
  - `PersistentTranslationLogger` 支持日志持久化
  - `ErrorCollector` 可收集并聚合错误信息
- **告警机制：已实现 ✅**
  - 失败率阈值：警告 > 0.1%，严重 > 0.5%
  - P95 延迟异常检测：基于 15 分钟基线对比
  - 指标事件：`api_monitor_recovered` / `api_monitor_warning` / `api_monitor_critical`

### 1.2 核心问题

- 监控覆盖不足：默认仅监控 `api.translate`、`api.translate-queue`、`api.status`
- 可观测性缺失：监控数据尚未进入告警仪表盘，缺乏直观视图
- 配置不透明：团队不了解如何扩展监控范围

### 1.3 错误统计

- 总错误数：137
- 严重错误：30 个翻译超时（`UNKNOWN` 类型，严重级别 5）
- 系统错误：55 个（`SYSTEM` 类型，严重级别 2）
- 关键问题：Request Body 重复读取、API 参数读取错误、认证失败

## 二、优化目标

### 2.1 短期目标（立即可实现）

1. 扩展监控覆盖到所有 API
2. 激活告警链路，确保监控数据进入观察系统
3. 文档化监控配置与使用方法

### 2.2 中期目标（逐步完善）

1. 建立监控仪表盘，展示关键指标
2. 基于真实数据调整告警阈值
3. 为各 API 建立性能基线

## 三、实施方案

### 3.1 立即行动项（无需改代码）

**配置调整**

```bash
# 监控所有 API（推荐）
export API_MONITORING_OPERATIONS=""

# 或显式列出需要监控的操作
export API_MONITORING_OPERATIONS="api.translate,api.translate-queue,api.status,api.locales,api.errors,api.sync-translations"
```

**验证步骤**

1. 设置环境变量并重启：`npm run dev`
2. 触发 API 调用：`curl http://localhost:3000/api/status`
3. 查看监控日志：`tail -f logs/app.log | grep -E "api_monitor|API 指标"`

### 3.2 文档更新需求

- **`CLAUDE.md`**：补充 API 监控配置、日志查看命令、故障排查指引
- **`.env.example`**：添加 `API_MONITORING_OPERATIONS` 示例与说明
- **`docs/api-monitoring-guide.md`**（新增或扩写现有指南）：
  - 监控系统架构（api-monitor → logger → database）
  - 关键指标说明（失败率、P95 延迟、状态码分布）
  - 告警规则与阈值
  - 监控扩展指南与日志查询命令

### 3.3 监控策略建议

- **环境分级**
  - 生产：监控核心 API，留意性能开销
  - 开发：全量监控，尽早发现问题
  - 故障排查：临时开启全量监控
- **告警优先级**
  - P0：认证失败、数据库连接失败
  - P1：翻译 API 失败率 > 1%
  - P2：API 响应时间 > 30 秒
  - P3：单个资源翻译超时

## 四、验收标准

### 4.1 技术验收

- `API_MONITORING_OPERATIONS=""` 后可见所有 API 的监控日志
- 触发错误能够生成 `api_monitor_warning` / `api_monitor_critical`
- 监控数据写入 TranslationLog 表

### 4.2 文档验收

- `CLAUDE.md` 含监控配置说明
- `.env.example` 提供清晰配置示例
- 监控指南覆盖主要使用场景

### 4.3 团队验收

- 团队成员掌握全量监控开启方法
- 能够查看并分析监控日志
- 建立监控值班与响应流程

## 五、风险与对策

### 5.1 潜在风险

- 性能影响：全量监控可能增加开销
- 日志膨胀：高频接口产生大量日志
- 告警疲劳：阈值过低导致噪声

### 5.2 缓解措施

- 采用采样策略（例如每 100 个请求记录一次）
- 配置日志轮转与清理
- 基于真实数据调整告警阈值
- 设定告警分级与静默策略

## 六、后续优化建议

### 6.1 技术债务清理

- 统一 `RouteContext` 契约，避免重复读取 request body
- 添加契约测试保护 API 路由规范
- 优化翻译超时处理

### 6.2 监控能力增强

- 接入 Grafana / Prometheus 等监控平台
- 建立 SLO（服务级别目标）
- 实现自动化告警响应（如自动重启、降级）

### 6.3 知识沉淀

- 编写 ADR 记录监控决策
- 定期复盘监控指标，持续优化性能
- 建立故障复盘机制

## 七、实施优先级

1. **立即执行（0 成本）**：设置 `API_MONITORING_OPERATIONS=""`，验证监控日志
2. **本周完成（低成本）**：更新 `CLAUDE.md`、`.env.example`，完善监控指南
3. **本月完成（中成本）**：配置日志告警规则，建立监控仪表盘
4. **季度目标（需规划）**：接入专业监控平台，实现自动化运维

> **核心结论**：监控能力已具备，瓶颈在于配置和可观测性的“最后一公里”。通过简单的环境变量调整与文档固化即可快速激活全量监控，并为团队提供可操作的指南。