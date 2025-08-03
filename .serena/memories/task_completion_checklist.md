# 任务完成检查清单

当完成编码任务后，请按以下步骤进行验证：

## 1. 代码质量检查
```bash
npm run lint     # 运行ESLint检查，确保没有语法错误
```

## 2. 构建测试
```bash
npm run build    # 确保代码能够成功构建
```

## 3. 功能测试
- 如果修改了数据库模型：
  ```bash
  npx prisma generate
  npx prisma migrate dev
  ```
- 启动开发服务器测试功能：
  ```bash
  npm run dev
  ```

## 4. 测试关键功能
- 如果修改了翻译功能：测试产品/集合扫描和翻译
- 如果修改了API：使用相应的测试端点验证
- 如果修改了UI：在浏览器中检查显示效果

## 5. 提交前检查
- 确保所有修改都符合项目代码风格
- 确保没有遗留的调试代码
- 确保敏感信息（API密钥等）没有被提交

## 6. 常见问题排查
- 数据库错误：运行 `npx prisma migrate dev`
- Redis连接失败：检查Redis是否运行 `redis-cli ping`
- Shopify认证问题：重新运行 `npm run dev` 并重新安装应用