#!/bin/bash
# 队列环境隔离修复 - 部署脚本
# 生成时间: $(date)

set -euo pipefail

# 配置
SERVER_IP="47.79.77.128"
SERVER_USER="root"
SSH_KEY="/Users/elie/Downloads/shopify.pem"
SHOP1_DIR="/var/www/app1-fynony"
SHOP2_DIR="/var/www/app2-onewind"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ❌${NC} $1"
}

# 检查SSH连接
log "检查服务器连接..."
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$SERVER_USER@$SERVER_IP" "echo '连接成功'" &>/dev/null; then
    error "无法连接到服务器 $SERVER_IP"
    echo ""
    echo "请检查："
    echo "  1. 服务器是否开机"
    echo "  2. 网络连接是否正常"
    echo "  3. SSH密钥权限: chmod 400 $SSH_KEY"
    echo ""
    exit 1
fi

log "✅ 服务器连接正常"

# 同步修改的文件到shop1
log "同步文件到 shop1 (fynony)..."
rsync -avz -e "ssh -i $SSH_KEY" \
    app/utils/redis-parser.server.js \
    "$SERVER_USER@$SERVER_IP:$SHOP1_DIR/app/utils/"

rsync -avz -e "ssh -i $SSH_KEY" \
    scripts/translation-queue-worker.js \
    "$SERVER_USER@$SERVER_IP:$SHOP1_DIR/scripts/"

rsync -avz -e "ssh -i $SSH_KEY" \
    app/services/queue.server.js \
    "$SERVER_USER@$SERVER_IP:$SHOP1_DIR/app/services/"

# 同步修改的文件到shop2
log "同步文件到 shop2 (onewind)..."
rsync -avz -e "ssh -i $SSH_KEY" \
    app/utils/redis-parser.server.js \
    "$SERVER_USER@$SERVER_IP:$SHOP2_DIR/app/utils/"

rsync -avz -e "ssh -i $SSH_KEY" \
    scripts/translation-queue-worker.js \
    "$SERVER_USER@$SERVER_IP:$SHOP2_DIR/scripts/"

rsync -avz -e "ssh -i $SSH_KEY" \
    app/services/queue.server.js \
    "$SERVER_USER@$SERVER_IP:$SHOP2_DIR/app/services/"

log "✅ 文件同步完成"

# 重启Worker进程
log "重启Worker进程..."
ssh -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" << 'ENDSSH'
    echo "🔄 重启shop1 Worker..."
    pm2 restart shop1-translation-worker 2>/dev/null || echo "⚠️ shop1-translation-worker未运行"

    echo "🔄 重启shop2 Worker..."
    pm2 restart shop2-translation-worker 2>/dev/null || echo "⚠️ shop2-translation-worker未运行"

    echo ""
    echo "📊 PM2进程状态:"
    pm2 list | grep -E "shop|worker|translation"

    echo ""
    echo "✅ Worker重启完成"
ENDSSH

log "✅ 部署完成！"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 环境隔离修复已部署"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "修改内容："
echo "  ✅ Redis DB环境隔离（本地DB10，shop1 DB11，shop2 DB2）"
echo "  ✅ Worker错误处理增强（跨环境资源访问保护）"
echo "  ✅ 统一DB分配逻辑"
echo ""
echo "下一步："
echo "  1. 监控队列处理: node -e \"require('./check-queue.js')\""
echo "  2. 查看Worker日志: ssh -i $SSH_KEY root@$SERVER_IP 'pm2 logs worker'"
echo "  3. 等待队列处理完成（约2-3小时，419个任务）"
echo ""
