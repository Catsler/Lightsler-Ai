# 翻译系统关键节点本地化错误处理增强 - 需求文档

## 📋 文档信息

- **版本**: v1.0
- **创建日期**: 2025-10-01
- **最后更新**: 2025-10-01
- **状态**: 待实施
- **优先级**: P2 (中等)
- **预计工作量**: 1-1.5小时

---

## 🎯 项目目标

在翻译系统的关键节点（长文本分块、URL转换）增加本地化错误处理，通过中文错误消息、详细上下文和错误码标识，提升问题定位效率和系统可维护性。

**核心价值**：
- 🚀 提升开发效率：从"搜索日志→理解含义→定位代码"缩短到"错误码直达"
- 🔍 增强可观测性：系统性收集异常数据，支持趋势分析
- 🛡️ 降低维护成本：本地化消息降低理解门槛，减少沟通成本

---

## 📊 现状分析

### 存在的问题

1. **错误消息非本地化**
   - 英文错误消息，需要额外理解成本
   - 缺少修复建议，增加排查难度

2. **缺少系统性错误收集**
   - 关键节点（分块、URL转换）无异常监控
   - 难以发现系统性问题和优化机会

3. **问题定位效率低**
   - 无错误码标识，需要搜索代码
   - 上下文信息不完整，难以重现问题

### 现有基础

- ✅ **错误收集系统**：`ErrorCollectorService` 已实现
- ✅ **错误分类**：10种错误类型，4种分类级别
- ✅ **错误指纹**：去重和分组机制完善
- ✅ **本地化框架**：`error-messages.server.js` 已存在
- ⚠️ **覆盖不足**：长文本翻译和URL转换监控缺失

---

## 🎯 核心需求

### 需求1：本地化错误消息系统增强

**目标**：扩展现有错误消息系统，支持参数化消息

**现有能力**：
```javascript
// app/utils/error-messages.server.js
export function getLocalizedErrorMessage(code, locale = DEFAULT_LOCALE, fallback = '')
```

**需求改进**：
```javascript
// 支持参数替换
getLocalizedErrorMessage('CHUNK_SIZE_ABNORMAL', 'zh-CN', {
  chunks: 150,
  textLength: 12000
})
// 返回: "分块数量异常(150个)，可能影响翻译质量"
```

**设计原则**：
- ✅ 简单替换：使用 `replace()` 循环，无额外依赖
- ✅ 容错处理：未提供的 `{param}` 保留原样，方便调试
- ✅ 无特殊处理：不转义 `$1` 等特殊字符
- ✅ 保持简洁：只存储消息映射，severity/code 在调用时指定

**新增错误消息**：
| 错误码 | 中文消息 | 参数 |
|--------|----------|------|
| CHUNK_SIZE_ABNORMAL | 分块数量异常({chunks}个)，可能影响翻译质量 | chunks, textLength |
| LINK_CONVERSION_LOW_SUCCESS_RATE | URL转换成功率过低 | rate, total, failed |

---

### 需求2：长文本分块异常监控

**业务场景**：
智能分块函数 (`intelligentChunkText`) 将长文本分割为多个块进行翻译。过度分块可能导致：
- 翻译质量下降（上下文丢失）
- API调用次数增加
- 翻译时间延长

**监控目标**：
发现异常分块行为，为算法优化提供数据支持

**触发条件**：
```javascript
chunks.length > 100  // 单一条件，保持简单
```

**监控位置**：
- 文件：`app/services/translation/core.server.js`
- 函数：`intelligentChunkText`
- 位置：函数末尾（return 前）

**收集信息**：
```javascript
{
  errorCode: 'CHUNK_SIZE_ABNORMAL',
  errorType: ERROR_TYPES.TRANSLATION,
  errorCategory: 'WARNING',
  message: "分块数量异常(150个)，可能影响翻译质量",
  severity: 2,
  operation: 'intelligentChunkText',
  context: {
    chunkCount: 150,           // 分块数量
    textLength: 12000,         // 原文长度
    averageSize: 80,           // 平均块大小
    isHtml: true               // 是否HTML内容
  }
}
```

