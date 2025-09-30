#!/bin/bash
# 简单的日志巡检脚本 - 遵循KISS原则

echo "=== 🔍 日志巡检报告 $(date) ==="
echo ""

# 检查日志文件是否存在
if [ ! -f "logs/app.log" ]; then
  echo "❌ 日志文件不存在: logs/app.log"
  exit 1
fi

echo "📊 错误统计（最近1000条）："
ERROR_COUNT=$(tail -1000 logs/app.log | grep -c '"level":50' 2>/dev/null || echo "0")
WARN_COUNT=$(tail -1000 logs/app.log | grep -c '"level":40' 2>/dev/null || echo "0")
echo "- ERROR: $ERROR_COUNT 个"
echo "- WARN: $WARN_COUNT 个"
echo ""

if [ "$ERROR_COUNT" -gt 0 ]; then
  echo "❌ 最近5个错误："
  tail -1000 logs/app.log | grep '"level":50' | tail -5 | while IFS= read -r line; do
    # 简单提取msg字段
    msg=$(echo "$line" | sed -n 's/.*"msg":"\([^"]*\)".*/\1/p')
    time=$(echo "$line" | sed -n 's/.*"time":\([0-9]*\).*/\1/p')
    echo "  [$time] $msg"
  done
  echo ""
fi

if [ "$WARN_COUNT" -gt 0 ]; then
  echo "⚠️ 最近5个警告："
  tail -1000 logs/app.log | grep '"level":40' | tail -5 | while IFS= read -r line; do
    # 简单提取msg字段
    msg=$(echo "$line" | sed -n 's/.*"msg":"\([^"]*\)".*/\1/p')
    time=$(echo "$line" | sed -n 's/.*"time":\([0-9]*\).*/\1/p')
    echo "  [$time] $msg"
  done
  echo ""
fi

echo "⏱️ 慢请求（>5秒）："
SLOW_COUNT=$(grep "duration" logs/app.log | grep -E "duration.*[5-9][0-9]{3}ms|[0-9]{5,}ms" | wc -l 2>/dev/null || echo "0")
if [ "$SLOW_COUNT" -gt 0 ]; then
  grep "duration" logs/app.log | grep -E "duration.*[5-9][0-9]{3}ms|[0-9]{5,}ms" | tail -5 | while IFS= read -r line; do
    duration=$(echo "$line" | sed -n 's/.*"duration":\([0-9]*\).*/\1/p')
    operation=$(echo "$line" | sed -n 's/.*"operationName":"\([^"]*\)".*/\1/p')
    echo "  ${operation:-未知操作}: ${duration}ms"
  done
else
  echo "  无慢请求"
fi
echo ""

echo "🎯 Theme翻译错误："
THEME_ERROR_COUNT=$(grep -c "Theme资源缺少contentFields数据" logs/app.log 2>/dev/null || echo "0")
echo "- Theme资源错误: $THEME_ERROR_COUNT 个"

echo "🔄 原文返回情况："
ORIGINAL_COUNT=$(grep -c "翻译未生效，返回原文" logs/app.log 2>/dev/null || echo "0")
IDENTICAL_COUNT=$(grep -c "译文与原文相同，标记为跳过" logs/app.log 2>/dev/null || echo "0")
echo "- 原文返回: $ORIGINAL_COUNT 个"
echo "- 智能跳过: $IDENTICAL_COUNT 个"

echo ""
echo "✅ 巡检完成"

# 根据错误数量给出建议
if [ "$ERROR_COUNT" -gt 50 ]; then
  echo ""
  echo "🚨 建议: 错误数量较多，请检查系统状态"
elif [ "$ERROR_COUNT" -gt 10 ]; then
  echo ""
  echo "⚠️ 建议: 有一些错误，建议定期关注"
else
  echo ""
  echo "✨ 系统运行良好"
fi