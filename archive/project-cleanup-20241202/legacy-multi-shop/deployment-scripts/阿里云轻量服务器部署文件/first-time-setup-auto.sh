#!/bin/bash
# 非交互式首次部署脚本
# 使用环境变量配置

set -euo pipefail

# 检查必需的环境变量
REQUIRED_VARS=("SHOP1_API_SECRET" "SHOP2_API_SECRET" "GPT_API_KEY")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var:-}" ]; then
        echo "❌ 缺少环境变量: $var"
        echo ""
        echo "使用方法："
        echo "  export SHOP1_API_SECRET='your-secret'"
        echo "  export SHOP2_API_SECRET='your-secret'"
        echo "  export GPT_API_KEY='sk-your-key'"
        echo "  export GPT_API_URL='https://us.vveai.com/v1'  # 可选"
        echo "  export REDIS_URL='redis://...'  # 可选"
        echo "  ./first-time-setup-auto.sh"
        exit 1
    fi
done

# 可选变量
GPT_API_URL=${GPT_API_URL:-https://us.vveai.com/v1}
REDIS_URL=${REDIS_URL:-}

# 自动生成session secrets
export SHOP1_SESSION_SECRET=${SHOP1_SESSION_SECRET:-$(openssl rand -hex 32)}
export SHOP2_SESSION_SECRET=${SHOP2_SESSION_SECRET:-$(openssl rand -hex 32)}

echo "✅ 环境变量已配置，开始自动部署..."
echo "  SHOP1_SESSION_SECRET: $SHOP1_SESSION_SECRET"
echo "  SHOP2_SESSION_SECRET: $SHOP2_SESSION_SECRET"
echo ""

# 执行完整的部署流程（不需要交互）
AUTO_DEPLOY=1 bash "$(dirname "$0")/first-time-setup.sh"
