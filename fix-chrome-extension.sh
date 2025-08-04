#!/bin/bash

echo "🛠️  Shopify翻译应用 - Chrome扩展问题修复工具"
echo "================================================"
echo ""
echo "此脚本将帮助您解决 'Failed to fetch' 错误"
echo ""

# 检查操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CHROME_PATH="google-chrome"
else
    echo "❌ 不支持的操作系统"
    exit 1
fi

echo "请选择解决方案："
echo "1) 使用Chrome隐身模式打开应用"
echo "2) 使用禁用扩展的Chrome打开应用"
echo "3) 打开独立测试页面"
echo "4) 查看详细解决方案"
echo ""
read -p "请输入选项 (1-4): " choice

# 获取应用URL
APP_URL="http://localhost:57044/app"
BYPASS_URL="http://localhost:57044/app/bypass"
TEST_URL="http://localhost:57044/standalone-test.html"

case $choice in
    1)
        echo "🚀 正在使用隐身模式打开应用..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open -a "Google Chrome" --args --incognito "$APP_URL"
        else
            $CHROME_PATH --incognito "$APP_URL" &
        fi
        ;;
    2)
        echo "🚀 正在使用禁用扩展模式打开应用..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open -a "Google Chrome" --args --disable-extensions "$APP_URL"
        else
            $CHROME_PATH --disable-extensions "$APP_URL" &
        fi
        ;;
    3)
        echo "🚀 正在打开独立测试页面..."
        if [[ "$OSTYPE" == "darwin"* ]]; then
            open "$TEST_URL"
        else
            xdg-open "$TEST_URL"
        fi
        ;;
    4)
        echo ""
        echo "📋 详细解决方案："
        echo "=================="
        echo ""
        echo "1. 临时解决方案："
        echo "   - 禁用所有Chrome扩展"
        echo "   - 使用隐身模式 (Cmd/Ctrl + Shift + N)"
        echo "   - 使用其他浏览器 (Firefox, Safari)"
        echo ""
        echo "2. 永久解决方案："
        echo "   - 在Chrome扩展设置中，为应用域名添加白名单"
        echo "   - 禁用特定的广告拦截器扩展"
        echo ""
        echo "3. 开发建议："
        echo "   - 使用 /app/bypass 页面进行测试"
        echo "   - 查看 DEV-ENVIRONMENT.md 文档"
        echo ""
        ;;
    *)
        echo "❌ 无效选项"
        exit 1
        ;;
esac

echo ""
echo "✅ 操作完成！"
echo ""
echo "如果问题仍然存在，请尝试："
echo "1. 清除浏览器缓存"
echo "2. 重启开发服务器"
echo "3. 检查控制台错误信息"