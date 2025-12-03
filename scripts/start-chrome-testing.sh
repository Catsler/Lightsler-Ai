#!/bin/bash
#
# Helper script to launch a Chrome instance dedicated to MCP/automation work.
# It uses an isolated user-data-dir so we can safely enable remote debugging.
#
# Usage:
#   ./scripts/start-chrome-testing.sh
#   ./scripts/start-chrome-testing.sh -- <extra chrome args>
#
# Optional environment variables:
#   CHROME_REMOTE_DEBUG_PORT  (default: 9222)
#   CHROME_REMOTE_USER_DATA_DIR (default: "$HOME/chrome-testing-data")

set -euo pipefail

CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ ! -x "${CHROME_APP}" ]]; then
  echo "❌ Chrome executable not found at ${CHROME_APP}"
  exit 1
fi

DEBUG_PORT="${CHROME_REMOTE_DEBUG_PORT:-9222}"
USER_DATA_DIR="${CHROME_REMOTE_USER_DATA_DIR:-}"
PROFILE_NAME="${CHROME_REMOTE_PROFILE:-}"
USE_DEFAULT_PROFILE="${CHROME_REMOTE_USE_DEFAULT:-0}"

DEFAULT_CLONE_DIR="$HOME/Library/Application Support/Google/Chrome/Profile 1 for Dev"
PROFILE_SOURCE_DIR="$HOME/Library/Application Support/Google/Chrome/Profile 1"
PROFILE_CHECK_DIR="${USER_DATA_DIR:-${DEFAULT_CLONE_DIR}}"

if [[ "${USE_DEFAULT_PROFILE}" != "1" ]]; then
  echo "🔍 检查前置条件..."
  if [[ ! -d "${PROFILE_CHECK_DIR}" ]]; then
    cat <<EOF
❌ Profile 不存在：${PROFILE_CHECK_DIR}

📖 请先参照 docs/browser-testing-profile.md 中的“Profile 管理”章节完成同步。

💡 快速同步示例（首次复制可能较慢）：
  rsync -av --progress \\
    "${PROFILE_SOURCE_DIR}/" \\
    "${PROFILE_CHECK_DIR}/"
EOF
    exit 1
  fi

  CRITICAL_FILES=("Cookies" "Login Data")
  MISSING_FILES=()
  for critical in "${CRITICAL_FILES[@]}"; do
    if [[ ! -f "${PROFILE_CHECK_DIR}/${critical}" ]]; then
      MISSING_FILES+=("${critical}")
    fi
  done

  if [[ ${#MISSING_FILES[@]} -gt 0 ]]; then
    echo "⚠️ Profile 可能缺少关键文件：${MISSING_FILES[*]}"
    echo "   建议重新同步 Cookies/Login Data："
    echo "   rsync -av --progress \\
      --include='Cookies*' --include='Login Data*' \\
      --exclude='*' \\
      \"${PROFILE_SOURCE_DIR}/\" \\
      \"${PROFILE_CHECK_DIR}/\""
  else
    echo "✅ 前置条件检查通过"
  fi
  echo ""
fi

CHROME_ARGS=(
  "--remote-debugging-port=${DEBUG_PORT}"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-background-networking"
  "--disable-sync"
)

if [[ -n "${USER_DATA_DIR}" ]]; then
  mkdir -p "${USER_DATA_DIR}"
  CHROME_ARGS+=("--user-data-dir=${USER_DATA_DIR}")
else
  echo "   ➜ User data dir: <system default>"
fi

if [[ -n "${PROFILE_NAME}" ]]; then
  CHROME_ARGS+=("--profile-directory=${PROFILE_NAME}")
  echo "   ➜ Profile      : ${PROFILE_NAME}"
fi

echo "🚀 Launching Chrome testing profile"
echo "   ➜ Debug port : ${DEBUG_PORT}"
echo "   ➜ Extra args : ${*:-<none>}"
echo ""
echo "首次运行请在弹出的浏览器中手动登录 lampesmercy@gmail.com。"
echo "登录成功后关闭窗口，后续再运行此脚本将保留登录状态。"
echo ""
echo "Chrome will stay attached to your current shell; press Ctrl+C to terminate."

exec "${CHROME_APP}" \
  "${CHROME_ARGS[@]}" \
  "$@"
