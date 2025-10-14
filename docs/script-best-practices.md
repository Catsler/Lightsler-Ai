# 数据修复脚本最佳实践

> 总结自"发布按钮灰度问题"事件（2025-10-12）

## 🎯 核心原则

### 1. 数据一致性优先
**规则**: 修改一个字段时，必须考虑关联字段的一致性

**常见关联关系**:
- `translationFields` 变更 → `syncStatus` 必须重置为 'pending'
- `syncStatus` 变更 → `syncedAt` 时间戳应同步更新
- `contentFields` 变更 → `contentHash` 应重新计算
- `translationFields` 清空 → 相关统计缓存需失效

**反例**:
```javascript
// ❌ 错误：只更新 translationFields
await prisma.translation.update({
  where: { id },
  data: { translationFields: cleaned }
});
// 问题：syncStatus 仍为 'synced'，UI 统计错误
```

**正例**:
```javascript
// ✅ 正确：同步更新关联字段
await prisma.translation.update({
  where: { id },
  data: {
    translationFields: cleaned,
    syncStatus: 'pending',  // 重置状态
    syncedAt: null          // 清除时间戳
  }
});
```

### 2. 安全第一

**必需的安全特性**:
- ✅ 备份受影响记录（自动化，非可选）
- ✅ 备份文件权限控制（600 仅所有者）
- ✅ 备份目录统一管理（`backups/`，gitignore 保护）
- ✅ 日志掩码敏感信息（DATABASE_URL、API Keys）
- ✅ Dry-run 模式强制预览
- ✅ 执行位置检查（防止路径错误）

**备份最佳实践**:
```javascript
function backupRecords(shopId, records) {
  const backupDir = path.join(process.cwd(), 'backups');

  // 确保目录存在且权限正确
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }

  const backupFile = path.join(
    backupDir,
    `fix-name-${shopId}-${Date.now()}.json`
  );

  const backupData = {
    shopId,
    timestamp: Date.now(),
    count: records.length,
    records: records.map(r => ({
      id: r.id,
      // 包含所有将要修改的字段
      ...relevantFields
    }))
  };

  fs.writeFileSync(
    backupFile,
    JSON.stringify(backupData, null, 2),
    { mode: 0o600 }  // 仅所有者可读写
  );

  console.log(`✅ 备份已保存: ${backupFile} (${records.length} 条)`);
  return backupFile;
}
```

### 3. 判定逻辑稳定性

**避免不稳定的比较方法**:
- ❌ `JSON.stringify(obj1) !== JSON.stringify(obj2)` - 键顺序不稳定
- ❌ `obj.field == 'value'` - 类型强制转换陷阱
- ✅ 复用业务检测函数（如 `hasSkippedStructure()`）
- ✅ 使用深度比较库（lodash `isEqual`）
- ✅ 严格相等 `===` 和类型检查

**推荐模式**:
```javascript
// 方案 A: 复用业务逻辑（推荐）
function needsFix(record) {
  return hasBusinessCondition(record.field) &&
         record.status !== 'target_status';
}

// 方案 B: 深度比较（有依赖时）
import { isEqual } from 'lodash-es';

function needsFix(record) {
  const before = record.field;
  const after = transformField(before);
  return !isEqual(before, after);
}
```

### 4. 执行可控性

**Dry-run 实现标准**:
```javascript
async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log(`模式: ${isDryRun ? 'DRY RUN (预览)' : 'EXECUTE (执行)'}`);

  const affectedRecords = await findAffectedRecords();

  console.log(`🔍 需要修复的记录数: ${affectedRecords.length}`);

  // 显示样本（前5条）
  affectedRecords.slice(0, 5).forEach((record, i) => {
    console.log(`   ${i + 1}. ID: ${record.id}`);
    console.log(`      字段变更: ${record.before} → ${record.after}`);
  });

  if (isDryRun) {
    console.log('💡 这是预览模式，没有实际修改数据。');
    console.log('   要执行修复，请运行: node scripts/fix-xxx.mjs');
    return;
  }

  // 执行修复...
}
```

---

## 📝 标准脚本模板

### 基础结构

