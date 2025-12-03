#!/usr/bin/env node

import fetch from 'node-fetch';
import fs from 'node:fs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('未配置 OPENAI_API_KEY，无法调用 AI 优化建议');
  process.exit(0);
}

const [,, reportPath] = process.argv;

if (!reportPath || !fs.existsSync(reportPath)) {
  console.error('请提供有效的 Lighthouse JSON 报告路径');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const lcp = report.audits?.['largest-contentful-paint']?.numericValue;
const totalSize = report.audits?.['total-byte-weight']?.numericValue;

const prompt = `基于以下数据，请提出三条性能优化建议并估算收益：
LCP: ${lcp}
Total Bytes: ${totalSize}
第三方资源: ${report.audits?.['third-party-summary']?.numericValue}
`;

async function suggestOptimizations() {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a performance optimization expert.' },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  console.log(data.choices?.[0]?.message?.content ?? '无建议返回');
}

suggestOptimizations().catch((err) => {
  console.error('AI 优化建议生成失败:', err);
  process.exit(1);
});
