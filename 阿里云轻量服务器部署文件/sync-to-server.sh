#!/bin/bash

# 代码同步到轻量服务器脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 服务器配置（请修改为你的实际信息）
SERVER_IP="your-server-ip"
SERVER_USER="root"
REMOTE_PATH="/root/lightsler-ai"  # 服务器上的项目路径

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

# 检查服务器连接
check_connection() {
    log "检查服务器连接..."
    if ssh $SERVER_USER@$SERVER_IP "echo 'Connected'" >/dev/null 2>&1; then
        success "服务器连接正常"
    else
        echo "❌ 服务器连接失败，请检查："
        echo "1. 服务器IP是否正确: $SERVER_IP"
        echo "2. SSH密钥是否配置"
        echo "3. 网络连接是否正常"
        exit 1
    fi
}

# 同步修改的文件
sync_files() {
    log "同步修改的文件到服务器..."

    # 核心修改文件列表
    FILES=(
        "app/utils/redis-parser.server.js"
        "app/services/queue.server.js"
        "app/services/memory-cache.server.js"
        "app/services/queue-manager.server.js"
        "app/routes/app._index.jsx"
        "prisma/schema.prisma"
        "ecosystem.config.js"
        ".env.template"
        "start-multi-shop.sh"
        "DEPLOYMENT.md"
    )

    for file in "${FILES[@]}"; do
        if [ -f "$file" ]; then
            log "同步文件: $file"
            scp "$file" $SERVER_USER@$SERVER_IP:$REMOTE_PATH/$file
            success "已同步: $file"
        else
            warning "文件不存在: $file"
        fi
    done
}

# 创建远程目录
create_directories() {
    log "创建必要的目录..."
    ssh $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_PATH/logs"
    ssh $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_PATH/app/utils"
    ssh $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_PATH/app/services"
    ssh $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_PATH/app/routes"
    success "目录创建完成"
}

# 设置文件权限
set_permissions() {
    log "设置文件权限..."
    ssh $SERVER_USER@$SERVER_IP "chmod +x $REMOTE_PATH/start-multi-shop.sh"
    success "权限设置完成"
}

# 安装依赖
install_dependencies() {
    log "安装Node.js依赖..."
    ssh $SERVER_USER@$SERVER_IP "cd $REMOTE_PATH && npm install"
    success "依赖安装完成"
}

# 运行数据库迁移
run_migrations() {
    log "运行数据库迁移..."
    ssh $SERVER_USER@$SERVER_IP "cd $REMOTE_PATH && npx prisma generate"
    ssh $SERVER_USER@$SERVER_IP "cd $REMOTE_PATH && npx prisma migrate deploy"
    success "数据库迁移完成"
}

# 显示下一步操作
show_next_steps() {
    echo ""
    echo "🎉 代码同步完成！"
    echo ""
    echo "📋 接下来在服务器上执行："
    echo ""
    echo "1. SSH登录服务器："
    echo "   ssh $SERVER_USER@$SERVER_IP"
    echo ""
    echo "2. 进入项目目录："
    echo "   cd $REMOTE_PATH"
    echo ""
    echo "3. 配置环境变量："
    echo "   cp .env.template .env"
    echo "   nano .env  # 填入Railway Redis URL等配置"
    echo ""
    echo "4. 部署Railway Redis："
    echo "   npm install -g @railway/cli"
    echo "   railway login"
    echo "   railway new shopify-redis"
    echo "   railway add  # 选择Redis"
    echo "   railway variables  # 获取REDIS_URL"
    echo ""
    echo "5. 启动应用："
    echo "   ./start-multi-shop.sh"
    echo ""
    echo "6. 查看状态："
    echo "   pm2 list"
    echo "   pm2 logs"
    echo ""
}

# 主函数
main() {
    log "开始同步代码到轻量服务器..."
    echo ""

    warning "请先修改脚本中的服务器信息："
    echo "SERVER_IP=\"$SERVER_IP\""
    echo "SERVER_USER=\"$SERVER_USER\""
    echo "REMOTE_PATH=\"$REMOTE_PATH\""
    echo ""
    read -p "确认信息正确，按Enter继续，或Ctrl+C退出修改..."

    check_connection
    create_directories
    sync_files
    set_permissions
    install_dependencies
    run_migrations
    show_next_steps
}

# 执行主函数
main "$@"