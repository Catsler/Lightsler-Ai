# 部署检查清单

本文档提供完整的部署前后检查清单，以及故障排查指南。

## 📋 部署流程概览

```
本地预检 → SSH连接 → 环境验证 → 一键部署 → 部署后验证
   ↓           ↓           ↓            ↓            ↓
  5分钟      1分钟       1分钟        3-5分钟      2分钟
```

---

## 🔍 部署前检查（本地执行）

### 1. 代码准备

- [ ] **确认当前在 main 分支**
  ```bash
  git branch --show-current  # 应显示 main
  ```

- [ ] **检查 Git 状态**
  ```bash
  git status
  # 确认：
  # ✅ 无未追踪的 .env 或 shopify.app.toml
  # ✅ 无未提交的重要变更
  ```

- [ ] **本地构建测试**
  ```bash
  npm run build
  # 必须成功！如果失败，修复后再部署
  ```

- [ ] **代码质量检查**（可选）
  ```bash
  npm run check:lint  # ESLint
  npm run check:build # TypeScript
  ```

### 2. 提交代码

- [ ] **提交变更**
  ```bash
  git add .
  git commit -m "feat: 部分同步状态功能"
  ```

- [ ] **推送到 GitHub**
  ```bash
  git push origin main
  ```

---

## 🚀 服务器部署

### 1. SSH 连接（绕过 VPN）

如果本地 VPN 劫持服务器路由，参考 `docs/troubleshooting/publish-issues.md` 配置静态路由。

```bash
# 智能连接脚本（已部署）
/tmp/ssh_smart_connect.sh "cd /var/www/app1-fynony"

# 或手动连接
ssh root@47.79.77.128
```

### 2. 选择目标店铺

- **Fynony (shop1)**: `/var/www/app1-fynony`
- **OneWind (shop2)**: `/var/www/app2-onewind`

### 3. 一键部署（推荐）

```bash
# 方式1：直接运行（推荐）
cd /var/www/app1-fynony
./scripts/deploy-safe.sh shop1

# 方式2：从远程拉取脚本后运行
cd /var/www/app1-fynony
git fetch origin
git show origin/main:scripts/deploy-safe.sh > /tmp/deploy-safe.sh
chmod +x /tmp/deploy-safe.sh
/tmp/deploy-safe.sh shop1
```

**脚本功能**：
- ✅ 自动验证环境配置
- ✅ 自动备份配置文件和数据库（保留最近5份）
- ✅ 智能判断是否需要 `npm install`
- ✅ 交互式确认关键操作
- ✅ 失败自动提示回滚方案

### 4. 手动部署（故障排查时）

如果一键部署脚本失败，可以手动执行各步骤：

#### Step 1: 环境验证
```bash
cd /var/www/app1-fynony
./scripts/verify-env.sh shop1
# 必须通过！如果失败，修复配置后再部署
```

#### Step 2: 备份
```bash
cp .env .env.backup.manual.$(date +%Y%m%d_%H%M%S)
cp shopify.app.toml shopify.app.toml.backup.manual.$(date +%Y%m%d_%H%M%S)
sqlite3 prisma/dev.sqlite ".backup 'prisma/dev.sqlite.backup.manual.$(date +%Y%m%d_%H%M%S)'"
```

#### Step 3: 拉取代码
```bash
git fetch origin
git log --oneline HEAD..origin/main  # 查看将要拉取的变更
git pull origin main
```

#### Step 4: 验证配置未被覆盖
```bash
git status | grep -E ".env|shopify.app.toml"
# 如果显示变更，立即恢复：
git checkout .env shopify.app.toml
```

#### Step 5: 依赖安装（按需）
```bash
# 检查 package.json 是否变化
git diff --name-only HEAD@{1} HEAD | grep package.json

# 如果变化，执行安装
npm install
```

#### Step 6: 构建
```bash
npm run build
# 必须成功！
```

#### Step 7: 重启服务
```bash
pm2 restart shop1-fynony shop1-worker
pm2 status
```

---

## ✅ 部署后验证

### 1. 进程健康检查

```bash
# 查看进程状态
pm2 status
# 预期：shop1-fynony 和 shop1-worker 都是 online

# 查看最近日志
pm2 logs shop1-fynony --lines 20 --nostream
pm2 logs shop1-worker --err --lines 20  # 只看错误
```

### 2. 环境配置验证

```bash
# 重新验证环境（确保配置未被覆盖）
./scripts/verify-env.sh shop1
```

### 3. 数据库验证

```bash
cd /var/www/app1-fynony

# 检查翻译总数
sqlite3 prisma/dev.sqlite "SELECT COUNT(*) FROM Translation;"

# 检查 partial 状态功能
sqlite3 prisma/dev.sqlite "
  SELECT
    syncStatus,
    COUNT(*) as count
  FROM Translation
  GROUP BY syncStatus;
"
```

### 4. UI 功能验证

- [ ] **访问应用 UI**
  - Fynony: https://fynony.ease-joy.fun
  - OneWind: https://onewind.ease-joy.fun

- [ ] **测试核心功能**
  - 扫描资源
  - 翻译资源（5-10条）
  - 批量发布

- [ ] **验证 partial 状态**
  - 翻译 PRODUCT_OPTION 类型资源
  - 发布后查看是否显示黄色 `partial` Badge
  - 检查详情页是否有 Banner 说明
  - 批量发布后是否有友好提示

