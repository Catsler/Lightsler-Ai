#!/bin/bash
# 健康检查脚本
# 功能：检查两个店铺应用的健康状态

set -euo pipefail

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

error() {
    echo -e "${RED}❌${NC} $1"
}

# 配置
SHOP1_PORT=3001
SHOP2_PORT=3002
MAX_RETRIES=30
RETRY_INTERVAL=2

# 检查端口是否监听
check_port() {
    local port=$1
    netstat -tlnp 2>/dev/null | grep -q ":${port} " || lsof -i ":${port}" >/dev/null 2>&1
}

# 检查 API 端点
check_api() {
    local url=$1
    local max_retries=$2
    local retry=0

    while [ $retry -lt $max_retries ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            return 0
        fi
        ((retry++))
        sleep $RETRY_INTERVAL
    done

    return 1
}

# 获取 API 响应
get_api_response() {
    local url=$1
    curl -sf "$url" 2>/dev/null || echo "{}"
}

# 主检查函数
main() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "开始健康检查..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # 检查 PM2 进程状态
    log "检查 PM2 进程..."
    if ! command -v pm2 >/dev/null 2>&1; then
        error "PM2 未安装"
        exit 1
    fi

    local shop1_status=$(pm2 jlist | jq -r '.[] | select(.name=="shop1-fynony") | .pm2_env.status' 2>/dev/null || echo "unknown")
    local shop2_status=$(pm2 jlist | jq -r '.[] | select(.name=="shop2-onewind") | .pm2_env.status' 2>/dev/null || echo "unknown")

    if [[ "$shop1_status" == "online" ]]; then
        success "Shop1 进程状态: online"
    else
        error "Shop1 进程状态: $shop1_status"
    fi

    if [[ "$shop2_status" == "online" ]]; then
        success "Shop2 进程状态: online"
    else
        error "Shop2 进程状态: $shop2_status"
    fi

    echo ""

    # 检查端口监听
    log "检查端口监听..."
    if check_port $SHOP1_PORT; then
        success "Shop1 端口 $SHOP1_PORT 正在监听"
    else
        error "Shop1 端口 $SHOP1_PORT 未监听"
    fi

    if check_port $SHOP2_PORT; then
        success "Shop2 端口 $SHOP2_PORT 正在监听"
    else
        error "Shop2 端口 $SHOP2_PORT 未监听"
    fi

    echo ""

    # 检查 API 健康
    log "检查 Shop1 API (最多等待 ${MAX_RETRIES}x${RETRY_INTERVAL}s)..."
    if check_api "http://localhost:$SHOP1_PORT/api/health" $MAX_RETRIES; then
        success "Shop1 API 健康检查通过"

        # 获取详细状态
        local status_response=$(get_api_response "http://localhost:$SHOP1_PORT/api/status")
        if [ -n "$status_response" ] && [ "$status_response" != "{}" ]; then
            log "Shop1 状态详情："
            echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
        fi
    else
        error "Shop1 API 健康检查失败"
        warning "查看 Shop1 日志："
        pm2 logs shop1-fynony --lines 20 --nostream 2>/dev/null || true
    fi

    echo ""

    log "检查 Shop2 API (最多等待 ${MAX_RETRIES}x${RETRY_INTERVAL}s)..."
    if check_api "http://localhost:$SHOP2_PORT/api/health" $MAX_RETRIES; then
        success "Shop2 API 健康检查通过"

        # 获取详细状态
        local status_response=$(get_api_response "http://localhost:$SHOP2_PORT/api/status")
        if [ -n "$status_response" ] && [ "$status_response" != "{}" ]; then
            log "Shop2 状态详情："
            echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
        fi
    else
        error "Shop2 API 健康检查失败"
        warning "查看 Shop2 日志："
        pm2 logs shop2-onewind --lines 20 --nostream 2>/dev/null || true
    fi

    echo ""

    # 检查系统资源
    log "检查系统资源..."

    # 内存使用
    local mem_info=$(free -h | grep Mem)
    echo "💾 内存: $mem_info"

    # 磁盘使用
    local disk_info=$(df -h /var/www | tail -1)
    echo "💿 磁盘: $disk_info"

    # PM2 内存使用
    echo ""
    log "PM2 进程资源使用："
    pm2 list | grep -E 'shop1-fynony|shop2-onewind' || true

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    success "健康检查完成！"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # 返回状态码
    if [[ "$shop1_status" == "online" ]] && [[ "$shop2_status" == "online" ]]; then
        return 0
    else
        return 1
    fi
}

# 执行主函数
main "$@"