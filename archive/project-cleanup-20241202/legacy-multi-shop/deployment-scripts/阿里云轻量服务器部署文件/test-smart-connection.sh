#!/bin/bash
# 智能路由连接测试脚本
# 验证智能检测函数是否正常工作

set -euo pipefail

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[测试]${NC} $1"; }
success() { echo -e "${GREEN}✅${NC} $1"; }
warning() { echo -e "${YELLOW}⚠️${NC} $1"; }
error() { echo -e "${RED}❌${NC} $1"; }

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "智能路由绕过VPN连接测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 智能检测函数
detect_bypass_vpn_ip() {
    local target_ip="${1:-47.79.77.128}"

    # 查询到目标服务器的路由接口
    local interface=$(route -n get "$target_ip" 2>/dev/null | grep 'interface:' | awk '{print $2}')

    # 排除VPN虚拟网卡（utun开头）
    if [ -n "$interface" ] && [[ ! "$interface" =~ ^utun ]]; then
        # 获取该接口的IP地址
        local bind_ip=$(ifconfig "$interface" 2>/dev/null | grep "inet " | grep -v "inet6" | awk '{print $2}')

        if [ -n "$bind_ip" ]; then
            echo "$bind_ip"
            return 0
        fi
    fi

    # 降级方案：扫描物理网卡
    for iface in en0 en1 en2; do
        local ip=$(ifconfig "$iface" 2>/dev/null | grep "inet " | grep -v "inet6" | awk '{print $2}')
        if [[ "$ip" =~ ^192\.168\. ]] || [[ "$ip" =~ ^10\. ]]; then
            echo "$ip"
            return 0
        fi
    done

    # 无可用IP
    echo ""
    return 1
}

# 测试1: 查看路由信息
log "测试1: 查看到服务器的路由信息"
echo ""
route -n get 47.79.77.128 | grep -E 'route to|gateway|interface|flags'
echo ""

# 测试2: 智能检测绑定IP
log "测试2: 智能检测绕过VPN的绑定IP"
BIND_IP=$(detect_bypass_vpn_ip "47.79.77.128")

if [ -n "$BIND_IP" ]; then
    success "检测到绑定IP: $BIND_IP"

    # 获取接口名称
    INTERFACE=$(route -n get 47.79.77.128 | grep 'interface:' | awk '{print $2}')
    echo "  网络接口: $INTERFACE"

    # 判断是否为VPN
    if [[ "$INTERFACE" =~ ^utun ]]; then
        warning "当前路由走VPN虚拟网卡"
    else
        success "当前路由走物理网卡（已绕过VPN）"
    fi
else
    error "无法检测到可用的物理网卡IP"
    exit 1
fi

echo ""

# 测试3: SSH连接测试
log "测试3: 测试SSH连接（5秒超时）"
SERVER_IP="47.79.77.128"
SSH_KEY="/Users/elie/Downloads/shopify.pem"

if timeout 5 ssh -b "$BIND_IP" -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@"$SERVER_IP" "echo 'Connection successful'" 2>/dev/null; then
    success "SSH连接成功（使用绑定IP: $BIND_IP）"
else
    error "SSH连接失败（可能服务器不可达或网络问题）"
    echo ""
    warning "这不一定是智能检测的问题，可能是："
    echo "  1. 服务器当前不可达"
    echo "  2. 防火墙阻止连接"
    echo "  3. SSH密钥路径不正确"
    exit 1
fi

echo ""

# 测试4: 对比直连和绑定IP连接
log "测试4: 对比直连（可能走VPN）和绑定IP连接"
echo ""

echo "方式1: 直连（不指定绑定IP）"
if timeout 3 ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=3 root@"$SERVER_IP" "hostname" 2>/dev/null; then
    success "直连成功"
else
    warning "直连失败（可能走VPN被阻断）"
fi

echo ""
echo "方式2: 绑定IP连接（强制走物理网卡）"
if timeout 3 ssh -b "$BIND_IP" -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=3 root@"$SERVER_IP" "hostname" 2>/dev/null; then
    success "绑定IP连接成功（已绕过VPN）"
else
    error "绑定IP连接失败"
fi

echo ""

# 测试5: 显示所有可用网卡IP
log "测试5: 显示所有可用网卡IP"
echo ""
echo "物理网卡："
for iface in en0 en1 en2; do
    ip=$(ifconfig "$iface" 2>/dev/null | grep "inet " | grep -v "inet6" | awk '{print $2}')
    if [ -n "$ip" ]; then
        echo "  $iface: $ip"
    fi
done

echo ""
echo "VPN虚拟网卡："
for iface in utun0 utun1 utun2 utun3; do
    ip=$(ifconfig "$iface" 2>/dev/null | grep "inet " | grep -v "inet6" | awk '{print $2}')
    if [ -n "$ip" ]; then
        echo "  $iface: $ip"
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "测试完成！"
echo ""
echo "📋 测试结果摘要："
echo "  检测到的绑定IP: $BIND_IP"
echo "  网络接口: $(route -n get 47.79.77.128 | grep 'interface:' | awk '{print $2}')"
echo "  SSH连接状态: $(timeout 3 ssh -b "$BIND_IP" -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=3 root@"$SERVER_IP" "echo OK" 2>/dev/null || echo "FAILED")"
echo ""
