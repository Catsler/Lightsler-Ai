#!/bin/bash

# 高级：代码同步到轻量阿里云服务器脚本
# 用途：将当前项目的最新代码同步到多店铺环境并收集实时错误日志

set -euo pipefail

# ============ 路径配置 ============
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LOCAL_PROJECT=$(cd "$SCRIPT_DIR/.." && pwd)
LOG_ROOT="$LOCAL_PROJECT/logs"
mkdir -p "$LOG_ROOT"

# ============ 服务器配置 ============
SERVER_IP="47.79.77.128"
SERVER_USER="root"
SSH_KEY="${SSH_KEY:-/Users/elie/Downloads/shopify.pem}"

REMOTE_BASE="/var/www"
REMOTE_BASE_REPO="$REMOTE_BASE/lightsler-base"
REMOTE_SHOP1="$REMOTE_BASE/app1-fynony"
REMOTE_SHOP2="$REMOTE_BASE/app2-onewind"
REMOTE_ECOSYSTEM="$REMOTE_BASE/ecosystem-simple.config.js"

PM2_SHOP1="shop1-fynony"
PM2_SHOP2="shop2-onewind"
PM2_SHOP1_WORKER="shop1-worker"
PM2_SHOP2_WORKER="shop2-worker"

# ============ 日志与颜色 ============
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }
warning() { echo -e "${YELLOW}⚠️${NC} $1"; }
error() { echo -e "${RED}❌${NC} $1"; }

# ============ 网络辅助函数 ============
detect_bind_ip() {
    local interface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
    if [[ -n "$interface" && ! "$interface" =~ ^utun ]]; then
        local ip=$(ifconfig "$interface" 2>/dev/null | awk '/inet /{print $2}' | head -1)
        if [[ -n "$ip" ]]; then
            echo "$ip"
            return 0
        fi
    fi

    for iface in en0 en1 en2; do
        local ip=$(ifconfig "$iface" 2>/dev/null | awk '/inet /{print $2}' | head -1)
        if [[ -n "$ip" && ! "$ip" =~ ^(127\.|0\.) ]]; then
            echo "$ip"
            return 0
        fi
    done

    echo ""
    return 1
}

BIND_IP=${BIND_IP:-$(detect_bind_ip)}

SSH_ARGS=(-i "$SSH_KEY" -o "StrictHostKeyChecking=no" -o "ServerAliveInterval=30" -o "ServerAliveCountMax=4")
if [[ -n "$BIND_IP" ]]; then
    SSH_ARGS=("-b" "$BIND_IP" "${SSH_ARGS[@]}")
    log "使用绑定IP: $BIND_IP (自动绕过VPN)"
else
    warning "未检测到可用物理网卡IP，尝试直接连接"
fi

SSH_CMD_STR="ssh ${SSH_ARGS[*]}"

ssh_cmd() {
    ssh "${SSH_ARGS[@]}" "$SERVER_USER@$SERVER_IP" "$@"
}

rsync_project() {
    rsync -av --delete \
        --exclude '.git/' \
        --exclude 'node_modules/' \
        --exclude 'build/' \
        --exclude 'logs/' \
        --exclude '.env' \
        --exclude '.env.*' \
        --exclude 'shopify.app.toml' \
        --exclude 'shopify.web.toml' \
        --exclude '阿里云轻量服务器部署文件/logs/' \
        -e "$SSH_CMD_STR" \
        "$LOCAL_PROJECT/" "$SERVER_USER@$SERVER_IP:$REMOTE_BASE_REPO/"
}

# ============ 步骤函数 ============
check_prerequisites() {
    log "检查本地环境..."
    command -v rsync >/dev/null || { error "缺少 rsync 命令"; exit 1; }
    [[ -f "$SSH_KEY" ]] || { error "SSH密钥不存在: $SSH_KEY"; exit 1; }
    log "本地环境检查通过"
}

check_connection() {
    log "测试服务器连接..."
    if ssh_cmd "echo 'connected'" >/dev/null 2>&1; then
        success "服务器连接正常"
    else
        error "无法连接到服务器 $SERVER_IP"
        exit 1
    fi

    log "确认远程目录存在..."
    ssh_cmd "mkdir -p $REMOTE_BASE_REPO $REMOTE_SHOP1 $REMOTE_SHOP2"
    success "远程目录准备完成"
}

sync_project() {
    log "同步项目代码到基线目录 ($REMOTE_BASE_REPO)..."
    rsync_project
    success "基线目录同步完成"
}

propagate_to_shops() {
    log "分发代码到 Shop1..."
    ssh_cmd "rsync -a --delete --exclude='.env' --exclude='.env.*' --exclude='node_modules/' --exclude='shopify.app.toml' --exclude='prisma/dev.sqlite' $REMOTE_BASE_REPO/ $REMOTE_SHOP1/"
    success "Shop1 同步完成"

    log "分发代码到 Shop2..."
    ssh_cmd "rsync -a --delete --exclude='.env' --exclude='.env.*' --exclude='node_modules/' --exclude='shopify.app.toml' --exclude='prisma/dev.sqlite' $REMOTE_BASE_REPO/ $REMOTE_SHOP2/"
    success "Shop2 同步完成"
}

