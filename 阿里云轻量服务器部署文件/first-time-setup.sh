#!/bin/bash
# 阿里云轻量服务器首次部署脚本
# 功能：从零开始配置服务器环境并部署应用

set -euo pipefail

# ============ 配置区域 ============
SERVER_IP="47.79.77.128"
SERVER_USER="root"
SSH_KEY="/Users/elie/Downloads/shopify.pem"
BIND_IP="192.168.31.83"

# 服务器路径
REMOTE_BASE="/var/www"
REMOTE_LIGHTSLER_BASE="$REMOTE_BASE/lightsler-base"
REMOTE_SHOP1="$REMOTE_BASE/app1-fynony"
REMOTE_SHOP2="$REMOTE_BASE/app2-onewind"
REMOTE_BACKUP="$REMOTE_BASE/backups"
REMOTE_ECOSYSTEM="/var/www/ecosystem-simple.config.js"

# 本地路径
LOCAL_PROJECT="/Users/elie/Downloads/translate/Lightsler-Ai"
LOCAL_DEPLOY_FILES="$LOCAL_PROJECT/阿里云轻量服务器部署文件"

# PM2 进程名
PM2_SHOP1="shop1-fynony"
PM2_SHOP2="shop2-onewind"
PM2_SHOP1_WORKER="shop1-translation-worker"
PM2_SHOP2_WORKER="shop2-translation-worker"

# ============ 颜色定义 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# ============ 日志函数 ============
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌${NC} $1"
}

phase() {
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}$1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ============ SSH/SCP 包装函数 ============
ssh_cmd() {
    ssh -b "$BIND_IP" -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" "$@"
}

scp_cmd() {
    scp -o BindAddress="$BIND_IP" -i "$SSH_KEY" -o StrictHostKeyChecking=no "$@"
}

# ============ 错误处理 ============
trap 'error "部署失败于第 $LINENO 行"; exit 1' ERR

# ============ 主流程函数 ============

# 检查本地环境
check_local_env() {
    phase "Phase 0: 检查本地环境"
    
    if [ ! -f "$SSH_KEY" ]; then
        error "SSH密钥不存在: $SSH_KEY"
        exit 1
    fi
    success "SSH密钥存在"
    
    if [ ! -d "$LOCAL_PROJECT" ]; then
        error "本地项目目录不存在: $LOCAL_PROJECT"
        exit 1
    fi
    success "本地项目目录存在"
    
    log "测试服务器连接..."
    if ssh_cmd "echo 'Connected'" >/dev/null 2>&1; then
        success "服务器连接正常"
    else
        error "无法连接到服务器"
        exit 1
    fi
}

# 安装服务器基础环境
install_server_env() {
    phase "Phase 1: 安装服务器基础环境"
    
    log "更新软件包列表..."
    ssh_cmd "apt-get update -y"
    
    log "安装基础工具..."
    ssh_cmd "apt-get install -y curl wget git rsync build-essential"
    success "基础工具安装完成"
    
    log "检查Node.js..."
    if ssh_cmd "node --version" 2>/dev/null | grep -q "v20"; then
        success "Node.js 20已安装"
    else
        log "安装Node.js 20.x..."
        ssh_cmd "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
        ssh_cmd "apt-get install -y nodejs"
        success "Node.js安装完成"
    fi
    
    log "安装PM2..."
    ssh_cmd "npm install -g pm2"
    ssh_cmd "pm2 startup systemd -u root --hp /root" || true
    success "PM2安装完成"
    
    log "检查环境版本..."
    ssh_cmd "node --version && npm --version && pm2 --version"
}

# 创建目录结构
create_directories() {
    phase "Phase 2: 创建目录结构"
    
    log "创建项目目录..."
    ssh_cmd "mkdir -p $REMOTE_BASE $REMOTE_LIGHTSLER_BASE $REMOTE_SHOP1 $REMOTE_SHOP2 $REMOTE_BACKUP"
    ssh_cmd "mkdir -p $REMOTE_SHOP1/prisma $REMOTE_SHOP2/prisma"
    ssh_cmd "mkdir -p $REMOTE_SHOP1/logs $REMOTE_SHOP2/logs"
    success "目录结构创建完成"
    
    log "验证目录..."
    ssh_cmd "ls -la $REMOTE_BASE"
}

