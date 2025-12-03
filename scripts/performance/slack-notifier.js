#!/usr/bin/env node

import fetch from 'node-fetch';

const webhook = process.env.SLACK_WEBHOOK_URL;

if (!webhook) {
  console.error('未配置 SLACK_WEBHOOK_URL，跳过通知');
  process.exit(0);
}

const [,, metric = 'LCP', baseline = '0', current = '0'] = process.argv;

async function notify() {
  const message = {
    text: '⚠️ 性能回归警报',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${metric}* 从 ${baseline} 降至 ${current}`
        }
      }
    ]
  };

  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });

  console.log('✅ Slack 通知已发送');
}

notify().catch((err) => {
  console.error('发送 Slack 通知失败:', err);
  process.exit(1);
});
