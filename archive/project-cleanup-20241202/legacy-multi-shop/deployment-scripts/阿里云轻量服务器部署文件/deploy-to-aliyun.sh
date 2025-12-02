#!/bin/bash
# 阿里云轻量服务器多店铺智能部署脚本
# 功能：安全地同步最新代码到服务器，更新配置，执行数据库迁移

set -euo pipefail

# ============ 配置区域 ============
SERVER_IP="47.79.77.128"
SERVER_USER="root"
SSH_KEY="/Users/elie/Downloads/shopify.pem"
BIND_IP=$(ifconfig en0 | grep "inet " | grep -v "inet6" | awk '{print $2}')  # Auto-detect current en0 IP

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

# ============ 监控配置 ============
QUEUE_BACKLOG_THRESHOLD=100    # 队列积压阈值
HEALTH_SLEEP_SECONDS=30        # 健康检查等待时间
LOG_SCAN_LINES=50              # 日志扫描行数

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
    ssh \
      -o PubkeyAcceptedAlgorithms=+ssh-rsa \
      -o HostKeyAlgorithms=+ssh-rsa \
      -b "$BIND_IP" \
      -i "$SSH_KEY" \
      -o StrictHostKeyChecking=no \
      "$SERVER_USER@$SERVER_IP" "$@"
}

scp_cmd() {
    scp \
      -o PubkeyAcceptedAlgorithms=+ssh-rsa \
      -o HostKeyAlgorithms=+ssh-rsa \
      -o BindAddress="$BIND_IP" \
      -i "$SSH_KEY" \
      -o StrictHostKeyChecking=no \
      "$@"
}

# ============ 错误处理 ============
trap 'error "部署失败于第 $LINENO 行"; exit 1' ERR

# ============ 阶段函数 ============

# 检查连接
check_connection() {
    phase "Phase 0: 检查服务器连接"

    log "测试 SSH 连接..."
    if ssh_cmd "echo 'Connected'" >/dev/null 2>&1; then
        success "服务器连接正常"
    else
        error "服务器连接失败，请检查："
        echo "1. 服务器IP: $SERVER_IP"
        echo "2. SSH密钥: $SSH_KEY"
        echo "3. 绑定IP: $BIND_IP"
        exit 1
    fi

    log "检查服务器目录..."
    ssh_cmd "ls -ld $REMOTE_SHOP1 $REMOTE_SHOP2" || {
        error "服务器目录不存在"
        exit 1
    }
    success "服务器目录检查通过"
}

# 停止应用
stop_apps() {
    phase "Phase 1: 停止应用进程"

    log "停止 PM2 进程..."
    ssh_cmd "pm2 stop $PM2_SHOP1 $PM2_SHOP2 $PM2_SHOP1_WORKER $PM2_SHOP2_WORKER || true"

    # 等待进程完全停止
    sleep 3

    # 验证进程已停止
    if ssh_cmd "pm2 list | grep -E '$PM2_SHOP1|$PM2_SHOP2|$PM2_SHOP1_WORKER|$PM2_SHOP2_WORKER' | grep -q 'online'"; then
        error "进程未能完全停止"
        exit 1
    fi

    success "所有应用进程已停止"
}

# 备份数据库和配置
backup_data() {
    phase "Phase 2: 备份数据库和配置"

    local timestamp=$(date +%Y%m%d_%H%M%S)

    log "创建备份目录..."
    ssh_cmd "mkdir -p $REMOTE_BACKUP"

    log "备份 Shop1 数据库..."
    ssh_cmd "sqlite3 $REMOTE_SHOP1/prisma/dev.sqlite \".backup $REMOTE_BACKUP/shop1-${timestamp}.db\""
    success "Shop1 数据库备份完成"

    log "备份 Shop2 数据库..."
    ssh_cmd "sqlite3 $REMOTE_SHOP2/prisma/dev.sqlite \".backup $REMOTE_BACKUP/shop2-${timestamp}.db\""
    success "Shop2 数据库备份完成"

    log "备份配置文件..."
    ssh_cmd "cp $REMOTE_SHOP1/.env $REMOTE_BACKUP/shop1-${timestamp}.env"
    ssh_cmd "cp $REMOTE_SHOP2/.env $REMOTE_BACKUP/shop2-${timestamp}.env"
    success "配置文件备份完成"

    # 显示备份信息
    log "备份文件列表："
    ssh_cmd "ls -lh $REMOTE_BACKUP/*${timestamp}*"
}

