#!/bin/bash

# Shopify Apps状态检查脚本

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================="
echo "   Shopify Apps 状态检查"
echo "===================================${NC}"
echo ""

# 检查端口监听状态
echo -e "${YELLOW}📊 端口监听状态:${NC}"
if lsof -i:3001 >/dev/null 2>&1; then
    echo -e "OneWind (3001): ${GREEN}✅ 运行中${NC}"
    PID=$(lsof -ti:3001)
    echo "  └─ PID: $PID"
else
    echo -e "OneWind (3001): ${RED}❌ 未运行${NC}"
fi

if lsof -i:3003 >/dev/null 2>&1; then
    echo -e "SSHVDT (3003): ${GREEN}✅ 运行中${NC}"
    PID=$(lsof -ti:3003)
    echo "  └─ PID: $PID"
else
    echo -e "SSHVDT (3003): ${RED}❌ 未运行${NC}"
fi

if lsof -i:3002 >/dev/null 2>&1; then
    echo -e "Daui (3002): ${GREEN}✅ 运行中${NC}"
    PID=$(lsof -ti:3002)
    echo "  └─ PID: $PID"
else
    echo -e "Daui (3002): ${RED}❌ 未运行${NC}"
fi

echo ""
echo -e "${YELLOW}🌐 域名访问状态:${NC}"

# 检查域名访问
check_domain() {
    local domain=$1
    local response=$(curl -s -o /dev/null -w "%{http_code}" -m 5 https://$domain 2>/dev/null)
    case $response in
        200|301|302|304)
            echo -e "$domain: ${GREEN}✅ $response${NC}"
            ;;
        502|503)
            echo -e "$domain: ${YELLOW}⚠️  $response (后端未运行)${NC}"
            ;;
        404)
            echo -e "$domain: ${YELLOW}⚠️  $response (路由未找到)${NC}"
            ;;
        000)
            echo -e "$domain: ${RED}❌ 无法连接${NC}"
            ;;
        *)
            echo -e "$domain: ${RED}❌ $response${NC}"
            ;;
    esac
}

check_domain "onewind.ease-joy.fun"
check_domain "sshvdt.ease-joy.fun"
check_domain "daui.ease-joy.fun"

echo ""
echo -e "${YELLOW}🔧 环境配置:${NC}"
CURRENT_ENV=$(readlink .env 2>/dev/null)
if [ -n "$CURRENT_ENV" ]; then
    echo -e "当前激活环境: ${GREEN}$CURRENT_ENV${NC}"
    
    # 显示当前环境的关键配置
    if [ -f ".env" ]; then
        SHOP_DOMAIN=$(grep "SHOP_DOMAIN=" .env | cut -d'=' -f2)
        APP_PORT=$(grep "APP_PORT=" .env | cut -d'=' -f2)
        echo "  └─ 店铺: $SHOP_DOMAIN"
        echo "  └─ 端口: $APP_PORT"
    fi
else
    echo -e "当前激活环境: ${RED}未设置${NC}"
fi

echo ""
echo -e "${YELLOW}📁 数据库状态:${NC}"
for db in onewind sshvdt daui; do
    if [ -f "data/${db}.db" ]; then
        SIZE=$(ls -lh "data/${db}.db" | awk '{print $5}')
        echo -e "${db}.db: ${GREEN}✅ 存在${NC} (大小: $SIZE)"
    else
        echo -e "${db}.db: ${YELLOW}⚠️  未创建${NC}"
    fi
done

echo ""
echo -e "${YELLOW}🔄 进程状态:${NC}"
REMIX_COUNT=$(ps aux | grep -c "[r]emix-serve")
SHOPIFY_COUNT=$(ps aux | grep -c "[s]hopify app")
CLOUDFLARED_COUNT=$(ps aux | grep -c "[c]loudflared")

echo "Remix进程数: $REMIX_COUNT"
echo "Shopify CLI进程数: $SHOPIFY_COUNT"
echo "Cloudflared隧道数: $CLOUDFLARED_COUNT"

echo ""
echo -e "${BLUE}==================================="
echo "快速启动命令:"
echo "  ./dev-onewind.sh  - 开发OneWind店铺"
echo "  ./dev-sshvdt.sh   - 开发SSHVDT店铺"
echo "  ./dev-daui.sh     - 开发Daui店铺"
echo "  ./shop-manager.sh status - 详细状态"
echo "===================================${NC}"