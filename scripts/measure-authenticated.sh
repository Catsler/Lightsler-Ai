#!/bin/bash
set -euo pipefail

TARGET_JSON="baseline-authenticated.json"
WAIT_MS=5000

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      TARGET_JSON="$2"
      shift 2
      ;;
    --wait)
      WAIT_MS="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: scripts/measure-authenticated.sh [--output file] [--wait ms]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

echo "🔐 Authenticated Performance Measurement"
echo "======================================="
echo "确保以下前提条件全部满足："
echo "  1. 已运行 ./scripts/start-chrome-testing.sh 并完成 Shopify 登录"
echo "  2. Browser 中已打开 Translator 页面 (https://translate.ease-joy.com/app 或嵌入式 Admin 页)"
echo "  3. Chrome DevTools 关闭（避免性能干扰）"
echo ""
read -rp "若已就绪请按 Enter 继续，或 Ctrl+C 退出..."

echo ""
echo "⚠️  操作步骤："
echo "  1. 切换至 Chrome 窗口"
echo "  2. 打开 DevTools → Application → Clear storage"
echo "     - 勾选 Cache storage、Local storage、Session storage"
echo "     - 保留 Cookies 选项（避免登出）"
echo "  3. 点击 'Clear site data'"
echo "  4. 关闭 DevTools"
echo "  5. 按 Cmd+R 刷新页面，等待完全加载"
echo "  6. 返回终端并按 Enter"
echo ""
read -rp "完成以上步骤后按 Enter 继续..."

echo "📊 正在采集性能数据... (wait=${WAIT_MS}ms)"
node scripts/diagnose-performance.mjs \
  --reload-mode=manual \
  --wait="${WAIT_MS}" \
  --output=json > "${TARGET_JSON}"

echo ""
echo "✅ 已写入 ${TARGET_JSON}"
echo "关键指标预览："
jq '{
  url: .navigation.url,
  FCP: .navigation.firstContentfulPaint,
  LCP: .navigation.largestContentfulPaint,
  TTFB: .navigation.timeToFirstByte,
  TTI: .navigation.timeToInteractive,
  TBT: .navigation.totalBlockingTime,
  resources: .navigation.resourceSummary.count
}' "${TARGET_JSON}" || true