# 同步代码
sync_code() {
    phase "Phase 3: 同步代码文件"

    log "准备同步代码到 lightsler-base..."

    # 第一阶段：预览变更
    warning "预览同步变更（dry-run）..."
    rsync -avn --delete \
        --exclude='.env' \
        --exclude='.env.*' \
        --exclude='shopify.app.toml' \
        --exclude='prisma/*.db*' \
        --exclude='logs/' \
        --exclude='node_modules/' \
        --exclude='.git/' \
        --exclude='阿里云轻量服务器部署文件/' \
        -e "ssh -b $BIND_IP -i $SSH_KEY -o StrictHostKeyChecking=no" \
        "$LOCAL_PROJECT/" "$SERVER_USER@$SERVER_IP:$REMOTE_LIGHTSLER_BASE/" \
        | grep -E '^(deleting|sending)' || true

    echo ""
    if [[ "${AUTO_CONFIRM:-}" != "true" ]]; then
        read -p "确认同步以上变更？[y/N] " confirm
        if [[ "$confirm" != "y" ]]; then
            warning "用户取消同步"
            exit 0
        fi
    else
        log "AUTO_CONFIRM=true，自动确认同步"
    fi

    # 第二阶段：实际同步
    log "开始同步代码..."
    rsync -av --delete \
        --exclude='.env' \
        --exclude='.env.*' \
        --exclude='shopify.app.toml' \
        --exclude='prisma/*.db*' \
        --exclude='logs/' \
        --exclude='node_modules/' \
        --exclude='.git/' \
        --exclude='阿里云轻量服务器部署文件/' \
        -e "ssh -b $BIND_IP -i $SSH_KEY -o StrictHostKeyChecking=no" \
        "$LOCAL_PROJECT/" "$SERVER_USER@$SERVER_IP:$REMOTE_LIGHTSLER_BASE/"

    success "代码同步到 lightsler-base 完成"

    # 分发到各店铺
    log "分发代码到 Shop1..."
    ssh_cmd "rsync -av --delete \
        --exclude='.env' \
        --exclude='shopify.app.toml' \
        --exclude='prisma/*.db*' \
        $REMOTE_LIGHTSLER_BASE/ $REMOTE_SHOP1/"
    success "Shop1 代码更新完成"

    log "分发代码到 Shop2..."
    ssh_cmd "rsync -av --delete \
        --exclude='.env' \
        --exclude='shopify.app.toml' \
        --exclude='prisma/*.db*' \
        $REMOTE_LIGHTSLER_BASE/ $REMOTE_SHOP2/"
    success "Shop2 代码更新完成"
}

# 更新配置
update_configs() {
    phase "Phase 4: 更新配置文件"

    log "上传环境变量合并脚本..."
    scp_cmd "$LOCAL_DEPLOY_FILES/merge-env.sh" "$SERVER_USER@$SERVER_IP:/tmp/"
    ssh_cmd "chmod +x /tmp/merge-env.sh"

    log "上传 .env.example 作为模板..."
    scp_cmd "$LOCAL_PROJECT/.env.example" "$SERVER_USER@$SERVER_IP:/tmp/"

    log "合并 Shop1 环境变量..."
    ssh_cmd "/tmp/merge-env.sh $REMOTE_SHOP1/.env /tmp/.env.example" || {
        warning "Shop1 环境变量合并失败，请手动检查"
    }
    success "Shop1 环境变量已更新"

    log "合并 Shop2 环境变量..."
    ssh_cmd "/tmp/merge-env.sh $REMOTE_SHOP2/.env /tmp/.env.example" || {
        warning "Shop2 环境变量合并失败，请手动检查"
    }
    success "Shop2 环境变量已更新"

    log "更新 Shop1 shopify.app.toml..."
    scp_cmd "$LOCAL_DEPLOY_FILES/shop1-shopify.app.toml" "$SERVER_USER@$SERVER_IP:$REMOTE_SHOP1/shopify.app.toml"
    success "Shop1 Shopify配置已更新"

    log "更新 Shop2 shopify.app.toml..."
    scp_cmd "$LOCAL_DEPLOY_FILES/shop2-shopify.app.toml" "$SERVER_USER@$SERVER_IP:$REMOTE_SHOP2/shopify.app.toml"
    success "Shop2 Shopify配置已更新"

    log "更新 PM2 配置..."
    scp_cmd "$LOCAL_DEPLOY_FILES/ecosystem.config.js" "$SERVER_USER@$SERVER_IP:$REMOTE_ECOSYSTEM"
    success "PM2 配置已更新"
}

# 安装依赖
install_deps() {
    phase "Phase 5: 安装依赖包"

    log "安装 Shop1 依赖（包含 devDependencies 用于构建和迁移）..."
    ssh_cmd "cd $REMOTE_SHOP1 && npm ci" || {
        error "Shop1 依赖安装失败"
        exit 1
    }
    success "Shop1 依赖安装完成"

    log "安装 Shop2 依赖（包含 devDependencies 用于构建和迁移）..."
    ssh_cmd "cd $REMOTE_SHOP2 && npm ci" || {
        error "Shop2 依赖安装失败"
        exit 1
    }
    success "Shop2 依赖安装完成"
}

