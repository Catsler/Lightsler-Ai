#!/bin/bash

# OneWind应用权限更新脚本
# 用途：在本地部署更新OneWind生产应用的Shopify权限配置

set -e  # 遇到错误立即退出

echo "🚀 开始更新 OneWind 应用权限..."
echo ""

# 检查当前目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查配置文件存在
if [ ! -f "阿里云轻量服务器部署文件/shop2-shopify.app.toml" ]; then
    echo "❌ 错误：找不到OneWind配置文件"
    exit 1
fi

# 备份当前配置
echo "📦 备份当前开发环境配置..."
cp shopify.app.toml shopify.app.toml.dev-backup
cp .env .env.dev-backup
echo "✅ 备份完成: shopify.app.toml.dev-backup, .env.dev-backup"
echo ""

# 替换为OneWind生产配置
echo "🔄 切换到OneWind生产配置..."
cp 阿里云轻量服务器部署文件/shop2-shopify.app.toml shopify.app.toml

# 临时修改 .env 中的 SHOPIFY_API_KEY
sed -i.bak 's/^SHOPIFY_API_KEY=.*/SHOPIFY_API_KEY=8102af9807fd9df0b322a44f500a1d0e/' .env
echo "✅ 已替换为OneWind配置（shopify.app.toml + .env）"
echo ""
echo "📋 配置信息："
echo "   - Client ID: 8102af9807fd9df0b322a44f500a1d0e"
echo "   - 应用名: Lightsler AI - OneWind"
echo "   - 域名: https://onewind.ease-joy.fun"
echo ""

# 部署到Shopify
echo "📤 开始部署到Shopify..."
echo "⚠️  注意：这将更新Shopify平台端的应用配置"
echo ""
read -p "按回车继续部署，或Ctrl+C取消: " confirm

shopify app deploy --force

echo ""
echo "✅ Shopify配置已更新"
echo ""

# 恢复原配置
echo "♻️  恢复开发环境配置..."
mv shopify.app.toml.dev-backup shopify.app.toml
mv .env.dev-backup .env
rm -f .env.bak  # 清理 sed 产生的备份文件
echo "✅ 配置已恢复（shopify.app.toml + .env）"
echo ""

# 下一步指导
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ 部署完成！"
echo ""
echo "📌 下一步操作（重要）："
echo ""
echo "1️⃣  打开 Shopify Partner Dashboard:"
echo "   https://partners.shopify.com/"
echo ""
echo "2️⃣  找到 'Lightsler AI - OneWind' 应用"
echo ""
echo "3️⃣  点击 'Test on development store'"
echo ""
echo "4️⃣  选择 'onewindoutdoors' 店铺"
echo ""
echo "5️⃣  系统会提示 'App requires new permissions'"
echo ""
echo "6️⃣  点击 'Update and install' 重新授权"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  注意：必须完成上述重新授权步骤，权限才会生效！"
echo ""
