# 任务完成检查清单

## 开发任务完成前的必要步骤

### 1. 代码质量检查
```bash
# 运行ESLint检查
npm run lint

# 如果有错误，修复后再次运行
npm run lint
```

### 2. 构建验证
```bash
# 确保项目能成功构建
npm run build
```

### 3. 数据库相关
如果修改了数据模型（prisma/schema.prisma）：
```bash
# 生成新的Prisma客户端
npx prisma generate

# 创建并运行迁移
npx prisma migrate dev --name describe_your_change
```

### 4. Shopify权限相关
如果修改了shopify.app.toml中的权限（scopes）：
```bash
# 部署更新到Shopify
npm run deploy
```

### 5. 功能测试
- 测试主要功能流程：
  1. 资源扫描是否正常
  2. 翻译功能是否正常
  3. 同步到Shopify是否成功
  
- 运行相关测试脚本：
```bash
node test-error-system.js
node test-resource-types.js
```

### 6. 错误处理验证
- 确保所有API路由都使用了 `withErrorHandling` 包装
- 确保异步操作都有 try-catch 处理
- 检查错误日志系统是否正常记录

### 7. 环境变量检查
确保所有必需的环境变量都已配置：
- SHOPIFY_API_KEY
- SHOPIFY_API_SECRET
- GPT_API_KEY

### 8. 文档更新
如果添加了新功能或修改了重要逻辑：
- 更新相关代码注释
- 如果是重大改动，考虑更新CLAUDE.md

### 9. Git提交前
```bash
# 查看所有更改
git status

# 查看具体更改内容
git diff

# 确保没有遗留的调试代码（console.log等）
rg "console.log" app/

# 添加并提交
git add .
git commit -m "type: 描述信息"
```

### 10. 开发服务器测试
最后运行开发服务器进行手动测试：
```bash
npm run dev
# 或如果有SSL问题
NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev
```

## 特殊情况检查

### 添加新的资源类型时
1. 更新 `RESOURCE_TYPES` 常量
2. 添加相应的 fetch 函数
3. 更新字段映射配置
4. 测试扫描和翻译流程

### 修改翻译逻辑时
1. 确保HTML标签保护正常工作
2. 验证品牌词保护
3. 测试长文本分块处理
4. 检查翻译质量验证

### 修改数据库结构时
1. 备份现有数据（如果需要）
2. 创建迁移脚本
3. 更新相关的数据库操作代码
4. 测试数据迁移

### 修改队列系统时
1. 测试Redis可用和不可用两种情况
2. 验证内存队列降级机制
3. 检查并发控制
4. 测试失败重试机制

## 生产部署前额外检查
1. 设置 NODE_ENV=production
2. 确保所有环境变量正确配置
3. 数据库迁移已执行
4. Shopify权限已更新
5. 错误监控就绪
6. 性能测试通过