#!/bin/bash
set -euo pipefail

echo "🚀 性能优化体系快速启动"

# Step 1: 安装依赖
echo "📦 安装性能工具依赖..."
(cd scripts/performance && npm install)

echo "📊 采集基线数据..."
./scripts/performance/audit.sh

LATEST_DIR=$(ls -dt logs/performance/* | head -n 1)

echo "🔍 扫描第三方脚本..."
node scripts/performance/third-party-scanner.js "${LATEST_DIR}/fynony.json" > "${LATEST_DIR}/fynony-third-party.md"
node scripts/performance/third-party-scanner.js "${LATEST_DIR}/onewind.json" > "${LATEST_DIR}/onewind-third-party.md"

echo "📈 生成性能对比报告..."
node scripts/performance/compare-lighthouse.js \
  "${LATEST_DIR}/fynony.json" \
  "${LATEST_DIR}/onewind.json" \
  > "${LATEST_DIR}/comparison.md"

cp "${LATEST_DIR}/fynony.json" logs/performance/baseline/$(date +%Y%m%d)-fynony.json
cp "${LATEST_DIR}/onewind.json" logs/performance/baseline/$(date +%Y%m%d)-onewind.json

echo "✅ 快速验证完成，详见 ${LATEST_DIR}"