# 运行数据库迁移
run_migrations() {
    phase "Phase 6: 运行数据库迁移"

    log "Shop1 数据库迁移..."
    ssh_cmd "cd $REMOTE_SHOP1 && npx prisma generate" || {
        error "Shop1 prisma generate 失败"
        exit 1
    }
    ssh_cmd "cd $REMOTE_SHOP1 && npx prisma migrate deploy" || {
        error "Shop1 数据库迁移失败"
        exit 1
    }
    success "Shop1 数据库迁移完成"

    log "Shop2 数据库迁移..."
    ssh_cmd "cd $REMOTE_SHOP2 && npx prisma generate" || {
        error "Shop2 prisma generate 失败"
        exit 1
    }
    ssh_cmd "cd $REMOTE_SHOP2 && npx prisma migrate deploy" || {
        error "Shop2 数据库迁移失败"
        exit 1
    }
    success "Shop2 数据库迁移完成"
}

# 启动应用
start_apps() {
    phase "Phase 7: 启动应用（零停机重启）"

    log "尝试 PM2 reload（零停机）..."
    if ssh_cmd "cd $REMOTE_BASE && pm2 reload $REMOTE_ECOSYSTEM --only $PM2_SHOP1,$PM2_SHOP2,$PM2_SHOP1_WORKER,$PM2_SHOP2_WORKER --update-env" 2>/dev/null; then
        success "PM2 reload 成功（零停机）"
    else
        warning "PM2 reload 失败（可能首次部署），使用 pm2 start..."
        ssh_cmd "cd $REMOTE_BASE && pm2 start $REMOTE_ECOSYSTEM --only $PM2_SHOP1,$PM2_SHOP2,$PM2_SHOP1_WORKER,$PM2_SHOP2_WORKER" || {
            error "应用启动失败"
            exit 1
        }
    fi

    log "等待进程启动..."
    sleep 5

    # 关卡1：验证进程在线
    log "验证进程状态..."
    ONLINE_COUNT=$(ssh_cmd "pm2 list | grep -E '$PM2_SHOP1|$PM2_SHOP2|$PM2_SHOP1_WORKER|$PM2_SHOP2_WORKER' | grep -c 'online'")
    if [ "$ONLINE_COUNT" -ne 4 ]; then
        error "进程启动异常（预期4个online，实际${ONLINE_COUNT}个）"
        ssh_cmd "pm2 list"
        echo ""
        echo "📌 修复后重新运行：./deploy-to-aliyun.sh"
        exit 1
    fi
    success "所有进程已启动"

    # 关卡2：验证 Worker 初始化成功
    log "验证 Shop1 Worker 初始化..."
    if ! ssh_cmd "pm2 logs $PM2_SHOP1_WORKER --lines $LOG_SCAN_LINES --nostream | grep -q 'worker ready'"; then
        error "Shop1 Worker 未成功初始化"
        ssh_cmd "pm2 logs $PM2_SHOP1_WORKER --err --lines 30 --nostream"
        echo ""
        echo "📌 修复后重新运行：./deploy-to-aliyun.sh"
        exit 1
    fi

    log "验证 Shop2 Worker 初始化..."
    if ! ssh_cmd "pm2 logs $PM2_SHOP2_WORKER --lines $LOG_SCAN_LINES --nostream | grep -q 'worker ready'"; then
        error "Shop2 Worker 未成功初始化"
        ssh_cmd "pm2 logs $PM2_SHOP2_WORKER --err --lines 30 --nostream"
        echo ""
        echo "📌 修复后重新运行：./deploy-to-aliyun.sh"
        exit 1
    fi
    success "Worker 初始化成功"

    # 关卡3：验证 Redis 模式
    log "检查 Shop1 队列模式..."
    if ssh_cmd "pm2 logs $PM2_SHOP1 --lines $LOG_SCAN_LINES --nostream | grep -q '内存模式'" && \
       ssh_cmd "pm2 logs $PM2_SHOP1_WORKER --lines $LOG_SCAN_LINES --nostream | grep -q '内存模式'"; then
        error "Shop1 队列运行在内存模式（Redis 不可用）"
        echo ""
        echo "诊断步骤："
        echo "  redis-cli ping"
        echo "  systemctl status redis"
        echo "  cat /var/www/app1-fynony/.env | grep REDIS_URL"
        echo ""
        echo "📌 修复 Redis 后重新运行：./deploy-to-aliyun.sh"
        exit 1
    fi

    log "检查 Shop2 队列模式..."
    if ssh_cmd "pm2 logs $PM2_SHOP2 --lines $LOG_SCAN_LINES --nostream | grep -q '内存模式'" && \
       ssh_cmd "pm2 logs $PM2_SHOP2_WORKER --lines $LOG_SCAN_LINES --nostream | grep -q '内存模式'"; then
        error "Shop2 队列运行在内存模式（Redis 不可用）"
        echo ""
        echo "📌 修复 Redis 后重新运行：./deploy-to-aliyun.sh"
        exit 1
    fi
    success "队列运行在 Redis 模式"

    log "保存 PM2 配置..."
    ssh_cmd "pm2 save"

    success "应用启动完成"
}

