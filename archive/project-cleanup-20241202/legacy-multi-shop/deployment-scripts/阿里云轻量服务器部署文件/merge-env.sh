#!/bin/bash
# 环境变量合并脚本
# 功能：将新增的环境变量追加到现有 .env 文件，保护已有的密钥配置

set -euo pipefail

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

error() {
    echo -e "${RED}❌${NC} $1"
}

# 参数检查
if [ $# -lt 2 ]; then
    error "用法: $0 <目标.env文件> <模板文件>"
    echo "示例: $0 /var/www/app1-fynony/.env /tmp/.env.example"
    exit 1
fi

ENV_FILE=$1
TEMPLATE_FILE=$2

# 文件存在性检查
if [ ! -f "$ENV_FILE" ]; then
    error "目标文件不存在: $ENV_FILE"
    exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
    error "模板文件不存在: $TEMPLATE_FILE"
    exit 1
fi

log "开始合并环境变量..."
log "目标文件: $ENV_FILE"
log "模板文件: $TEMPLATE_FILE"

# 备份原文件
BACKUP_FILE="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"
success "已备份原文件: $BACKUP_FILE"

# 统计变量
ADDED_COUNT=0
SKIPPED_COUNT=0

# 提取模板中的所有变量并追加
log "扫描新增变量..."
while IFS= read -r line; do
    # 跳过注释和空行
    if [[ "$line" =~ ^#.*$ ]] || [[ -z "$line" ]]; then
        continue
    fi

    # 提取变量名（等号前的部分）
    if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)= ]]; then
        key="${BASH_REMATCH[1]}"

        # 检查变量是否已存在
        if grep -q "^${key}=" "$ENV_FILE"; then
            log "跳过已存在变量: $key"
            ((SKIPPED_COUNT++))
        else
            # 追加新变量
            echo "$line" >> "$ENV_FILE"
            success "➕ 添加新变量: $key"
            ((ADDED_COUNT++))
        fi
    fi
done < "$TEMPLATE_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "环境变量合并完成！"
echo "  📊 新增变量: $ADDED_COUNT"
echo "  ⏭️  跳过变量: $SKIPPED_COUNT"
echo "  💾 备份文件: $BACKUP_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 验证关键变量
log "验证必需变量..."
REQUIRED_VARS=("SHOPIFY_API_KEY" "SHOPIFY_API_SECRET" "GPT_API_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" "$ENV_FILE"; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    warning "缺少必需变量: ${MISSING_VARS[*]}"
    warning "请手动补充这些变量"
    exit 1
else
    success "所有必需变量检查通过"
fi

# 显示新增变量列表
if [ $ADDED_COUNT -gt 0 ]; then
    echo ""
    log "新增变量清单（请检查默认值是否合适）："
    grep -Ff <(grep -E '^[A-Z_]+=' "$TEMPLATE_FILE" | cut -d= -f1) "$ENV_FILE" | tail -n $ADDED_COUNT
fi

# 检查关键变量的配置差异
echo ""
log "检查关键配置差异..."
CRITICAL_VARS=("REDIS_URL" "QUEUE_CONCURRENCY" "NODE_ENV" "GPT_MODEL" "DATABASE_URL")
DIFF_FOUND=false

for var in "${CRITICAL_VARS[@]}"; do
    OLD_VALUE=$(grep "^${var}=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")
    NEW_VALUE=$(grep "^${var}=" "$TEMPLATE_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' || echo "")

    if [ -n "$NEW_VALUE" ] && [ "$OLD_VALUE" != "$NEW_VALUE" ]; then
        if [ "$DIFF_FOUND" = false ]; then
            warning "发现以下配置差异，请确认是否需要手动更新："
            DIFF_FOUND=true
        fi
        echo "  📝 $var:"
        echo "     当前值: $OLD_VALUE"
        echo "     模板值: $NEW_VALUE"
    fi
done

if [ "$DIFF_FOUND" = false ]; then
    success "关键配置无差异"
fi

success "环境变量合并成功完成！"