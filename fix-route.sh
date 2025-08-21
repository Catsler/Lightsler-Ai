#!/bin/bash

# 修复阿里云服务器路由配置
# 适配当前网络环境：192.168.31.x

echo "🔧 修复阿里云服务器路由配置"
echo "================================"
echo ""

# 服务器信息
SERVER_IP="47.79.77.128"
CURRENT_GATEWAY="192.168.31.1"  # 当前网段的正确网关

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}当前网络信息：${NC}"
echo "本地IP: $(ipconfig getifaddr en0)"
echo "目标服务器: $SERVER_IP"
echo "使用网关: $CURRENT_GATEWAY"
echo ""

# 检查当前路由
echo -e "${YELLOW}检查当前路由状态...${NC}"
CURRENT_ROUTE=$(route get $SERVER_IP 2>/dev/null | grep gateway | awk '{print $2}')

if [ ! -z "$CURRENT_ROUTE" ]; then
    echo "发现现有路由: gateway = $CURRENT_ROUTE"
    
    if [ "$CURRENT_ROUTE" != "$CURRENT_GATEWAY" ]; then
        echo -e "${YELLOW}需要更新路由配置${NC}"
        echo "删除旧路由..."
        sudo route delete -host $SERVER_IP 2>/dev/null
    else
        echo -e "${GREEN}路由已正确配置${NC}"
    fi
else
    echo "未发现现有路由"
fi

# 添加正确的路由
echo ""
echo -e "${YELLOW}添加新路由...${NC}"
sudo route add -host $SERVER_IP $CURRENT_GATEWAY

# 验证路由
echo ""
echo -e "${YELLOW}验证路由配置...${NC}"
NEW_ROUTE=$(route get $SERVER_IP | grep gateway | awk '{print $2}')

if [ "$NEW_ROUTE" == "$CURRENT_GATEWAY" ]; then
    echo -e "${GREEN}✅ 路由配置成功！${NC}"
    echo "Gateway: $NEW_ROUTE"
else
    echo -e "${RED}❌ 路由配置失败${NC}"
    exit 1
fi

# 测试连接
echo ""
echo -e "${YELLOW}测试SSH连接...${NC}"
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i ~/Downloads/shopify.pem root@$SERVER_IP "echo '✅ SSH连接成功'; uname -a"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}服务器连接正常！${NC}"
else
    echo -e "${RED}SSH连接失败，请检查：${NC}"
    echo "1. VPN是否干扰"
    echo "2. 密钥文件权限"
    echo "3. 服务器是否在线"
fi