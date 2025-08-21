#!/bin/bash

# 使用osascript请求管理员权限来修复路由

SERVER_IP="47.79.77.128"
CURRENT_GATEWAY="192.168.31.1"

echo "🔧 修复阿里云服务器路由（需要管理员权限）"
echo "=========================================="
echo ""

# 使用osascript执行需要权限的命令
osascript -e "do shell script \"route delete -host $SERVER_IP 2>/dev/null; route add -host $SERVER_IP $CURRENT_GATEWAY\" with administrator privileges"

if [ $? -eq 0 ]; then
    echo "✅ 路由配置已更新"
    
    # 验证路由
    echo "验证新路由..."
    route get $SERVER_IP | grep gateway
    
    # 测试SSH连接
    echo ""
    echo "测试SSH连接..."
    ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i ~/Downloads/shopify.pem root@$SERVER_IP "echo '✅ 连接成功！'; hostname; date"
else
    echo "❌ 路由配置失败"
fi