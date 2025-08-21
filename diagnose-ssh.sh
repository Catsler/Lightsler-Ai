#!/bin/bash

echo "🔍 SSH连接诊断"
echo "==============="
echo ""

SERVER="47.79.77.128"

# 1. 检查网络连通性
echo "1. 检查网络连通性"
echo "-----------------"
ping -c 3 -W 2 $SERVER > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Ping测试通过"
else
    echo "❌ Ping测试失败"
fi

# 2. 检查路由
echo ""
echo "2. 检查路由配置"
echo "--------------"
route get $SERVER | grep gateway

# 3. 检查端口
echo ""
echo "3. 检查SSH端口(22)"
echo "-----------------"
nc -zv -w 3 $SERVER 22 2>&1

# 4. 测试SSH连接
echo ""
echo "4. SSH详细诊断"
echo "--------------"
ssh -vv -o ConnectTimeout=5 \
    -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null \
    -i ~/Downloads/shopify.pem \
    root@$SERVER "echo 'SSH OK'" 2>&1 | grep -E "(Connection|kex_exchange|Authenticated|closed)"

# 5. 可能的问题
echo ""
echo "📋 可能的问题和解决方案："
echo "------------------------"
echo "1. 如果连接立即关闭："
echo "   - 服务器可能启用了fail2ban（IP被临时封禁）"
echo "   - SSH服务配置问题"
echo "   - 安全组规则限制"
echo ""
echo "2. 建议操作："
echo "   - 等待几分钟后重试（fail2ban通常10分钟解封）"
echo "   - 通过阿里云控制台重启SSH服务"
echo "   - 检查阿里云安全组规则"
echo "   - 使用VNC连接检查服务器状态"