**实施方式**：
1. 日志记录：`logger.warn()` - 立即可见
2. 错误收集：`collectError()` - 持久化分析

**价值评估**：
- ✅ 发现过度分块的文本特征
- ✅ 为分块算法优化提供数据
- ✅ 监控系统整体健康度

---

### 需求3：URL转换成功率监控

**业务场景**：
链接转换功能将内链转换为多语言URL（如 `/products/test` → `/pt/products/test`）。转换失败可能导致：
- 多语言站点内链指向错误语言
- 用户体验受损（语言切换后链接失效）
- SEO影响（错误的语言链接）

**监控目标**：
及时发现Markets配置缺失或URL转换异常

**触发条件**：
```javascript
successRate < 80% && totalLinks >= 5
```

**监控位置**：
- 文件：`app/services/link-converter.server.js`
- 函数：`convertLinksForLocale`
- 位置：函数末尾（转换完成后）

**数据收集流程**：
```javascript
// 1. 转换过程中统计
const stats = {
  totalLinks: 0,
  successCount: 0,
  failedCount: 0,
  failedUrls: []  // 最多收集3条
};

// 2. 单个链接转换失败时
if (stats.failedUrls.length < 3) {
  stats.failedUrls.push({
    url: url.substring(0, 200),           // 截断至200字符
    error: error.message.substring(0, 100) // 截断至100字符
  });
}

// 3. 转换完成后检查成功率
if (successRate < 80 && totalLinks >= 5) {
  collectError({...});
}
```

**收集信息**：
```javascript
{
  errorCode: 'LINK_CONVERSION_LOW_SUCCESS_RATE',
  errorType: ERROR_TYPES.TRANSLATION,
  errorCategory: 'WARNING',
  message: "URL转换成功率过低",
  severity: 2,
  operation: 'convertLinksForLocale',
  context: {
    targetLocale: 'pt',
    stats: {
      total: 12,
      success: 8,
      failed: 4,
      rate: "66.7"
    },
    failedSamples: [  // 最多3条
      {
        url: "/products/test-product-with-very...",
        error: "Target config missing for locale"
      },
      {
        url: "http://example.com/page...",
        error: "Invalid URL format"
      }
    ]
  }
}
```

**实施方式**：
1. 统计逻辑：遍历过程中累计成功/失败
2. 样本收集：最多3条失败样本（URL+error均截断）
3. 日志记录：`logger.warn()` - 完整信息
4. 错误收集：`collectError()` - 截断后信息

**价值评估**：
- ✅ 快速发现Markets配置问题
- ✅ 识别需要特殊处理的URL模式
- ✅ 监控链接转换功能健康度

---

### 需求4：错误查询文档

**目标**：提供清晰的错误查询指南，降低排查门槛

**文档位置**：`CLAUDE.md` - 故障排查章节

**内容要点**：

#### API查询方式
```bash
# 查询所有翻译相关错误
GET /api/errors?isTranslationError=true&limit=50

# 查询特定错误码
GET /api/errors?errorCode=CHUNK_SIZE_ABNORMAL
GET /api/errors?errorCode=LINK_CONVERSION_LOW_SUCCESS_RATE

# 组合查询
GET /api/errors?isTranslationError=true&severity=3
```

#### 本地日志查询
```bash
# 实时查看翻译错误
tail -f logs/app.log | jq 'select(.errorCode != null)'

# 统计错误频率
tail -1000 logs/app.log | jq -r '.errorCode' | grep -v null | sort | uniq -c | sort -rn

# 查看特定错误详情
tail -f logs/app.log | jq 'select(.errorCode == "CHUNK_SIZE_ABNORMAL")'
```