```javascript
/**
 * [脚本名称] - [简要描述]
 *
 * 背景: [问题描述]
 * 用途: [修复目标]
 *
 * 使用方法:
 *   node scripts/fix-xxx.mjs --dry-run  # 预览
 *   node scripts/fix-xxx.mjs             # 执行
 *
 * ⚠️ 执行位置: 必须在 repo 根目录运行
 *
 * 安全特性:
 *   - 自动备份到 backups/ 目录（权限 600）
 *   - 日志掩码敏感信息
 *   - 串行处理多店铺
 *   - dry-run 模式强制预览
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// ========================================
// 业务逻辑函数
// ========================================

/**
 * 判定记录是否需要修复
 */
function needsFix(record) {
  // TODO: 实现具体判定逻辑
  // 确保逻辑稳定（避免 JSON.stringify）
  return false;
}

// ========================================
// 工具函数
// ========================================

/**
 * 掩码敏感信息
 */
function maskDatabaseUrl(url) {
  if (!url) return 'undefined';
  return url.replace(/(.*:\/\/)([^:]+):([^@]+)@(.*)/, '$1***:***@$4');
}

/**
 * 确保备份目录存在
 */
function ensureBackupDir() {
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  }
  return backupDir;
}

/**
 * 备份受影响记录
 */
function backupRecords(shopId, records) {
  const backupDir = ensureBackupDir();
  const backupFile = path.join(
    backupDir,
    `fix-xxx-${shopId}-${Date.now()}.json`
  );

  const backupData = {
    shopId,
    timestamp: Date.now(),
    count: records.length,
    records: records.map(r => ({
      id: r.id,
      // 包含所有相关字段
    }))
  };

  fs.writeFileSync(
    backupFile,
    JSON.stringify(backupData, null, 2),
    { mode: 0o600 }
  );

  console.log(`✅ 备份已保存: ${backupFile} (${records.length} 条)`);
  return backupFile;
}

/**
 * 检查执行位置
 */
function checkExecutionPath() {
  const currentDir = process.cwd();
  const scriptsDir = path.join(currentDir, 'scripts');

  if (!fs.existsSync(scriptsDir)) {
    console.error('❌ 错误：必须在项目根目录执行此脚本！');
    console.error(`   当前目录: ${currentDir}`);
    process.exit(1);
  }
}

// ========================================
// 核心处理逻辑
// ========================================

/**
 * 处理单个店铺
 */
async function processShop(shopId, isDryRun) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📍 处理店铺: ${shopId}`);
  console.log(`${'='.repeat(60)}`);

  // 1. 查询所有记录
  const allRecords = await prisma.yourModel.findMany({
    where: { shopId },
    select: {
      id: true,
      // 相关字段
    }
  });

  console.log(`   总记录数: ${allRecords.length}`);

  // 2. 筛选需要修复的记录
  const needsFixRecords = allRecords.filter(needsFix);

  console.log(`🔍 需要修复的记录数: ${needsFixRecords.length}\n`);

  if (needsFixRecords.length === 0) {
    console.log('✅ 没有需要修复的记录！');
    return;
  }

  // 3. 显示样本（前5条）
  console.log('📋 受影响记录样本（前5条）:');
  needsFixRecords.slice(0, 5).forEach((record, index) => {
    console.log(`   ${index + 1}. ID: ${record.id}`);
    // 显示字段变更详情
  });

  if (needsFixRecords.length > 5) {
    console.log(`   ... 及其他 ${needsFixRecords.length - 5} 条记录`);
  }
  console.log('');

  // 4. Dry-run 模式：只预览不执行
  if (isDryRun) {
    console.log('💡 这是预览模式，没有实际修改数据。');
    console.log('   要执行修复，请运行: node scripts/fix-xxx.mjs\n');
    return;
  }

  // 5. 备份受影响记录
  console.log('💾 备份受影响记录...');
  const backupFile = backupRecords(shopId, needsFixRecords);

  // 6. 执行修复
  console.log('🔧 开始执行修复...\n');

  let successCount = 0;
  let failedCount = 0;

  for (const record of needsFixRecords) {
    try {
      await prisma.yourModel.update({
        where: { id: record.id },
        data: {
          // 更新字段（包括关联字段！）
        }
      });

      console.log(`   ✅ 修复成功: ${record.id}`);
      successCount++;
    } catch (error) {
      console.error(`   ❌ 修复失败: ${record.id}`, error.message);
      failedCount++;
    }
  }

  // 7. 显示最终统计
  console.log('\n' + '='.repeat(60));
  console.log(`📊 ${shopId} 修复完成统计:`);
  console.log(`   ✅ 成功: ${successCount}`);
  console.log(`   ❌ 失败: ${failedCount}`);
  console.log(`   💾 备份文件: ${backupFile}`);
  console.log('='.repeat(60));
}

