#!/bin/bash

set -euo pipefail

FYNONY_URL="${FYNONY_URL:-https://fynony.ease-joy.fun}"
ONEWIND_URL="${ONEWIND_URL:-https://onewind.ease-joy.fun}"
OUTPUT_ROOT="${OUTPUT_ROOT:-logs/performance}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="${OUTPUT_ROOT}/${TIMESTAMP}"

run_lighthouse() {
  local url="$1"
  local name="$2"
  npx lighthouse "$url" \
    --output=json \
    --output=html \
    --output-path="${OUTPUT_DIR}/${name}" \
    --throttling-method=simulate \
    --preset=desktop \
    ${LIGHTHOUSE_FLAGS:-}
}

compare_reports() {
  if [ -f "${OUTPUT_DIR}/fynony.json" ] && [ -f "${OUTPUT_DIR}/onewind.json" ]; then
    node scripts/performance/compare-lighthouse.js \
      "${OUTPUT_DIR}/fynony.json" \
      "${OUTPUT_DIR}/onewind.json" \
      > "${OUTPUT_DIR}/comparison.md"
  fi
}

main() {
  mkdir -p "${OUTPUT_DIR}"
  echo "🚀 开始性能审计..." >&2
  run_lighthouse "${FYNONY_URL}" "fynony"
  run_lighthouse "${ONEWIND_URL}" "onewind"
  compare_reports
  echo "✅ 审计完成，报告输出目录：${OUTPUT_DIR}" >&2
}

main "$@"
