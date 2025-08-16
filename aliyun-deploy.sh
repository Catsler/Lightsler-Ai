#!/bin/bash

# ============================================
#   Shopify翻译应用 - 阿里云自动部署脚本
#   GitHub: https://github.com/Catsler/Lightsler-Ai
# ============================================

set -e  # 遇到错误立即退出

echo "============================================"
echo "   开始部署 Shopify 翻译应用"
echo "   GitHub: Catsler/Lightsler-Ai"
echo "============================================"
echo ""

# 步骤 1: 更新系统
echo "[1/12] 更新系统包..."
apt update && apt upgrade -y

# 步骤 2: 安装基础工具
echo "[2/12] 安装必要工具..."
apt install -y curl wget git vim unzip build-essential

# 步骤 3: 安装 Node.js 18
echo "[3/12] 安装 Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
echo "Node版本: $(node -v)"
echo "NPM版本: $(npm -v)"

# 步骤 4: 安装 PM2
echo "[4/12] 安装 PM2 进程管理器..."
npm install -g pm2

# 步骤 5: 安装 Redis（可选但推荐）
echo "[5/12] 安装 Redis..."
apt install -y redis-server
systemctl enable redis-server
systemctl start redis-server
echo "Redis状态: $(systemctl is-active redis-server)"

# 步骤 6: 克隆项目
echo "[6/12] 从 GitHub 克隆项目..."
cd /root
if [ -d "shopify-app" ]; then
    echo "项目目录已存在，更新代码..."
    cd shopify-app
    git pull origin main
else
    git clone https://github.com/Catsler/Lightsler-Ai.git shopify-app
    cd shopify-app
fi

# 步骤 7: 安装项目依赖
echo "[7/12] 安装项目依赖..."
npm install

# 步骤 8: 创建环境配置文件
echo "[8/12] 创建环境配置文件..."
if [ ! -f ".env" ]; then
    cat > .env << 'EOF'
# ============================================
# Shopify 应用配置
# ============================================
SHOPIFY_API_KEY=请替换为你的API密钥
SHOPIFY_API_SECRET=请替换为你的API密码
SHOPIFY_SCOPES=write_products,read_products,write_translations,read_translations,write_content,read_content,write_themes,read_themes,write_files,read_files,write_online_store_pages,read_online_store_pages,write_metaobjects,read_metaobjects
SHOPIFY_APP_URL=http://你的服务器IP:3000

# ============================================
# GPT API 配置
# ============================================
GPT_API_KEY=请替换为你的OpenAI密钥
GPT_API_URL=https://api.openai.com/v1
# 或使用兼容API：
# GPT_API_URL=https://api.cursorai.art/v1

# ============================================
# 数据库配置
# ============================================
DATABASE_URL="file:./prisma/dev.db"

# ============================================
# Redis 配置（可选）
# ============================================
REDIS_URL=redis://localhost:6379

# ============================================
# 其他配置
# ============================================
NODE_ENV=production
PORT=3000
QUEUE_CONCURRENCY=5
EOF
    echo ""
    echo "⚠️  请编辑 .env 文件，填入你的实际API密钥"
    echo "使用命令: vim /root/shopify-app/.env"
    echo ""
    read -p "按回车键继续（编辑完成后）..."
    vim .env
fi

# 步骤 9: 初始化数据库
echo "[9/12] 初始化数据库..."
npm run setup

# 步骤 10: 构建项目
echo "[10/12] 构建生产版本..."
npm run build

# 步骤 11: 使用PM2启动应用
echo "[11/12] 启动应用..."
pm2 delete shopify-app 2>/dev/null || true
pm2 start npm --name shopify-app -- start
pm2 save
pm2 startup systemd -u root --hp /root

# 步骤 12: 安装和配置 Nginx
echo "[12/12] 配置 Nginx 反向代理..."
apt install -y nginx

# 创建Nginx配置
cat > /etc/nginx/sites-available/shopify-app << 'EOF'
server {
    listen 80;
    server_name _;
    
    # 客户端最大请求体大小（用于上传）
    client_max_body_size 10M;
    
    # 超时设置
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 启用配置
ln -sf /etc/nginx/sites-available/shopify-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试并重启Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

# 显示完成信息
echo ""
echo "============================================"
echo "   ✅ 部署完成！"
echo "============================================"
echo ""
echo "📌 重要信息："
echo "   访问地址: http://$(curl -s ifconfig.me)"
echo "   应用端口: 3000"
echo ""
echo "📝 常用命令："
echo "   查看日志: pm2 logs shopify-app"
echo "   重启应用: pm2 restart shopify-app"
echo "   查看状态: pm2 status"
echo "   监控面板: pm2 monit"
echo ""
echo "🔧 更新代码："
echo "   cd /root/shopify-app"
echo "   git pull origin main"
echo "   npm install"
echo "   npm run build"
echo "   pm2 restart shopify-app"
echo ""
echo "⚠️  注意事项："
echo "   1. 请确保已编辑 .env 文件填入实际的API密钥"
echo "   2. 建议配置HTTPS证书（使用certbot）"
echo "   3. 定期备份数据库文件"
echo ""
echo "============================================"

# 显示应用状态
pm2 status