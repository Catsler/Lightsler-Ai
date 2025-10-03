#!/bin/bash
# 阿里云轻量服务器回滚脚本
# 功能：安全地回滚到指定版本

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

# ============ 回滚流程 ============

# 参数检查
ROLLBACK_TARGET=${1:-""}

if [ -z "$ROLLBACK_TARGET" ]; then
    error "请指定回滚目标（commit hash 或 tag）"
    echo ""
    echo "用法: $0 <commit-hash|tag>"
    echo "示例:"
    echo "  $0 abc1234              # 回滚到指定 commit"
    echo "  $0 v1.2.3               # 回滚到指定 tag"
    echo "  $0 HEAD~1               # 回滚到上一个 commit"
    echo ""
    echo "查看可用版本："
    echo "  git log --oneline -10   # 最近10次提交"
    echo "  git tag                 # 所有标签"
    exit 1
fi

# 确认回滚
phase "回滚确认"
warning "即将回滚到: $ROLLBACK_TARGET"
warning "此操作将："
echo "  1. 停止所有应用"
echo "  2. 回滚代码到指定版本"
echo "  3. 重新安装依赖"
echo "  4. 重启应用"
echo ""
read -p "确认继续？输入 'yes' 确认: " confirm

if [ "$confirm" != "yes" ]; then
    log "回滚已取消"
    exit 0
fi

# 停止应用
phase "Phase 1: 停止应用"
log "停止所有 PM2 进程..."
ssh_cmd "pm2 stop $PM2_SHOP1 $PM2_SHOP2 $PM2_SHOP1_WORKER $PM2_SHOP2_WORKER || true"
ssh_cmd "pm2 delete $PM2_SHOP1 $PM2_SHOP2 $PM2_SHOP1_WORKER $PM2_SHOP2_WORKER || true"
success "应用已停止"

# 备份当前状态
phase "Phase 2: 备份当前状态"
timestamp=$(date +%Y%m%d_%H%M%S)

log "备份当前代码版本..."
CURRENT_COMMIT=$(ssh_cmd "cd $REMOTE_LIGHTSLER_BASE && git rev-parse --short HEAD")
log "当前版本: $CURRENT_COMMIT"
echo "$CURRENT_COMMIT" > /tmp/rollback-from-${timestamp}.txt
success "已记录回滚前版本"

log "备份配置文件..."
ssh_cmd "cp $REMOTE_SHOP1/.env $REMOTE_BACKUP/shop1-rollback-${timestamp}.env 2>/dev/null || true"
ssh_cmd "cp $REMOTE_SHOP2/.env $REMOTE_BACKUP/shop2-rollback-${timestamp}.env 2>/dev/null || true"
success "配置文件备份完成"

# 回滚代码
phase "Phase 3: 回滚代码"
log "获取最新远程信息..."
ssh_cmd "cd $REMOTE_LIGHTSLER_BASE && git fetch --all --tags"

log "回滚到: $ROLLBACK_TARGET"
ssh_cmd "cd $REMOTE_LIGHTSLER_BASE && git checkout $ROLLBACK_TARGET" || {
    error "回滚失败：无法切换到 $ROLLBACK_TARGET"
    error "请检查版本号是否正确"
    exit 1
}

ROLLBACK_COMMIT=$(ssh_cmd "cd $REMOTE_LIGHTSLER_BASE && git rev-parse --short HEAD")
success "代码已回滚到: $ROLLBACK_COMMIT"

# 同步代码到各店铺
log "同步代码到 Shop1..."
ssh_cmd "rsync -a --delete --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='*.sqlite' --exclude='logs' $REMOTE_LIGHTSLER_BASE/ $REMOTE_SHOP1/"
success "Shop1 代码同步完成"

log "同步代码到 Shop2..."
ssh_cmd "rsync -a --delete --exclude='.git' --exclude='node_modules' --exclude='.env' --exclude='*.sqlite' --exclude='logs' $REMOTE_LIGHTSLER_BASE/ $REMOTE_SHOP2/"
success "Shop2 代码同步完成"

# 重新安装依赖
phase "Phase 4: 重新安装依赖"
log "安装 Shop1 依赖..."
ssh_cmd "cd $REMOTE_SHOP1 && npm ci" || {
    error "Shop1 依赖安装失败"
    exit 1
}
success "Shop1 依赖安装完成"

log "安装 Shop2 依赖..."
ssh_cmd "cd $REMOTE_SHOP2 && npm ci" || {
    error "Shop2 依赖安装失败"
    exit 1
}
success "Shop2 依赖安装完成"

# 数据库检查（不自动迁移）
phase "Phase 5: 数据库检查"
warning "⚠️ 回滚可能需要数据库回滚，请手动检查"
echo "  如需回滚数据库，请执行："
echo "  1. SSH登录服务器"
echo "  2. 恢复数据库备份：psql < $REMOTE_BACKUP/db-backup-TIMESTAMP.sql"
echo ""
read -p "数据库无需回滚，按回车继续... "

# 启动应用
phase "Phase 6: 启动应用"
log "启动 PM2 进程..."
ssh_cmd "cd $REMOTE_BASE && pm2 start $REMOTE_ECOSYSTEM" || {
    error "应用启动失败"
    exit 1
}

log "等待进程启动..."
sleep 10

# 验证状态
phase "Phase 7: 验证回滚结果"
log "检查进程状态..."
ssh_cmd "pm2 status"

log "检查应用健康..."
if ssh_cmd "curl -sf http://localhost:3001/api/status > /dev/null"; then
    success "Shop1 健康检查通过"
else
    warning "Shop1 健康检查失败"
fi

if ssh_cmd "curl -sf http://localhost:3002/api/status > /dev/null"; then
    success "Shop2 健康检查通过"
else
    warning "Shop2 健康检查失败"
fi

# 显示回滚总结
phase "回滚完成"
success "✨ 代码已回滚到 $ROLLBACK_COMMIT"
echo ""
echo "回滚信息："
echo "  原版本: $CURRENT_COMMIT"
echo "  新版本: $ROLLBACK_COMMIT"
echo "  备份位置: $REMOTE_BACKUP/*-rollback-${timestamp}.*"
echo ""
echo "后续操作："
echo "  1. 检查应用日志: pm2 logs --lines 50"
echo "  2. 验证功能正常"
echo "  3. 如需再次回滚: $0 <version>"
echo ""

success "回滚流程全部完成！"