#### 常见错误码说明
| 错误码 | 含义 | 排查建议 |
|--------|------|----------|
| CHUNK_SIZE_ABNORMAL | 分块数量过多 | 检查原文格式，是否包含异常HTML结构 |
| LINK_CONVERSION_LOW_SUCCESS_RATE | URL转换成功率低 | 检查Markets配置，确认目标语言域名映射 |

**价值**：
- ✅ 开发者自助排查
- ✅ 减少沟通成本
- ✅ 统一排查流程

---

## 📐 技术设计

### 设计原则

1. **KISS原则**
   - 最小化改动：只在关键节点增加监控
   - 渐进验证：Phase 0先验证，观察后再扩展
   - 复用现有：基于已有ErrorCollector和error-messages

2. **非侵入性**
   - 不改变现有翻译逻辑
   - 错误收集对用户透明
   - 性能影响可忽略（仅异常时触发）

3. **可观测优先**
   - 日志优先：立即可见，实时调试
   - 按需持久化：避免数据膨胀
   - 保留上下文：足够重现问题

### 架构设计

```
┌─────────────────────────────────────────┐
│         翻译操作（正常流程）              │
└────────────┬────────────────────────────┘
             │
             ├── intelligentChunkText
             │   └── chunks.length > 100?
             │       ├── Yes → logger.warn + collectError
             │       └── No → 继续
             │
             ├── convertLinksForLocale
             │   └── successRate < 80% && totalLinks >= 5?
             │       ├── Yes → logger.warn + collectError
             │       └── No → 继续
             │
             └── 返回翻译结果（不受影响）

┌─────────────────────────────────────────┐
│           错误收集与查询                  │
└────────────┬────────────────────────────┘
             │
             ├── logger.warn() → logs/app.log（实时）
             │
             ├── collectError() → ErrorLog表（持久化）
             │   └── 包含: errorCode, message, context
             │
             └── 查询方式
                 ├── /api/errors?errorCode=xxx
                 └── tail -f logs/app.log | jq '...'
```

### 数据流

```
触发点（如 chunks > 100）
    ↓
1. getLocalizedErrorMessage()  // 生成中文消息
    ↓
2. logger.warn()               // 立即写入日志
    ↓
3. collectError()              // 异步写入数据库
    ↓
4. ErrorLog表                  // 持久化存储
    ↓
5. 查询/分析                   // 开发者排查
```

### 错误分类

```javascript
{
  errorType: 'TRANSLATION',       // 所有翻译相关
  errorCategory: 'WARNING',       // 不影响功能
  severity: 2,                    // 中等严重度
  isTranslationError: true,       // 用于筛选
  operation: '具体操作函数名'      // 快速定位
}
```

---

## 🚀 实施计划

### Phase 0：最小验证（1-1.5小时）

**目标**：在2个高价值场景打点，验证效果

#### 修改清单

| 文件 | 改动点 | 行数 | 说明 |
|------|--------|------|------|
| `app/utils/error-messages.server.js` | 添加2个错误消息 + 扩展函数 | ~15行 | 支持参数替换 |
| `app/services/translation/core.server.js` | `intelligentChunkText` 末尾 | ~15行 | 分块异常监控 |
| `app/services/link-converter.server.js` | `convertLinksForLocale` 统计+告警 | ~35行 | URL转换监控 |
| `CLAUDE.md` | 添加错误排查章节 | ~25行 | 文档更新 |

**总代码量**：~90行（纯增量）

#### 实施步骤

1. **扩展 error-messages.server.js**（15分钟）
   ```javascript
   // 1. 添加2个错误消息到 ERROR_MESSAGES
   // 2. 扩展 getLocalizedErrorMessage 支持 params 参数
   // 3. 添加参数替换逻辑（简单 replace 循环）
   ```

