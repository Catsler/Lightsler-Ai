# PRODUCT_OPTION GID 修复验证清单

## 前置条件

- [ ] 代码已修复（4处改动完成）
- [ ] **npm run check 通过**（lint + build）
- [ ] 数据清理脚本已准备

## 验证步骤

### 0. 构建验证

```bash
# 代码规范检查
npm run check:lint

# TypeScript编译检查
npm run check:build

# 或一次性检查
npm run check
```

**预期**：无错误，无警告

---

### 1. Dry-run 检查

```bash
node scripts/fix-option-gids.mjs --dry-run
```

**预期**：
- 显示受影响的资源数量
- 显示样本数据（包含错误gid）
- 显示受影响的店铺统计
- 不执行实际修改

---

### 2. 清理数据（先测试环境）

```bash
# 测试环境（如果有）
node scripts/fix-option-gids.mjs --shop=devshop

# 或指定具体店铺
node scripts/fix-option-gids.mjs --shop=shop1
```

**预期**：
- 3秒倒计时确认
- 成功清理，无报错
- 显示更新的资源数量
- 显示删除的翻译数量

---

### 3. 重新扫描产品

- 在UI中点击"扫描资源"
- 选择任意带options的产品
- 等待扫描完成

**验证点**：
- 扫描无错误
- Resource表新增记录

---

### 4. 翻译产品

- 选择带有options的产品
- 翻译到日语
- 观察日志

**预期日志**：
```
✅ 使用产品关联翻译增强版
✅ GraphQL成功获取 X 个产品选项
✅ 临时Options资源保存成功
```

---

### 5. 验证数据库

```bash
# 方式1: Prisma Studio
npx prisma studio
# 打开Resource表，筛选resourceType='PRODUCT_OPTION'

# 方式2: SQL查询（在服务器上）
sqlite3 /var/www/app1-fynony/prisma/dev.sqlite "
  SELECT id, resourceType, gid, title
  FROM Resource
  WHERE resourceType = 'PRODUCT_OPTION'
  LIMIT 5;
"

# 方式3: 本地查询
sqlite3 prisma/dev.sqlite "
  SELECT id, resourceType, gid, title
  FROM Resource
  WHERE resourceType = 'PRODUCT_OPTION'
  LIMIT 5;
"
```

**预期**：
- ✅ gid字段格式：`gid://shopify/ProductOption/数字`
- ❌ **无**包含`-temp`的gid
- ❌ **无**cuid格式的gid（如"ckxyz123"）

---

### 6. 批量发布

- 点击"批量发布"按钮
- 等待处理完成
- 检查日志

**预期日志**：
```
✅ 批量发布完成: X/X 成功 (100%)
```

**禁止出现**：
```
❌ 资源标识解析失败: RESOURCE_GID_UNRESOLVED
❌ 资源标识解析失败: UNSUPPORTED_RESOURCE_TYPE
```

---

### 7. 确认Shopify

- 登录Shopify Admin
- 访问产品页面
- 切换语言到日语
- 检查options翻译

**预期**：
- 产品名称已翻译
- 选项名称已翻译（如 Size → サイズ）
- 选项值已保持原文（如 S, M, L）

---

## 成功标准

### 数据层面
- [x] 所有PRODUCT_OPTION的gid格式正确
- [x] 无`-temp`后缀的gid
- [x] 无cuid格式的gid

### 功能层面
- [x] 批量发布成功率100%
- [x] Shopify显示翻译内容
- [x] 日志无错误

### 性能层面
- [x] 批量发布时无重复API调用
- [x] 无超时错误

---

## 回滚方案（如出现问题）

```bash
# 1. 回滚代码
git log --oneline -5  # 查看最近的提交
git revert <commit-hash>

# 2. 重新部署
npm run build
pm2 restart shop1-fynony shop1-worker

# 3. 清理测试数据（如需要）
sqlite3 prisma/dev.sqlite "
  DELETE FROM Translation
  WHERE resourceId IN (
    SELECT id FROM Resource
    WHERE resourceType = 'PRODUCT_OPTION'
    AND createdAt > datetime('now', '-1 hour')
  );
"
```

---

## 生产环境部署流程

### 1. 本地验证通过后

- [ ] 所有测试步骤通过
- [ ] 代码已提交到Git

### 2. 提交代码

```bash
git add .
git commit -m "fix(product): 修复PRODUCT_OPTION GID保存错误

- 临时对象保留真实Shopify GID
- 使用isTemporary标记控制保存行为
- 非临时分支添加多级fallback和格式验证
- 创建数据清理脚本和验证清单

修复批量发布失败问题"

git push origin main
```

### 3. SSH到生产服务器

```bash
# 使用智能路由脚本
/tmp/ssh_auto_route.sh "cd /var/www/app1-fynony && pwd"
```

### 4. 执行部署

```bash
# 拉取代码
/tmp/ssh_auto_route.sh "cd /var/www/app1-fynony && git pull origin main"

# 构建
/tmp/ssh_auto_route.sh "cd /var/www/app1-fynony && npm run build"

# Dry-run检查（Fynony）
/tmp/ssh_auto_route.sh "cd /var/www/app1-fynony && node scripts/fix-option-gids.mjs --dry-run --shop=shop1"

# 确认后清理（Fynony）
/tmp/ssh_auto_route.sh "cd /var/www/app1-fynony && node scripts/fix-option-gids.mjs --shop=shop1"

# OneWind店铺（如需要）
/tmp/ssh_auto_route.sh "cd /var/www/app2-onewind && git pull origin main && npm run build"
/tmp/ssh_auto_route.sh "cd /var/www/app2-onewind && node scripts/fix-option-gids.mjs --dry-run --shop=shop2"
/tmp/ssh_auto_route.sh "cd /var/www/app2-onewind && node scripts/fix-option-gids.mjs --shop=shop2"

# 重启服务
/tmp/ssh_auto_route.sh "pm2 restart shop1-fynony shop1-worker"
/tmp/ssh_auto_route.sh "pm2 restart shop2-onewind shop2-worker"
```

### 5. 监控日志

```bash
# Fynony日志
/tmp/ssh_auto_route.sh "pm2 logs shop1-fynony --lines 50 --nostream"
/tmp/ssh_auto_route.sh "pm2 logs shop1-worker --lines 50 --nostream"

# 实时监控
/tmp/ssh_auto_route.sh "pm2 logs shop1-worker --lines 0"
```

### 6. UI验证

按照上述步骤3-7在生产环境执行验证

---

## 常见问题

### Q: 为什么要先dry-run？
**A**: 避免误删数据，先预览影响范围和受影响的店铺。

### Q: 清理后需要重新翻译吗？
**A**: 是的，脚本会删除无效的pending翻译记录，需要重新扫描和翻译。

### Q: 如果清理脚本卡住怎么办？
**A**: Ctrl+C中止，检查数据库锁定情况，确保没有其他进程在访问数据库。

### Q: 多个店铺如何批量处理？
**A**: 逐个店铺执行，避免跨店铺数据混乱：
```bash
for shop in shop1 shop2; do
  node scripts/fix-option-gids.mjs --shop=$shop
done
```

### Q: 验证数据库时发现仍有错误GID怎么办？
**A**:
1. 检查是否有新的翻译任务创建了错误GID
2. 重新运行清理脚本
3. 检查代码是否正确部署并重启

---

## 相关文档

- 主文档：`CLAUDE.md` - 常见Bug模式与解决方案
- 部署说明：`阿里云轻量服务器部署文件/轻量服务器稳定操作说明.md`
- 数据清理脚本：`scripts/fix-option-gids.mjs`
