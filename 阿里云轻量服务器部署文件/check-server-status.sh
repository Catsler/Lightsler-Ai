#!/bin/bash

# 检查阿里云轻量服务器状态
# 使用绑定IP绕过VPN

# 配置
SERVER_IP="47.79.77.128"
SSH_KEY="/Users/elie/Downloads/shopify.pem"
BIND_IP="192.168.31.152"  # 绕过VPN的本地IP

# SSH函数（绕过VPN）
ssh_cmd() {
    ssh -b ${BIND_IP} -i ${SSH_KEY} root@${SERVER_IP} "$@"
}

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}     阿里云轻量服务器状态检查${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

echo -e "${YELLOW}📊 PM2进程状态：${NC}"
ssh_cmd "pm2 list"
echo ""

echo -e "${YELLOW}📝 最近日志（各10行）：${NC}"
echo -e "${GREEN}Shop1 - Fynony:${NC}"
ssh_cmd "pm2 logs shop1-fynony --lines 10 --nostream"
echo ""
echo -e "${GREEN}Shop2 - OneWind:${NC}"
ssh_cmd "pm2 logs shop2-onewind --lines 10 --nostream"
echo ""

echo -e "${YELLOW}🔍 端口监听状态：${NC}"
ssh_cmd "netstat -tlnp | grep -E '3001|3002'"
echo ""

echo -e "${YELLOW}💾 数据库文件：${NC}"
ssh_cmd "ls -lh /var/www/app1-fynony/prisma/dev.sqlite /var/www/app2-onewind/prisma/dev.sqlite"
echo ""

echo -e "${YELLOW}📈 系统资源使用：${NC}"
ssh_cmd "free -h && echo '' && df -h /var/www"
echo ""

echo -e "${YELLOW}🌐 Cloudflare隧道状态：${NC}"
ssh_cmd "systemctl status cloudflared | head -10"
echo ""

echo -e "${GREEN}✅ 状态检查完成！${NC}"
echo ""
echo "访问地址："
echo "  - Shop1: https://fynony.ease-joy.fun"
echo "  - Shop2: https://onewind.ease-joy.fun"