#!/usr/bin/env node
/**
 * PoC Validator CLI
 * -----------------
 * 统一执行 Theme 数据截断、限流恢复、品牌词准确率等 PoC 验证，
 * 生成结构化报告供 Go/No-Go 决策使用。
 *
 * 支持两种数据来源：
 * 1. dataset：从 JSON 文件读取模拟数据；
 * 2. module：动态加载自定义模块（应导出默认函数/对象）。
 *
 * 配置示例（poc.config.json）：
 * {
 *   "theme": {
 *     "mode": "dataset",
 *     "dataset": "./poc/theme-files.json",
 *     "themeId": "gid://shopify/Theme/123"
 *   },
 *   "rateLimit": {
 *     "mode": "module",
 *     "module": "./scripts/poc/providers/rate-limit-runner.js",
 *     "options": { "iterations": 80, "concurrency": 8 }
 *   },
 *   "brand": {
 *     "mode": "dataset",
 *     "dataset": "./poc/brand-tests.json"
 *   },
 *   "output": {
 *     "report": "./poc/report.json",
 *     "human": "./poc/report.txt"
 *   }
 * }
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { ThemeDataValidator } from './theme-data-validator.js';
import { RateLimitValidator } from './rate-limit-validator.js';
import { BrandProtectionPoC } from './brand-protection-poc.js';

const DEFAULT_CONFIG_PATH = 'poc.config.json';

async function readJsonFile(filePath) {
  const absolutePath = path.resolve(filePath);
  const content = await fs.readFile(absolutePath, 'utf8');
  return JSON.parse(content);
}

async function loadModule(modulePath) {
  const absolutePath = path.resolve(modulePath);
  const imported = await import(absolutePath);
  return imported.default ?? imported;
}

async function resolveThemeFetcher(config) {
  if (!config) {
    return null;
  }

  if (config.mode === 'dataset') {
    const dataset = await readJsonFile(config.dataset);
    if (!Array.isArray(dataset)) {
      throw new Error('Theme dataset 必须是数组');
    }
    return async () => dataset;
  }

  if (config.mode === 'module') {
    const fetcher = await loadModule(config.module);
    if (typeof fetcher !== 'function') {
      throw new Error('Theme module 必须导出默认函数');
    }
    return fetcher;
  }

  return null;
}

async function resolveRateLimitRunner(config) {
  if (!config) {
    return null;
  }

  if (config.mode === 'dataset') {
    const dataset = await readJsonFile(config.dataset);
    return async () => dataset;
  }

  if (config.mode === 'module') {
    const runner = await loadModule(config.module);
    if (typeof runner !== 'function') {
      throw new Error('RateLimit module 必须导出默认函数');
    }
    return runner;
  }

  return null;
}

async function resolveBrandTestSet(config) {
  if (!config) {
    return [];
  }

  if (config.mode === 'dataset') {
    const dataset = await readJsonFile(config.dataset);
    if (!Array.isArray(dataset)) {
      throw new Error('品牌词 dataset 必须是数组');
    }
    return dataset;
  }

  if (config.mode === 'module') {
    const supplier = await loadModule(config.module);
    if (typeof supplier !== 'function') {
      throw new Error('品牌词 module 必须导出默认函数');
    }
    const dataset = await supplier();
    if (!Array.isArray(dataset)) {
      throw new Error('品牌词 module 需返回数组');
    }
    return dataset;
  }

  return [];
}

async function resolveBrandGuard(config) {
  if (!config?.guardModule) {
    return (text) => /^[A-Z][a-z]+$/.test(text); // 默认最保守策略
  }

  const guard = await loadModule(config.guardModule);
  if (typeof guard !== 'function') {
    throw new Error('guardModule 必须导出默认函数');
  }
  return guard;
}

function formatSummary(summary) {
  return [
    '========== PoC 验收摘要 ==========\n',
    `Theme 截断率: ${summary.theme?.truncationRate ?? 'N/A'}% (${summary.theme?.requiresFallback ? '⚠️ 建议降级' : '✅ 正常'})`,
    `限流恢复: ${summary.rateLimit?.maxRetryAfterMs ?? 'N/A'}ms (${summary.rateLimit?.meetsRecoveryTarget ? '✅ 达标' : '❌ 超标'})`,
    `品牌词准确率: ${summary.brand?.accuracy ?? 'N/A'}%`,
    `总体结论: ${summary.passed ? '✅ 通过' : '❌ 未通过'}`,
    '\n=================================='
  ].join('\n');
}

async function writeOutputs(summary, outputConfig = {}) {
  const tasks = [];

  if (outputConfig.report) {
    tasks.push(
      fs.writeFile(
        path.resolve(outputConfig.report),
        JSON.stringify(summary, null, 2),
        'utf8'
      )
    );
  }

  if (outputConfig.human) {
    tasks.push(
      fs.writeFile(
        path.resolve(outputConfig.human),
        formatSummary(summary),
        'utf8'
      )
    );
  }

  await Promise.all(tasks);
}

function parseArgs(argv) {
  const [, , ...rest] = argv;
  const args = { configPath: DEFAULT_CONFIG_PATH, targets: null };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if ((arg === '-c' || arg === '--config') && rest[index + 1]) {
      args.configPath = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--trace') {
      args.trace = true;
      continue;
    }

    if (arg === '--theme-only' || arg === '--rate-limit-only' || arg === '--brand-only') {
      if (!args.targets) {
        args.targets = new Set();
      }
      if (arg === '--theme-only') {
        args.targets.add('theme');
      } else if (arg === '--rate-limit-only') {
        args.targets.add('rateLimit');
      } else if (arg === '--brand-only') {
        args.targets.add('brand');
      }
    }
  }

  return args;
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const config = await readJsonFile(args.configPath);

    const shouldRun = (target) => !args.targets || args.targets.has(target);

    const summary = {
      configPath: path.resolve(args.configPath),
      timestamp: new Date().toISOString(),
      theme: null,
      rateLimit: null,
      brand: null,
      passed: false
    };

    // Theme 验证
    if (shouldRun('theme') && config.theme) {
      const fetcher = await resolveThemeFetcher(config.theme);
      if (!fetcher) {
        throw new Error('未能解析 Theme fetcher，请检查配置');
      }
      const validator = new ThemeDataValidator(fetcher, config.theme.options);
      summary.theme = await validator.run(
        config.theme.themeId ?? 'unknown-theme',
        config.theme.context
      );
    }

    // 限流验证
    if (shouldRun('rateLimit') && config.rateLimit) {
      if (config.rateLimit.mode === 'dataset') {
        const datasetSupplier = await resolveRateLimitRunner(config.rateLimit);
        const dataset = await datasetSupplier();
        const report = {
          samples: dataset,
          total: dataset.length,
          throttled: dataset.filter(item => item.throttled).length
        };
        report.throttleRate = report.total
          ? Number(((report.throttled / report.total) * 100).toFixed(2))
          : 0;
        const retryAfterValues = dataset
          .filter(item => typeof item.retryAfterMs === 'number')
          .map(item => item.retryAfterMs);
        report.maxRetryAfterMs = retryAfterValues.length
          ? Math.max(...retryAfterValues)
          : null;
        report.avgRetryAfterMs = retryAfterValues.length
          ? Math.round(retryAfterValues.reduce((sum, value) => sum + value, 0) / retryAfterValues.length)
          : null;
        report.meetsRecoveryTarget = report.maxRetryAfterMs === null
          ? true
          : report.maxRetryAfterMs <= (config.rateLimit.options?.recoveryWindowMs ?? 30000);
        summary.rateLimit = report;
      } else {
        const runner = await resolveRateLimitRunner(config.rateLimit);
        const validator = new RateLimitValidator(runner);
        summary.rateLimit = await validator.run(config.rateLimit.options);
      }
    }

    // 品牌词验证
    if (shouldRun('brand') && config.brand) {
      const testSet = await resolveBrandTestSet(config.brand);
      const guard = await resolveBrandGuard(config.brand);
      const poc = new BrandProtectionPoC(guard, { trace: args.trace ?? false });
      summary.brand = await poc.run(testSet);
    }

    const conditions = [];
    if (summary.theme) {
      conditions.push(!summary.theme.requiresFallback);
    }
    if (summary.rateLimit) {
      conditions.push(summary.rateLimit.meetsRecoveryTarget !== false);
    }
    if (summary.brand) {
      const target = config.brand?.targetAccuracy ?? 90;
      conditions.push(summary.brand.accuracy >= target);
    }
    summary.passed = conditions.every(Boolean);

    if (config.output) {
      await writeOutputs(summary, config.output);
    }

    // eslint-disable-next-line no-console
    console.log(formatSummary(summary));

    if (!summary.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('PoC 验证失败:', error);
    process.exitCode = 1;
  }
}

await main();