# 上传代码
upload_code() {
    phase "Phase 3: 上传代码"
    
    log "同步代码到lightsler-base..."
    rsync -avz -e "ssh -b $BIND_IP -i $SSH_KEY -o StrictHostKeyChecking=no" \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='.env' \
        --exclude='.env.*' \
        --exclude='*.sqlite' \
        --exclude='*.sqlite-journal' \
        --exclude='logs' \
        --exclude='build' \
        --exclude='.cache' \
        --exclude='阿里云轻量服务器部署文件' \
        "$LOCAL_PROJECT/" "$SERVER_USER@$SERVER_IP:$REMOTE_LIGHTSLER_BASE/"
    success "代码上传到lightsler-base完成"
    
    log "同步代码到Shop1..."
    ssh_cmd "rsync -a --delete --exclude='node_modules' --exclude='.env' --exclude='*.sqlite' --exclude='logs' $REMOTE_LIGHTSLER_BASE/ $REMOTE_SHOP1/"
    success "Shop1代码同步完成"
    
    log "同步代码到Shop2..."
    ssh_cmd "rsync -a --delete --exclude='node_modules' --exclude='.env' --exclude='*.sqlite' --exclude='logs' $REMOTE_LIGHTSLER_BASE/ $REMOTE_SHOP2/"
    success "Shop2代码同步完成"
}

