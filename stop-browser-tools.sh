#!/bin/bash

echo "========================================="
echo "停止 Browser Tools 系统"
echo "========================================="

# 查找并停止 browser-tools-server 进程
echo ""
echo "查找 Browser Tools Server 进程..."
PIDS=$(ps aux | grep -E "browser-tools-server" | grep -v grep | awk '{print $2}')

if [ -z "$PIDS" ]; then
    echo "没有找到运行中的 Browser Tools Server"
else
    echo "找到进程 PID: $PIDS"
    echo "正在停止..."
    for PID in $PIDS; do
        kill $PID 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "  ✓ 已停止进程 $PID"
        else
            echo "  ✗ 无法停止进程 $PID (可能需要 sudo)"
        fi
    done
fi

echo ""
echo "========================================="
echo "Browser Tools 系统已停止"
echo "========================================="