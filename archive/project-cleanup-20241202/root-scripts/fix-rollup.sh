#!/bin/bash
echo "🔧 修复 Rollup ARM64 依赖问题..."

# 检测架构
if [[ $(uname -m) == "arm64" ]]; then
    echo "✅ 检测到 ARM64 架构"

    # 清理
    echo "🧹 清理旧依赖..."
    rm -rf node_modules package-lock.json

    # 重新安装
    echo "📦 重新安装依赖..."
    npm install --force

    # 确保 rollup ARM64 包存在
    echo "🔍 验证 rollup-darwin-arm64..."
    npm list @rollup/rollup-darwin-arm64 || npm install @rollup/rollup-darwin-arm64 --save-optional

    echo "✨ 修复完成！"
    echo "现在可以使用以下命令启动项目（需用户授权）："
    echo "shopify app dev --tunnel-url=https://translate.ease-joy.com:3000"
else
    echo "⚠️  非 ARM64 架构，使用标准安装"
    npm install
fi