#!/usr/bin/env bash
#
# Wrapper used by MCP to ensure chrome-devtools connects to the pre-authenticated
# lampesmercy@gmail.com testing profile instead of spawning a fresh browser.
# 1. Ensures the dedicated Chrome instance is running on the expected port.
# 2. Launches it via scripts/chrome-testing-with-debug.sh when absent.
# 3. Delegates to chrome-devtools-mcp, telling it to attach to the running browser.
#
# Environment overrides:
#   CHROME_REMOTE_DEBUG_PORT      (default: 9222)
#   CHROME_REMOTE_USER_DATA_DIR   (default: "$HOME/chrome-testing-data")

set -euo pipefail

PORT="${CHROME_REMOTE_DEBUG_PORT:-9222}"

DEFAULT_USER_DATA_DIR="$HOME/chrome-mcp-profile"

if [[ "${CHROME_REMOTE_USE_DEFAULT:-0}" == "1" ]]; then
  USER_DATA_DIR=""
else
  USER_DATA_DIR="${CHROME_REMOTE_USER_DATA_DIR:-}"
  if [[ -z "${USER_DATA_DIR}" && -d "${DEFAULT_USER_DATA_DIR}" ]]; then
    USER_DATA_DIR="${DEFAULT_USER_DATA_DIR}"
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LAUNCHER="${REPO_ROOT}/scripts/chrome-testing-with-debug.sh"

if [[ ! -x "${LAUNCHER}" ]]; then
  echo "❌ Missing launcher script at ${LAUNCHER}" >&2
  exit 1
fi

is_port_listening() {
  lsof -PiTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1
}

print_port_usage() {
  if command -v lsof >/dev/null 2>&1; then
    local output
    if output="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>&1)"; then
      if [[ -n "${output//[[:space:]]/}" ]]; then
        echo "   • 当前监听进程："
        echo "${output}" | sed 's/^/     /'
      fi
    else
      echo "   • 端口检查失败（可能需要权限）。尝试：sudo lsof -i :${PORT}"
      if command -v netstat >/dev/null 2>&1; then
        echo "   • 或使用：netstat -an | grep ${PORT}"
      fi
    fi
  else
    echo "   • 系统缺少 lsof，可改用：netstat -an | grep ${PORT}"
  fi
}

# Require the caller to have launched the desired Chrome profile manually.
if ! is_port_listening; then
  cat >&2 <<EOF
❌ 未检测到运行在端口 ${PORT} 上的 Chrome 远程调试实例。

🔍 诊断步骤：
   1. 确认 Chrome 是否以远程调试模式运行：
      ps aux | grep "remote-debugging-port=${PORT}"
   2. 若尚未启动，可执行：
      CHROME_REMOTE_PROFILE="Profile 1" \\
      CHROME_REMOTE_USE_DEFAULT=1 \\
      ${LAUNCHER}
   3. 如果怀疑端口被占用：
      lsof -i :${PORT}
      ↳ 如需终止：kill -9 <PID>
EOF
  exit 1
fi

set +e
CURL_OUTPUT="$(curl --silent --show-error "http://127.0.0.1:${PORT}/json/version" 2>&1)"
CURL_STATUS=$?
set -e

if [[ ${CURL_STATUS} -ne 0 ]]; then
  {
    echo "❌ 无法连接到 Chrome 调试端点 (http://127.0.0.1:${PORT}/json/version)"
    if [[ -n "${CURL_OUTPUT}" ]]; then
      echo ""
      echo "💬 curl 输出："
      echo "${CURL_OUTPUT}" | sed 's/^/   /'
    fi
    echo ""
    echo "🔍 诊断步骤："
    echo "   1. 确认调试进程仍在运行："
    echo "      ps aux | grep \"remote-debugging-port=${PORT}\""
    echo "   2. 检查端口占用情况："
    echo "      lsof -i :${PORT}"
    print_port_usage
    echo "   3. 如需重新启动测试浏览器："
    echo "      ${LAUNCHER}"
  } >&2
  exit 1
fi

VERSION_JSON="${CURL_OUTPUT}"

PYTHON_CODE=$(cat <<'PY'
import json
import sys

try:
    data = json.load(sys.stdin)
except json.JSONDecodeError as exc:
    print(f"JSON_ERROR:{exc}", end="")
    sys.exit(2)

print(data.get("webSocketDebuggerUrl", ""), end="")
PY
)

set +e
PYTHON_OUTPUT="$(python3 -c "${PYTHON_CODE}" <<<"${VERSION_JSON}" 2>&1)"
PYTHON_STATUS=$?
set -e

if [[ ${PYTHON_STATUS} -ne 0 ]]; then
  if [[ ${PYTHON_STATUS} -eq 2 && "${PYTHON_OUTPUT}" == JSON_ERROR:* ]]; then
    {
      echo "❌ Chrome 调试协议响应解析失败（JSON 格式错误）。"
      echo "💬 Python 错误：${PYTHON_OUTPUT#JSON_ERROR:}"
      echo ""
      echo "📦 原始响应："
      echo "${VERSION_JSON}" | sed 's/^/   /'
      echo ""
      echo "🔍 诊断步骤："
      echo "   1. 确认端口返回的确是 Chrome 调试协议："
      echo "      curl http://127.0.0.1:${PORT}/json/version"
      echo "   2. 检查端口占用详情："
      echo "      lsof -i :${PORT}"
      print_port_usage
      echo "   3. 重启远程调试实例后重试："
      echo "      ${LAUNCHER}"
    } >&2
  else
    {
      echo "❌ 无法解析 Chrome 调试协议响应。"
      if [[ -n "${PYTHON_OUTPUT}" ]]; then
        echo "💬 Python 输出：${PYTHON_OUTPUT}"
      fi
    } >&2
  fi
  exit 1
fi

WEBSOCKET_URL="${PYTHON_OUTPUT}"

if [[ -z "${WEBSOCKET_URL}" ]]; then
  {
    echo "❌ Chrome 调试协议缺少 webSocketDebuggerUrl。"
    echo ""
    echo "📦 当前响应："
    echo "${VERSION_JSON}" | sed 's/^/   /'
    echo ""
    echo "🔍 诊断步骤："
    echo "   1. 确认访问的是 Chrome 调试端口："
    echo "      curl http://127.0.0.1:${PORT}/json/version"
    echo "   2. 检查端口占用详情："
    echo "      lsof -i :${PORT}"
    print_port_usage
    echo "   3. 重启远程调试实例后重试："
    echo "      ${LAUNCHER}"
  } >&2
  exit 1
fi

echo "✅ 检测到 Chrome 远程调试端口：http://127.0.0.1:${PORT}"
if [[ -n "${USER_DATA_DIR}" ]]; then
  echo "🔐 复用的用户目录：${USER_DATA_DIR}"
else
  echo "🔐 使用系统默认用户目录（请确保 Profile 已保持登录）"
fi
echo "🔗 WebSocket Endpoint: ${WEBSOCKET_URL}"

exec npx -y chrome-devtools-mcp --wsEndpoint "${WEBSOCKET_URL}"
