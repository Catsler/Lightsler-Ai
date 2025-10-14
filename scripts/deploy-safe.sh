#!/bin/bash
# 安全部署脚本（一键部署，带交互确认）
# 集成：备份 + 验证 + 拉取 + 构建 + 重启 + 验证
# 用法：./deploy-safe.sh <shop1|shop2>

set -e

TARGET_SHOP=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_KEEP_COUNT=5  # 保留最近5份备份

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置映射
declare -A SHOP_CONFIG
SHOP_CONFIG[shop1_dir]="/var/www/app1-fynony"
SHOP_CONFIG[shop1_pm2]="shop1-fynony shop1-worker"
SHOP_CONFIG[shop2_dir]="/var/www/app2-onewind"
SHOP_CONFIG[shop2_pm2]="shop2-onewind shop2-worker"

# 备份函数（带自动清理）
backup_with_cleanup() {
  local file=$1
  local backup="${file}.backup.$(date +%Y%m%d_%H%M%S)"

  if [ ! -f "$file" ]; then
    echo -e "${YELLOW}⚠️  文件不存在，跳过备份: $file${NC}"
    return 0
  fi

  cp "$file" "$backup"
  echo -e "${GREEN}✅ 已备份: $(basename $backup)${NC}"

  # 清理旧备份（保留最近N份）
  local backup_count=$(ls -t "${file}.backup."* 2>/dev/null | wc -l)
  if [ $backup_count -gt $BACKUP_KEEP_COUNT ]; then
    local to_delete=$(ls -t "${file}.backup."* 2>/dev/null | tail -n +$((BACKUP_KEEP_COUNT + 1)))
    echo "$to_delete" | while read old_backup; do
      rm -f "$old_backup"
      echo -e "🗑️  已清理旧备份: $(basename $old_backup)"
    done
  fi
}

