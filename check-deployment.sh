#!/bin/bash
# 部署状态检查脚本
# 用于快速检查阿里云服务器上的翻译应用部署状态

SERVER_IP="47.79.77.128"
KEY_PATH="$HOME/Downloads/shopify.pem"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Shopify翻译应用部署状态检查${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 检查SSH连接
echo -e "${YELLOW}1. 检查SSH连接...${NC}"
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$KEY_PATH" root@$SERVER_IP "echo '✅ SSH连接正常'" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ SSH连接失败，尝试修复路由...${NC}"
    osascript -e "do shell script \"route delete -host $SERVER_IP 2>/dev/null; route add -host $SERVER_IP -interface en0\" with administrator privileges" 2>/dev/null
    ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$KEY_PATH" root@$SERVER_IP "echo '✅ SSH连接已修复'" 2>/dev/null
fi
echo ""

# 2. 检查Node进程
echo -e "${YELLOW}2. 检查应用进程...${NC}"
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$KEY_PATH" root@$SERVER_IP "
    echo '店铺进程状态：'
    ps aux | grep node | grep -v grep | while read line; do
        if echo \$line | grep -q 'onewind'; then
            echo '  ✅ OneWind店铺 (端口3001) - 运行中'
        elif echo \$line | grep -q 'daui'; then
            echo '  ✅ Daui店铺 (端口3002) - 运行中'
        elif echo \$line | grep -q 'sshvdt'; then
            echo '  ✅ SSHVDT店铺 (端口3003) - 运行中'
        fi
    done
    
    # 检查端口监听
    echo ''
    echo '端口监听状态：'
    for port in 3001 3002 3003; do
        if netstat -tuln | grep -q \":\$port \"; then
            echo \"  ✅ 端口 \$port 正在监听\"
        else
            echo \"  ❌ 端口 \$port 未监听\"
        fi
    done
" 2>/dev/null
echo ""

# 3. 检查Cloudflare隧道
echo -e "${YELLOW}3. 检查Cloudflare隧道...${NC}"
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$KEY_PATH" root@$SERVER_IP "
    if systemctl is-active cloudflared >/dev/null 2>&1; then
        echo '✅ Cloudflare隧道服务运行中'
        systemctl status cloudflared | grep 'Active:' | sed 's/^/  /'
    else
        echo '❌ Cloudflare隧道服务未运行'
    fi
" 2>/dev/null
echo ""

# 4. 检查域名访问
echo -e "${YELLOW}4. 检查域名访问...${NC}"
for domain in onewind.ease-joy.fun daui.ease-joy.fun sshvdt.ease-joy.fun; do
    http_code=$(curl -s -o /dev/null -w "%{http_code}" https://$domain)
    if [ "$http_code" = "200" ]; then
        echo -e "  ${GREEN}✅ $domain - HTTP $http_code${NC}"
    else
        echo -e "  ${RED}❌ $domain - HTTP $http_code${NC}"
    fi
done
echo ""

# 5. 检查数据库
echo -e "${YELLOW}5. 检查数据库隔离...${NC}"
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$KEY_PATH" root@$SERVER_IP "
    cd /root/shopify-translate
    echo '数据库文件：'
    for db in onewind daui sshvdt; do
        if [ -f \"prisma/data/\$db.db\" ]; then
            size=\$(du -h \"prisma/data/\$db.db\" | cut -f1)
            echo \"  ✅ \$db.db (\$size)\"
        else
            echo \"  ❌ \$db.db 不存在\"
        fi
    done
" 2>/dev/null
echo ""

# 6. 检查资源使用
echo -e "${YELLOW}6. 服务器资源使用...${NC}"
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "$KEY_PATH" root@$SERVER_IP "
    echo -n '  CPU使用率: '
    top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - \$1\"%\"}'
    echo -n '  内存使用: '
    free -h | grep '^Mem' | awk '{print \$3\"/\"\$2}'
    echo -n '  磁盘使用: '
    df -h / | tail -1 | awk '{print \$3\"/\"\$2\" (\"\$5\")\"}'
" 2>/dev/null
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   检查完成${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 提供快速操作提示
echo "快速操作命令："
echo -e "${BLUE}SSH连接:${NC} ssh -i ~/Downloads/shopify.pem root@$SERVER_IP"
echo -e "${BLUE}查看日志:${NC} ssh -i ~/Downloads/shopify.pem root@$SERVER_IP 'tail -f /root/shopify-translate/logs/*.log'"
echo -e "${BLUE}重启应用:${NC} ssh -i ~/Downloads/shopify.pem root@$SERVER_IP 'cd /root/shopify-translate && ./restart-apps.sh'"