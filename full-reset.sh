#!/bin/bash

echo "🧹 完整重置翻译应用"
echo "=================================="
echo ""
echo "⚠️  警告：此操作将："
echo "  - 清除所有翻译和资源数据"
echo "  - 重置自动扫描状态"
echo "  - 清除错误日志"
echo ""
echo "按 Ctrl+C 取消，或按回车继续..."
read

echo ""
echo "📊 步骤 1/3: 清理数据库..."
node reset-database.js

echo ""
echo "🔄 步骤 2/3: 重置扫描状态..."
node reset-auto-scan.js

echo ""
echo "📝 步骤 3/3: 检查最终状态..."
node check-db-status.js

echo ""
echo "=================================="
echo "✅ 重置完成！"
echo ""
echo "下一步："
echo "1. 启动应用: NODE_TLS_REJECT_UNAUTHORIZED=0 npm run dev -- --tunnel-url=translate.ease-joy.fun"
echo "2. 在应用中点击 '重置自动扫描' 按钮（如果需要）"
echo "3. 刷新页面，自动扫描将重新开始"
echo ""