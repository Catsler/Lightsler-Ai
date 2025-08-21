# 任务完成检查清单

## 代码质量检查（必须）
```bash
npm run lint                    # ESLint代码检查 - 必须无错误
npm run build                   # 构建验证 - 必须成功
```

## 数据模型变更后
```bash
npx prisma migrate dev          # 运行数据库迁移
npx prisma generate             # 重新生成Prisma客户端
```

## Shopify权限变更后
```bash
npm run deploy                  # 更新Shopify应用权限和webhook
```

## 功能测试验证
- ✅ 测试关键功能流程（扫描→翻译→同步）
- ✅ 验证API端点响应正常
- ✅ 检查错误处理是否完善
- ✅ 确认Webhook处理正常
- ✅ 验证数据库操作正确

## 代码规范检查
- ✅ 服务端文件使用 `*.server.js` 后缀
- ✅ 使用 `withErrorHandling` 包装API路由
- ✅ 使用 `shopify.authenticate.admin()` 进行认证
- ✅ GraphQL使用2025-07版本
- ✅ 中文注释和2空格缩进
- ✅ 错误处理使用TranslationError类

## 安全检查
- ✅ 没有硬编码API密钥或敏感信息
- ✅ 不在日志中记录敏感数据
- ✅ 输入验证完整
- ✅ 权限检查正确

## 性能检查
- ✅ 大批量操作使用队列系统
- ✅ GraphQL使用批量操作优化
- ✅ 数据库查询有适当索引
- ✅ 长文本使用分块处理

## 部署前检查
- ✅ 环境变量配置正确
- ✅ 数据库迁移已应用
- ✅ Shopify应用配置已更新
- ✅ Redis服务状态（可选）
- ✅ 日志系统工作正常

## 文档更新
- ✅ CLAUDE.md更新相关命令
- ✅ 重要变更添加注释
- ✅ API变更更新文档

## 错误处理完整性
- ✅ 所有异步操作有错误处理
- ✅ 用户友好的错误信息
- ✅ 错误日志记录完整
- ✅ 失败自动重试机制

## 提交前最后检查
- ✅ 删除调试代码和console.log
- ✅ 代码格式符合Prettier规范
- ✅ 没有未使用的导入和变量
- ✅ Git提交信息清晰描述

## 重要提醒
- **NEVER commit changes unless the user explicitly asks** - 只有用户明确要求时才提交代码
- **不要假设特定测试框架** - 检查README或搜索代码库确定测试方法
- **SSL问题解决** - 开发环境使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`