#!/bin/bash
# 启动所有店铺（固定端口）- 使用tmux或后台进程

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 先停止所有旧进程
echo -e "${YELLOW}停止所有旧进程...${NC}"
lsof -ti:3001,3002,3003 | xargs kill -9 2>/dev/null
pkill -f "remix-serve" 2>/dev/null
sleep 2

# 确保构建是最新的
echo -e "${BLUE}检查构建...${NC}"
if [ ! -d "build" ]; then
    echo -e "${YELLOW}构建应用...${NC}"
    npm run build
fi

# 启动OneWind (端口3001)
echo -e "${GREEN}启动 OneWind (端口 3001)...${NC}"
NODE_TLS_REJECT_UNAUTHORIZED=0 \
PORT=3001 \
DATABASE_URL=file:./prisma/data/onewind.db \
    nohup npx --env-file=.env.onewind remix-serve ./build/server/index.js > logs/onewind.log 2>&1 &
echo "PID: $!"

sleep 2

# 启动Daui (端口3002)
echo -e "${GREEN}启动 Daui (端口 3002)...${NC}"
NODE_TLS_REJECT_UNAUTHORIZED=0 \
PORT=3002 \
DATABASE_URL=file:./prisma/data/daui.db \
    nohup npx --env-file=.env.daui remix-serve ./build/server/index.js > logs/daui.log 2>&1 &
echo "PID: $!"

sleep 2

# 启动SSHVDT (端口3003)
echo -e "${GREEN}启动 SSHVDT (端口 3003)...${NC}"
NODE_TLS_REJECT_UNAUTHORIZED=0 \
PORT=3003 \
DATABASE_URL=file:./prisma/data/sshvdt.db \
    nohup npx --env-file=.env.sshvdt remix-serve ./build/server/index.js > logs/sshvdt.log 2>&1 &
echo "PID: $!"

sleep 3

# 检查状态
echo ""
echo -e "${BLUE}=== 服务状态 ===${NC}"
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
echo -e "${BLUE}Cloudflare隧道配置:${NC}"
echo "onewind.ease-joy.fun → localhost:3001"
echo "daui.ease-joy.fun    → localhost:3002"
echo "sshvdt.ease-joy.fun  → localhost:3003"

echo ""
echo -e "${GREEN}✅ 启动完成！现在可以运行Cloudflare隧道：${NC}"
echo ""
echo "cloudflared tunnel run --token eyJhIjoiNDcxNTkxNzQ5ZDJlZmMzODQwODIxZDgyYjJjYzRlMmQiLCJ0IjoiODZkOGZlZjgtNzg3Zi00MWQ1LWIyNjMtOTUyNjQyODJhOTA3IiwicyI6Ik5EY3hNVFpsT0RRdE5ERmpNQzAwTmpjd0xUbGxPR0l0WWpReE5EWXpOelUxT0RkayJ9"
echo ""
echo -e "${YELLOW}查看日志:${NC}"
echo "tail -f logs/onewind.log"
echo "tail -f logs/daui.log"
echo "tail -f logs/sshvdt.log"