# 配置环境变量
configure_env() {
    phase "Phase 4: 配置环境变量"

    # 检查是否通过环境变量提供配置（自动模式）
    if [ -n "${AUTO_DEPLOY:-}" ]; then
        log "使用环境变量自动配置..."
        SHOP1_API_SECRET="${SHOP1_API_SECRET}"
        SHOP2_API_SECRET="${SHOP2_API_SECRET}"
        SHOP1_SESSION_SECRET="${SHOP1_SESSION_SECRET:-$(openssl rand -hex 32)}"
        SHOP2_SESSION_SECRET="${SHOP2_SESSION_SECRET:-$(openssl rand -hex 32)}"
        GPT_API_KEY="${GPT_API_KEY}"
        GPT_API_URL="${GPT_API_URL:-https://us.vveai.com/v1}"
        REDIS_URL="${REDIS_URL:-}"

        if [ -z "$REDIS_URL" ]; then
            REDIS_ENABLED="false"
            log "Redis未配置，将使用内存队列模式"
        else
            REDIS_ENABLED="true"
            log "Redis已配置"
        fi
    else
        # 交互模式
        warning "需要配置环境变量，请提供以下信息："
        echo ""

        # Shop1配置
        echo "━━━ Shop1 (Fynony) 配置 ━━━"
        read -p "Shop1 SHOPIFY_API_SECRET: " SHOP1_API_SECRET
        read -p "Shop1 SHOPIFY_APP_SESSION_SECRET (留空自动生成): " SHOP1_SESSION_SECRET
        if [ -z "$SHOP1_SESSION_SECRET" ]; then
            SHOP1_SESSION_SECRET=$(openssl rand -hex 32)
            log "已生成Shop1 Session Secret: $SHOP1_SESSION_SECRET"
        fi

        echo ""
        echo "━━━ Shop2 (OneWind) 配置 ━━━"
        read -p "Shop2 SHOPIFY_API_SECRET: " SHOP2_API_SECRET
        read -p "Shop2 SHOPIFY_APP_SESSION_SECRET (留空自动生成): " SHOP2_SESSION_SECRET
        if [ -z "$SHOP2_SESSION_SECRET" ]; then
            SHOP2_SESSION_SECRET=$(openssl rand -hex 32)
            log "已生成Shop2 Session Secret: $SHOP2_SESSION_SECRET"
        fi

        echo ""
        echo "━━━ 共享配置 ━━━"
        read -p "GPT_API_KEY: " GPT_API_KEY
        read -p "GPT_API_URL (默认: https://us.vveai.com/v1): " GPT_API_URL
        GPT_API_URL=${GPT_API_URL:-https://us.vveai.com/v1}

        read -p "Redis URL (留空使用内存队列): " REDIS_URL
        if [ -z "$REDIS_URL" ]; then
            REDIS_ENABLED="false"
            warning "将使用内存队列模式"
        else
            REDIS_ENABLED="true"
        fi
    fi
    
    # 创建Shop1 .env
    log "创建Shop1环境变量..."
    ssh_cmd "cat > $REMOTE_SHOP1/.env << 'ENV_EOF'
# Shopify配置
SHOPIFY_API_KEY=f97170933cde079c914f7df7e90cd806
SHOPIFY_API_SECRET=$SHOP1_API_SECRET
SHOPIFY_APP_SESSION_SECRET=$SHOP1_SESSION_SECRET
SHOPIFY_APP_URL=https://fynony.ease-joy.fun

# 数据库
DATABASE_URL=\"file:./prisma/dev.sqlite\"

# 翻译服务
GPT_API_KEY=$GPT_API_KEY
GPT_API_URL=$GPT_API_URL
GPT_MODEL=gpt-4o-mini

# Redis队列
REDIS_ENABLED=$REDIS_ENABLED
${REDIS_URL:+REDIS_URL=$REDIS_URL}
QUEUE_CONCURRENCY=2

# 应用配置
NODE_ENV=production
PORT=3001
SHOP_ID=shop1
SHOP_PREFIX=shop1

# 日志配置
LOG_LEVEL=info
LOGGING_FILE_ENABLED=true
LOGGING_LEVEL=info

# 功能开关
ENABLE_PRODUCT_RELATED_TRANSLATION=true
ENV_EOF"
    success "Shop1环境变量创建完成"
    
    # 创建Shop2 .env
    log "创建Shop2环境变量..."
    ssh_cmd "cat > $REMOTE_SHOP2/.env << 'ENV_EOF'
# Shopify配置
SHOPIFY_API_KEY=8102af9807fd9df0b322a44f500a1d0e
SHOPIFY_API_SECRET=$SHOP2_API_SECRET
SHOPIFY_APP_SESSION_SECRET=$SHOP2_SESSION_SECRET
SHOPIFY_APP_URL=https://onewind.ease-joy.fun

# 数据库
DATABASE_URL=\"file:./prisma/dev.sqlite\"

# 翻译服务
GPT_API_KEY=$GPT_API_KEY
GPT_API_URL=$GPT_API_URL
GPT_MODEL=gpt-4o-mini

# Redis队列
REDIS_ENABLED=$REDIS_ENABLED
${REDIS_URL:+REDIS_URL=$REDIS_URL}
QUEUE_CONCURRENCY=2

# 应用配置
NODE_ENV=production
PORT=3002
SHOP_ID=shop2
SHOP_PREFIX=shop2

# 日志配置
LOG_LEVEL=info
LOGGING_FILE_ENABLED=true
LOGGING_LEVEL=info

# 功能开关
ENABLE_PRODUCT_RELATED_TRANSLATION=true
ENV_EOF"
    success "Shop2环境变量创建完成"
}

# 安装依赖
install_dependencies() {
    phase "Phase 5: 安装依赖"
    
    log "安装Shop1依赖..."
    ssh_cmd "cd $REMOTE_SHOP1 && npm ci"
    success "Shop1依赖安装完成"
    
    log "安装Shop2依赖..."
    ssh_cmd "cd $REMOTE_SHOP2 && npm ci"
    success "Shop2依赖安装完成"
}

# 初始化数据库
init_database() {
    phase "Phase 6: 初始化数据库"
    
    log "生成Shop1 Prisma客户端..."
    ssh_cmd "cd $REMOTE_SHOP1 && npx prisma generate"
    
    log "执行Shop1数据库迁移..."
    ssh_cmd "cd $REMOTE_SHOP1 && npx prisma migrate deploy"
    success "Shop1数据库初始化完成"
    
    log "生成Shop2 Prisma客户端..."
    ssh_cmd "cd $REMOTE_SHOP2 && npx prisma generate"
    
    log "执行Shop2数据库迁移..."
    ssh_cmd "cd $REMOTE_SHOP2 && npx prisma migrate deploy"
    success "Shop2数据库初始化完成"
}

# 创建PM2配置
create_pm2_config() {
    phase "Phase 7: 创建PM2配置"
    
    log "创建PM2配置文件..."
    ssh_cmd "cat > $REMOTE_ECOSYSTEM << 'PM2_EOF'
module.exports = {
  apps: [
    {
      name: '$PM2_SHOP1',
      cwd: '$REMOTE_SHOP1',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '$REMOTE_SHOP1/logs/error.log',
      out_file: '$REMOTE_SHOP1/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    },
    {
      name: '$PM2_SHOP2',
      cwd: '$REMOTE_SHOP2',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: '$REMOTE_SHOP2/logs/error.log',
      out_file: '$REMOTE_SHOP2/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
PM2_EOF"
    success "PM2配置文件创建完成"
}

# 启动服务
start_services() {
    phase "Phase 8: 启动服务"
    
    log "启动PM2进程..."
    ssh_cmd "pm2 start $REMOTE_ECOSYSTEM"
    
    log "保存PM2配置..."
    ssh_cmd "pm2 save"
    
    success "服务启动完成"
    
    log "等待服务启动..."
    sleep 10
    
    log "查看PM2状态..."
    ssh_cmd "pm2 status"
}

# 验证部署
verify_deployment() {
    phase "Phase 9: 验证部署"
    
    log "检查Shop1健康状态..."
    if ssh_cmd "curl -sf http://localhost:3001/healthz > /dev/null"; then
        success "Shop1健康检查通过 ✓"
    else
        warning "Shop1健康检查失败，请查看日志"
        ssh_cmd "pm2 logs $PM2_SHOP1 --lines 20 --nostream"
    fi
    
    log "检查Shop2健康状态..."
    if ssh_cmd "curl -sf http://localhost:3002/healthz > /dev/null"; then
        success "Shop2健康检查通过 ✓"
    else
        warning "Shop2健康检查失败，请查看日志"
        ssh_cmd "pm2 logs $PM2_SHOP2 --lines 20 --nostream"
    fi
}

# 显示后续步骤
show_next_steps() {
    phase "部署完成！后续步骤"
    
    success "🎉 首次部署成功！"
    echo ""
    echo "服务信息："
    echo "  Shop1 (Fynony)"
    echo "    - 本地: http://localhost:3001"
    echo "    - 域名: https://fynony.ease-joy.fun"
    echo "    - 数据库: $REMOTE_SHOP1/prisma/dev.sqlite"
    echo ""
    echo "  Shop2 (OneWind)"
    echo "    - 本地: http://localhost:3002"
    echo "    - 域名: https://onewind.ease-joy.fun"
    echo "    - 数据库: $REMOTE_SHOP2/prisma/dev.sqlite"
    echo ""
    echo "后续操作："
    echo "  1. 配置Cloudflare隧道（如需域名访问）"
    echo "  2. 在Shopify Partner Dashboard更新回调URL"
    echo "  3. 测试应用安装和翻译功能"
    echo ""
    echo "常用命令："
    echo "  查看日志: ssh root@$SERVER_IP 'pm2 logs'"
    echo "  重启应用: ssh root@$SERVER_IP 'pm2 restart all'"
    echo "  查看状态: ssh root@$SERVER_IP 'pm2 status'"
    echo ""
}

# ============ 主流程 ============
main() {
    log "开始首次部署流程..."
    echo ""
    warning "此脚本将在服务器上执行以下操作："
    echo "  1. 安装Node.js 20.x、PM2、Git等基础环境"
    echo "  2. 创建项目目录结构"
    echo "  3. 上传代码到服务器"
    echo "  4. 配置环境变量（需要交互输入）"
    echo "  5. 安装依赖并初始化数据库"
    echo "  6. 启动PM2服务"
    echo ""

    # 自动模式跳过确认
    if [ -z "${AUTO_DEPLOY:-}" ]; then
        read -p "确认继续？[y/N] " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            log "已取消部署"
            exit 0
        fi
    else
        log "自动部署模式，跳过确认..."
    fi
    
    check_local_env
    install_server_env
    create_directories
    upload_code
    configure_env
    install_dependencies
    init_database
    create_pm2_config
    start_services
    verify_deployment
    show_next_steps
    
    success "✨ 首次部署流程全部完成！"
}

# 执行主流程
main "$@"
