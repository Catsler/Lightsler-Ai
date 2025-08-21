#!/bin/bash

echo "========================================="
echo "    Shopify 翻译应用多店铺状态"
echo "========================================="
echo ""

# 检查各店铺进程状态
check_store() {
    local store=$1
    local port=$2
    local domain=$3
    
    if lsof -ti:$port > /dev/null 2>&1; then
        echo "✅ $store 店铺"
        echo "   端口: $port"
        echo "   状态: 运行中"
        echo "   访问: https://$domain"
        echo "   进程: $(lsof -ti:$port)"
    else
        echo "❌ $store 店铺"
        echo "   端口: $port"
        echo "   状态: 未运行"
        echo "   访问: https://$domain"
    fi
    echo ""
}

# 检查三个店铺
check_store "OneWind" 3001 "onewind.ease-joy.fun"
check_store "SSHVDT" 3003 "sshvdt.ease-joy.fun"
check_store "Daui" 3002 "daui.ease-joy.fun"

# 数据库状态
echo "========================================="
echo "    数据库状态"
echo "========================================="
echo ""

for db in onewind sshvdt daui; do
    if [ -f "prisma/data/$db.db" ]; then
        size=$(ls -lh prisma/data/$db.db | awk '{print $5}')
        echo "✅ $db.db - 大小: $size"
    else
        echo "❌ $db.db - 未找到"
    fi
done

echo ""
echo "========================================="
echo "    管理命令"
echo "========================================="
echo ""
echo "启动店铺: ./shop-manager.sh start <店铺名>"
echo "停止店铺: ./shop-manager.sh stop <店铺名>"
echo "切换店铺: ./shop-manager.sh switch <店铺名>"
echo "查看状态: ./shop-manager.sh status"
echo ""
echo "店铺名: onewind | sshvdt | daui"
echo "========================================="