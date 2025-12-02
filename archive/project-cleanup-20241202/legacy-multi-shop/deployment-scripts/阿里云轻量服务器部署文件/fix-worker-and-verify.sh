#!/bin/bash
# Worker进程修复和验证脚本
# 根据诊断结果修复Worker启动问题并进行完整验证

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

# ============ 修复流程开始 ============
section "Phase 1: 连接验证"

log "测试SSH连接..."
if ssh_cmd "echo 'Connected'" >/dev/null 2>&1; then
    success "服务器连接正常"
else
    error "服务器连接失败，请检查网络"
    exit 1
fi

# ============ Worker脚本权限修复 ============
section "Phase 2: 修复脚本权限"

log "设置 Worker 脚本可执行权限..."
ssh_cmd "chmod +x /var/www/app1-fynony/scripts/translation-queue-worker.js"
ssh_cmd "chmod +x /var/www/app2-onewind/scripts/translation-queue-worker.js"
success "脚本权限已设置"

log "设置脚本所有者..."
ssh_cmd "chown -R root:root /var/www/app1-fynony/scripts/"
ssh_cmd "chown -R root:root /var/www/app2-onewind/scripts/"
success "脚本所有者已设置"

# ============ 环境变量验证 ============
section "Phase 3: 验证环境变量"

log "检查 Shop1 必需环境变量..."
SHOP1_SHOP_ID=$(ssh_cmd "cat /var/www/app1-fynony/.env | grep '^SHOP_ID=' | cut -d= -f2" || echo "")
SHOP1_REDIS_URL=$(ssh_cmd "cat /var/www/app1-fynony/.env | grep '^REDIS_URL=' | cut -d= -f2" || echo "")

if [ -z "$SHOP1_SHOP_ID" ]; then
    warning "Shop1 缺少 SHOP_ID，尝试补充..."
    ssh_cmd "echo 'SHOP_ID=shop1' >> /var/www/app1-fynony/.env"
fi

if [ -z "$SHOP1_REDIS_URL" ]; then
    error "Shop1 缺少 REDIS_URL，请手动配置"
    exit 1
fi

success "Shop1 环境变量检查通过"

log "检查 Shop2 必需环境变量..."
SHOP2_SHOP_ID=$(ssh_cmd "cat /var/www/app2-onewind/.env | grep '^SHOP_ID=' | cut -d= -f2" || echo "")
SHOP2_REDIS_URL=$(ssh_cmd "cat /var/www/app2-onewind/.env | grep '^REDIS_URL=' | cut -d= -f2" || echo "")

if [ -z "$SHOP2_SHOP_ID" ]; then
    warning "Shop2 缺少 SHOP_ID，尝试补充..."
    ssh_cmd "echo 'SHOP_ID=shop2' >> /var/www/app2-onewind/.env"
fi

if [ -z "$SHOP2_REDIS_URL" ]; then
    error "Shop2 缺少 REDIS_URL，请手动配置"
    exit 1
fi

success "Shop2 环境变量检查通过"

# ============ 重启Worker ============
section "Phase 4: 重启Worker进程"

log "删除现有Worker进程..."
ssh_cmd "pm2 delete shop1-translation-worker shop2-translation-worker || true"

log "等待3秒..."
sleep 3

log "从ecosystem配置重新启动Worker..."
ssh_cmd "pm2 start /var/www/ecosystem-simple.config.js --only shop1-translation-worker,shop2-translation-worker"

log "等待5秒让进程完全启动..."
sleep 5

success "Worker进程已重启"

# ============ 进程状态验证 ============
section "Phase 5: 进程状态验证"

log "获取PM2进程列表..."
ssh_cmd "pm2 list"

echo ""
log "检查Worker进程状态..."
WORKER1_STATUS=$(ssh_cmd "pm2 list | grep 'shop1-translation-worker' | grep -o 'online\\|stopped\\|errored'" || echo "unknown")
WORKER2_STATUS=$(ssh_cmd "pm2 list | grep 'shop2-translation-worker' | grep -o 'online\\|stopped\\|errored'" || echo "unknown")

