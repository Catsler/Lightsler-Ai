# 建议的开发命令

## 初始设置
```bash
# 安装依赖
npm install

# 初始化数据库（生成Prisma客户端 + 运行迁移）
npm run setup
```

## 日常开发
```bash
# 启动开发服务器（Shopify CLI处理隧道和认证）
npm run dev

# 如果遇到SSL证书问题，使用：
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev

# 代码检查
npm run lint

# 构建项目
npm run build
```

## 数据库管理
```bash
# 生成Prisma客户端（模型改变后必须执行）
npx prisma generate

# 创建并运行新的数据库迁移
npx prisma migrate dev

# 打开数据库可视化管理界面
npx prisma studio

# 重置数据库（清除所有数据，慎用！）
npx prisma migrate reset
```

## Shopify相关
```bash
# 部署应用到Shopify（更新权限、webhook等）
npm run deploy

# 链接到Shopify应用配置
npm run config:link

# 使用特定的应用配置
npm run config:use

# 生成Shopify应用代码
npm run generate
```

## 测试和调试
```bash
# 运行错误系统测试
node test-error-system.js

# 运行资源类型测试
node test-resource-types.js

# 运行分类翻译测试
node test-category-translation.js

# 运行多语言测试
node test-multi-language.js

# 运行问题诊断工具
node diagnose-issue.js
```

## Redis管理（可选）
```bash
# macOS启动Redis服务
brew services start redis

# 停止Redis服务
brew services stop redis

# 测试Redis连接
redis-cli ping

# 连接到Redis CLI
redis-cli
```

## Git常用命令
```bash
# 查看状态
git status

# 添加所有更改
git add .

# 提交更改
git commit -m "描述信息"

# 推送到远程
git push

# 拉取最新代码
git pull

# 查看提交历史
git log --oneline -10
```

## 系统工具（Darwin/macOS）
```bash
# 查看文件列表
ls -la

# 查看当前目录
pwd

# 切换目录
cd [目录路径]

# 查找文件
find . -name "*.js"

# 搜索文件内容（使用ripgrep，更快）
rg "搜索内容"

# 查看进程
ps aux | grep node

# 结束进程
kill -9 [PID]

# 查看端口占用
lsof -i :3000

# 清理npm缓存
npm cache clean --force
```

## 故障排查
```bash
# 如果遇到认证循环问题
npm run deploy

# 如果数据库出错
npm run setup
# 或
npx prisma migrate dev

# 查看npm包版本
npm list [包名]

# 检查Node版本
node --version

# 检查npm版本
npm --version
```

## 生产部署
```bash
# Docker构建
docker build -t shopify-app .

# Docker运行
docker run -p 3000:3000 shopify-app

# 设置生产环境变量
export NODE_ENV=production
```