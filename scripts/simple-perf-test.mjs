#!/usr/bin/env node
/**
 * 简化版性能测试 - 使用手动提取的 Cookie
 * 
 * 使用方法：
 * 1. 在 Chrome 中打开 https://translate.ease-joy.com 并登录
 * 2. 打开开发者工具 (F12) -> Application -> Cookies
 * 3. 复制 _shopify_app_session 的值
 * 4. 运行: node scripts/simple-perf-test.mjs --cookie="你的cookie值"
 */

import fs from 'fs';
import path from 'path';

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [k, v] = arg.replace(/^--/, '').split('=');
        return [k, v ?? true];
    })
);

const API_URL = args.url || 'https://translate.ease-joy.com/api/translate';
const COOKIE = args.cookie || process.env.SHOPIFY_COOKIE || '';
const ITERATIONS = parseInt(args.iterations || '10', 10);
const CONCURRENCY = parseInt(args.concurrency || '2', 10);
const TEXT = args.text || 'Hello world, this is a performance test.';
const OUTPUT_DIR = args.outputDir || 'docs/performance';
const DATE_TAG = new Date().toISOString().split('T')[0].replace(/-/g, '');
const OUTPUT_FILE = args.output || path.join(OUTPUT_DIR, `production-baseline-${DATE_TAG}.json`);

if (!COOKIE) {
    console.log(`
📋 Cookie 提取步骤：

1. 在 Chrome 中打开: https://translate.ease-joy.com
2. 确保已登录 Shopify
3. 按 F12 打开开发者工具
4. 切换到 Application 标签页
5. 左侧展开 Cookies -> 选择 translate.ease-joy.com
6. 找到 _shopify_app_session，复制其 Value

然后运行：
  node scripts/simple-perf-test.mjs --cookie="你复制的值"

或者设置环境变量：
  export SHOPIFY_COOKIE="你复制的值"
  node scripts/simple-perf-test.mjs
`);
    process.exit(1);
}

// 确保输出目录存在
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log(`
🚀 性能测试配置：
   API: ${API_URL}
   迭代次数: ${ITERATIONS}
   并发数: ${CONCURRENCY}
   文本长度: ${TEXT.length} 字符
   输出文件: ${OUTPUT_FILE}
`);

async function runSingleRequest(id) {
    const start = Date.now();
    try {
        // 使用 FormData 格式，匹配 api.translate.jsx 的预期
        const formData = new URLSearchParams();
        formData.append('language', 'zh-CN');
        formData.append('resourceIds', JSON.stringify(['test-resource-' + id]));
        formData.append('userRequested', 'true');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': `_shopify_app_session=${COOKIE}`
            },
            body: formData.toString()
        });

        const duration = Date.now() - start;
        const data = await response.json().catch(() => ({}));

        return {
            id,
            success: response.ok,
            status: response.status,
            duration,
            error: response.ok ? null : (data.message || data.error || response.statusText)
        };
    } catch (err) {
        return {
            id,
            success: false,
            status: 0,
            duration: Date.now() - start,
            error: err.message
        };
    }
}

async function runBatch(startId, count) {
    const promises = [];
    for (let i = 0; i < count; i++) {
        promises.push(runSingleRequest(startId + i));
    }
    return Promise.all(promises);
}

async function main() {
    const results = [];
    let completed = 0;

    console.log('⚡ 开始测试...\n');

    const overallStart = Date.now();

    for (let i = 0; i < ITERATIONS; i += CONCURRENCY) {
        const batchSize = Math.min(CONCURRENCY, ITERATIONS - i);
        const batchResults = await runBatch(i, batchSize);
        results.push(...batchResults);
        completed += batchSize;

        // 进度显示
        const successCount = batchResults.filter(r => r.success).length;
        const avgDuration = batchResults.reduce((sum, r) => sum + r.duration, 0) / batchSize;
        process.stdout.write(`\r   进度: ${completed}/${ITERATIONS} | 本批成功: ${successCount}/${batchSize} | 平均耗时: ${avgDuration.toFixed(0)}ms`);
    }

    const overallDuration = Date.now() - overallStart;

    console.log('\n\n📊 测试结果：\n');

    // 计算统计
    const successResults = results.filter(r => r.success);
    const failResults = results.filter(r => !r.success);
    const durations = successResults.map(r => r.duration).sort((a, b) => a - b);

    const stats = {
        总请求数: results.length,
        成功数: successResults.length,
        失败数: failResults.length,
        成功率: `${(successResults.length / results.length * 100).toFixed(1)}%`,
        总耗时: `${overallDuration}ms`,
        吞吐量: `${(results.length / overallDuration * 1000).toFixed(2)} req/s`
    };

    if (durations.length > 0) {
        stats.最小延迟 = `${durations[0]}ms`;
        stats.最大延迟 = `${durations[durations.length - 1]}ms`;
        stats.平均延迟 = `${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(0)}ms`;
        stats.P50 = `${durations[Math.floor(durations.length * 0.5)]}ms`;
        stats.P90 = `${durations[Math.floor(durations.length * 0.9)]}ms`;
        stats.P95 = `${durations[Math.floor(durations.length * 0.95)]}ms`;
        stats.P99 = `${durations[Math.floor(durations.length * 0.99)]}ms`;
    }

    // 打印统计
    for (const [key, value] of Object.entries(stats)) {
        console.log(`   ${key}: ${value}`);
    }

    if (failResults.length > 0) {
        console.log('\n❌ 失败请求：');
        const errorCounts = {};
        for (const r of failResults) {
            const key = `${r.status}: ${r.error}`;
            errorCounts[key] = (errorCounts[key] || 0) + 1;
        }
        for (const [err, count] of Object.entries(errorCounts)) {
            console.log(`   ${count}x ${err}`);
        }
    }

    // 保存结果
    const output = {
        timestamp: new Date().toISOString(),
        config: { API_URL, ITERATIONS, CONCURRENCY, TEXT_LENGTH: TEXT.length },
        stats,
        results
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\n✅ 结果已保存到: ${OUTPUT_FILE}`);
}

main().catch(err => {
    console.error('❌ 测试失败:', err);
    process.exit(1);
});
