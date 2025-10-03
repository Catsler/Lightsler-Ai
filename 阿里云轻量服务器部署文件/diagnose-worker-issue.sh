#!/bin/bash
# Worker进程启动失败诊断脚本
# 用于诊断PM2 Worker进程启动失败的原因

set -euo pipefail

# ============ 配置区域 ============
SERVER_IP="47.79.77.128"
SERVER_USER="root"
SSH_KEY="/Users/elie/Downloads/shopify.pem"

# 自动检测可用的本地IP
detect_bind_ip() {
    local interface=$(route -n get default 2>/dev/null | grep interface | awk '{print $2}')
    if [ -n "$interface" ]; then
        ifconfig "$interface" | grep "inet " | awk '{print $2}' | head -1
    else
        echo ""
    fi
}

BIND_IP=$(detect_bind_ip)

if [ -z "$BIND_IP" ]; then
    echo "⚠️  无法自动检测绑定IP，尝试不绑定IP连接..."
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no"
else
    echo "✅ 使用绑定IP: $BIND_IP"
    SSH_OPTS="-b $BIND_IP -i $SSH_KEY -o StrictHostKeyChecking=no"
fi

# ============ 颜色定义 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# ============ 日志函数 ============
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }
warning() { echo -e "${YELLOW}⚠️${NC} $1"; }
error() { echo -e "${RED}❌${NC} $1"; }
section() {
    echo ""
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}$1${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# ============ SSH包装函数 ============
ssh_cmd() {
    ssh $SSH_OPTS "$SERVER_USER@$SERVER_IP" "$@"
}

# ============ 诊断开始 ============
section "Phase 1: 网络连接测试"

log "测试SSH连接..."
if ssh_cmd "echo 'Connected'" >/dev/null 2>&1; then
    success "服务器连接正常"
else
    error "服务器连接失败"
    exit 1
fi

# ============ PM2状态检查 ============
section "Phase 2: PM2进程状态"

log "获取PM2进程列表..."
ssh_cmd "pm2 list"

echo ""
log "统计进程状态..."
ONLINE_COUNT=$(ssh_cmd "pm2 list | grep -E 'shop1|shop2' | grep -c 'online'" || echo 0)
STOPPED_COUNT=$(ssh_cmd "pm2 list | grep -E 'shop1|shop2' | grep -c 'stopped'" || echo 0)

echo "  📊 在线进程: $ONLINE_COUNT"
echo "  ⏸️  停止进程: $STOPPED_COUNT"

# ============ Worker错误日志 ============
section "Phase 3: Worker错误日志分析"

log "查看 Shop1 Worker 错误日志..."
echo ""
echo "━━━ Shop1 Worker 错误日志 (最近30行) ━━━"
ssh_cmd "pm2 logs shop1-translation-worker --err --lines 30 --nostream" || warning "无错误日志或进程不存在"

echo ""
log "查看 Shop1 Worker 标准输出..."
echo ""
echo "━━━ Shop1 Worker 标准输出 (最近30行) ━━━"
ssh_cmd "pm2 logs shop1-translation-worker --out --lines 30 --nostream" || warning "无输出日志"

echo ""
log "查看 Shop2 Worker 错误日志..."
echo ""
echo "━━━ Shop2 Worker 错误日志 (最近30行) ━━━"
ssh_cmd "pm2 logs shop2-translation-worker --err --lines 30 --nostream" || warning "无错误日志或进程不存在"

# ============ Worker脚本检查 ============
section "Phase 4: Worker脚本文件检查"

log "检查 Shop1 Worker 脚本..."
if ssh_cmd "ls -lh /var/www/app1-fynony/scripts/translation-queue-worker.js" 2>/dev/null; then
    success "Shop1 Worker脚本存在"

    log "查看脚本前15行（检查语法）..."
    ssh_cmd "head -15 /var/www/app1-fynony/scripts/translation-queue-worker.js"
else
    error "Shop1 Worker脚本不存在"
fi

echo ""
log "检查 Shop2 Worker 脚本..."
if ssh_cmd "ls -lh /var/www/app2-onewind/scripts/translation-queue-worker.js" 2>/dev/null; then
    success "Shop2 Worker脚本存在"
else
    error "Shop2 Worker脚本不存在"
fi

# ============ 环境变量检查 ============
section "Phase 5: 环境变量配置检查"

log "检查 Shop1 环境变量..."
echo ""
echo "━━━ Shop1 关键环境变量 ━━━"
ssh_cmd "cat /var/www/app1-fynony/.env | grep -E 'SHOP_ID|SHOP_PREFIX|REDIS_URL|REDIS_ENABLED|PORT|NODE_ENV'"

echo ""
log "检查 Shop2 环境变量..."
echo ""
echo "━━━ Shop2 关键环境变量 ━━━"
ssh_cmd "cat /var/www/app2-onewind/.env | grep -E 'SHOP_ID|SHOP_PREFIX|REDIS_URL|REDIS_ENABLED|PORT|NODE_ENV'"

# ============ Redis连接测试 ============
section "Phase 6: Redis连接测试"

log "测试 Redis 连接..."
REDIS_URL=$(ssh_cmd "cat /var/www/app1-fynony/.env | grep '^REDIS_URL=' | cut -d= -f2" | tr -d '"')

if [ -n "$REDIS_URL" ]; then
    echo "  Redis URL: $REDIS_URL"

    if ssh_cmd "redis-cli -u '$REDIS_URL' ping" 2>/dev/null; then
        success "Redis连接正常"
    else
        error "Redis连接失败"
    fi
else
    warning "未找到REDIS_URL配置"
fi

# ============ PM2配置检查 ============
section "Phase 7: PM2 Ecosystem配置检查"

log "检查 PM2 配置文件..."
if ssh_cmd "ls -lh /var/www/ecosystem-simple.config.js" 2>/dev/null; then
    success "PM2配置文件存在"

    log "查看 Worker 相关配置..."
    ssh_cmd "grep -A 20 'shop1-translation-worker' /var/www/ecosystem-simple.config.js" || true
else
    error "PM2配置文件不存在"
fi

# ============ 手动启动测试 ============
section "Phase 8: 手动启动测试建议"

echo ""
echo "🔧 建议手动测试步骤："
echo ""
echo "1. SSH登录服务器："
echo "   ssh $SSH_OPTS $SERVER_USER@$SERVER_IP"
echo ""
echo "2. 进入Shop1目录："
echo "   cd /var/www/app1-fynony"
echo ""
echo "3. 手动启动Worker（前台测试）："
echo "   node scripts/translation-queue-worker.js"
echo ""
echo "4. 查看输出是否有错误信息"
echo ""
echo "5. 如果成功，使用Ctrl+C退出，然后重启PM2 Worker："
echo "   pm2 restart shop1-translation-worker shop2-translation-worker"
echo ""

# ============ 诊断摘要 ============
section "诊断摘要"

echo "✅ 已完成以下检查："
echo "  1. SSH连接测试"
echo "  2. PM2进程状态"
echo "  3. Worker错误日志"
echo "  4. Worker脚本文件"
echo "  5. 环境变量配置"
echo "  6. Redis连接"
echo "  7. PM2配置文件"
echo ""
echo "📋 请根据上述诊断结果修复问题，常见问题："
echo "  - ESM模块导入错误：检查脚本第1行是否为 'import' 语句"
echo "  - Redis连接失败：检查REDIS_URL格式和Railway服务状态"
echo "  - 环境变量缺失：补充SHOP_ID、SHOP_PREFIX等必需变量"
echo "  - 脚本权限问题：执行 chmod +x scripts/*.js"
echo ""

success "诊断完成！"