2. **添加分块异常监控**（20分钟）
   ```javascript
   // 在 intelligentChunkText 函数末尾
   if (chunks.length > 100) {
     const message = getLocalizedErrorMessage('CHUNK_SIZE_ABNORMAL', 'zh-CN', {...});
     logger.warn(message, {...});
     collectError({...});
   }
   ```

3. **添加URL转换监控**（30分钟）
   ```javascript
   // 在 convertLinksForLocale 中
   // 1. 初始化 stats 统计对象
   // 2. 转换失败时收集样本（最多3条）
   // 3. 转换完成后检查成功率
   // 4. 成功率低时 logger + collectError
   ```

4. **更新文档**（15分钟）
   ```markdown
   // 在 CLAUDE.md 添加"翻译错误排查"章节
   // 包括：API查询、日志查询、错误码说明
   ```

#### 验证方式

```bash
# 1. 代码检查
npm run check:lint   # ESLint通过
npm run check:build  # 构建成功

# 2. 不启动项目
# 等待生产环境自然触发，或使用现有测试数据

# 3. 如必须验证运行时
shopify app dev --tunnel-url=https://translate.ease-joy.fun:3000
# 翻译包含长文本的资源，观察日志输出
```

#### 验收标准

- [ ] `npm run check:lint` 通过
- [ ] `npm run check:build` 通过
- [ ] 错误消息支持参数替换
- [ ] 分块 > 100 时正确记录错误
- [ ] URL成功率 < 80% 时正确记录错误
- [ ] CLAUDE.md 包含错误查询文档

---

### 观察期（1-2周）

**观察内容**：

1. **触发频率**
   ```bash
   # 查询分块异常频率
   curl "/api/errors?errorCode=CHUNK_SIZE_ABNORMAL&limit=100" | jq '.total'

   # 查询URL转换告警频率
   curl "/api/errors?errorCode=LINK_CONVERSION_LOW_SUCCESS_RATE&limit=100" | jq '.total'
   ```

2. **数据质量**
   - 错误上下文是否足够定位问题？
   - 是否有误报（正常情况被告警）？
   - 阈值设置是否合理？

3. **实际价值**
   - 是否真正帮助发现和解决了问题？
   - 开发者是否使用了错误查询功能？
   - 是否有新的监控需求？

**数据收集**：
```bash
# 统计错误分布
tail -7d logs/app.log | \
  jq -r '.errorCode' | \
  grep -v null | \
  sort | uniq -c | sort -rn

# 查看具体错误详情
jq 'select(.errorCode == "CHUNK_SIZE_ABNORMAL")' logs/app.log | \
  jq -s 'group_by(.context.chunkCount) | map({count: .[0].context.chunkCount, occurrences: length})'
```

**评估标准**：
- ✅ 频率合理（5-20次/周，不过多不过少）
- ✅ 有效定位（至少发现1个实际问题）
- ✅ 无误报（误报率 < 10%）

---

### Phase 1：按需扩展（待定）

根据观察期数据决定是否需要：

#### 可能的优化方向

1. **阈值调优**
   - 分块数量：从100调整到50或150
   - URL成功率：从80%调整到70%或90%
   - 动态阈值：根据文本类型调整

2. **新增场景**
   - 翻译验证失败（completeness check）
   - API超时频繁
   - 队列处理异常

3. **功能增强**
   - 专门的错误查询API
   - 监控仪表盘集成
   - 错误趋势分析
   - 自动告警通知

4. **数据优化**
   - 错误聚合统计
   - 根因自动分析
   - 修复建议智能推荐

#### 决策依据

| 指标 | 扩展阈值 | 说明 |
|------|----------|------|
| 错误频率 | > 10次/周 | 足够样本量 |
| 定位价值 | ≥ 1个问题/月 | 真正有用 |
| 误报率 | < 10% | 信号清晰 |
| 开发需求 | ≥ 2人提出 | 真实需求 |

---

## ✅ 验收标准

### 功能验收

