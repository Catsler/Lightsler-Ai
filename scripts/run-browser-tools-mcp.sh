#!/bin/bash
set -euo pipefail

PORT="${BROWSER_TOOLS_SERVER_PORT:-3025}"

# Start the Browser Tools server if it's not already listening.
SERVER_ALREADY_RUNNING=false
if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    SERVER_ALREADY_RUNNING=true
    echo "Browser Tools server already running on port ${PORT}"
  fi
fi

if [ "${SERVER_ALREADY_RUNNING}" = false ]; then
  echo "Starting Browser Tools server on port ${PORT}..."
  npx -y @agentdeskai/browser-tools-server --port "${PORT}" --no-browser &
  SERVER_PID=$!
  trap 'kill "${SERVER_PID}" 2>/dev/null || true' EXIT
  sleep 2
fi

# Launch the MCP server (blocks until the MCP process exits).
npx -y @agentdeskai/browser-tools-mcp@latest
EXIT_CODE=$?

if [ "${SERVER_ALREADY_RUNNING}" = false ]; then
  kill "${SERVER_PID}" 2>/dev/null || true
fi

exit "${EXIT_CODE}"
