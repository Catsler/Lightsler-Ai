#!/usr/bin/env bash

# Helper to copy Chrome profile data from the primary profile into the
# dedicated testing profile. Defaults to incremental sync (Cookies/Login Data).

set -euo pipefail

DEFAULT_SOURCE="$HOME/Library/Application Support/Google/Chrome/Profile 1"
DEFAULT_TARGET="$HOME/Library/Application Support/Google/Chrome/Profile 1 for Dev"

SOURCE_DIR="${CHROME_PROFILE_SOURCE_DIR:-${DEFAULT_SOURCE}}"
TARGET_DIR="${CHROME_PROFILE_TARGET_DIR:-${DEFAULT_TARGET}}"
MODE="incremental"
DRY_RUN=0
ASSUME_YES=0
COPY_LOCAL_STATE="auto"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --source=<dir>           Override source profile directory
  --target=<dir>           Override destination profile directory
  --full                   Copy entire profile directory
  --incremental            Only copy Cookies/Login Data (default)
  --with-local-state       Also copy the shared "Local State" file
  --no-local-state         Skip copying "Local State"
  --dry-run                Show rsync actions without writing
  -y, --yes                Skip confirmation prompt
  -h, --help               Show this help text

Environment overrides:
  CHROME_PROFILE_SOURCE_DIR   (default: ${DEFAULT_SOURCE})
  CHROME_PROFILE_TARGET_DIR   (default: ${DEFAULT_TARGET})
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source=*) SOURCE_DIR="${1#*=}" ;;
    --target=*) TARGET_DIR="${1#*=}" ;;
    --full) MODE="full" ;;
    --incremental) MODE="incremental" ;;
    --with-local-state) COPY_LOCAL_STATE="1" ;;
    --no-local-state) COPY_LOCAL_STATE="0" ;;
    --dry-run) DRY_RUN=1 ;;
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "${COPY_LOCAL_STATE}" == "auto" ]]; then
  if [[ "${MODE}" == "full" ]]; then
    COPY_LOCAL_STATE="1"
  else
    COPY_LOCAL_STATE="0"
  fi
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "❌ 未找到 rsync，请先安装后再运行。" >&2
  exit 1
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "❌ 源 Profile 不存在：${SOURCE_DIR}" >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}" >/dev/null 2>&1

echo "🔄 Chrome Profile 同步"
echo "   源目录 : ${SOURCE_DIR}"
echo "   目标目录 : ${TARGET_DIR}"
echo "   模式 : ${MODE}"
if (( DRY_RUN )); then
  echo "   选项 : dry-run"
fi
if [[ "${COPY_LOCAL_STATE}" == "1" ]]; then
  echo "   Local State : 将同步"
else
  echo "   Local State : 跳过"
fi
echo ""

if (( ASSUME_YES == 0 )); then
  read -r -p "继续执行？[y/N] " reply
  if [[ ! "$reply" =~ ^([Yy]|[Yy][Ee][Ss])$ ]]; then
    echo "🚫 已取消。"
    exit 0
  fi
fi

RSYNC_ARGS=("-av" "--progress")
if (( DRY_RUN )); then
  RSYNC_ARGS+=("--dry-run")
fi

if [[ "${MODE}" == "incremental" ]]; then
  RSYNC_ARGS+=("--include=*/" "--include=Cookies*" "--include=Login Data*" "--exclude=*")
fi

set +e
rsync "${RSYNC_ARGS[@]}" "${SOURCE_DIR}/" "${TARGET_DIR}/"
RSYNC_STATUS=$?
set -e

if [[ ${RSYNC_STATUS} -ne 0 ]]; then
  echo "❌ rsync 执行失败。" >&2
  exit ${RSYNC_STATUS}
fi

if [[ "${COPY_LOCAL_STATE}" == "1" ]]; then
  LOCAL_STATE_SRC="$(dirname "${SOURCE_DIR}")/Local State"
  LOCAL_STATE_DST="${TARGET_DIR}/Local State"
  if [[ -f "${LOCAL_STATE_SRC}" ]]; then
    if (( DRY_RUN )); then
      echo "[dry-run] cp -p \"${LOCAL_STATE_SRC}\" \"${LOCAL_STATE_DST}\""
    else
      cp -p "${LOCAL_STATE_SRC}" "${LOCAL_STATE_DST}"
    fi
  else
    echo "⚠️ 源目录缺少 Local State：${LOCAL_STATE_SRC}"
  fi
fi

echo "✅ 同步完成。建议运行 scripts/verify-chrome-profile.sh 确认结果。"
