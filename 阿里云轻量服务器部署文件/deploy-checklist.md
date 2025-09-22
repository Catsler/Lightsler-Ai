# ✅ 轻量服务器部署检查清单

## 🎯 修改同步脚本配置
```bash
# 编辑 sync-to-server.sh，修改这些值：
SERVER_IP="your-actual-server-ip"           # 替换为实际服务器IP
SERVER_USER="root"                          # 或你的用户名
REMOTE_PATH="/root/lightsler-ai"            # 或实际项目路径
```

## 📦 第1步：同步代码到服务器
```bash
# 在本地执行
./sync-to-server.sh
```

## 🚀 第2步：在服务器上部署Railway Redis
```bash
# SSH登录服务器
ssh root@your-server-ip

# 安装Railway CLI
npm install -g @railway/cli

# 登录Railway（会打开浏览器）
railway login

# 创建Redis服务
railway new shopify-redis
railway add    # 选择 "Redis"

# 获取连接URL（重要！）
railway variables
# 复制 REDIS_URL 的值
```

## ⚙️ 第3步：配置环境变量
```bash
# 在服务器项目目录下
cd /root/lightsler-ai

# 配置环境变量
cp .env.template .env
nano .env

# 填入以下关键配置：
REDIS_URL=redis://default:xxxxx@xxxxx.railway.app:6379
SHOPIFY_API_KEY=你的shopify密钥
SHOPIFY_API_SECRET=你的shopify密码
GPT_API_KEY=你的翻译API密钥
```

## 🔧 第4步：升级服务器内存
在云服务商控制台：
- [ ] 内存：2GB → 4GB
- [ ] 重启服务器
- [ ] 验证内存：`free -h`

## ▶️ 第5步：启动应用
```bash
# 在服务器上执行
./start-multi-shop.sh
```

## 🔍 第6步：验证部署
```bash
# 检查进程状态
pm2 list

# 检查应用健康
curl http://localhost:3001/api/status  # Shop1
curl http://localhost:3002/api/status  # Shop2

# 查看日志
pm2 logs
```

## 📊 预期结果
- ✅ PM2显示2个running进程
- ✅ 内存使用 <3GB
- ✅ Redis连接正常
- ✅ API健康检查通过
- ✅ UI访问正常，无崩溃

## 🚨 如果出现问题

### Redis连接失败
```bash
# 检查Redis URL格式
echo $REDIS_URL
# 测试连接
redis-cli -u "$REDIS_URL" ping
```

### 内存不足
```bash
# 检查内存使用
free -h
ps aux --sort=-%mem | head
```

### 应用启动失败
```bash
# 查看详细错误
pm2 logs --lines 50
# 重启尝试
pm2 restart all
```

### UI仍然崩溃
```bash
# 清理浏览器缓存
# 检查网络请求状态
curl -v http://localhost:3001/api/status
```

## 📞 部署完成确认

部署成功的标志：
- [ ] PM2显示2个healthy进程
- [ ] 内存使用稳定在50-70%
- [ ] 翻译功能正常工作
- [ ] UI操作流畅无崩溃
- [ ] 两个店铺数据完全隔离

**🎉 完成后，你的轻量服务器将稳定运行2个店铺的翻译应用！**