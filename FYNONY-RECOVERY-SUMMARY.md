# Fynony应用恢复总结

## 问题诊断

### 原始问题
1. 用户报告：fynony.ease-joy.fun 无法访问
2. 用户无法看到翻译内容（双语详情页为空）
3. 点击"翻译全部"没有反应

### 根本原因
1. **.env文件中Redis URL硬编码DB索引**
   - Fynony: `REDIS_URL=.../1` → 强制使用DB 1
   - 应该使用动态分配 → DB 11

2. **应用构建问题**
   - 上传本地build到服务器导致模块解析失败
   - 本地build引用路径与服务器环境不兼容
   - PM2显示应用重启2000+次

3. **环境隔离未完全生效**
   - 源码已更新但build未重新编译
   - Worker使用DB 11，应用使用DB 1 → 队列隔离

## 修复步骤

### 步骤1：修复Redis URL配置
```bash
# 移除.env中的DB索引
sed -i "s|REDIS_URL=redis://.*|REDIS_URL=redis://default:XXX@host:port|" .env
```

### 步骤2：恢复应用运行
```bash
# 从OneWind复制可用的build
cp -r /var/www/app2-onewind/build /var/www/app1-fynony/build
pm2 restart shop1-fynony
```

### 步骤3：更新build包含新代码
```bash
# 本地重新构建
npm run build

# 上传新的server-build文件
rsync build/server/index.js root@SERVER:/var/www/app1-fynony/build/server/
rsync build/server/assets/server-build-HG_GkHnT.js root@SERVER:/var/www/app1-fynony/build/server/assets/

# 重启应用
pm2 restart shop1-fynony
```

## 当前状态

### ✅ 已修复
- [x] Fynony应用可访问 (fynony.ease-joy.fun)
- [x] Redis DB配置正确 (DB 11)
- [x] Worker使用DB 11
- [x] 应用使用DB 11
- [x] 环境隔离生效

### ✅ 验证通过
- PM2状态: online, uptime稳定
- Redis配置: `[Shop: shop1, DB: 11]`
- 应用响应: HTTP 200
- 日志无错误

## 下一步测试

### 用户需要做的
1. 访问 https://fynony.ease-joy.fun
2. 登录店铺
3. 点击"翻译全部"按钮
4. 观察队列是否有任务产生
5. 检查双语详情页是否显示翻译

### 预期结果
- 队列DB 11应该有waiting任务
- Worker日志应该显示处理任务
- 翻译应该保存到数据库
- 双语详情页应该显示翻译内容

## 重要提醒

**环境配置**：
- 本地开发: DB 10
- Fynony (shop1): DB 11  
- OneWind (shop2): DB 2

**数据流**：
1. 用户点击"翻译全部" → API调用
2. 任务添加到Redis Queue (DB 11)
3. Worker从Queue取任务 (DB 11)
4. 翻译后保存到数据库 (prod.db)
5. UI从数据库读取显示 (syncStatus='pending')
6. 用户点击"发布" → 同步到Shopify

---

修复时间: 2025-10-04 10:30
修复人: Claude Code
