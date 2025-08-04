#!/bin/bash

echo "加载环境变量..."
source .env

echo "GPT_API_KEY 配置状态: ${GPT_API_KEY:0:10}..."

echo "运行翻译测试..."
node test-long-translation.js