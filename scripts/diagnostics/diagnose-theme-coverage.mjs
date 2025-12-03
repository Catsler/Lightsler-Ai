#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_DAYS = 7;
const CATEGORY_KEYS = ['technical', 'patternMismatch', 'liquid', 'brand', 'empty', 'other'];
const NOISE_WORDS = new Set([
  'settings',
  'setting',
  'blocks',
  'block',
  'sections',
  'section',
  'value',
  'values',
  'field',
  'fields',
  'item',
  'items',
  'data',
  'content',
  'theme',
  'dynamicfields'
]);

function parseArgs(argv) {
  const options = {
    shop: null,
    resource: null,
    lang: null,
    days: DEFAULT_DAYS,
    format: 'console',
    detailed: false,
    exportFile: null,
    verbose: false,
    limit: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--shop':
        options.shop = argv[++i];
        break;
      case '--resource':
        options.resource = argv[++i];
        break;
      case '--lang':
        options.lang = argv[++i];
        break;
      case '--days':
        options.days = Number(argv[++i]) || DEFAULT_DAYS;
        break;
      case '--format':
        options.format = argv[++i] || 'console';
        break;
      case '--detailed':
        options.detailed = true;
        break;
      case '--export':
        options.exportFile = argv[++i];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--limit':
        options.limit = Number(argv[++i]) || null;
        break;
      default:
        // ignore unknown args
        break;
    }
  }

  return options;
}

function toDateRange(days) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function normaliseSkipStats(raw) {
  const stats = { ...raw };
  CATEGORY_KEYS.forEach((key) => {
    if (typeof stats[key] !== 'number') {
      stats[key] = 0;
    }
  });
  return stats;
}

function sumSkipStats(stats) {
  return CATEGORY_KEYS.reduce((acc, key) => acc + (stats[key] || 0), 0);
}

function updateGroup(map, key, updater) {
  const current = map.get(key) || {
    records: 0,
    totalFields: 0,
    translatedFields: 0,
    skippedFields: 0
  };
  const updated = updater(current);
  map.set(key, updated);
}

function extractKeywordCandidates(fieldPath) {
  if (typeof fieldPath !== 'string') return [];
  const matches = fieldPath.match(/([a-zA-Z_]+)/g);
  if (!matches) return [];
  const filtered = matches
    .map((segment) => segment.toLowerCase())
    .filter((segment) => segment.length > 2 && !NOISE_WORDS.has(segment));
  return Array.from(new Set(filtered));
}

function buildRecommendations(aggregator) {
  const recommendations = [];

  if (aggregator.patternMismatchSamples.length > 0) {
    const keywordCounts = new Map();
    aggregator.patternMismatchSamples.forEach((sample) => {
      extractKeywordCandidates(sample.field).forEach((keyword) => {
        const lower = keyword.toLowerCase();
        keywordCounts.set(lower, (keywordCounts.get(lower) || 0) + 1);
      });
    });

    const sorted = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([keyword, count]) => ({
        keyword,
        count,
        suggestedPattern: `/${keyword}/i`,
        estimatedImpact: count,
        priority: count > 50 ? 'HIGH' : count > 20 ? 'MEDIUM' : 'LOW'
      }));

    if (sorted.length > 0) {
      recommendations.push({
        title: '扩充 THEME_TRANSLATABLE_PATTERNS',
        priority: sorted[0].priority,
        estimatedImpact: sorted.reduce((sum, item) => sum + item.estimatedImpact, 0),
        details: sorted
      });
    }
  }

  if (aggregator.brandSamples.length > 0) {
    const uniqueBrandValues = new Set(
      aggregator.brandSamples.map((sample) => String(sample.value).trim()).filter(Boolean)
    );
    recommendations.push({
      title: '检查品牌名跳过逻辑',
      priority: uniqueBrandValues.size > 20 ? 'MEDIUM' : 'LOW',
      estimatedImpact: aggregator.categoryTotals.brand || 0,
      details: Array.from(uniqueBrandValues).slice(0, 20)
    });
  }

  if (aggregator.liquidSamples.length > 0) {
    recommendations.push({
      title: '审查 Liquid 模板中可翻译文本',
      priority: 'LOW',
      estimatedImpact: aggregator.categoryTotals.liquid || 0,
      details: aggregator.liquidSamples.slice(0, 10)
    });
  }

  return recommendations;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0.0%';
  return `${(value * 100).toFixed(1)}%`;
}

function calculateCoverage(totalFields, skipped) {
  if (totalFields <= 0) return 0;
  return (totalFields - skipped) / totalFields;
}