// ========================================
// 主函数
// ========================================

async function main() {
  checkExecutionPath();

  const isDryRun = process.argv.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('🔧 [脚本名称]');
  console.log('='.repeat(60));
  console.log(`模式: ${isDryRun ? 'DRY RUN (预览)' : 'EXECUTE (执行)'}`);
  console.log(`🔐 数据库连接: ${maskDatabaseUrl(process.env.DATABASE_URL)}`);
  console.log('');

  // 串行处理多店铺
  const shopIds = ['shop1', 'shop2'];

  for (const shopId of shopIds) {
    try {
      await processShop(shopId, isDryRun);
    } catch (error) {
      console.error(`\n❌ 处理 ${shopId} 时出错:`, error);
      console.error(error.stack);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('❌ 脚本执行失败:', error);
  console.error(error.stack);
  await prisma.$disconnect();
  process.exit(1);
});
```

---

## ✅ 代码审阅清单

### 在提交修复脚本前检查

#### 📋 数据一致性
- [ ] 所有关联字段已同步更新
- [ ] 时间戳字段正确处理（创建、更新、删除）
- [ ] 状态转换符合业务逻辑
- [ ] 统计缓存已考虑失效

#### 🔐 安全性
- [ ] 备份目录路径正确（`backups/`）
- [ ] 备份文件权限设置（600）
- [ ] .gitignore 已包含 `backups/`
- [ ] 敏感信息已掩码（数据库URL、API Keys）
- [ ] 执行位置检查已实现

#### 🎯 判定逻辑
- [ ] 避免 `JSON.stringify` 比较（键顺序不稳定）
- [ ] 复用业务检测函数（逻辑一致性）
- [ ] 使用严格相等 `===`（避免类型强制转换）
- [ ] 边界条件已覆盖（null、undefined、空对象）

#### 🚀 执行控制
- [ ] Dry-run 模式已实现
- [ ] 受影响记录样本已显示（前5条）
- [ ] 输出包含记录数量（便于核对）
- [ ] 成功/失败统计已记录

#### 🧪 测试覆盖
- [ ] 单元测试：判定逻辑函数
- [ ] 集成测试：完整修复流程
- [ ] 内存 SQLite 测试环境
- [ ] `afterAll` 清理连接（防止挂起）

#### 📚 文档
- [ ] 脚本顶部注释完整（背景、用途、使用方法）
- [ ] 修改历史已记录
- [ ] 相关字段关联关系已说明

---

## ⚠️ 常见陷阱

### 1. JSON.stringify 键顺序问题

**错误示例**:
```javascript
// ❌ 对象键顺序不同会误判
const before = { a: 1, b: 2 };
const after = { b: 2, a: 1 };
console.log(JSON.stringify(before) !== JSON.stringify(after)); // true（误判）
```

**解决方案**:
```javascript
// ✅ 方案 A: 复用业务检测函数
function needsFix(record) {
  return hasBusinessCondition(record.field);
}

// ✅ 方案 B: 使用深度比较库
import { isEqual } from 'lodash-es';
const changed = !isEqual(before, after);
```

### 2. 遗漏关联字段更新

**错误示例**:
```javascript
// ❌ 只更新 translationFields
await prisma.translation.update({
  where: { id },
  data: { translationFields: cleaned }
});
// 问题：syncStatus 仍是 'synced'，导致 UI 统计错误
```

**解决方案**:
```javascript
// ✅ 同步更新所有关联字段
await prisma.translation.update({
  where: { id },
  data: {
    translationFields: cleaned,
    syncStatus: 'pending',      // 状态重置
    syncedAt: null,              // 时间戳清除
    contentVersion: { increment: 1 }  // 版本号递增（如需要）
  }
});
```

### 3. 备份文件泄密

**错误示例**:
```javascript
// ❌ 备份文件在项目根目录，可能被提交
const backupFile = `backup-${Date.now()}.json`;
fs.writeFileSync(backupFile, JSON.stringify(data));
```

**解决方案**:
```javascript
// ✅ 统一备份目录，gitignore 保护，权限控制
const backupDir = path.join(process.cwd(), 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { mode: 0o700 });
}
const backupFile = path.join(backupDir, `fix-${Date.now()}.json`);
fs.writeFileSync(backupFile, JSON.stringify(data), { mode: 0o600 });
```

### 4. 测试资源泄漏

**错误示例**:
```javascript
// ❌ 忘记断开 Prisma 连接
describe('test', () => {
  let prisma = new PrismaClient();

  it('test case', async () => {
    // ...
  });

  // 缺少 afterAll(() => prisma.$disconnect())
});
// 结果：test runner 挂起
```

**解决方案**:
```javascript
// ✅ 正确清理资源
describe('test', () => {
  let prisma;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();  // 关键：防止挂起
  });

  it('test case', async () => {
    // ...
  });
});
```

---

## 📚 案例分析：发布按钮灰度问题

### 事件回顾

**时间**: 2025-10-12
**现象**: 所有发布按钮显示灰色不可点击
**影响**: Fynony 155 条记录 + OneWind 26 条记录

### 根因分析

1. **直接原因**:
   - `fix-translation-fields.mjs` 清理 translationFields
   - 但未重置 syncStatus 为 'pending'
   - 记录保持 'synced' 状态

2. **传导链路**:
   ```
   syncStatus='synced'
   → database.server.js:pendingTranslations=0
   → api.status.jsx:stats.pendingTranslations=0
   → app._index.jsx:disabled={!stats.pendingTranslations}
   → 按钮灰度不可点击
   ```

3. **设计缺陷**:
   - 脚本只关注主要字段（translationFields）
   - 忽略关联字段（syncStatus、syncedAt）
   - 未考虑数据一致性影响

### 修复方案

**立即修复**:
```javascript
// scripts/reset-option-sync-status.mjs
// 重置已修复记录的 syncStatus
await prisma.translation.update({
  where: { id: record.id },
  data: {
    syncStatus: 'pending',
    syncedAt: null
  }
});
```

**长期修复**:
```javascript
// scripts/fix-translation-fields.mjs (修改后)
await prisma.translation.update({
  where: { id: record.id },
  data: {
    translationFields: cleaned,
    syncStatus: 'pending',    // 新增
    syncedAt: null            // 新增
  }
});
```

### 经验教训

1. **数据一致性是第一原则**
   - 修改任何字段前，列出所有关联字段
   - 确保关联字段同步更新

2. **测试必须覆盖关联关系**
   - 单元测试：验证所有字段都被正确更新
   - 集成测试：验证端到端流程（包括 UI 行为）

3. **审阅清单不可省略**
   - 代码审阅时使用标准清单
   - 重点检查数据一致性部分

4. **备份是最后防线**
   - 自动备份（非可选）
   - 备份文件权限控制
   - 回滚方案提前准备

---

## 🚀 未来改进方向

### Phase 7（后续规划）

1. **数据一致性监控**
   - 定期检查"已清理但未重置状态"的记录
   - 告警通知机制

2. **自动化测试增强**
   - 添加 e2e 测试覆盖真实数据库
   - CI/CD 集成数据一致性检查

3. **脚本审阅工具化**
   - 自动检测缺少关联字段更新
   - Lint 规则：检测 `JSON.stringify` 比较

4. **监控面板**
   - 数据一致性指标可视化
   - 脚本执行历史追踪

---

## 📖 参考资料

- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Node.js File System Security](https://nodejs.org/api/fs.html#file-modes)
- [Testing Best Practices with Vitest](https://vitest.dev/guide/)

---

**最后更新**: 2025-10-12
**维护者**: 项目团队
**审阅周期**: 每季度或重大事件后更新
