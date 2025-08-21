#!/bin/bash

# 等待并重试SSH连接
# 服务器信息：47.79.77.128 (公网) / 172.19.0.234 (私有)

echo "⏰ SSH连接等待重试脚本"
echo "========================"
echo ""
echo "服务器信息："
echo "  公网IP: 47.79.77.128"
echo "  私有IP: 172.19.0.234"
echo ""

# 配置
MAX_RETRIES=10
WAIT_TIME=60  # 每次等待60秒
RETRY_COUNT=0

# 颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_connection() {
    ssh -o ConnectTimeout=5 \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -i ~/Downloads/shopify.pem \
        root@47.79.77.128 "echo 'SUCCESS'; hostname" 2>/dev/null
    return $?
}

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    
    echo -e "${YELLOW}尝试 $RETRY_COUNT/$MAX_RETRIES ...${NC}"
    
    if test_connection; then
        echo -e "${GREEN}✅ 连接成功！${NC}"
        echo ""
        echo "现在可以执行部署："
        echo "1. scp -i ~/Downloads/shopify.pem deploy.tar.gz root@47.79.77.128:/root/"
        echo "2. ssh -i ~/Downloads/shopify.pem root@47.79.77.128"
        echo "3. cd /root && tar -xzf deploy.tar.gz && ./server-deploy.sh"
        exit 0
    else
        echo -e "${RED}❌ 连接失败${NC}"
        
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            echo "等待 $WAIT_TIME 秒后重试..."
            echo "（可能是fail2ban临时封禁，通常10-15分钟自动解封）"
            sleep $WAIT_TIME
        fi
    fi
done

echo ""
echo -e "${RED}所有尝试都失败了${NC}"
echo ""
echo "可能的解决方案："
echo "1. 通过阿里云控制台："
echo "   - 使用VNC连接服务器"
echo "   - 检查 /var/log/auth.log"
echo "   - 检查 fail2ban 状态: fail2ban-client status sshd"
echo "   - 解封IP: fail2ban-client set sshd unbanip YOUR_IP"
echo ""
echo "2. 检查安全组规则："
echo "   - 确保22端口对您的IP开放"
echo "   - 或临时开放所有IP (0.0.0.0/0)"
echo ""
echo "3. 重置SSH服务："
echo "   - 通过VNC: systemctl restart sshd"