async function printConsoleReport(report, options) {
  const lines = [];
  const range = `${report.period.start.toISOString().slice(0, 10)} ~ ${report.period.end
    .toISOString()
    .slice(0, 10)}`;

  lines.push('Theme Translation Coverage Diagnostic');
  lines.push('=====================================');
  lines.push('');
  lines.push(`分析时间窗口: ${range}`);
  lines.push(`样本记录总数: ${report.summary.totalRecords}`);
  lines.push(
    `总字段数: ${report.summary.totalFields} | 翻译成功: ${report.summary.translatedFields} (${formatPercent(
      report.summary.coverage
    )})`
  );
  lines.push(`总跳过数: ${report.summary.skippedFields}`);
  lines.push('');
  lines.push('Skip 分类分布');
  lines.push('-------------------------------------');
  report.categories.forEach((category) => {
    const percent = report.summary.skippedFields
      ? formatPercent(category.count / report.summary.skippedFields)
      : '0.0%';
    const flag = category.key === 'patternMismatch' ? '⚠️ ' : category.key === 'brand' ? '🔸 ' : ' ';
    lines.push(`${flag}${category.label.padEnd(18)} ${String(category.count).padStart(6)} (${percent})`);
  });
  lines.push('');

  if (report.resourceTypes.length > 0) {
    lines.push('资源类型覆盖率');
    lines.push('-------------------------------------');
    report.resourceTypes.forEach((item) => {
      lines.push(
        `${item.resourceType.padEnd(30)} ${formatPercent(item.coverage).padStart(8)}  (字段: ${item.totalFields}, 跳过: ${item.skippedFields})`
      );
    });
    lines.push('');
  }

  if (report.patternSamples.length > 0) {
    lines.push('Pattern Mismatch 样本');
    lines.push('-------------------------------------');
    report.patternSamples.forEach((sample, index) => {
      lines.push(`${index + 1}. ${sample.field} = "${String(sample.value).slice(0, 80)}"`);
    });
    lines.push('');
  }

  if (report.recommendations.length > 0) {
    lines.push('推荐措施（按优先级排序）');
    lines.push('-------------------------------------');
    report.recommendations.forEach((rec, index) => {
      lines.push(
        `${index + 1}. [${rec.priority}] ${rec.title} · 预估影响字段: ${rec.estimatedImpact}`
      );
      if (rec.title.includes('扩充') && Array.isArray(rec.details)) {
        const detailLines = rec.details.slice(0, 5).map((item) => `   - ${item.suggestedPattern} (${item.count})`);
        lines.push(...detailLines);
      }
    });
    lines.push('');
  }

  if (report.summary.parseErrors || report.summary.missingDiagnostics) {
    lines.push('数据质量提示');
    lines.push('-------------------------------------');
    if (report.summary.parseErrors) {
      lines.push(`⚠️  JSON 解析失败: ${report.summary.parseErrors} 条记录`);
    }
    if (report.summary.missingDiagnostics) {
      lines.push(`⚠️  缺少诊断数据: ${report.summary.missingDiagnostics} 条记录`);
    }
    lines.push('');

    if (options.verbose && report.debug) {
      if (report.debug.parseErrors?.length) {
        lines.push('解析失败记录详情');
        lines.push('-------------------------------------');
        report.debug.parseErrors.forEach(({ recordId, field, error }) => {
          lines.push(`  - 记录 ${recordId} · ${field} · ${error}`);
        });
        lines.push('');
      }
      if (report.debug.missingDiagnostics?.length) {
        lines.push('缺少诊断数据记录');
        lines.push('-------------------------------------');
        report.debug.missingDiagnostics.forEach((recordId) => {
          lines.push(`  - 记录 ${recordId}`);
        });
        lines.push('');
      }
    }
  }

  console.log(lines.join('\n'));

  if (options.exportFile) {
    const fs = await import('node:fs');
    fs.writeFileSync(options.exportFile, JSON.stringify(report.recommendations, null, 2), 'utf-8');
    console.log(`推荐列表已导出至 ${options.exportFile}`);
  }
}