- [ ] **参数替换功能**
  - `getLocalizedErrorMessage` 支持 `{param}` 替换
  - 未提供参数保留原样
  - 无特殊字符转义问题

- [ ] **分块异常监控**
  - 分块数 > 100 时触发
  - 错误消息为中文
  - context 包含完整信息（chunkCount, textLength, averageSize）

- [ ] **URL转换监控**
  - 成功率 < 80% 且链接数 ≥ 5 时触发
  - 收集最多3条失败样本
  - URL和error均正确截断

- [ ] **错误查询**
  - 可通过 `/api/errors?errorCode=xxx` 查询
  - 可通过 jq 过滤日志
  - 文档示例可正常运行

### 质量验收

- [ ] **代码质量**
  - `npm run check:lint` 无新增错误
  - `npm run check:build` 成功
  - 代码符合现有风格

- [ ] **性能影响**
  - 正常流程无性能下降
  - 错误收集不阻塞主流程
  - 数据库无性能问题

- [ ] **兼容性**
  - 不影响现有翻译功能
  - 向后兼容（`getLocalizedErrorMessage` 不传 params 也能正常工作）

### 文档验收

- [ ] **需求文档**
  - 本文档完整清晰
  - 包含所有设计细节

- [ ] **用户文档**
  - CLAUDE.md 包含错误排查章节
  - 示例代码可运行
  - 错误码说明清晰

- [ ] **TODO.md更新**
  - 任务添加到进行中
  - 包含Phase 0检查清单
  - 标注观察期时间

---

## 🎯 预期效果

### 开发体验改进

| 指标 | 改进前 | 改进后 | 提升 |
|------|--------|--------|------|
| 错误理解时间 | 2-5分钟（搜索+理解） | 10-30秒（直接阅读） | 75%+ |
| 问题定位时间 | 10-30分钟（搜索日志+分析） | 2-5分钟（错误码直达） | 80%+ |
| 趋势分析能力 | 困难（需手动统计） | 简单（一条查询） | 质的飞跃 |

### 示例对比

#### 改进前
```javascript
// 日志
logger.warn('Chunk count abnormal', { count: 150 });

// 开发者排查流程
1. 搜索日志："abnormal" → 找到日志
2. 理解含义：什么是 abnormal？多少算 abnormal？
3. 定位代码：搜索 "Chunk count abnormal" → 找到文件和函数
4. 分析问题：读代码理解逻辑
5. 判断严重性：是否需要处理？

// 总耗时：10-20分钟
```

#### 改进后
```json
{
  "errorCode": "CHUNK_SIZE_ABNORMAL",
  "message": "分块数量异常(150个)，可能影响翻译质量",
  "severity": 2,
  "operation": "intelligentChunkText",
  "context": {
    "chunkCount": 150,
    "textLength": 12000,
    "averageSize": 80
  }
}
```

**开发者排查流程**：
1. ✅ 看到中文消息，立即理解问题
2. ✅ 通过 `errorCode` 搜索代码，直达位置
3. ✅ 从 `context` 获取完整信息（文本长度12000，分150块，平均80字符）
4. ✅ 从 `severity: 2` 判断：中等严重度，需关注但不紧急

**总耗时**：2-5分钟（提升80%）

### 系统可维护性改进

- ✅ **趋势分析**：通过错误统计发现系统性问题
- ✅ **数据驱动**：有数据支持的优化决策
- ✅ **知识沉淀**：错误码成为团队共同语言

---

## ⚠️ 风险和限制

### 技术风险

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| 性能影响 | 低 | 仅异常时触发，异步收集 |
| 数据膨胀 | 低 | 截断长字段，限制样本数 |
| 误报告警 | 中 | 观察期调优阈值 |

### 业务限制

- **用户无感知**：错误收集完全后台进行
- **功能不受影响**：翻译结果和流程不变
- **可回滚**：移除 `collectError` 调用即可

### 维护成本

