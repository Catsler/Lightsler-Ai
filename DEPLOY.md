# 🚀 阿里云部署指南

## 快速开始

### 1. 购买阿里云服务器
- 地域：**香港**（免备案）
- 系统：**Ubuntu 22.04**
- 配置：**2核4G 6M带宽**（推荐）

### 2. 连接服务器
```bash
ssh root@你的服务器IP
```

### 3. 一键部署
```bash
# 下载并执行部署脚本
wget https://raw.githubusercontent.com/Catsler/Lightsler-Ai/main/aliyun-deploy.sh
chmod +x aliyun-deploy.sh
./aliyun-deploy.sh
```

### 4. 配置API密钥
编辑 `.env` 文件：
```bash
vim /root/shopify-app/.env
```

填入你的实际密钥：
```env
SHOPIFY_API_KEY=你的Shopify API密钥
SHOPIFY_API_SECRET=你的Shopify API密码
GPT_API_KEY=你的OpenAI密钥
```

### 5. 重启应用
```bash
pm2 restart shopify-app
```

## 📋 详细步骤

### Step 1: 服务器初始设置
```bash
# 更新系统
apt update && apt upgrade -y

# 设置时区（可选）
timedatectl set-timezone Asia/Shanghai
```

### Step 2: 安装必要软件
```bash
# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# PM2
npm install -g pm2

# Redis（可选）
apt install -y redis-server
systemctl enable redis-server
```

### Step 3: 克隆项目
```bash
cd /root
git clone https://github.com/Catsler/Lightsler-Ai.git shopify-app
cd shopify-app
```

### Step 4: 配置应用
```bash
# 安装依赖
npm install

# 创建环境配置
cp .env.example .env
vim .env

# 初始化数据库
npm run setup

# 构建项目
npm run build
```

### Step 5: 启动应用
```bash
# PM2启动
pm2 start npm --name shopify-app -- start
pm2 save
pm2 startup
```

## 🔧 日常维护

### 更新代码
```bash
cd /root/shopify-app
git pull origin main
npm install
npm run build
pm2 restart shopify-app
```

### 查看日志
```bash
# 实时日志
pm2 logs shopify-app

# 错误日志
pm2 logs shopify-app --err

# 清空日志
pm2 flush
```

### 监控状态
```bash
# PM2状态
pm2 status

# 系统监控
pm2 monit

# 系统资源
htop
```

### 备份数据
```bash
# 备份数据库
cd /root/shopify-app
sqlite3 prisma/dev.db ".backup backup-$(date +%Y%m%d).db"

# 备份整个项目
tar -czf shopify-backup-$(date +%Y%m%d).tar.gz shopify-app/
```

## 🔒 安全设置

### 配置HTTPS（推荐）
```bash
# 安装Certbot
apt install -y certbot python3-certbot-nginx

# 获取证书（需要域名）
certbot --nginx -d 你的域名.com

# 自动续期
crontab -e
# 添加：0 2 * * * certbot renew --quiet
```

### 防火墙设置
```bash
# 使用ufw
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable
```

## 📊 性能优化

### PM2集群模式
```bash
# 使用多核CPU
pm2 start npm --name shopify-app -i max -- start
```

### 内存限制
```bash
# 设置内存上限
pm2 set pm2:max_memory_restart 1G
```

### 日志轮转
```bash
# 安装日志轮转模块
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## 🆘 故障排查

### 应用无法启动
```bash
# 检查错误日志
pm2 logs shopify-app --err

# 检查端口占用
netstat -tlnp | grep 3000

# 检查Node版本
node -v  # 需要 >= 18.20
```

### 数据库错误
```bash
# 重新初始化数据库
cd /root/shopify-app
npx prisma migrate reset
npm run setup
```

### 内存不足
```bash
# 添加Swap
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 📞 联系支持

- GitHub Issues: https://github.com/Catsler/Lightsler-Ai/issues
- 项目文档: 查看 CLAUDE.md

## 🎉 部署成功后

1. 访问 `http://你的服务器IP` 
2. 在Shopify后台安装应用
3. 配置翻译语言
4. 开始使用！

---
*最后更新: 2025-08-16*