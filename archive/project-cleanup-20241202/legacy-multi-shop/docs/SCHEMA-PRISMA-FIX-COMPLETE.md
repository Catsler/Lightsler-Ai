# ✅ schema.prisma数据库配置修复完成

## 修复内容

### 1. 修改schema.prisma使用环境变量
**之前**:
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:dev.sqlite"  # 硬编码
}
```

**修改后**:
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  # 读取环境变量
}
```

### 2. 重命名数据库文件
- **Fynony**: `dev.sqlite` → `prod.db` (13MB, 699 resources)
- **OneWind**: `dev.sqlite` → `prod.db` (35MB, 1141 resources)

### 3. 重新生成Prisma客户端
```bash
npx prisma generate  # 两个店铺都已执行
```

### 4. 重启所有进程
```bash
pm2 restart shop1-fynony shop2-onewind shop1-worker shop2-worker
```

## ✅ 验证结果

### 进程状态
- shop1-fynony: online (uptime 11s)
- shop2-onewind: online (uptime 9s)
- shop1-worker: online (uptime 8s)
- shop2-worker: online (uptime 6s)

### 数据库访问
- ✅ Shop1能正确读取prod.db (699条资源)
- ✅ Shop2能正确读取prod.db (1141条资源)
- ✅ 数据完整无损

## 配置隔离最终状态

### Fynony (Shop1)
```
Client ID:   f97170933cde079c914f7df7e90cd806
App URL:     https://fynony.ease-joy.fun
Database:    /var/www/app1-fynony/prisma/prod.db
Redis DB:    11 (动态分配)
SHOP_ID:     fynony
数据:        699 resources, 130 translations
```

### OneWind (Shop2)
```
Client ID:   8102af9807fd9df0b322a44f500a1d0e
App URL:     https://onewind.ease-joy.fun
Database:    /var/www/app2-onewind/prisma/prod.db
Redis DB:    2 (动态分配)
SHOP_ID:     onewind
数据:        1141 resources, 878 translations
```

## 剩余问题

### Shopify跨域错误
**现象**: 浏览器报错 `translate.ease-joy.com !== fynony.ease-joy.fun`

**原因**: Shopify Partners后台配置与shopify.app.toml不同步

**解决方案**: 需要在本地运行
```bash
# 本地操作
cp 阿里云轻量服务器部署文件/shop1-shopify.app.toml shopify.app.toml
shopify app deploy  # 需要浏览器OAuth认证

cp 阿里云轻量服务器部署文件/shop2-shopify.app.toml shopify.app.toml  
shopify app deploy

git checkout shopify.app.toml  # 恢复
```

## 下一步测试

请用户：
1. 从Shopify Admin打开Fynony应用（不是直接访问域名）
2. 点击"翻译全部"测试队列功能
3. 检查双语详情页是否显示翻译

---

修复时间: 2025-10-04 11:18
修复状态: ✅ 完成
