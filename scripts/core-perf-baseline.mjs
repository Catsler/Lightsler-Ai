#!/usr/bin/env node
/**
 * 翻译核心模块性能基准测试
 * 直接调用翻译函数，不走 HTTP API
 */

import { translateText } from '../app/services/translation/core.server.js';
import fs from 'fs';
import path from 'path';

const ITERATIONS = parseInt(process.argv[2] || '5', 10);
const OUTPUT_DIR = 'docs/performance';
const DATE_TAG = new Date().toISOString().split('T')[0].replace(/-/g, '');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `core-baseline-${DATE_TAG}.json`);

// 测试用例
const testCases = [
    { name: '短文本', text: 'Hello world', targetLang: 'zh-CN' },
    { name: '中等文本', text: 'This is a test of the translation system. It should handle various text lengths efficiently.', targetLang: 'zh-CN' },
    { name: 'HTML混合', text: '<p>Hello <strong>world</strong>!</p>', targetLang: 'zh-CN' },
    { name: '品牌词', text: 'I love my iPhone 15 Pro Max', targetLang: 'zh-CN' },
];

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function runTest(testCase, iteration) {
    const start = Date.now();
    try {
        const result = await translateText(testCase.text, testCase.targetLang, {
            skipCache: true,
            sourceType: 'product'
        });
        return {
            name: testCase.name,
            iteration,
            success: true,
            duration: Date.now() - start,
            inputLength: testCase.text.length,
            outputLength: result?.length || 0
        };
    } catch (err) {
        return {
            name: testCase.name,
            iteration,
            success: false,
            duration: Date.now() - start,
            error: err.message
        };
    }
}

async function main() {
    console.log('🚀 翻译核心性能基准测试');
    console.log(`   迭代次数: ${ITERATIONS}`);
    console.log(`   测试用例: ${testCases.length}`);
    console.log('');

    const results = [];

    for (const testCase of testCases) {
        console.log(`📝 测试: ${testCase.name}`);
        for (let i = 0; i < ITERATIONS; i++) {
            const result = await runTest(testCase, i + 1);
            results.push(result);
            process.stdout.write(`   迭代 ${i + 1}/${ITERATIONS}: ${result.duration}ms ${result.success ? '✓' : '✗'}\n`);
        }
    }

    // 按测试用例分组统计
    const stats = {};
    for (const testCase of testCases) {
        const caseResults = results.filter(r => r.name === testCase.name);
        const successResults = caseResults.filter(r => r.success);
        const durations = successResults.map(r => r.duration).sort((a, b) => a - b);

        stats[testCase.name] = {
            total: caseResults.length,
            success: successResults.length,
            successRate: `${(successResults.length / caseResults.length * 100).toFixed(1)}%`,
            avgDuration: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
            minDuration: durations[0] || 0,
            maxDuration: durations[durations.length - 1] || 0,
            p50: durations[Math.floor(durations.length * 0.5)] || 0,
            p95: durations[Math.floor(durations.length * 0.95)] || 0
        };
    }

    console.log('\n📊 统计结果：\n');
    for (const [name, stat] of Object.entries(stats)) {
        console.log(`   ${name}:`);
        console.log(`     成功率: ${stat.successRate}, 平均: ${stat.avgDuration}ms, P50: ${stat.p50}ms, P95: ${stat.p95}ms`);
    }

    // 保存结果
    const output = {
        timestamp: new Date().toISOString(),
        iterations: ITERATIONS,
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
