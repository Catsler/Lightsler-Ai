#!/bin/bash
# 环境验证脚本（只读，安全）
# 用途：部署前/后验证环境配置正确性
# 用法：./verify-env.sh <shop1|shop2|all>

set -e

TARGET_SHOP=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置映射
declare -A SHOP_CONFIG
SHOP_CONFIG[shop1_dir]="/var/www/app1-fynony"
SHOP_CONFIG[shop1_redis_db]="11"
SHOP_CONFIG[shop1_api_key]="f97170933cde079c914f7df7e90cd806"
SHOP_CONFIG[shop1_shop_id]="shop1"
SHOP_CONFIG[shop2_dir]="/var/www/app2-onewind"
SHOP_CONFIG[shop2_redis_db]="12"
SHOP_CONFIG[shop2_api_key]="8102af9807fd9df0b322a44f500a1d0e"
SHOP_CONFIG[shop2_shop_id]="shop2"

# 验证环境函数
verify_environment() {
  local shop=$1
  local app_dir="${SHOP_CONFIG[${shop}_dir]}"
  local expected_db="${SHOP_CONFIG[${shop}_redis_db]}"
  local expected_key="${SHOP_CONFIG[${shop}_api_key]}"
  local expected_shop_id="${SHOP_CONFIG[${shop}_shop_id]}"

  echo ""
  echo "============================================"
  echo "🔍 环境验证: $shop"
  echo "============================================"

  # 检查目录存在
  if [ ! -d "$app_dir" ]; then
    echo -e "${RED}❌ 错误: 应用目录不存在: $app_dir${NC}"
    return 1
  fi

  cd "$app_dir" || return 1
  echo "📂 应用目录: $app_dir"

  # 检查 .env 文件
  if [ ! -f ".env" ]; then
    echo -e "${RED}❌ 错误: .env 文件不存在${NC}"
    return 1
  fi

  # 读取实际配置
  local actual_shop_id=$(grep "^SHOP_ID=" .env 2>/dev/null | cut -d= -f2 | tr -d ' ')
  local actual_redis_url=$(grep "^REDIS_URL=" .env 2>/dev/null | cut -d= -f2)
  local actual_redis_db=$(echo "$actual_redis_url" | grep -o "/[0-9]*$" | tr -d '/')
  local actual_api_key=$(grep "^SHOPIFY_API_KEY=" .env 2>/dev/null | cut -d= -f2 | tr -d ' ')
  local actual_node_env=$(grep "^NODE_ENV=" .env 2>/dev/null | cut -d= -f2 | tr -d ' ')

  # 验证标志
  local all_pass=true

  # 验证 SHOP_ID
  echo ""
  echo "1️⃣  SHOP_ID 验证:"
  echo "   预期: $expected_shop_id"
  echo "   实际: $actual_shop_id"
  if [ "$actual_shop_id" == "$expected_shop_id" ]; then
    echo -e "   ${GREEN}✅ 匹配${NC}"
  else
    echo -e "   ${RED}❌ 不匹配${NC}"
    all_pass=false
  fi

  # 验证 Redis DB
  echo ""
  echo "2️⃣  Redis DB 验证:"
  echo "   预期: /11 (shop1) 或 /12 (shop2)"
  echo "   实际: /$actual_redis_db"
  if [ "$actual_redis_db" == "$expected_db" ]; then
    echo -e "   ${GREEN}✅ 匹配${NC}"
  else
    echo -e "   ${RED}❌ 不匹配 - 严重错误！可能导致数据混乱${NC}"
    all_pass=false
  fi

  # 验证 API Key
  echo ""
  echo "3️⃣  SHOPIFY_API_KEY 验证:"
  echo "   预期: ${expected_key:0:20}...${expected_key: -6}"
  echo "   实际: ${actual_api_key:0:20}...${actual_api_key: -6}"
  if [ "$actual_api_key" == "$expected_key" ]; then
    echo -e "   ${GREEN}✅ 匹配${NC}"
  else
    echo -e "   ${RED}❌ 不匹配${NC}"
    all_pass=false
  fi

  # 验证 NODE_ENV
  echo ""
  echo "4️⃣  NODE_ENV 验证:"
  echo "   实际: $actual_node_env"
  if [ "$actual_node_env" == "production" ]; then
    echo -e "   ${GREEN}✅ 生产环境${NC}"
  else
    echo -e "   ${YELLOW}⚠️  非生产环境${NC}"
  fi

  # 验证 shopify.app.toml
  echo ""
  echo "5️⃣  shopify.app.toml 验证:"
  if [ -f "shopify.app.toml" ]; then
    local toml_client_id=$(grep "^client_id" shopify.app.toml 2>/dev/null | cut -d'"' -f2)
    echo "   client_id: ${toml_client_id:0:20}...${toml_client_id: -6}"
    if [ "$toml_client_id" == "$expected_key" ]; then
      echo -e "   ${GREEN}✅ 与 API Key 一致${NC}"
    else
      echo -e "   ${RED}❌ 与 API Key 不一致${NC}"
      all_pass=false
    fi
  else
    echo -e "   ${RED}❌ 文件不存在${NC}"
    all_pass=false
  fi

  # 验证数据库
  echo ""
  echo "6️⃣  数据库验证:"
  if [ -f "prisma/dev.sqlite" ]; then
    local db_size=$(du -h prisma/dev.sqlite | cut -f1)
    local translation_count=$(sqlite3 prisma/dev.sqlite "SELECT COUNT(*) FROM Translation;" 2>/dev/null || echo "N/A")
    echo "   文件大小: $db_size"
    echo "   翻译记录数: $translation_count"
    echo -e "   ${GREEN}✅ 数据库存在${NC}"
  else
    echo -e "   ${YELLOW}⚠️  数据库文件不存在（首次部署？）${NC}"
  fi

  # 最终结果
  echo ""
  echo "============================================"
  if [ "$all_pass" = true ]; then
    echo -e "${GREEN}✅ 环境验证通过: $shop${NC}"
    echo "============================================"
    return 0
  else
    echo -e "${RED}❌ 环境验证失败: $shop${NC}"
    echo -e "${RED}请修复上述错误后再部署！${NC}"
    echo "============================================"
    return 1
  fi
}

# 主逻辑
if [[ -z "$TARGET_SHOP" ]]; then
  echo "用法: $0 <shop1|shop2|all>"
  echo ""
  echo "示例："
  echo "  $0 shop1      # 验证 Fynony 环境"
  echo "  $0 shop2      # 验证 OneWind 环境"
  echo "  $0 all        # 验证所有店铺"
  exit 1
fi

if [[ "$TARGET_SHOP" == "all" ]]; then
  verify_environment "shop1" || exit_code=1
  verify_environment "shop2" || exit_code=1
  exit ${exit_code:-0}
else
  if [[ ! "$TARGET_SHOP" =~ ^(shop1|shop2)$ ]]; then
    echo "❌ 错误: 未知的店铺标识 '$TARGET_SHOP'"
    echo "只支持: shop1, shop2, all"
    exit 1
  fi
  verify_environment "$TARGET_SHOP"
fi
