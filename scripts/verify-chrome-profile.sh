#!/usr/bin/env bash

# Verifies that the testing Chrome profile looks healthy and up-to-date.

set -euo pipefail

DEFAULT_SOURCE="$HOME/Library/Application Support/Google/Chrome/Profile 1"
DEFAULT_TARGET="$HOME/Library/Application Support/Google/Chrome/Profile 1 for Dev"

SOURCE_DIR="${CHROME_PROFILE_SOURCE_DIR:-${DEFAULT_SOURCE}}"
TARGET_DIR="${CHROME_PROFILE_TARGET_DIR:-${DEFAULT_TARGET}}"

usage() {
  cat <<EOF
Usage: $(basename "$0") [--source=<dir>] [--target=<dir>]

Environment overrides:
  CHROME_PROFILE_SOURCE_DIR   (default: ${DEFAULT_SOURCE})
  CHROME_PROFILE_TARGET_DIR   (default: ${DEFAULT_TARGET})
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source=*) SOURCE_DIR="${1#*=}" ;;
    --target=*) TARGET_DIR="${1#*=}" ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

OS_NAME="$(uname -s)"

stat_mtime() {
  local path="$1"
  if [[ "${OS_NAME}" == "Darwin" ]]; then
    stat -f "%m" "$path"
  else
    stat -c "%Y" "$path"
  fi
}

stat_size() {
  local path="$1"
  if [[ "${OS_NAME}" == "Darwin" ]]; then
    stat -f "%z" "$path"
  else
    stat -c "%s" "$path"
  fi
}

format_ts() {
  local ts="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$ts" <<'PY'
import sys
import datetime

ts = int(sys.argv[1])
print(datetime.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S"))
PY
  elif [[ "${OS_NAME}" == "Darwin" ]]; then
    date -r "$ts" "+%Y-%m-%d %H:%M:%S"
  else
    date -d "@$ts" "+%Y-%m-%d %H:%M:%S"
  fi
}

format_delta() {
  local delta=$1
  local sign="+"
  if (( delta < 0 )); then
    sign="-"
    delta=$(( -delta ))
  fi

  local hours=$(( delta / 3600 ))
  local minutes=$(( (delta % 3600) / 60 ))
  local seconds=$(( delta % 60 ))

  local parts=()
  if (( hours > 0 )); then
    parts+=("${hours}h")
  fi
  if (( minutes > 0 )); then
    parts+=("${minutes}m")
  fi
  if (( seconds > 0 && hours == 0 )); then
    parts+=("${seconds}s")
  fi
  if (( ${#parts[@]} == 0 )); then
    parts+=("0s")
  fi

  printf "%s%s" "${sign}" "$(IFS=; echo "${parts[*]}")"
}

print_dir_status() {
  local label="$1"
  local path="$2"

  if [[ -d "$path" ]]; then
    local size
    if size="$(du -sh "$path" 2>/dev/null | awk '{print $1}')"; then
      printf "✅ %s: %s (大小 %s)\n" "$label" "$path" "$size"
    else
      printf "✅ %s: %s\n" "$label" "$path"
    fi
  else
    printf "❌ %s 缺失: %s\n" "$label" "$path"
  fi
}

echo "🔍 Chrome Profile 健康检查"
print_dir_status "源 Profile" "$SOURCE_DIR"
print_dir_status "测试 Profile" "$TARGET_DIR"
echo ""

CRITICAL_FILES=("Cookies" "Cookies-journal" "Login Data" "Login Data-journal")

echo "📁 关键文件对比"
for file in "${CRITICAL_FILES[@]}"; do
  source_path="${SOURCE_DIR}/${file}"
  target_path="${TARGET_DIR}/${file}"

  if [[ ! -f "$source_path" ]]; then
    printf "⚠️  %s：源文件缺失\n" "$file"
    continue
  fi

  if [[ ! -f "$target_path" ]]; then
    printf "⚠️  %s：目标缺失\n" "$file"
    continue
  fi

  source_ts="$(stat_mtime "$source_path")"
  target_ts="$(stat_mtime "$target_path")"
  source_size="$(stat_size "$source_path")"
  target_size="$(stat_size "$target_path")"

  delta=$(( target_ts - source_ts ))
  delta_str="$(format_delta "$delta")"
  freshness="过期"
  symbol="⚠️"
  if (( delta >= 0 )); then
    freshness="最新"
    symbol="✅"
  fi

  printf "%s %s：目标%s (Δ %s)\n" "$symbol" "$file" "$freshness" "$delta_str"
  printf "   源:    %s (%s bytes)\n" "$(format_ts "$source_ts")" "$source_size"
  printf "   目标:  %s (%s bytes)\n" "$(format_ts "$target_ts")" "$target_size"
done

echo ""

LOCAL_STATE_SRC="$(dirname "$SOURCE_DIR")/Local State"
LOCAL_STATE_DST="${TARGET_DIR}/Local State"
echo "🗂️ Local State"
if [[ -f "$LOCAL_STATE_SRC" ]]; then
  if [[ -f "$LOCAL_STATE_DST" ]]; then
    src_ts="$(stat_mtime "$LOCAL_STATE_SRC")"
    dst_ts="$(stat_mtime "$LOCAL_STATE_DST")"
    delta=$(( dst_ts - src_ts ))
    delta_str="$(format_delta "$delta")"
    status="过期"
    symbol="⚠️"
    if (( delta >= 0 )); then
      status="最新"
      symbol="✅"
    fi
    printf "%s Local State：目标%s (Δ %s)\n" "$symbol" "$status" "$delta_str"
    printf "   源路径:   %s\n" "$LOCAL_STATE_SRC"
    printf "   目标路径: %s\n" "$LOCAL_STATE_DST"
  else
    printf "⚠️ Local State 目标缺失：%s\n" "$LOCAL_STATE_DST"
  fi
else
  printf "ℹ️ 源目录缺少 Local State（忽略即可）。\n"
fi

echo ""
echo "✅ 检查完成。如发现目标落后，请运行 scripts/sync-chrome-profile.sh 同步。"
