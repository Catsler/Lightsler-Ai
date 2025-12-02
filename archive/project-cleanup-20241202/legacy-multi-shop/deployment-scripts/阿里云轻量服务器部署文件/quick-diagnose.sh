#!/bin/bash
# 快速诊断脚本（绕过网络路由问题）
# 不绑定IP，直接尝试连接

set -euo pipefail

SERVER_IP="47.79.77.128"
SSH_KEY="/Users/elie/Downloads/shopify.pem"

echo "================================================"
echo "🔍 阿里云服务器快速诊断"
echo "================================================"
echo ""

echo "📡 方式1: 直接连接（不绑定IP）"
echo "---"
if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@"$SERVER_IP" "echo '✅ 连接成功'" 2>&1; then
    echo ""
    echo "✅ 连接成功！开始检查PM2状态..."
    echo ""

    echo "📊 PM2进程列表:"
    echo "---"
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@"$SERVER_IP" "pm2 list"

    echo ""
    echo "🔍 Worker进程状态:"
    echo "---"
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@"$SERVER_IP" "pm2 list | grep -E 'shop1-translation-worker|shop2-translation-worker' || echo '❌ Worker进程不存在'"

    echo ""
    echo "📝 Shop1 Worker 最近日志（最近20行）:"
    echo "---"
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@"$SERVER_IP" "pm2 logs shop1-translation-worker --lines 20 --nostream 2>&1 || echo '⚠️  无法获取日志'"

    echo ""
    echo "📝 Shop2 Worker 最近日志（最近20行）:"
    echo "---"
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@"$SERVER_IP" "pm2 logs shop2-translation-worker --lines 20 --nostream 2>&1 || echo '⚠️  无法获取日志'"

    echo ""
    echo "🔌 Redis连接测试:"
    echo "---"
    REDIS_URL=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@"$SERVER_IP" "cat /var/www/app1-fynony/.env | grep '^REDIS_URL=' | cut -d= -f2" | tr -d '"')
    if [ -n "$REDIS_URL" ]; then
        echo "Redis URL: $REDIS_URL"
        if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no root@"$SERVER_IP" "redis-cli -u '$REDIS_URL' ping" 2>/dev/null; then
            echo "✅ Redis连接正常"
        else
            echo "❌ Redis连接失败"
        fi
    else
        echo "⚠️  未找到REDIS_URL"
    fi

    echo ""
    echo "================================================"
    echo "✅ 诊断完成"
    echo "================================================"
else
    echo "❌ 连接失败"
    echo ""
    echo "请手动执行以下命令清除路由缓存："
    echo "  sudo route delete 47.79.77.128"
    echo ""
    echo "然后重新运行此脚本"
    exit 1
fi