### 5. 性能检查

```bash
# 查看内存使用
pm2 monit

# 查看 Redis 连接
redis-cli -u "redis://default:password@host:port/11" ping
# 应返回: PONG
```

---

## 🚨 故障排查

### 问题1：构建失败

**症状**：
```
npm run build
Error: Cannot find module...
```

**解决方案**：
```bash
# 清理缓存
rm -rf node_modules package-lock.json
npm install

# 重新构建
npm run build
```

### 问题2：配置文件被覆盖

**症状**：
- 环境验证失败
- SHOP_ID 或 Redis DB 不匹配

**解决方案**：
```bash
# 恢复最近的备份
cp .env.backup.* .env
cp shopify.app.toml.backup.* shopify.app.toml

# 重新验证
./scripts/verify-env.sh shop1

# 重启服务
pm2 restart shop1-fynony shop1-worker
```

### 问题3：PM2 进程异常

**症状**：
- 进程状态显示 errored 或 stopped
- 日志显示持续错误

**解决方案**：
```bash
# 查看详细日志
pm2 logs shop1-fynony --lines 50

# 重启进程
pm2 restart shop1-fynony

# 如果仍然失败，完全重启
pm2 delete shop1-fynony shop1-worker
pm2 start ecosystem.config.js --only shop1-fynony,shop1-worker
```

### 问题4：数据库损坏

**症状**：
```
Error: database disk image is malformed
```

**解决方案**：
```bash
# 恢复最近的数据库备份
cd /var/www/app1-fynony/prisma
sqlite3 dev.sqlite.backup.* ".restore 'dev.sqlite'"

# 或者从备份复制
cp dev.sqlite.backup.* dev.sqlite

# 验证数据库
sqlite3 dev.sqlite "PRAGMA integrity_check;"
# 应返回: ok
```

### 问题5：Redis 连接失败

**症状**：
```
Error: Redis connection refused
Error: ENOTFOUND nozomi.proxy.rlwy.net
```

**解决方案**：
```bash
# 检查 Redis URL 配置
grep REDIS_URL /var/www/app1-fynony/.env

# 测试连接
redis-cli -u "redis://..." ping

# 检查网络
ping nozomi.proxy.rlwy.net

# 如果 Redis 不可用，应用会自动降级到内存队列
```

---

## 🔙 紧急回滚

如果部署后发现严重问题，快速回滚：

### 方式1：Git 回退（推荐）

```bash
cd /var/www/app1-fynony

# 1. 查看最近提交
git log --oneline -5

# 2. 回退到上一版本
git reset --hard HEAD~1

# 3. 恢复配置（如果被覆盖）
cp .env.backup.* .env 2>/dev/null || true
cp shopify.app.toml.backup.* shopify.app.toml 2>/dev/null || true

# 4. 重新构建
npm run build

# 5. 重启服务
pm2 restart shop1-fynony shop1-worker

# 6. 验证
pm2 logs shop1-fynony --lines 20 --nostream
```

### 方式2：备份恢复（配置问题）

```bash
cd /var/www/app1-fynony

# 1. 恢复配置文件
cp .env.backup.* .env
cp shopify.app.toml.backup.* shopify.app.toml

# 2. 恢复数据库（可选）
cd prisma
cp dev.sqlite.backup.* dev.sqlite

# 3. 重启服务
pm2 restart shop1-fynony shop1-worker
```

---

## 📊 部署后监控

### 实时日志监控（推荐保持打开）

```bash
# 实时查看所有日志
pm2 logs shop1-fynony shop1-worker

# 只看错误
pm2 logs shop1-fynony --err

# 过滤关键词
pm2 logs shop1-fynony | grep -E "ERROR|partial|PRODUCT_OPTION"
```

### 定期健康检查

```bash
# 每小时检查一次进程状态
pm2 status

# 每天检查一次数据库状态
sqlite3 prisma/dev.sqlite "
  SELECT
    syncStatus,
    COUNT(*) as count
  FROM Translation
  WHERE DATE(updatedAt) = DATE('now')
  GROUP BY syncStatus;
"
```

---

## 🎯 成功标准

部署成功的标志：

- ✅ 所有 PM2 进程状态为 `online`
- ✅ 环境验证通过（`./scripts/verify-env.sh shop1`）
- ✅ UI 可以正常访问
- ✅ 批量发布功能正常
- ✅ PRODUCT_OPTION 翻译显示 `partial` 状态
- ✅ 无持续性错误日志
- ✅ 数据库记录数正常

---

## 📚 相关文档

- **环境配置**: `CLAUDE.md` - 生产部署红线警告
- **发布问题排查**: `docs/troubleshooting/publish-issues.md`
- **多店铺部署**: 已废弃，参考归档 `archive/project-cleanup-20241202/duplicate-docs/multi-shop-deployment.md`（只读）
- **VPN绕过配置**: `docs/troubleshooting/publish-issues.md#前置步骤ssh连接`

---

## 📞 紧急联系

如遇到本文档未覆盖的问题：

1. 查看 `logs/app.log` 获取详细错误日志
2. 运行诊断脚本收集问题信息
3. 保留错误现场（不要立即重启）
4. 联系开发团队并提供：
   - PM2 日志：`pm2 logs --lines 100 --nostream`
   - 环境验证结果：`./scripts/verify-env.sh shop1`
   - Git 状态：`git log --oneline -5 && git status`