# 健康检查
health_check() {
    phase "Phase 8: 健康检查"

    log "等待应用启动（${HEALTH_SLEEP_SECONDS}秒）..."
    sleep $HEALTH_SLEEP_SECONDS

    # 端点探测
    log "检查 Shop1 (端口3001)..."
    if ssh_cmd "curl -sf http://localhost:3001/healthz > /dev/null"; then
        success "Shop1 健康检查通过"
    else
        warning "Shop1 健康检查失败，请检查日志"
        ssh_cmd "pm2 logs $PM2_SHOP1 --lines 20 --nostream"
    fi

    log "检查 Shop2 (端口3002)..."
    if ssh_cmd "curl -sf http://localhost:3002/healthz > /dev/null"; then
        success "Shop2 健康检查通过"
    else
        warning "Shop2 健康检查失败，请检查日志"
        ssh_cmd "pm2 logs $PM2_SHOP2 --lines 20 --nostream"
    fi

    # 队列深度
    log "检查队列深度..."
    QUEUE_DEPTH=$(ssh_cmd "redis-cli --scan --pattern 'bull:translation_*:wait' | xargs -I{} redis-cli LLEN {} 2>/dev/null | awk '{s+=\$1} END {print s}'")

    if [ -z "$QUEUE_DEPTH" ]; then
        warning "无法获取队列深度（可能 Redis 不可用）"
    elif [ "$QUEUE_DEPTH" -gt "$QUEUE_BACKLOG_THRESHOLD" ]; then
        warning "队列积压较多：${QUEUE_DEPTH} 个任务（阈值: ${QUEUE_BACKLOG_THRESHOLD}）"
        echo "  建议：检查 Worker 日志确认是否正常消费"
        echo "  命令：pm2 logs $PM2_SHOP1_WORKER --lines 50"
    else
        success "队列深度正常：${QUEUE_DEPTH} 个任务"
    fi

    # Worker 状态
    log "检查队列 Worker 状态..."
    ssh_cmd "pm2 list | grep -E '$PM2_SHOP1_WORKER|$PM2_SHOP2_WORKER'"

    # 日志速览
    log "查看最近日志..."
    ssh_cmd "pm2 logs --lines 10 --nostream"
}

# 显示后续步骤
show_next_steps() {
    phase "部署完成！后续操作"

    echo ""
    success "🎉 代码同步和配置更新完成！"
    echo ""
    echo "📋 请按照以下步骤完成 Shopify 权限部署："
    echo ""
    echo "1️⃣  SSH 登录服务器："
    echo "   ssh -b $BIND_IP -i $SSH_KEY $SERVER_USER@$SERVER_IP"
    echo ""
    echo "2️⃣  部署 Shop1 到 Shopify："
    echo "   cd $REMOTE_SHOP1"
    echo "   shopify app deploy"
    echo "   # 按提示完成 OAuth 认证"
    echo ""
    echo "3️⃣  部署 Shop2 到 Shopify："
    echo "   cd $REMOTE_SHOP2"
    echo "   shopify app deploy"
    echo "   # 按提示完成 OAuth 认证"
    echo ""
    echo "4️⃣  验证部署："
    echo "   - 访问: https://fynony.ease-joy.fun"
    echo "   - 访问: https://onewind.ease-joy.fun"
    echo "   - 测试扫描和翻译功能"
    echo ""
    echo "5️⃣  监控应用："
    echo "   pm2 monit"
    echo "   pm2 logs"
    echo "   pm2 logs $PM2_SHOP1_WORKER --lines 20"
    echo "   pm2 logs $PM2_SHOP2_WORKER --lines 20"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ============ 主流程 ============
main() {
    log "开始多店铺部署流程..."

    check_connection
    stop_apps
    backup_data
    sync_code
    update_configs
    install_deps
    run_migrations
    start_apps
    health_check
    show_next_steps

    success "✨ 部署流程全部完成！"
}

# 执行主流程
main "$@"
