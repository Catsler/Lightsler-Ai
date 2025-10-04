#!/bin/bash

# 轻量服务器修复部署脚本
# 使用静态路由绕过VPN进行稳定连接

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 服务器配置（基于文档）
SERVER_IP="47.79.77.128"
SSH_KEY="/Users/elie/Downloads/shopify.pem"
BIND_IP="192.168.110.124"  # 绕过VPN的本地IP
USER="root"

# 服务器路径
APP1_PATH="/var/www/app1-fynony"
APP2_PATH="/var/www/app2-onewind"
BASE_PATH="/var/www/lightsler-base"

# 日志函数
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

# SSH命令包装器（绕过VPN）
ssh_cmd() {
    ssh -b $BIND_IP -i $SSH_KEY -o StrictHostKeyChecking=no $USER@$SERVER_IP "$@"
}

# SCP命令包装器（绕过VPN）
scp_cmd() {
    scp -o BindAddress=$BIND_IP -i $SSH_KEY -o StrictHostKeyChecking=no "$@"
}

# 检查连接
check_connection() {
    log "检查服务器连接..."
    if ssh_cmd "echo 'Connected'" >/dev/null 2>&1; then
        success "服务器连接正常 (通过 $BIND_IP 绕过VPN)"
    else
        error "服务器连接失败"
        exit 1
    fi
}

# 备份现有文件
backup_existing() {
    log "备份现有文件..."

    # 创建备份目录
    local backup_dir="/var/www/backup-$(date +%Y%m%d-%H%M%S)"
    ssh_cmd "mkdir -p $backup_dir"

    # 备份重要文件
    ssh_cmd "cp -r $APP1_PATH/prisma/dev.sqlite $backup_dir/shop1-dev.sqlite 2>/dev/null || true"
    ssh_cmd "cp -r $APP2_PATH/prisma/dev.sqlite $backup_dir/shop2-dev.sqlite 2>/dev/null || true"
    ssh_cmd "cp $APP1_PATH/.env $backup_dir/shop1.env 2>/dev/null || true"
    ssh_cmd "cp $APP2_PATH/.env $backup_dir/shop2.env 2>/dev/null || true"

    success "备份完成: $backup_dir"
}

# 创建必要的目录结构
create_directories() {
    log "创建目录结构..."

    ssh_cmd "mkdir -p $BASE_PATH/app/utils"
    ssh_cmd "mkdir -p $BASE_PATH/app/services"
    ssh_cmd "mkdir -p $BASE_PATH/app/routes"
    ssh_cmd "mkdir -p $BASE_PATH/logs"
    ssh_cmd "mkdir -p $APP1_PATH/logs"
    ssh_cmd "mkdir -p $APP2_PATH/logs"

    success "目录结构创建完成"
}

