#!/bin/bash
# SSHVDT店铺开发模式启动脚本

echo "🚀 启动SSHVDT店铺开发环境..."
echo "店铺: sshvdt-ai.myshopify.com"
echo "端口: 3003"
echo "域名: https://sshvdt.ease-joy.fun"
echo ""

cd "$(dirname "$0")"
./shop-manager.sh dev sshvdt