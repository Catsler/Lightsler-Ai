#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

AUTH_URL="${AUTH_URL:-${1:-}}"
API_URL="${API_URL:-${2:-}}"
ITERATIONS="${ITERATIONS:-100}"
CONCURRENCY="${CONCURRENCY:-5}"
TEXT="${TEXT:-Hello world}"
HEADLESS="${HEADLESS:-false}"
USE_CHROME="${USE_CHROME:-true}"
CHROME_PROFILE="${CHROME_PROFILE:-Profile 1}"
COOKIE_FILE="${COOKIE_FILE:-${ROOT_DIR}/tmp/session-cookie.json}"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT_DIR}/docs/performance}"
DATE_TAG="$(date +%Y%m%d)"
OUTPUT_FILE="${OUTPUT_FILE:-${OUTPUT_DIR}/production-baseline-${DATE_TAG}.json}"

if [[ -z "${AUTH_URL}" ]]; then
  echo "❌ 缺少 AUTH_URL。用法: AUTH_URL=... API_URL=... scripts/measure-production-perf.sh"
  exit 1
fi

if [[ -z "${API_URL}" ]]; then
  echo "❌ 缺少 API_URL。用法: AUTH_URL=... API_URL=... scripts/measure-production-perf.sh"
  exit 1
fi

mkdir -p "$(dirname "${COOKIE_FILE}")" "${OUTPUT_DIR}"

echo "📝 Step 1: 提取 Shopify 会话 Cookie (headless=${HEADLESS}, useChrome=${USE_CHROME})"
node "${ROOT_DIR}/scripts/extract-session-cookie.mjs" \
  --url="${AUTH_URL}" \
  --output="${COOKIE_FILE}" \
  --headless="${HEADLESS}" \
  --useChrome="${USE_CHROME}" \
  --chromeProfile="${CHROME_PROFILE}"

COOKIE=$(node - <<'NODE'
const fs = require('fs');
const file = process.argv[1];
if (!fs.existsSync(file)) {
  console.error('Cookie 文件不存在:', file);
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!data.cookieHeader) {
  console.error('Cookie 文件缺少 cookieHeader');
  process.exit(3);
}
console.log(data.cookieHeader);
NODE
"${COOKIE_FILE}")

echo "⚡ Step 2: 运行 API 性能测试 (iterations=${ITERATIONS}, concurrency=${CONCURRENCY})"
node "${ROOT_DIR}/scripts/api-performance-test.mjs" \
  --url="${API_URL}" \
  --iterations="${ITERATIONS}" \
  --concurrency="${CONCURRENCY}" \
  --text="${TEXT}" \
  --cookie="${COOKIE}" \
  --output="${OUTPUT_FILE}"

echo "✅ 完成，结果已写入: ${OUTPUT_FILE}"
echo "ℹ️ Cookie 长度: ${#COOKIE}，Cookie 文件: ${COOKIE_FILE}"
