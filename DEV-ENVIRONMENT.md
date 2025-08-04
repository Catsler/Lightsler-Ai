# 开发环境说明

## 常见问题解决

### TypeError: Failed to fetch 错误

这个错误通常是由浏览器扩展程序（如广告拦截器）干扰Shopify App Bridge造成的。

#### 解决方法：

1. **禁用浏览器扩展**
   - 临时禁用所有Chrome扩展程序，特别是：
     - 广告拦截器（AdBlock, uBlock Origin等）
     - 隐私保护工具（Privacy Badger, Ghostery等）
     - VPN扩展
   - 或使用Chrome隐身模式（Ctrl/Cmd + Shift + N）

2. **使用其他浏览器**
   - Firefox
   - Safari
   - Edge

3. **清除缓存**
   ```bash
   # 清除浏览器缓存
   # Chrome: 设置 -> 隐私和安全 -> 清除浏览数据
   ```

### 开发服务器配置

#### 启动开发服务器
```bash
npm run dev
```

服务器将在随机端口启动，查看终端输出获取访问地址。

#### 环境变量检查
确保 `.env` 文件包含以下必需配置：
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `GPT_API_KEY`（翻译功能必需）

### 测试页面

应用提供了多个测试页面用于调试：

1. **主应用页面** `/app`
   - 完整功能，需要Shopify认证
   - 包含错误边界保护

2. **简化版页面** `/app/simple`
   - 基本功能，需要Shopify认证
   - 去除了复杂交互

3. **调试页面**
   - `/test/ui` - 纯HTML UI测试
   - `/debug/auth` - 认证状态检查

### 错误处理机制

应用已实现以下错误处理：

1. **错误边界组件**
   - 捕获React组件错误
   - 提供友好的错误提示
   - 支持快速恢复

2. **App Bridge错误处理**
   - 安全的toast显示函数
   - 自动降级到日志记录
   - 网络错误特殊处理

3. **CORS配置优化**
   - 支持Cloudflare Tunnel
   - 宽松的CORS策略
   - CDN请求代理

### 开发建议

1. **使用隐身模式开发**
   - 避免扩展干扰
   - 清洁的Cookie环境

2. **监控网络请求**
   - 打开开发者工具Network标签
   - 检查失败的请求
   - 查看Console错误

3. **错误上报**
   - 所有错误会记录在Console
   - 检查应用内的操作日志
   - 使用错误边界提供的调试信息

### 部署注意事项

1. **生产环境配置**
   - 使用真实域名替代Cloudflare Tunnel
   - 配置适当的CORS策略
   - 启用错误监控服务

2. **性能优化**
   - 启用Redis缓存（可选）
   - 使用CDN加速静态资源
   - 优化API请求批处理

### 联系支持

如遇到无法解决的问题，请提供：
- 浏览器版本和操作系统
- 错误截图和Console日志
- 网络请求失败的详细信息
- 使用的浏览器扩展列表