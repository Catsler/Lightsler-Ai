#!/bin/bash
# 启动Cloudflare隧道

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   启动 Cloudflare 隧道${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查cloudflared是否安装
if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}cloudflared 未安装！${NC}"
    echo "请先安装 cloudflared:"
    echo "  brew install cloudflared"
    echo "或访问: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
    exit 1
fi

# 检查本地服务是否运行
echo -e "${YELLOW}检查本地服务状态...${NC}"
echo ""

services_ok=true

if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo -e "OneWind (3001): ${GREEN}✅ 运行中${NC}"
else
    echo -e "OneWind (3001): ${RED}❌ 未运行${NC}"
    services_ok=false
fi

if curl -s http://localhost:3002 > /dev/null 2>&1; then
    echo -e "Daui (3002): ${GREEN}✅ 运行中${NC}"
else
    echo -e "Daui (3002): ${RED}❌ 未运行${NC}"
    services_ok=false
fi

if curl -s http://localhost:3003 > /dev/null 2>&1; then
    echo -e "SSHVDT (3003): ${GREEN}✅ 运行中${NC}"
else
    echo -e "SSHVDT (3003): ${RED}❌ 未运行${NC}"
    services_ok=false
fi

echo ""

if [ "$services_ok" = false ]; then
    echo -e "${YELLOW}警告: 某些服务未运行！${NC}"
    echo "请先运行: ./start-all-shops.sh"
    echo ""
fi

echo -e "${BLUE}隧道配置:${NC}"
echo "  onewind.ease-joy.fun → localhost:3001"
echo "  daui.ease-joy.fun    → localhost:3002"
echo "  sshvdt.ease-joy.fun  → localhost:3003"
echo ""

echo -e "${GREEN}启动 Cloudflare 隧道...${NC}"
echo ""

# 启动隧道
cloudflared tunnel run --token eyJhIjoiNDcxNTkxNzQ5ZDJlZmMzODQwODIxZDgyYjJjYzRlMmQiLCJ0IjoiODZkOGZlZjgtNzg3Zi00MWQ1LWIyNjMtOTUyNjQyODJhOTA3IiwicyI6Ik5EY3hNVFpsT0RRdE5ERmpNQzAwTmpjd0xUbGxPR0l0WWpReE5EWXpOelUxT0RkayJ9