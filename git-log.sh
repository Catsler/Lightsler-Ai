#!/bin/bash
# Git 提交历史可视化脚本
# 使用方法: ./git-log.sh [数量，默认20]

COUNT=${1:-20}

echo "📊 最近 $COUNT 个提交："
echo ""
git log --graph --pretty=format:'%C(yellow)%h%Creset - %s %C(green)(%cr)%Creset %C(blue)<%an>%Creset' --abbrev-commit -$COUNT
echo ""
echo ""
echo "💡 提示："
echo "  - 黄色部分是 commit ID (短格式)"
echo "  - 使用 'git show <commit-id>' 查看详情"
echo "  - 使用 './git-log.sh 50' 显示更多提交"
