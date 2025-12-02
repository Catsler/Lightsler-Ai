#!/bin/bash
# =============================================================================
# 阿里云服务器路由配置脚本
# =============================================================================
# 功能：添加静态路由，绕过 VPN 直连阿里云服务器
# 用法：sudo ./setup-aliyun-route.sh
# =============================================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# 检查 sudo 权限
if [ "$EUID" -ne 0 ]; then
    error "请使用 sudo 运行此脚本: sudo $0"
fi

# 目标服务器 IP
TARGET_IP="47.79.77.128"

echo "=================================================="
echo "  阿里云服务器路由配置"
echo "=================================================="
echo "目标服务器: $TARGET_IP"
echo ""

# 1. 获取本地网关（排除 VPN 虚拟网卡）
echo "🔍 检测本地网关..."
GATEWAY=$(netstat -rn | grep "^default" | grep -v "utun" | head -1 | awk '{print $2}')

if [ -z "$GATEWAY" ]; then
    error "无法检测到本地网关，请检查网络连接"
fi

log "本地网关: $GATEWAY"
echo ""

# 2. 查看当前到目标服务器的路由
echo "🔍 当前路由状态:"
echo "---------------------------------------------------"
route -n get $TARGET_IP 2>/dev/null || warning "目标服务器无路由条目"
echo "---------------------------------------------------"
echo ""

# 3. 删除可能存在的旧路由（避免冲突）
echo "🧹 清理旧路由..."
if route -n delete -host $TARGET_IP 2>/dev/null; then
    warning "已删除旧路由"
else
    log "无旧路由，跳过"
fi
echo ""

# 4. 添加新的主机路由
echo "➕ 添加静态路由..."
if route -n add -host $TARGET_IP $GATEWAY; then
    log "路由添加成功: $TARGET_IP -> $GATEWAY"
else
    error "路由添加失败"
fi
echo ""

# 5. 验证路由生效
echo "✅ 验证路由配置:"
echo "---------------------------------------------------"
CURRENT_GATEWAY=$(route -n get $TARGET_IP 2>/dev/null | grep "gateway:" | awk '{print $2}')
route -n get $TARGET_IP

if [ "$CURRENT_GATEWAY" = "$GATEWAY" ]; then
    log "路由验证成功，流量将绕过 VPN"
else
    warning "路由网关为 $CURRENT_GATEWAY，期望 $GATEWAY"
fi
echo "---------------------------------------------------"
echo ""

# 6. 测试 SSH 连接
echo "🔐 测试 SSH 连接..."
if timeout 5 ssh -o ConnectTimeout=5 -o BatchMode=yes lightsler "echo '连接成功' && hostname" 2>/dev/null; then
    log "SSH 连接测试成功！"
else
    warning "SSH 连接测试失败，可能仍需配置服务器安全组"
    warning "请登录阿里云控制台，添加当前公网 IP 到白名单"
    echo ""
    echo "获取当前公网 IP："
    echo "  curl --interface en0 ifconfig.me"
fi
echo ""

echo "=================================================="
log "路由配置完成"
echo "=================================================="
echo ""
echo "💡 提示："
echo "  - 此路由在系统重启后会失效"
echo "  - VPN 重连可能覆盖此路由"
echo "  - 如需持久化，请使用 LaunchDaemon 方案"
echo ""
echo "查看路由："
echo "  route -n get $TARGET_IP"
echo ""
echo "删除路由："
echo "  sudo route -n delete -host $TARGET_IP"
echo ""