| 项目 | 成本 | 频率 |
|------|------|------|
| 新增错误码 | 5分钟/个 | 低（Phase 0后很少） |
| 阈值调优 | 10分钟/次 | 低（观察期后稳定） |
| 文档维护 | 2分钟/次 | 低（跟随错误码） |

---

## 📝 相关文档

### 项目文件
- `app/utils/error-messages.server.js` - 错误消息定义
- `app/services/error-collector.server.js` - 错误收集服务
- `app/services/translation/core.server.js` - 翻译核心逻辑
- `app/services/link-converter.server.js` - 链接转换逻辑
- `CLAUDE.md` - 项目文档
- `TODO.md` - 任务跟踪

### 技术概念
- **ErrorCollector**: 统一错误收集和管理系统
- **Sequential Thinking**: 智能决策引擎
- **Markets配置**: Shopify多语言域名映射
- **智能分块**: 长文本自适应分割算法

---

## 📚 附录

### A. 错误消息完整定义

```javascript
// app/utils/error-messages.server.js
const ERROR_MESSAGES = {
  // ... 现有消息 ...

  CHUNK_SIZE_ABNORMAL: {
    'zh-CN': '分块数量异常({chunks}个)，可能影响翻译质量',
    'en': 'Abnormal chunk count ({chunks}), may affect translation quality'
  },

  LINK_CONVERSION_LOW_SUCCESS_RATE: {
    'zh-CN': 'URL转换成功率过低',
    'en': 'Link conversion success rate too low'
  }
};
```

### B. 错误收集示例

```javascript
// 分块异常
await collectError({
  errorType: ERROR_TYPES.TRANSLATION,
  errorCategory: 'WARNING',
  errorCode: 'CHUNK_SIZE_ABNORMAL',
  message: '分块数量异常(150个)，可能影响翻译质量',
  context: {
    chunkCount: 150,
    textLength: 12000,
    averageSize: 80,
    isHtml: true
  },
  operation: 'intelligentChunkText',
  severity: 2
});

// URL转换成功率低
await collectError({
  errorType: ERROR_TYPES.TRANSLATION,
  errorCategory: 'WARNING',
  errorCode: 'LINK_CONVERSION_LOW_SUCCESS_RATE',
  message: 'URL转换成功率过低',
  context: {
    targetLocale: 'pt',
    stats: {
      total: 12,
      success: 8,
      failed: 4,
      rate: "66.7"
    },
    failedSamples: [
      { url: "/products/test...", error: "Target config missing" }
    ]
  },
  operation: 'convertLinksForLocale',
  severity: 2
});
```

### C. 查询命令速查

```bash
# API查询
curl "/api/errors?errorCode=CHUNK_SIZE_ABNORMAL" | jq .
curl "/api/errors?isTranslationError=true&severity=2" | jq .

# 日志查询
tail -f logs/app.log | jq 'select(.errorCode)'
tail -100 logs/app.log | jq -r '.errorCode' | sort | uniq -c

# 统计分析
jq 'select(.errorCode == "CHUNK_SIZE_ABNORMAL")' logs/app.log | \
  jq -s 'group_by(.context.chunkCount) | map({chunks: .[0].context.chunkCount, count: length})'
```

---

## 🎬 下一步行动

### 立即执行（Phase 0）
1. ✅ 创建本需求文档
2. ⏳ 更新 TODO.md
3. ⏳ 实施代码修改（4个文件，~90行）
4. ⏳ 运行代码检查验证

### 短期观察（1-2周）
1. 监控生产环境日志
2. 收集错误统计数据
3. 评估阈值合理性
4. 收集团队反馈

### 中期决策（观察期后）
1. 分析 Phase 0 效果
2. 决定是否进入 Phase 1
3. 规划扩展方向
4. 调整优化策略

---

**文档维护者**: AI Assistant
**最后审核**: 2025-10-01
**下次审核**: Phase 0 完成后
