# 常用开发命令

## 项目初始化
```bash
npm install                      # 安装依赖
npm run setup                    # 初始化数据库（生成Prisma客户端 + 迁移）
```

## 开发命令
```bash
# 推荐开发启动方式（绕过SSL验证）
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev

# 标准启动（可能遇到SSL问题）
npm run dev

# 代码质量检查
npm run lint                     # ESLint代码检查
npm run build                    # 构建生产版本

# 生产环境
npm run start                    # 运行生产构建
```

## 数据库操作
```bash
npx prisma generate              # 生成Prisma客户端（模型改变后必须执行）
npx prisma migrate dev           # 创建/运行数据库迁移
npx prisma studio                # 可视化数据库管理界面
npx prisma migrate reset         # 重置数据库（清除所有数据）
npx prisma migrate deploy        # 生产环境迁移
```

## Shopify CLI命令
```bash
npm run deploy                   # 部署到Shopify（更新权限、webhook等）
npm run config:link              # 链接Shopify应用配置
npm run config:use               # 使用特定的应用配置
npm run generate                 # 生成Shopify应用代码
npm run env                      # 管理环境变量
```

## 测试和调试脚本
```bash
# 核心功能测试
node test-error-system.js        # 错误系统测试
node test-resource-types.js      # 资源类型测试  
node test-category-translation.js # 分类翻译测试
node test-multi-language.js      # 多语言测试
node test-sequential-thinking.js # Sequential Thinking 系统演示
node test-translation-logs.js    # 翻译日志测试
node test-url-handle.js          # URL处理测试

# 诊断工具
node diagnose-issue.js           # 问题诊断工具
node check-logs.js               # 检查系统日志
node view-translation-logs.js    # 查看翻译日志
```

## 初始化脚本
```bash
npm run init-error-patterns      # 初始化错误模式数据
node scripts/init-languages.js   # 初始化语言配置
node scripts/reset-database.js   # 重置数据库脚本
```

## Redis操作（可选）
```bash
brew services start redis        # macOS启动Redis
redis-cli ping                   # 测试Redis连接
redis-cli flushall              # 清空Redis缓存
```

## 系统工具（macOS）
```bash
# 基本文件操作
ls -la                          # 列出文件详情
find . -name "*.js" -type f     # 查找JavaScript文件
grep -r "搜索内容" .            # 递归搜索文本
tail -f logs/app.log            # 实时查看日志

# Git操作
git status                      # 查看仓库状态
git add .                       # 添加所有更改
git commit -m "提交信息"        # 提交更改
git push                        # 推送到远程仓库

# 进程管理
ps aux | grep node              # 查看Node进程
kill -9 PID                     # 强制终止进程
lsof -i :3000                   # 查看端口占用
```

## 开发完成检查命令
```bash
npm run lint                    # 必须：代码质量检查
npm run build                   # 必须：构建验证
npx prisma migrate dev          # 数据模型变更后必须
npm run deploy                  # 新增Shopify权限后必须
```