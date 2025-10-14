#!/bin/bash
###############################################################################
# 翻译数据备份脚本
#
# 用法：
#   ./scripts/maintenance/backup-translations.sh --shopId=shop1
#   ./scripts/maintenance/backup-translations.sh --shopId=shop2 --no-stop
#
# 参数：
#   --shopId     (必填) 店铺标识：shop1 (Fynony) 或 shop2 (OneWind)
#   --no-stop    (可选) 不停止应用，直接备份（数据库较小时可用）
#
# 输出：
#   /var/backups/translations/YYYY-MM-DD_HH-MM-SS/
#     ├── database.sql           (完整数据库导出)
#     ├── pending-translations.json  (待发布翻译记录)
#     └── backup-info.json       (备份元信息)
#
# 前提：
#   - 必须在服务器上执行（/var/www/app1-fynony 或 /var/www/app2-onewind）
#   - 需要 sudo 权限（用于 PM2 操作）
###############################################################################

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 解析参数
SHOP_ID=""
NO_STOP=false

for arg in "$@"; do
  case $arg in
    --shopId=*)
      SHOP_ID="${arg#*=}"
      shift
      ;;
    --no-stop)
      NO_STOP=true
      shift
      ;;
    *)
      ;;
  esac
done

# 验证参数
if [ -z "$SHOP_ID" ]; then
  echo -e "${RED}❌ 缺少 --shopId 参数${NC}"
  echo "用法: ./scripts/maintenance/backup-translations.sh --shopId=shop1"
  exit 1
fi

# 根据 shopId 确定目录和进程名
if [ "$SHOP_ID" = "shop1" ]; then
  APP_DIR="/var/www/app1-fynony"
  MAIN_PROCESS="shop1-fynony"
  WORKER_PROCESS="shop1-worker"
  SHOP_DOMAIN="sshvdt-ai.myshopify.com"
elif [ "$SHOP_ID" = "shop2" ]; then
  APP_DIR="/var/www/app2-onewind"
  MAIN_PROCESS="shop2-onewind"
  WORKER_PROCESS="shop2-worker"
  SHOP_DOMAIN="onewindoutdoors.myshopify.com"
else
  echo -e "${RED}❌ 无效的 shopId: $SHOP_ID${NC}"
  echo "支持的值: shop1 (Fynony) 或 shop2 (OneWind)"
  exit 1
fi

# 检查应用目录
if [ ! -d "$APP_DIR" ]; then
  echo -e "${RED}❌ 应用目录不存在: $APP_DIR${NC}"
  exit 1
fi

# 检查数据库文件
DB_FILE="$APP_DIR/prisma/dev.sqlite"
if [ ! -f "$DB_FILE" ]; then
  echo -e "${RED}❌ 数据库文件不存在: $DB_FILE${NC}"
  exit 1
fi

# 创建备份目录
BACKUP_ROOT="/var/backups/translations"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="$BACKUP_ROOT/$SHOP_ID-$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

echo -e "${CYAN}===== 翻译数据备份 =====${NC}\n"
echo -e "${BLUE}店铺: $SHOP_ID ($SHOP_DOMAIN)${NC}"
echo -e "${BLUE}应用目录: $APP_DIR${NC}"
echo -e "${BLUE}备份目录: $BACKUP_DIR${NC}"
echo -e "${BLUE}停止应用: $([ "$NO_STOP" = true ] && echo "否" || echo "是")${NC}\n"

# 停止应用（如果需要）
if [ "$NO_STOP" = false ]; then
  echo -e "${YELLOW}⏸️  停止应用进程...${NC}"
  pm2 stop "$MAIN_PROCESS" "$WORKER_PROCESS" > /dev/null 2>&1 || true
  sleep 2
  echo -e "${GREEN}✅ 应用已停止${NC}\n"
fi

# 1. 导出完整数据库
echo -e "${CYAN}📦 1. 导出完整数据库...${NC}"
sqlite3 "$DB_FILE" ".dump" > "$BACKUP_DIR/database.sql"
DB_SIZE=$(ls -lh "$BACKUP_DIR/database.sql" | awk '{print $5}')
echo -e "${GREEN}✅ 数据库已导出: database.sql ($DB_SIZE)${NC}\n"

# 2. 导出待发布翻译记录（JSON格式）
echo -e "${CYAN}📋 2. 导出待发布翻译记录...${NC}"
sqlite3 "$DB_FILE" <<EOF > "$BACKUP_DIR/pending-translations.json"
.mode json
SELECT
  t.id,
  t.language,
  t.syncStatus,
  t.createdAt,
  t.updatedAt,
  r.resourceType,
  r.gid,
  r.title
FROM Translation t
INNER JOIN Resource r ON t.resourceId = r.id
WHERE t.syncStatus = 'pending'
  AND r.shopId = '$SHOP_DOMAIN'
  AND r.resourceType = 'PRODUCT_OPTION'
ORDER BY t.updatedAt DESC;
EOF

PENDING_COUNT=$(jq 'length' "$BACKUP_DIR/pending-translations.json" 2>/dev/null || echo "0")
echo -e "${GREEN}✅ 待发布记录已导出: pending-translations.json (${PENDING_COUNT} 条)${NC}\n"

# 3. 生成备份元信息
echo -e "${CYAN}📝 3. 生成备份元信息...${NC}"
cat > "$BACKUP_DIR/backup-info.json" <<EOF
{
  "shopId": "$SHOP_ID",
  "shopDomain": "$SHOP_DOMAIN",
  "timestamp": "$TIMESTAMP",
  "backupDir": "$BACKUP_DIR",
  "appDir": "$APP_DIR",
  "databaseFile": "$DB_FILE",
  "databaseSize": "$DB_SIZE",
  "pendingTranslations": $PENDING_COUNT,
  "appStopped": $([ "$NO_STOP" = false ] && echo "true" || echo "false")
}
EOF
echo -e "${GREEN}✅ 元信息已生成: backup-info.json${NC}\n"

# 重启应用（如果之前停止了）
if [ "$NO_STOP" = false ]; then
  echo -e "${YELLOW}▶️  重启应用进程...${NC}"
  pm2 start "$MAIN_PROCESS" "$WORKER_PROCESS" > /dev/null 2>&1 || true
  sleep 2
  echo -e "${GREEN}✅ 应用已重启${NC}\n"
fi

# 输出备份汇总
echo -e "${CYAN}===== 备份完成 =====${NC}\n"
echo -e "${GREEN}备份位置: $BACKUP_DIR${NC}"
echo -e "${BLUE}包含文件:${NC}"
ls -lh "$BACKUP_DIR" | tail -n +2 | awk '{print "  - " $9 " (" $5 ")"}'
echo ""
echo -e "${YELLOW}💾 备份已保存到持久化目录，不会被自动清理${NC}"
echo -e "${BLUE}如需回滚，请运行: ./scripts/maintenance/rollback-translations.sh --backup=$BACKUP_DIR${NC}"
echo ""
