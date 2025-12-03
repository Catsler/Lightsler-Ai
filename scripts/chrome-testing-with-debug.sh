#!/usr/bin/env bash

# Chrome automation profile launcher
# Usage:
#   chmod +x scripts/chrome-testing-with-debug.sh
#   scripts/chrome-testing-with-debug.sh
#
# First run: sign in to lampesmercy@gmail.com inside the launched Chrome window,
# then close Chrome. Subsequent runs will reuse the session for MCP debugging.

set -euo pipefail

CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
DEBUG_PORT="${BILLING_CHROME_DEBUG_PORT:-${CHROME_REMOTE_DEBUG_PORT:-9222}}"
USER_DATA_DIR="${CHROME_REMOTE_USER_DATA_DIR:-}"
PROFILE_NAME="${CHROME_REMOTE_PROFILE:-}"

extra_args=(
  "--remote-debugging-port=${DEBUG_PORT}"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-background-networking"
  "--disable-sync"
)

if [[ -n "${USER_DATA_DIR}" ]]; then
  mkdir -p "${USER_DATA_DIR}"
  extra_args+=("--user-data-dir=${USER_DATA_DIR}")
fi

if [[ -n "${PROFILE_NAME}" ]]; then
  extra_args+=("--profile-directory=${PROFILE_NAME}")
fi

echo "🚀 Launching Chrome test instance..."
if [[ -n "${USER_DATA_DIR}" ]]; then
  echo "📂 User data dir: ${USER_DATA_DIR}"
else
  echo "📂 Using system default user-data-dir"
fi
if [[ -n "${PROFILE_NAME}" ]]; then
  echo "👤 Profile      : ${PROFILE_NAME}"
fi
echo "🔌 Debug port   : ${DEBUG_PORT}"
echo "💡 Extra args   : ${*:-<none>}"

"${CHROME_APP}" \
  "${extra_args[@]}" \
  "$@" >/dev/null 2>&1 &

PID=$!
echo "✅ Chrome started (PID: ${PID})"
echo "🌐 DevTools endpoint: http://localhost:${DEBUG_PORT}"
echo "👉 若需保持 lampesmercy@gmail.com 登录，请在弹出的窗口内确认状态。"

# Wait for remote debugging endpoint to become available.
for attempt in {1..40}; do
  if curl -s "http://127.0.0.1:${DEBUG_PORT}/json/version" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

# Optionally open predefined URLs inside the launched Chrome session.
if [[ -n "${CHROME_REMOTE_START_URLS:-}" ]]; then
  IFS=$' \n\t' read -r -a __remote_urls <<<"${CHROME_REMOTE_START_URLS}"
  for url in "${__remote_urls[@]}"; do
    if [[ -n "${url}" ]]; then
      osascript -e 'tell application "Google Chrome" to open location "'"${url}"'"' >/dev/null 2>&1 || true
    fi
  done
  unset __remote_urls
fi
