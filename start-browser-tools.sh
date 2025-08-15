#!/bin/bash

echo "========================================="
echo "启动 Browser Tools 系统"
echo "========================================="

# 启动 Browser Tools Server
echo ""
echo "1. 启动 Browser Tools Server..."
npx @agentdeskai/browser-tools-server &
SERVER_PID=$!

# 等待服务器启动
sleep 3

echo ""
echo "========================================="
echo "Browser Tools 系统已启动!"
echo "========================================="
echo ""
echo "服务器 PID: $SERVER_PID"
echo ""
echo "请确保:"
echo "  ✓ Chrome 浏览器已打开"
echo "  ✓ Browser Tools 扩展已安装并启用"
echo "  ✓ MCP 服务器已连接 (claude mcp list)"
echo ""
echo "测试命令:"
echo "  - 截图: mcp__browser-tools__takeScreenshot"
echo "  - 控制台日志: mcp__browser-tools__getConsoleLogs"
echo "  - 网络日志: mcp__browser-tools__getNetworkLogs"
echo ""
echo "停止服务: kill $SERVER_PID"
echo "========================================="

# 保持脚本运行
wait $SERVER_PID