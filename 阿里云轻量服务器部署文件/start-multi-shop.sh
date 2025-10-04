#!/bin/bash

# 多店铺Shopify应用启动脚本
# 包含健康检查和故障恢复

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠️${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ❌${NC} $1"
}

# 检查环境变量
check_env() {
    log "检查环境变量..."

    if [ ! -f ".env" ]; then
        error ".env文件不存在，请复制.env.template并配置"
        exit 1
    fi

    source .env

    # 检查必需的环境变量
    required_vars=("SHOPIFY_API_KEY" "SHOPIFY_API_SECRET" "GPT_API_KEY")

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            error "缺少必需的环境变量: $var"
            exit 1
        fi
    done

    success "环境变量检查通过"
}

# 检查Redis连接
check_redis() {
    log "检查Redis连接..."

    if [ -n "$REDIS_URL" ]; then
        # 尝试连接Redis
        if command -v redis-cli >/dev/null 2>&1; then
            if redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then
                success "Redis连接正常"
            else
                warning "Redis连接失败，将使用内存模式"
            fi
        else
            warning "redis-cli未安装，跳过Redis连接检查"
        fi
    else
        warning "未配置REDIS_URL，将使用内存模式"
    fi
}

# 数据库迁移
run_migrations() {
    log "运行数据库迁移..."

    if npx prisma migrate deploy; then
        success "数据库迁移完成"
    else
        error "数据库迁移失败"
        exit 1
    fi
}

# 启动应用
start_apps() {
    log "启动多店铺应用..."

    # 检查PM2是否已安装
    if ! command -v pm2 >/dev/null 2>&1; then
        warning "PM2未安装，正在安装..."
        npm install -g pm2
    fi

    # 停止现有进程
    pm2 stop ecosystem.config.js >/dev/null 2>&1 || true

    # 启动应用
    if pm2 start ecosystem.config.js --env production; then
        success "应用启动成功"
    else
        error "应用启动失败"
        exit 1
    fi

    # 保存PM2配置
    pm2 save

    # 显示状态
    pm2 list
}

# 健康检查
health_check() {
    log "执行健康检查..."

    # 等待应用启动
    sleep 5

    # 检查端口3001（shop1）
    if curl -f http://localhost:3001/healthz >/dev/null 2>&1; then
        success "Shop1 (端口3001) 健康检查通过"
    else
        warning "Shop1 (端口3001) 健康检查失败"
    fi

    # 检查端口3002（shop2）
    if curl -f http://localhost:3002/healthz >/dev/null 2>&1; then
        success "Shop2 (端口3002) 健康检查通过"
    else
        warning "Shop2 (端口3002) 健康检查失败"
    fi
}

# 显示监控信息
show_monitoring() {
    log "监控信息："
    echo ""
    echo "📊 实时监控: pm2 monit"
    echo "📋 查看状态: pm2 list"
    echo "📝 查看日志: pm2 logs"
    echo "🔄 重启应用: pm2 restart ecosystem.config.js"
    echo "🛑 停止应用: pm2 stop ecosystem.config.js"
    echo ""
    echo "🌐 访问地址:"
    echo "  Shop1: http://localhost:3001"
    echo "  Shop2: http://localhost:3002"
    echo ""
}

# 主函数
main() {
    log "开始启动多店铺Shopify翻译应用..."
    echo ""

    check_env
    check_redis
    run_migrations
    start_apps
    health_check
    show_monitoring

    success "多店铺应用启动完成！"
}

# 错误处理
trap 'error "启动过程中出现错误，请检查日志"; exit 1' ERR

# 执行主函数
main "$@"