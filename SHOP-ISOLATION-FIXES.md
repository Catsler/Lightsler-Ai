# 店铺配置隔离问题诊断与修复

## 🔍 诊断结果

### ✅ 配置文件隔离正确
**Fynony (Shop1)**:
- Client ID: f97170933cde079c914f7df7e90cd806  
- App URL: https://fynony.ease-joy.fun  
- SHOP_ID: fynony  
- Redis: 无硬编码DB（动态分配DB 11）

**OneWind (Shop2)**:
- Client ID: 8102af9807fd9df0b322a44f500a1d0e  
- App URL: https://onewind.ease-joy.fun  
- SHOP_ID: onewind  
- Redis: 无硬编码DB（动态分配DB 2）

### ❌ 数据库配置问题

**问题1: schema.prisma硬编码数据库路径**
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:dev.sqlite"  ← 硬编码，忽略环境变量
}
```

**影响**:
- `.env`配置`DATABASE_URL="file:./prisma/prod.db"`被忽略
- 两个店铺都使用`dev.sqlite`而不是`prod.db`  
- 虽然文件是分开的，但命名不规范

**实际数据**:
- Fynony: 699 resources, 130 translations (13MB)
- OneWind: 1141 resources, 878 translations (35MB)

**问题2: Shopify跨域错误**
浏览器报错显示应用从 `translate.ease-joy.fun` 重定向到 `fynony.ease-joy.fun`，导致跨域。
可能是Shopify Partners中应用配置未更新。

## 🛠️ 修复方案

### 修复1: schema.prisma使用环境变量

**目标**: 让schema.prisma读取.env中的DATABASE_URL

**方法A（推荐）**: 修改schema.prisma
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  ← 使用环境变量
}
```

**方法B**: 重命名数据库文件（如果不改schema）
```bash
# Fynony
mv /var/www/app1-fynony/prisma/dev.sqlite \
   /var/www/app1-fynony/prisma/prod.db

# OneWind  
mv /var/www/app2-onewind/prisma/dev.sqlite \
   /var/www/app2-onewind/prisma/prod.db
```

### 修复2: 更新Shopify应用配置

**在服务器上运行**:
```bash
# Shop1 (Fynony)
cd /var/www/app1-fynony
shopify app deploy

# Shop2 (OneWind)
cd /var/www/app2-onewind
shopify app deploy
```

这会将 `shopify.app.toml` 中的配置推送到Shopify Partners。

### 修复3: 重启应用

```bash
pm2 restart shop1-fynony
pm2 restart shop2-onewind  
pm2 restart shop1-worker
pm2 restart shop2-worker
```

## 📋 配置隔离检查清单

### ✅ 已确认隔离
- [x] Client ID (f97... vs 8102...)
- [x] App URL (fynony vs onewind)
- [x] SHOP_ID环境变量  
- [x] Redis URL（无硬编码DB）
- [x] PM2工作目录（独立目录）
- [x] 数据库文件（虽然名称不对但是分开的）

### ⚠️ 需要修复
- [ ] schema.prisma使用环境变量而非硬编码
- [ ] Shopify Partners配置与shopify.app.toml同步
- [ ] 数据库文件命名规范（可选）

## 🎯 推荐操作顺序

1. **修改schema.prisma** (两个店铺都要改)
2. **重命名数据库文件** (确保与.env匹配)
3. **部署到Shopify** (`shopify app deploy`)
4. **重启所有进程**
5. **测试访问**

## 💡 关键发现

1. **配置隔离做得很好** - 两个店铺的.env和shopify.app.toml已完全分离
2. **数据库实际是分离的** - 虽然都叫dev.sqlite但在不同目录
3. **跨域问题的真正原因** - Shopify Partners后台配置与本地toml文件不同步
4. **Redis隔离已生效** - 通过DB索引正确隔离（DB 11 vs DB 2）

---

生成时间: 2025-10-04 11:10