# 部署函数
deploy() {
  local shop=$1
  local app_dir="${SHOP_CONFIG[${shop}_dir]}"
  local pm2_apps="${SHOP_CONFIG[${shop}_pm2]}"

  echo ""
  echo "============================================"
  echo "🚀 开始部署: $shop"
  echo "============================================"

  # 检查目录
  if [ ! -d "$app_dir" ]; then
    echo -e "${RED}❌ 错误: 应用目录不存在: $app_dir${NC}"
    exit 1
  fi

  cd "$app_dir" || exit 1
  echo -e "${BLUE}📂 应用目录: $app_dir${NC}"

  # === Phase 1: 环境验证 ===
  echo ""
  echo "=== Phase 1: 环境验证 ==="
  if [ -f "$SCRIPT_DIR/verify-env.sh" ]; then
    bash "$SCRIPT_DIR/verify-env.sh" "$shop" || {
      echo -e "${RED}❌ 环境验证失败，停止部署${NC}"
      exit 1
    }
  else
    echo -e "${YELLOW}⚠️  警告: verify-env.sh 不存在，跳过环境验证${NC}"
  fi

  # === Phase 2: 备份 ===
  echo ""
  echo "=== Phase 2: 备份关键文件 ==="
  backup_with_cleanup ".env"
  backup_with_cleanup "shopify.app.toml"

  # 备份数据库
  if [ -f "prisma/dev.sqlite" ]; then
    local db_backup="prisma/dev.sqlite.backup.$(date +%Y%m%d_%H%M%S)"
    sqlite3 prisma/dev.sqlite ".backup '$db_backup'" 2>/dev/null || {
      echo -e "${YELLOW}⚠️  数据库备份失败，继续部署${NC}"
    }
    echo -e "${GREEN}✅ 数据库已备份: $(basename $db_backup)${NC}"

    # 清理旧数据库备份
    local db_backup_count=$(ls -t prisma/dev.sqlite.backup.* 2>/dev/null | wc -l)
    if [ $db_backup_count -gt $BACKUP_KEEP_COUNT ]; then
      ls -t prisma/dev.sqlite.backup.* 2>/dev/null | tail -n +$((BACKUP_KEEP_COUNT + 1)) | xargs rm -f 2>/dev/null || true
    fi
  else
    echo -e "${YELLOW}⚠️  数据库文件不存在，跳过备份${NC}"
  fi

  # === Phase 3: Git 拉取 ===
  echo ""
  echo "=== Phase 3: 拉取代码 ==="

  # 获取当前状态
  git fetch origin
  local current_commit=$(git rev-parse HEAD)
  local current_branch=$(git branch --show-current)
  local remote_commit=$(git rev-parse origin/main)

  echo "📊 Git 状态:"
  echo "   当前分支: $current_branch"
  echo "   当前 commit: ${current_commit:0:8}"
  echo "   远程 commit: ${remote_commit:0:8}"

  if [ "$current_commit" == "$remote_commit" ]; then
    echo -e "${GREEN}✅ 已是最新代码，无需拉取${NC}"
    read -p "是否仍要继续部署（重新构建）? (y/N): " confirm
    [[ "$confirm" != "y" ]] && { echo "取消部署"; exit 0; }
    local last_commit="$current_commit"
  else
    echo ""
    echo "将要拉取的变更:"
    git log --oneline "$current_commit".."$remote_commit" | head -5

    echo ""
    read -p "❓ 确认从 main 分支拉取代码? (y/N): " confirm
    [[ "$confirm" != "y" ]] && { echo "取消部署"; exit 0; }

    local last_commit="$current_commit"
    git pull origin main

    # 验证配置文件未被覆盖
    if git status --porcelain | grep -E ".env|shopify.app.toml" 2>/dev/null; then
      echo -e "${RED}⚠️  警告: 配置文件被修改，正在恢复...${NC}"
      git checkout .env shopify.app.toml 2>/dev/null || true
      # 从备份恢复
      local latest_env_backup=$(ls -t .env.backup.* 2>/dev/null | head -1)
      local latest_toml_backup=$(ls -t shopify.app.toml.backup.* 2>/dev/null | head -1)
      [ -f "$latest_env_backup" ] && cp "$latest_env_backup" .env
      [ -f "$latest_toml_backup" ] && cp "$latest_toml_backup" shopify.app.toml
      echo -e "${GREEN}✅ 配置文件已恢复${NC}"
    fi
  fi

  # === Phase 4: 智能依赖安装 ===
  echo ""
  echo "=== Phase 4: 依赖检查 ==="

  local changed_files=$(git diff --name-only "$last_commit" HEAD 2>/dev/null || echo "")

  if echo "$changed_files" | grep -q "package-lock.json\|package.json"; then
    echo "📦 检测到依赖文件变更，执行 npm install..."
    npm install || {
      echo -e "${RED}❌ npm install 失败${NC}"
      exit 1
    }
    echo -e "${GREEN}✅ 依赖安装完成${NC}"
  else
    echo -e "${GREEN}✅ 依赖未变化，跳过 npm install（节省 30-60秒）${NC}"
  fi

  # === Phase 5: 构建 ===
  echo ""
  echo "=== Phase 5: 构建应用 ==="

  # 检查是否需要构建
  local needs_build=false
  if echo "$changed_files" | grep -qE "^(app/|prisma/schema.prisma|package.json)"; then
    needs_build=true
  fi

  if [ "$needs_build" = true ]; then
    echo "🔨 检测到代码变更，执行构建..."
  else
    echo "ℹ️  未检测到代码变更（仅文档/配置变更）"
    read -p "是否仍要构建? (Y/n): " confirm
    [[ "$confirm" == "n" ]] && {
      echo -e "${YELLOW}⚠️  跳过构建，直接重启服务${NC}"
    } || needs_build=true
  fi

  if [ "$needs_build" = true ]; then
    npm run build || {
      echo -e "${RED}❌ 构建失败${NC}"
      echo ""
      echo "回滚选项:"
      echo "  1. 查看错误: npm run build"
      echo "  2. 回退代码: git reset --hard $last_commit"
      echo "  3. 恢复配置: cp .env.backup.* .env"
      exit 1
    }
    echo -e "${GREEN}✅ 构建完成${NC}"
  fi

  # === Phase 6: 重启服务 ===
  echo ""
  echo "=== Phase 6: 重启服务 ==="

  echo "🔄 重启 PM2 进程: $pm2_apps"
  pm2 restart $pm2_apps

  echo "⏳ 等待服务启动..."
  sleep 3

  # === Phase 7: 验证 ===
  echo ""
  echo "=== Phase 7: 部署后验证 ==="

  # 检查进程状态
  echo "📊 PM2 进程状态:"
  pm2 status | grep -E "$pm2_apps" || {
    echo -e "${RED}❌ 进程状态异常${NC}"
    exit 1
  }

  # 检查错误日志
  echo ""
  echo "📋 最近错误日志（最近10条）:"
  local error_logs=$(pm2 logs --err --lines 10 --nostream $pm2_apps 2>/dev/null | grep -E "ERROR|Error" || echo "")
  if [ -n "$error_logs" ]; then
    echo -e "${YELLOW}⚠️  检测到错误日志:${NC}"
    echo "$error_logs"
    echo ""
    read -p "发现错误日志，是否仍认为部署成功? (y/N): " confirm
    [[ "$confirm" != "y" ]] && {
      echo -e "${RED}❌ 部署失败${NC}"
      exit 1
    }
  else
    echo -e "${GREEN}✅ 无错误日志${NC}"
  fi

  # 最终结果
  echo ""
  echo "============================================"
  echo -e "${GREEN}✅ 部署完成: $shop${NC}"
  echo "============================================"
  echo ""
  echo "📝 建议手动验证:"
  echo "  1. 访问 UI 页面"
  echo "  2. 测试批量发布功能"
  echo "  3. 检查 partial 状态记录"
  echo ""
  echo "📖 详细检查清单: scripts/DEPLOYMENT_CHECKLIST.md"
  echo ""
}

# === 主逻辑 ===
if [[ -z "$TARGET_SHOP" ]] || [[ ! "$TARGET_SHOP" =~ ^(shop1|shop2)$ ]]; then
  echo "用法: $0 <shop1|shop2>"
  echo ""
  echo "示例："
  echo "  $0 shop1      # 部署到 Fynony (shop1)"
  echo "  $0 shop2      # 部署到 OneWind (shop2)"
  echo ""
  echo "注意："
  echo "  - 部署前会自动验证环境配置"
  echo "  - 自动备份配置文件和数据库"
  echo "  - 智能判断是否需要 npm install"
  echo "  - 支持交互式确认关键操作"
  exit 1
fi

# 执行部署
deploy "$TARGET_SHOP"
