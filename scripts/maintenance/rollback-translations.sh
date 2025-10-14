#!/bin/bash
###############################################################################
# 翻译数据回滚脚本
#
# 用法：
#   ./scripts/maintenance/rollback-translations.sh --backup=/var/backups/translations/shop1-2025-10-13_15-30-00
#
# 参数：
#   --backup  (必填) 备份目录路径（由 backup-translations.sh 生成）
#
# 安全措施：
#   - 停止应用再回滚
#   - 验证备份文件完整性
#   - 回滚后运行验证脚本确认状态
#
# 前提：
#   - 必须在服务器上执行（/var/www/app1-fynony 或 /var/www/app2-onewind）
#   - 需要 sudo 权限（用于 PM2 操作）
#   - 备份目录包含 database.sql 和 backup-info.json
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
BACKUP_DIR=""

for arg in "$@"; do
  case $arg in
    --backup=*)
      BACKUP_DIR="${arg#*=}"
      shift
      ;;
    *)
      ;;
  esac
done

# 验证参数
if [ -z "$BACKUP_DIR" ]; then
  echo -e "${RED}❌ 缺少 --backup 参数${NC}"
  echo "用法: ./scripts/maintenance/rollback-translations.sh --backup=/var/backups/translations/shop1-2025-10-13_15-30-00"
  exit 1
fi

# 检查备份目录
if [ ! -d "$BACKUP_DIR" ]; then
  echo -e "${RED}❌ 备份目录不存在: $BACKUP_DIR${NC}"
  exit 1
fi

# 检查备份文件
BACKUP_SQL="$BACKUP_DIR/database.sql"
BACKUP_INFO="$BACKUP_DIR/backup-info.json"

if [ ! -f "$BACKUP_SQL" ]; then
  echo -e "${RED}❌ 备份数据库文件不存在: $BACKUP_SQL${NC}"
  exit 1
fi

if [ ! -f "$BACKUP_INFO" ]; then
  echo -e "${RED}❌ 备份元信息文件不存在: $BACKUP_INFO${NC}"
  exit 1
fi

# 读取备份元信息
SHOP_ID=$(jq -r '.shopId' "$BACKUP_INFO")
SHOP_DOMAIN=$(jq -r '.shopDomain' "$BACKUP_INFO")
APP_DIR=$(jq -r '.appDir' "$BACKUP_INFO")
DB_FILE=$(jq -r '.databaseFile' "$BACKUP_INFO")
BACKUP_TIMESTAMP=$(jq -r '.timestamp' "$BACKUP_INFO")

echo -e "${CYAN}===== 翻译数据回滚 =====${NC}\n"
echo -e "${BLUE}备份目录: $BACKUP_DIR${NC}"
echo -e "${BLUE}备份时间: $BACKUP_TIMESTAMP${NC}"
echo -e "${BLUE}店铺: $SHOP_ID ($SHOP_DOMAIN)${NC}"
echo -e "${BLUE}应用目录: $APP_DIR${NC}"
echo -e "${BLUE}数据库: $DB_FILE${NC}\n"

# 确认操作
echo -e "${YELLOW}⚠️  警告：回滚操作将覆盖当前数据库${NC}"
echo -e "${YELLOW}当前数据库将被备份到: $DB_FILE.before-rollback${NC}\n"
read -p "确认执行回滚操作？(yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${RED}❌ 回滚已取消${NC}"
  exit 1
fi

# 根据 shopId 确定进程名
if [ "$SHOP_ID" = "shop1" ]; then
  MAIN_PROCESS="shop1-fynony"
  WORKER_PROCESS="shop1-worker"
elif [ "$SHOP_ID" = "shop2" ]; then
  MAIN_PROCESS="shop2-onewind"
  WORKER_PROCESS="shop2-worker"
else
  echo -e "${RED}❌ 无效的 shopId: $SHOP_ID${NC}"
  exit 1
fi

# 1. 停止应用
echo -e "${YELLOW}⏸️  1. 停止应用进程...${NC}"
pm2 stop "$MAIN_PROCESS" "$WORKER_PROCESS" > /dev/null 2>&1 || true
sleep 2
echo -e "${GREEN}✅ 应用已停止${NC}\n"

# 2. 备份当前数据库
echo -e "${CYAN}💾 2. 备份当前数据库...${NC}"
CURRENT_BACKUP="$DB_FILE.before-rollback-$(date +%Y%m%d%H%M%S)"
sqlite3 "$DB_FILE" ".dump" > "$CURRENT_BACKUP"
CURRENT_BACKUP_SIZE=$(ls -lh "$CURRENT_BACKUP" | awk '{print $5}')
echo -e "${GREEN}✅ 当前数据库已备份: $CURRENT_BACKUP ($CURRENT_BACKUP_SIZE)${NC}\n"

# 3. 执行回滚
echo -e "${CYAN}🔄 3. 恢复备份数据库...${NC}"

# 删除当前数据库
rm -f "$DB_FILE"
rm -f "$DB_FILE-shm"
rm -f "$DB_FILE-wal"

# 从备份恢复
sqlite3 "$DB_FILE" < "$BACKUP_SQL"

RESTORED_SIZE=$(ls -lh "$DB_FILE" | awk '{print $5}')
echo -e "${GREEN}✅ 数据库已恢复: $DB_FILE ($RESTORED_SIZE)${NC}\n"

# 4. 重启应用
echo -e "${YELLOW}▶️  4. 重启应用进程...${NC}"
pm2 start "$MAIN_PROCESS" "$WORKER_PROCESS" > /dev/null 2>&1 || true
sleep 3
echo -e "${GREEN}✅ 应用已重启${NC}\n"

# 5. 验证回滚结果
echo -e "${CYAN}✔️  5. 验证回滚结果...${NC}"

# 等待应用启动
sleep 2

# 查询待发布翻译数量
PENDING_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM Translation t INNER JOIN Resource r ON t.resourceId = r.id WHERE t.syncStatus = 'pending' AND r.shopId = '$SHOP_DOMAIN' AND r.resourceType = 'PRODUCT_OPTION';")

echo -e "${BLUE}待发布翻译数量: $PENDING_COUNT${NC}"

# 运行验证脚本（可选，如果脚本存在）
VERIFY_SCRIPT="$APP_DIR/scripts/verify-shopify-sync-status.mjs"
if [ -f "$VERIFY_SCRIPT" ]; then
  echo -e "${CYAN}运行验证脚本...${NC}"
  cd "$APP_DIR"
  node "$VERIFY_SCRIPT" --shopId="$SHOP_DOMAIN" --sample=3 --resourceType=PRODUCT_OPTION || echo -e "${YELLOW}⚠️  验证脚本执行失败，请手动检查${NC}"
else
  echo -e "${YELLOW}⚠️  验证脚本不存在，请手动验证: $VERIFY_SCRIPT${NC}"
fi

echo ""

# 输出回滚汇总
echo -e "${CYAN}===== 回滚完成 =====${NC}\n"
echo -e "${GREEN}✅ 数据库已恢复到: $BACKUP_TIMESTAMP${NC}"
echo -e "${BLUE}当前数据库备份: $CURRENT_BACKUP${NC}"
echo -e "${BLUE}应用状态: $(pm2 list | grep -E "$MAIN_PROCESS|$WORKER_PROCESS" || echo "未知")${NC}\n"
echo -e "${YELLOW}⚠️  如回滚后仍有问题，可再次恢复: $CURRENT_BACKUP${NC}"
echo -e "${BLUE}恢复命令: sqlite3 $DB_FILE < $CURRENT_BACKUP${NC}"
echo ""
