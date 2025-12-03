#!/bin/bash

# 统一以指定 Profile 打开 Chrome，避免测试时新建临时浏览器导致未登录
# 默认 Profile 目录：~/.lightsler/chrome-profiles/dev-lampes
# 默认应用路径：macOS -> /Applications/Google Chrome.app
#
# 首次运行后请在弹出的浏览器内使用 lampesmercy@gmail.com 登录，
# 登录状态将保存在该 Profile 中，后续执行脚本会自动复用。

set -euo pipefail

DEFAULT_PROFILE_ROOT="$HOME/.lightsler/chrome-profiles/dev-lampes"
DEFAULT_PROFILE_DIR="Default"
LAMPMERCY_ROOT="$HOME/Library/Application Support/Google/Chrome"
LAMPMERCY_DIR="Profile 1"

if [ -n "${LIGHTSLER_DEV_CHROME_PROFILE:-}" ]; then
  PROFILE_ROOT="$LIGHTSLER_DEV_CHROME_PROFILE"
  PROFILE_DIR="${LIGHTSLER_DEV_CHROME_PROFILE_DIRECTORY:-$DEFAULT_PROFILE_DIR}"
else
  if [ -f "$LAMPMERCY_ROOT/$LAMPMERCY_DIR/Preferences" ] && \
     grep -q "lampesmercy@gmail.com" "$LAMPMERCY_ROOT/$LAMPMERCY_DIR/Preferences"; then
    PROFILE_ROOT="$LAMPMERCY_ROOT"
    PROFILE_DIR="$LAMPMERCY_DIR"
  else
    PROFILE_ROOT="$DEFAULT_PROFILE_ROOT"
    PROFILE_DIR="$DEFAULT_PROFILE_DIR"
  fi
fi

CHROME_APP_PATH="${CHROME_APP_PATH:-/Applications/Google Chrome.app}"
CHROME_BIN="${CHROME_BIN:-google-chrome}"

mkdir -p "$PROFILE_ROOT"

launch_chrome_mac() {
  if [ ! -d "$CHROME_APP_PATH" ]; then
    echo "未找到 Chrome 应用：$CHROME_APP_PATH"
    echo "请通过 LIGHTSLER_CHROME_APP_PATH 环境变量指定正确位置。"
    exit 1
  fi

  echo "使用 Profile Root：$PROFILE_ROOT"
  echo "使用 Profile：$PROFILE_DIR"
  open -na "$CHROME_APP_PATH" --args \
    --user-data-dir="$PROFILE_ROOT" \
    --profile-directory="$PROFILE_DIR" \
    --no-first-run \
    --disable-first-run-ui \
    "$@"
}

launch_chrome_linux() {
  if ! command -v "$CHROME_BIN" >/dev/null 2>&1; then
    echo "未找到 Chrome 可执行文件：$CHROME_BIN"
    echo "请通过 CHROME_BIN 环境变量指定正确位置。"
    exit 1
  fi

  echo "使用 Profile Root：$PROFILE_ROOT"
  echo "使用 Profile：$PROFILE_DIR"
  "$CHROME_BIN" \
    --user-data-dir="$PROFILE_ROOT" \
    --profile-directory="$PROFILE_DIR" \
    --no-first-run \
    --disable-first-run-ui \
    "$@" >/dev/null 2>&1 &
}

case "$(uname -s)" in
  Darwin)
    launch_chrome_mac "$@"
    ;;
  Linux)
    launch_chrome_linux "$@"
    ;;
  *)
    echo "暂不支持的平台：$(uname -s)"
    exit 1
    ;;
esac
