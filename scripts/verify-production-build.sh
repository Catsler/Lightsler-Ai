#!/usr/bin/env bash

set -euo pipefail

BUILD_DIR="build/client/assets"

echo "🚦 验证生产构建..."

if [[ ! -d "$BUILD_DIR" ]]; then
  echo "❌ 未找到 $BUILD_DIR，先运行 npm run build"
  exit 1
fi

# 1) 检查是否残留开发代码
if grep -rq "__DEV__\|development" "$BUILD_DIR"; then
  echo "❌ 检测到疑似开发构建，请用 NODE_ENV=production 重建"
  exit 1
else
  echo "✅ 未发现开发代码标记"
fi

# 2) 列出 vendor 体积
if ls "$BUILD_DIR"/vendor*.js >/dev/null 2>&1; then
  echo "📦 Vendor bundles:"
  ls -lh "$BUILD_DIR"/vendor*.js
else
  echo "⚠️ 未找到 vendor chunk，检查构建配置"
fi

# 3) 快速扫描 React hook 异常提示
if grep -rq "Invalid hook call" "$BUILD_DIR"; then
  echo "⚠️ 构建中包含 'Invalid hook call' 相关字符串，需关注"
else
  echo "✅ 未发现 hook 错误提示"
fi

echo "🎯 构建验证完成"