update_pm2_config() {
    log "更新 PM2 配置文件..."
    ssh_cmd "cp $REMOTE_BASE_REPO/阿里云轻量服务器部署文件/ecosystem.config.js $REMOTE_ECOSYSTEM"
    ssh_cmd "mkdir -p /var/www/app1-fynony/logs /var/www/app2-onewind/logs"
    success "PM2 配置更新完成"
}

install_dependencies() {
    if [[ "${SKIP_INSTALL:-false}" == "true" ]]; then
        warning "跳过依赖安装 (SKIP_INSTALL=true)"
        return
    fi

    log "安装 Shop1 依赖..."
    ssh_cmd "cd $REMOTE_SHOP1 && npm install"
    success "Shop1 依赖安装完成"

    log "安装 Shop2 依赖..."
    ssh_cmd "cd $REMOTE_SHOP2 && npm install"
    success "Shop2 依赖安装完成"
}

run_migrations() {
    if [[ "${SKIP_MIGRATE:-false}" == "true" ]]; then
        warning "跳过数据库迁移 (SKIP_MIGRATE=true)"
        return
    fi

    log "执行 Shop1 Prisma 迁移..."
    ssh_cmd "cd $REMOTE_SHOP1 && npx prisma generate && npx prisma migrate deploy"
    log "执行 Shop2 Prisma 迁移..."
    ssh_cmd "cd $REMOTE_SHOP2 && npx prisma generate && npx prisma migrate deploy"
    success "Prisma 迁移全部完成"
}

reload_pm2() {
    log "重新加载 PM2 进程..."
    ssh_cmd "pm2 reload $REMOTE_ECOSYSTEM --only $PM2_SHOP1,$PM2_SHOP2,$PM2_SHOP1_WORKER,$PM2_SHOP2_WORKER --update-env" \
        || ssh_cmd "pm2 start $REMOTE_ECOSYSTEM --only $PM2_SHOP1,$PM2_SHOP2,$PM2_SHOP1_WORKER,$PM2_SHOP2_WORKER"
    success "PM2 进程已重新加载"
}

collect_error_logs() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local output_dir="$LOG_ROOT/server-sync-$timestamp"
    mkdir -p "$output_dir"

    log "收集真实店铺运行时错误日志..."
    ssh_cmd "pm2 logs $PM2_SHOP1 --err --lines 60 --nostream" > "$output_dir/shop1-app.err.log" || true
    ssh_cmd "pm2 logs $PM2_SHOP2 --err --lines 60 --nostream" > "$output_dir/shop2-app.err.log" || true
    ssh_cmd "pm2 logs $PM2_SHOP1_WORKER --err --lines 80 --nostream" > "$output_dir/shop1-worker.err.log" || true
    ssh_cmd "pm2 logs $PM2_SHOP2_WORKER --err --lines 80 --nostream" > "$output_dir/shop2-worker.err.log" || true
    ssh_cmd "pm2 logs $PM2_SHOP1_WORKER --lines 40 --nostream | tail -n 40" > "$output_dir/shop1-worker.out.log" || true
    ssh_cmd "pm2 logs $PM2_SHOP2_WORKER --lines 40 --nostream | tail -n 40" > "$output_dir/shop2-worker.out.log" || true

    # 队列快照（分别采集 Fynony 与 OneWind，并追加详细失败信息）
    ssh_cmd "cd $REMOTE_SHOP1 && NODE_PATH=./node_modules node $REMOTE_BASE_REPO/check-fynony-db11.cjs" > "$output_dir/queue-status.txt" || true
    ssh_cmd "cd $REMOTE_SHOP2 && NODE_PATH=./node_modules node $REMOTE_BASE_REPO/check-onewind-db2.cjs" >> "$output_dir/queue-status.txt" || true
    ssh_cmd "cd $REMOTE_SHOP2 && NODE_PATH=./node_modules node $REMOTE_BASE_REPO/check-queue-status.cjs" >> "$output_dir/queue-status.txt" || true

    success "日志已保存到: $output_dir"
}

show_summary() {
    echo ""
    success "🎉 同步完成"
    echo "📂 远程基线目录: $REMOTE_BASE_REPO"
    echo "📂 Shop1 目录: $REMOTE_SHOP1"
    echo "📂 Shop2 目录: $REMOTE_SHOP2"
    echo "🗂  日志目录: $LOG_ROOT"
    echo ""
    echo "下一步建议："
    echo "  1. 查看日志: tail -n 20 $LOG_ROOT/server-sync-*/shop*-*.log"
    echo "  2. Shopify 后台验证翻译功能"
    echo "  3. 如需跳过 npm/prisma，可设置 SKIP_INSTALL=true 或 SKIP_MIGRATE=true"
}

main() {
    check_prerequisites
    check_connection
    sync_project
    propagate_to_shops
    update_pm2_config
    install_dependencies
    run_migrations
    reload_pm2
    collect_error_logs
    show_summary
}

main "$@"
