#!/usr/bin/env node

/**
 * 利用 critical 包快速生成指定页面的关键 CSS。
 * 需提前在项目中安装 dev 依赖：npm install --save-dev critical
 */

import { generate } from 'critical';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.resolve(__dirname, 'critical.config.js');
// eslint-disable-next-line import/no-dynamic-require, global-require
const config = require(configPath);

async function main() {
  await generate({
    ...config,
    inline: false,
    base: config.base ?? path.resolve('logs/performance/critical'),
  });

  console.log(`✅ 关键 CSS 已生成，目标输出：${JSON.stringify(config.target)}`);
}

main().catch((error) => {
  console.error('关键 CSS 生成失败：', error);
  process.exit(1);
});
