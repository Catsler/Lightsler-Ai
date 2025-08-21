#!/bin/bash

# 服务器部署脚本 - 单代码库多租户架构
# 在阿里云服务器上执行

set -e

echo "=========================================="
echo "   Shopify翻译应用 - 服务器部署"
echo "   架构: 单代码库服务3个店铺"
echo "=========================================="
echo ""

# 1. 更新系统
echo "📦 更新系统包..."
apt update && apt upgrade -y

# 2. 安装必要软件
echo "🔧 安装必要软件..."
apt install -y curl git wget build-essential sqlite3 unzip

# 3. 安装Node.js 18.x
if ! command -v node &> /dev/null; then
    echo "📦 安装Node.js 18.x..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
else
    echo "✅ Node.js已安装: $(node -v)"
fi

# 4. 安装PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装PM2..."
    npm install -g pm2
else
    echo "✅ PM2已安装"
fi

# 5. 创建应用目录
echo "📁 创建应用目录..."
mkdir -p /root/shopify-translate
cd /root/shopify-translate

# 6. 解压应用文件
echo "📦 解压应用文件..."
tar -xzf deploy.tar.gz

# 7. 安装依赖
echo "📦 安装npm依赖..."
npm install

# 8. 生成Prisma客户端
echo "🔧 生成Prisma客户端..."
npx prisma generate

# 9. 创建数据库目录
echo "📁 创建数据库目录..."
mkdir -p prisma/data

# 10. 初始化数据库
echo "🗄️ 初始化数据库..."
for shop in onewind daui sshvdt; do
    echo "  - 初始化 $shop 数据库..."
    DATABASE_URL="file:./prisma/data/$shop.db" npx prisma migrate deploy
done

# 11. 创建日志目录
echo "📁 创建日志目录..."
mkdir -p logs

# 12. 构建应用
echo "🔨 构建应用..."
npm run build

# 13. 启动PM2进程
echo "🚀 启动PM2进程..."
pm2 start ecosystem.config.js

# 14. 设置PM2开机自启
echo "⚙️ 设置PM2开机自启..."
pm2 startup systemd -u root --hp /root
pm2 save

# 15. 安装Cloudflared
echo "☁️ 安装Cloudflared..."
if ! command -v cloudflared &> /dev/null; then
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod +x cloudflared-linux-amd64
    mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
    echo "✅ Cloudflared安装完成"
else
    echo "✅ Cloudflared已安装"
fi

# 16. 创建Cloudflare隧道服务
echo "🔧 配置Cloudflare隧道服务..."
cat > /etc/systemd/system/cloudflared.service << 'EOF'
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloudflared tunnel run --token eyJhIjoiNDcxNTkxNzQ5ZDJlZmMzODQwODIxZDgyYjJjYzRlMmQiLCJ0IjoiODZkOGZlZjgtNzg3Zi00MWQ1LWIyNjMtOTUyNjQyODJhOTA3IiwicyI6Ik5EY3hNVFpsT0RRdE5ERmpNQzAwTmpjd0xUbGxPR0l0WWpReE5EWXpOelUxT0RkayJ9
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# 17. 启动Cloudflare隧道
echo "🚀 启动Cloudflare隧道..."
systemctl daemon-reload
systemctl enable cloudflared
systemctl start cloudflared

# 18. 显示状态
echo ""
echo "=========================================="
echo "   ✅ 部署完成!"
echo "=========================================="
echo ""
echo "📊 服务状态:"
pm2 status
echo ""
echo "🌐 访问地址:"
echo "  - https://onewind.ease-joy.fun (OneWind店铺)"
echo "  - https://daui.ease-joy.fun (Daui店铺)"
echo "  - https://sshvdt.ease-joy.fun (SSHVDT店铺)"
echo ""
echo "📝 常用命令:"
echo "  pm2 status          - 查看进程状态"
echo "  pm2 logs           - 查看所有日志"
echo "  pm2 logs 0         - 查看OneWind日志"
echo "  pm2 logs 1         - 查看Daui日志"
echo "  pm2 logs 2         - 查看SSHVDT日志"
echo "  pm2 restart all    - 重启所有进程"
echo "  systemctl status cloudflared - 查看隧道状态"
echo ""