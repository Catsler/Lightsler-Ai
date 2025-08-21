#!/bin/bash
# 固定端口启动脚本 - 用于Cloudflare隧道
# OneWind: 3001, Daui: 3002, SSHVDT: 3003

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ACTION=$1

# 停止所有服务
stop_all() {
    echo -e "${YELLOW}停止所有服务...${NC}"
    lsof -ti:3001,3002,3003 | xargs kill -9 2>/dev/null
    pkill -f "remix-serve" 2>/dev/null
    pkill -f "shopify app" 2>/dev/null
    echo -e "${GREEN}所有服务已停止${NC}"
}

# 构建应用
build_app() {
    echo -e "${BLUE}构建应用...${NC}"
    npm run build
}

# 启动OneWind (端口3001)
start_onewind() {
    echo -e "${GREEN}启动 OneWind 店铺 (端口 3001)...${NC}"
    
    # 停止旧进程
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    
    # 设置环境变量并启动
    (
        export NODE_TLS_REJECT_UNAUTHORIZED=0
        export PORT=3001
        export DATABASE_URL=file:./prisma/data/onewind.db
        
        # 加载OneWind环境变量
        set -a
        source .env.onewind
        set +a
        
        # 启动服务
        npx remix-serve ./build/server/index.js
    ) &
    
    echo -e "${GREEN}OneWind 启动完成${NC}"
    echo "访问地址: http://localhost:3001"
    echo "Cloudflare: onewind.ease-joy.fun"
}

# 启动Daui (端口3002)
start_daui() {
    echo -e "${GREEN}启动 Daui 店铺 (端口 3002)...${NC}"
    
    # 停止旧进程
    lsof -ti:3002 | xargs kill -9 2>/dev/null
    
    # 设置环境变量并启动
    (
        export NODE_TLS_REJECT_UNAUTHORIZED=0
        export PORT=3002
        export DATABASE_URL=file:./prisma/data/daui.db
        
        # 加载Daui环境变量
        set -a
        source .env.daui
        set +a
        
        # 启动服务
        npx remix-serve ./build/server/index.js
    ) &
    
    echo -e "${GREEN}Daui 启动完成${NC}"
    echo "访问地址: http://localhost:3002"
    echo "Cloudflare: daui.ease-joy.fun"
}

# 启动SSHVDT (端口3003)
start_sshvdt() {
    echo -e "${GREEN}启动 SSHVDT 店铺 (端口 3003)...${NC}"
    
    # 停止旧进程
    lsof -ti:3003 | xargs kill -9 2>/dev/null
    
    # 设置环境变量并启动
    (
        export NODE_TLS_REJECT_UNAUTHORIZED=0
        export PORT=3003
        export DATABASE_URL=file:./prisma/data/sshvdt.db
        
        # 加载SSHVDT环境变量
        set -a
        source .env.sshvdt
        set +a
        
        # 启动服务
        npx remix-serve ./build/server/index.js
    ) &
    
    echo -e "${GREEN}SSHVDT 启动完成${NC}"
    echo "访问地址: http://localhost:3003"
    echo "Cloudflare: sshvdt.ease-joy.fun"
}

# 显示状态
show_status() {
    echo -e "${BLUE}=== 服务状态 ===${NC}"
    echo ""
    
    if lsof -i:3001 >/dev/null 2>&1; then
        echo -e "OneWind (3001): ${GREEN}✅ 运行中${NC}"
    else
        echo -e "OneWind (3001): ${RED}❌ 未运行${NC}"
    fi
    
    if lsof -i:3002 >/dev/null 2>&1; then
        echo -e "Daui (3002): ${GREEN}✅ 运行中${NC}"
    else
        echo -e "Daui (3002): ${RED}❌ 未运行${NC}"
    fi
    
    if lsof -i:3003 >/dev/null 2>&1; then
        echo -e "SSHVDT (3003): ${GREEN}✅ 运行中${NC}"
    else
        echo -e "SSHVDT (3003): ${RED}❌ 未运行${NC}"
    fi
    
    echo ""
    echo -e "${BLUE}Cloudflare隧道映射:${NC}"
    echo "onewind.ease-joy.fun → localhost:3001"
    echo "daui.ease-joy.fun    → localhost:3002"
    echo "sshvdt.ease-joy.fun  → localhost:3003"
}

# 主逻辑
case $ACTION in
    start)
        stop_all
        build_app
        start_onewind
        sleep 2
        start_daui
        sleep 2
        start_sshvdt
        sleep 2
        show_status
        echo ""
        echo -e "${GREEN}✅ 所有服务已启动，端口固定！${NC}"
        echo ""
        echo "现在可以启动Cloudflare隧道："
        echo "cloudflared tunnel run --token eyJhIjoiNDcxNTkxNzQ5ZDJlZmMzODQwODIxZDgyYjJjYzRlMmQiLCJ0IjoiODZkOGZlZjgtNzg3Zi00MWQ1LWIyNjMtOTUyNjQyODJhOTA3IiwicyI6Ik5EY3hNVFpsT0RRdE5ERmpNQzAwTmpjd0xUbGxPR0l0WWpReE5EWXpOelUxT0RkayJ9"
        ;;
    stop)
        stop_all
        ;;
    status)
        show_status
        ;;
    *)
        echo "使用方法: $0 {start|stop|status}"
        echo ""
        echo "  start  - 构建并启动所有服务（固定端口）"
        echo "  stop   - 停止所有服务"
        echo "  status - 查看服务状态"
        exit 1
        ;;
esac