#!/bin/bash

echo "📊 监控多租户Shopify应用状态"
echo "====================================="

# 绑定源IP SSH函数
ssh_cmd() {
    ssh -b 192.168.31.152 -i /Users/elie/Downloads/shopify.pem root@47.79.77.128 "$@"
}

echo "🔍 PM2进程状态："
echo "-----------------------------------"
ssh_cmd "pm2 status"

echo ""
echo "📝 Shop1 (Fynony) 最近日志："
echo "-----------------------------------"
ssh_cmd "pm2 logs lightsler-fynony --lines 10 --nostream"

echo ""
echo "📝 Shop2 (OneWind) 最近日志："
echo "-----------------------------------"
ssh_cmd "pm2 logs lightsler-onewind --lines 10 --nostream"

echo ""
echo "💾 内存使用情况："
echo "-----------------------------------"
ssh_cmd "pm2 list | grep -E 'lightsler-|memory'"

echo ""
echo "🗄️ 数据库文件状态："
echo "-----------------------------------"
ssh_cmd "ls -lh /var/www/shops/fynony/prisma/dev.sqlite 2>/dev/null || echo 'Shop1数据库未创建'"
ssh_cmd "ls -lh /var/www/shops/onewindoutdoors/prisma/dev.sqlite 2>/dev/null || echo 'Shop2数据库未创建'"

echo ""
echo "🔧 配置文件状态："
echo "-----------------------------------"
ssh_cmd "ls -la /var/www/shops/fynony/shopify.app.toml 2>/dev/null || echo 'Shop1配置缺失'"
ssh_cmd "ls -la /var/www/shops/onewindoutdoors/shopify.app.toml 2>/dev/null || echo 'Shop2配置缺失'"

echo ""
echo "🌐 Cloudflare隧道状态："
echo "-----------------------------------"
ssh_cmd "systemctl status cloudflared --no-pager | head -10"

echo ""
echo "🚪 端口监听状态："
echo "-----------------------------------"
ssh_cmd "netstat -tlnp | grep -E '3001|3002'"

echo ""
echo "📊 系统资源状况："
echo "-----------------------------------"
ssh_cmd "free -h && df -h /var/www"