echo "  Shop1 Worker: $WORKER1_STATUS"
echo "  Shop2 Worker: $WORKER2_STATUS"

if [ "$WORKER1_STATUS" != "online" ] || [ "$WORKER2_STATUS" != "online" ]; then
    error "Worker进程未能成功启动，查看错误日志："
    echo ""
    ssh_cmd "pm2 logs shop1-translation-worker --err --lines 20 --nostream"
    exit 1
fi

success "所有Worker进程在线"

# ============ Worker初始化验证 ============
section "Phase 6: Worker初始化验证"

log "等待10秒让Worker完全初始化..."
sleep 10

log "检查 Shop1 Worker 初始化日志..."
if ssh_cmd "pm2 logs shop1-translation-worker --lines 50 --nostream | grep -q 'worker ready\\|ready\\|初始化'"; then
    success "Shop1 Worker 初始化成功"
else
    warning "Shop1 Worker 初始化日志不确定，请手动检查"
fi

log "检查 Shop2 Worker 初始化日志..."
if ssh_cmd "pm2 logs shop2-translation-worker --lines 50 --nostream | grep -q 'worker ready\\|ready\\|初始化'"; then
    success "Shop2 Worker 初始化成功"
else
    warning "Shop2 Worker 初始化日志不确定，请手动检查"
fi

log "验证Redis模式（不应出现'内存模式'）..."
if ssh_cmd "pm2 logs shop1-translation-worker --lines 50 --nostream | grep -q '内存模式'"; then
    error "Shop1 Worker 运行在内存模式，Redis未连接"
    exit 1
fi

if ssh_cmd "pm2 logs shop2-translation-worker --lines 50 --nostream | grep -q '内存模式'"; then
    error "Shop2 Worker 运行在内存模式，Redis未连接"
    exit 1
fi

success "Worker运行在Redis模式"

# ============ 应用健康检查 ============
section "Phase 7: 应用健康检查"

log "检查 Shop1 API端点..."
if ssh_cmd "curl -sf http://localhost:3001/healthz > /dev/null"; then
    success "Shop1 API健康检查通过"
else
    warning "Shop1 API响应异常"
fi

log "检查 Shop2 API端点..."
if ssh_cmd "curl -sf http://localhost:3002/healthz > /dev/null"; then
    success "Shop2 API健康检查通过"
else
    warning "Shop2 API响应异常"
fi

# ============ Redis队列检查 ============
section "Phase 8: Redis队列检查"

log "检查Redis队列键..."
QUEUE_KEYS=$(ssh_cmd "redis-cli --scan --pattern 'bull:translation_*' | head -10" || echo "")

if [ -n "$QUEUE_KEYS" ]; then
    success "Redis队列键存在"
    echo "$QUEUE_KEYS" | while read key; do
        echo "  - $key"
    done
else
    warning "未找到Redis队列键（可能队列为空）"
fi

# ============ 保存PM2配置 ============
section "Phase 9: 保存PM2配置"

log "保存PM2进程列表..."
ssh_cmd "pm2 save"
success "PM2配置已保存"

# ============ 最终摘要 ============
section "修复完成摘要"

echo ""
success "🎉 Worker修复流程全部完成！"
echo ""
echo "📊 最终状态："
ssh_cmd "pm2 list | grep -E 'shop1|shop2'"
echo ""
echo "🔗 应用访问地址："
echo "  Shop1: https://fynony.ease-joy.fun"
echo "  Shop2: https://onewind.ease-joy.fun"
echo ""
echo "📋 后续操作："
echo "  1. 测试翻译功能（扫描+异步翻译）"
echo "  2. 监控Worker日志（pm2 logs shop1-translation-worker）"
echo "  3. 验证队列消费（检查翻译任务完成情况）"
echo ""
echo "🔍 监控命令："
echo "  pm2 monit                              # 实时监控"
echo "  pm2 logs --lines 20                    # 查看最近日志"
echo "  redis-cli LLEN bull:translation_shop1:wait  # 检查队列深度"
echo ""

success "✨ 部署验证全部完成！"
