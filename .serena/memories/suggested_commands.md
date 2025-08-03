# 常用开发命令

## 开发启动
```bash
npm run dev          # 启动开发服务器（通过Shopify CLI）
```

## 数据库操作
```bash
npx prisma generate  # 生成Prisma客户端
npx prisma migrate dev  # 运行数据库迁移（开发环境）
npx prisma migrate deploy  # 运行数据库迁移（生产环境）
npx prisma studio    # 打开Prisma数据库管理界面
```

## 代码质量检查
```bash
npm run lint         # 运行ESLint检查
npm run build        # 构建生产版本
```

## Shopify CLI命令
```bash
npm run shopify      # 运行Shopify CLI
npm run deploy       # 部署应用到Shopify
npm run config:link  # 链接Shopify配置
npm run generate     # 生成Shopify扩展
```

## 测试和调试
```bash
node test-setup.js   # 测试应用配置
node simple-test.js  # 运行简单测试
node check-status.js # 检查应用状态
```

## Redis操作（macOS）
```bash
brew services start redis  # 启动Redis
brew services stop redis   # 停止Redis
redis-cli ping            # 测试Redis连接
```

## Git操作
```bash
git add .
git commit -m "描述"
git push
```