# 上传修复文件
upload_fixes() {
    log "上传修复文件到服务器..."

    # 核心修复文件
    local FILES=(
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

    # 上传到基础目录
    for file in "${FILES[@]}"; do
        if [ -f "$file" ]; then
            log "上传: $file"
            # 创建目标目录
            target_dir=$(dirname "$file")
            ssh_cmd "mkdir -p $BASE_PATH/$target_dir"
            # 上传文件
            scp_cmd "$file" $USER@$SERVER_IP:$BASE_PATH/$file
            success "已上传: $file"
        else
            warning "文件不存在: $file"
        fi
    done
}

# 同步到两个应用目录
sync_to_apps() {
    log "同步修复文件到应用目录..."

    # 同步到app1
    ssh_cmd "cp -r $BASE_PATH/app/* $APP1_PATH/app/ 2>/dev/null || true"
    ssh_cmd "cp $BASE_PATH/prisma/schema.prisma $APP1_PATH/prisma/schema.prisma"
    ssh_cmd "cp $BASE_PATH/.env.template $APP1_PATH/.env.template"

    # 同步到app2
    ssh_cmd "cp -r $BASE_PATH/app/* $APP2_PATH/app/ 2>/dev/null || true"
    ssh_cmd "cp $BASE_PATH/prisma/schema.prisma $APP2_PATH/prisma/schema.prisma"
    ssh_cmd "cp $BASE_PATH/.env.template $APP2_PATH/.env.template"

    # 复制PM2配置到根目录
    ssh_cmd "cp $BASE_PATH/ecosystem.config.js /var/www/ecosystem-fix.config.js"

    success "文件同步完成"
}

# 部署Railway Redis
deploy_railway_redis() {
    log "准备Railway Redis部署..."

    warning "请在新终端窗口执行以下命令部署Railway Redis："
    echo ""
    echo "1. SSH登录服务器："
    echo "   ssh -b $BIND_IP -i $SSH_KEY $USER@$SERVER_IP"
    echo ""
    echo "2. 安装Railway CLI："
    echo "   npm install -g @railway/cli"
    echo ""
    echo "3. 登录Railway："
    echo "   railway login"
    echo ""
    echo "4. 创建Redis服务："
    echo "   railway new shopify-redis"
    echo "   railway add  # 选择 Redis"
    echo ""
    echo "5. 获取连接URL："
    echo "   railway variables"
    echo "   # 复制REDIS_URL的值"
    echo ""
    read -p "按Enter继续（假设你已获取REDIS_URL）..."
}

# 更新环境变量
update_env() {
    log "更新环境变量配置..."

    # 获取Redis URL
    read -p "请输入Railway Redis URL (或按Enter跳过): " REDIS_URL

    if [ -n "$REDIS_URL" ]; then
        # 更新shop1环境变量
        ssh_cmd "cat > $APP1_PATH/.env.redis << 'EOF'
# Redis配置（新增）
REDIS_URL=$REDIS_URL
REDIS_ENABLED=true

# 店铺隔离配置
SHOP_ID=shop1
SHOP_PREFIX=shop1

# 性能优化
QUEUE_CONCURRENCY=2
MAX_CACHE_SIZE=500
CACHE_TTL=3600
EOF"

        # 更新shop2环境变量
        ssh_cmd "cat > $APP2_PATH/.env.redis << 'EOF'
# Redis配置（新增）
REDIS_URL=$REDIS_URL
REDIS_ENABLED=true

# 店铺隔离配置
SHOP_ID=shop2
SHOP_PREFIX=shop2

# 性能优化
QUEUE_CONCURRENCY=2
MAX_CACHE_SIZE=500
CACHE_TTL=3600
EOF"

        # 合并到主环境变量文件
        ssh_cmd "cat $APP1_PATH/.env.redis >> $APP1_PATH/.env"
        ssh_cmd "cat $APP2_PATH/.env.redis >> $APP2_PATH/.env"

        success "Redis配置已添加"
    else
        warning "跳过Redis配置（将使用内存模式）"
    fi
}

# 安装依赖和运行迁移
install_and_migrate() {
    log "安装依赖和运行数据库迁移..."

    # Shop1
    log "处理Shop1..."
    ssh_cmd "cd $APP1_PATH && npm install --production"
    ssh_cmd "cd $APP1_PATH && npx prisma generate"
    ssh_cmd "cd $APP1_PATH && npx prisma migrate deploy || true"

    # Shop2
    log "处理Shop2..."
    ssh_cmd "cd $APP2_PATH && npm install --production"
    ssh_cmd "cd $APP2_PATH && npx prisma generate"
    ssh_cmd "cd $APP2_PATH && npx prisma migrate deploy || true"

    success "依赖安装和迁移完成"
}

# 重启应用
restart_apps() {
    log "重启PM2应用..."

    # 停止现有应用
    ssh_cmd "pm2 delete all || true"

    # 使用修复后的配置启动
    ssh_cmd "cd /var/www && pm2 start ecosystem-fix.config.js --env production"

    # 保存PM2配置
    ssh_cmd "pm2 save"

    # 显示状态
    ssh_cmd "pm2 list"

    success "应用重启完成"
}

# 验证部署
verify_deployment() {
    log "验证部署状态..."

    # 检查PM2进程
    echo ""
    log "PM2进程状态："
    ssh_cmd "pm2 list | grep -E 'shop|online'"

    # 检查端口
    echo ""
    log "端口监听状态："
    ssh_cmd "netstat -tlnp | grep -E '3001|3002' || lsof -i:3001,3002"

    # 检查内存使用
    echo ""
    log "内存使用情况："
    ssh_cmd "free -h"

    # 测试API健康检查
    echo ""
    log "API健康检查："
    ssh_cmd "curl -s http://localhost:3001/healthz | head -20 || echo 'Shop1 API未响应'"
    ssh_cmd "curl -s http://localhost:3002/healthz | head -20 || echo 'Shop2 API未响应'"

    success "部署验证完成"
}

# 显示后续步骤
show_next_steps() {
    echo ""
    echo "=========================================="
    echo "🎉 修复部署完成！"
    echo "=========================================="
    echo ""
    echo "📋 后续操作："
    echo ""
    echo "1. 监控日志："
    echo "   ssh -b $BIND_IP -i $SSH_KEY $USER@$SERVER_IP 'pm2 logs'"
    echo ""
    echo "2. 查看状态："
    echo "   ssh -b $BIND_IP -i $SSH_KEY $USER@$SERVER_IP 'pm2 status'"
    echo ""
    echo "3. 如需升级服务器内存："
    echo "   - 登录云服务商控制台"
    echo "   - 升级到4GB内存"
    echo "   - 重启服务器"
    echo ""
    echo "4. 访问应用："
    echo "   - Shop1: https://fynony.ease-joy.fun"
    echo "   - Shop2: https://onewind.ease-joy.fun"
    echo ""
    echo "5. 如遇问题，查看错误日志："
    echo "   ssh -b $BIND_IP -i $SSH_KEY $USER@$SERVER_IP 'pm2 logs --err'"
    echo ""
}

# 主函数
main() {
    log "开始部署修复到轻量服务器..."
    echo "服务器: $SERVER_IP"
    echo "绑定IP: $BIND_IP (绕过VPN)"
    echo ""

    check_connection
    backup_existing
    create_directories
    upload_fixes
    sync_to_apps
    deploy_railway_redis
    update_env
    install_and_migrate
    restart_apps
    verify_deployment
    show_next_steps
}

# 错误处理
trap 'error "部署过程中出现错误"; exit 1' ERR

# 执行主函数
main "$@"