async function run(options) {
  const { start, end } = toDateRange(options.days);
  const where = {
    errorCode: 'THEME_FIELD_SKIPPED',
    createdAt: { gte: start, lte: end }
  };

  if (options.shop) {
    where.shopId = options.shop;
  }
  if (options.resource) {
    where.resourceType = options.resource;
  }
  if (options.lang) {
    where.context = {
      path: ['$targetLang'],
      equals: options.lang
    };
  }

  const summary = {
    totalRecords: 0,
    totalFields: 0,
    translatedFields: 0,
    skippedFields: 0,
    coverage: 0,
    parseErrors: 0,
    missingDiagnostics: 0
  };

const categoryTotals = CATEGORY_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
const categories = new Map();
const resourceTypes = new Map();
const sectionAggregates = new Map();
const patternMismatchSamples = [];
  const brandSamples = [];
  const liquidSamples = [];
  const parseErrorSamples = [];
  const missingDiagnosticsSamples = [];

  let cursor = null;
  let fetched = 0;

  while (true) {
    const records = await prisma.errorLog.findMany({
      where,
      take: DEFAULT_BATCH_SIZE,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' }
    });

    if (!records.length) {
      break;
    }

    for (const record of records) {
      cursor = record.id;
      if (options.limit && fetched >= options.limit) {
        break;
      }

      fetched += 1;
      summary.totalRecords += 1;

      let context = record.context;
      if (typeof context === 'string') {
        try {
          context = JSON.parse(context);
        } catch (error) {
          summary.parseErrors += 1;
          parseErrorSamples.push({ recordId: record.id, field: 'context', error: error.message });
          continue;
        }
      }
      const diagnostics = context?.diagnostics || null;

      if (!diagnostics) {
        summary.missingDiagnostics += 1;
        missingDiagnosticsSamples.push(record.id);
        continue;
      }

      const skipStats = normaliseSkipStats(diagnostics.skipStats || {});
      const skippedFields = sumSkipStats(skipStats);
      const translatedFields = diagnostics.translatedFields || 0;
      const totalFields = diagnostics.totalFields || translatedFields + skippedFields;

      summary.totalFields += totalFields;
      summary.translatedFields += translatedFields;
      summary.skippedFields += skippedFields;

      CATEGORY_KEYS.forEach((key) => {
        categoryTotals[key] += skipStats[key] || 0;
        const labelMap = {
          technical: '技术字段',
          patternMismatch: '模式不匹配',
          liquid: 'Liquid 模板',
          brand: '品牌名',
          empty: '空值',
          other: '其他'
        };
        categories.set(key, {
          key,
          label: labelMap[key] || key,
          count: categoryTotals[key]
        });
      });

      updateGroup(resourceTypes, context?.resourceType || 'UNKNOWN', (current) => ({
        records: current.records + 1,
        totalFields: current.totalFields + totalFields,
        translatedFields: current.translatedFields + translatedFields,
        skippedFields: current.skippedFields + skippedFields
      }));

      const sectionStats = diagnostics.sectionStats || {};
      for (const [sectionType, data] of Object.entries(sectionStats)) {
        updateGroup(sectionAggregates, sectionType || 'unknown', (current) => ({
          records: current.records + 1,
          totalFields: current.totalFields + (data.total || 0),
          translatedFields: current.translatedFields + (data.translated || 0),
          skippedFields: current.skippedFields + (data.skipped || 0)
        }));
      }

      const samples = diagnostics.samples || {};
      if (Array.isArray(samples.patternMismatch)) {
        samples.patternMismatch.forEach((item) => {
          patternMismatchSamples.push({
            field: item.field,
            value: item.value,
            recordId: record.id
          });
        });
      }
      if (Array.isArray(samples.brand)) {
        samples.brand.forEach((item) => {
          brandSamples.push({
            field: item.field,
            value: item.value,
            recordId: record.id
          });
        });
      }
      if (Array.isArray(samples.liquid)) {
        samples.liquid.forEach((item) => {
          liquidSamples.push({
            field: item.field,
            value: item.value,
            recordId: record.id
          });
        });
      }
    }

    if (options.limit && fetched >= options.limit) {
      break;
    }

    if (records.length < DEFAULT_BATCH_SIZE) {
      break;
    }
  }

  summary.coverage = calculateCoverage(summary.totalFields, summary.skippedFields);

  const report = {
    period: { start, end },
    summary,
    categoryTotals,
    categories: Array.from(categories.values()).sort((a, b) => b.count - a.count),
    resourceTypes: Array.from(resourceTypes.entries()).map(([resourceType, data]) => ({
      resourceType,
      ...data,
      coverage: calculateCoverage(data.totalFields, data.skippedFields)
    })).sort((a, b) => a.coverage - b.coverage),
    sectionCoverage: Array.from(sectionAggregates.entries()).map(([sectionType, data]) => ({
      sectionType,
      ...data,
      coverage: calculateCoverage(data.totalFields, data.skippedFields)
    })).sort((a, b) => a.coverage - b.coverage),
    patternSamples: options.detailed
      ? patternMismatchSamples
      : patternMismatchSamples.slice(0, 10),
    recommendations: buildRecommendations({
      patternMismatchSamples,
      brandSamples,
      liquidSamples,
      categoryTotals
    }),
    raw: options.format === 'json' ? {
      patternMismatchSamples,
      brandSamples,
      liquidSamples
    } : undefined,
    debug: {
      parseErrors: parseErrorSamples,
      missingDiagnostics: missingDiagnosticsSamples
    }
  };

  return report;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  try {
    const report = await run(options);

    if (options.format === 'json') {
      const payload = {
        period: report.period,
        summary: report.summary,
        categories: report.categories,
        resourceTypes: report.resourceTypes,
        patternSamples: report.patternSamples,
        recommendations: report.recommendations,
        debug: report.debug
      };
      console.log(JSON.stringify(payload, null, 2));
      if (options.exportFile) {
        const fs = await import('node:fs');
        fs.writeFileSync(options.exportFile, JSON.stringify(report.recommendations, null, 2), 'utf-8');
      }
    } else {
      await printConsoleReport(report, options);
    }
  } catch (error) {
    console.error('主题覆盖率诊断脚本运行失败:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
