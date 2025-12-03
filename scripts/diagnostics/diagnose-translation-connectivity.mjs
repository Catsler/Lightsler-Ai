#!/usr/bin/env node

/**
 * Translation connectivity diagnostic CLI.
 * Sequentially verifies configuration, DNS, TLS and API connectivity for GPT translation service.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runTranslationDiagnostics } from '../../app/services/translation/diagnostics.server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

// Attempt to load project .env if available (safe on production server as it runs in-place)
dotenv.config({ path: path.resolve(projectRoot, '.env') });

function parseArgs(rawArgs) {
  const args = {
    includeFallbacks: true,
    timeoutMs: undefined
  };

  for (let i = 0; i < rawArgs.length; i += 1) {
    const token = rawArgs[i];

    if (token === '--no-fallbacks') {
      args.includeFallbacks = false;
    } else if (token === '--timeout' || token === '--timeout-ms') {
      const next = rawArgs[i + 1];
      if (next) {
        const parsed = Number(next);
        if (!Number.isNaN(parsed) && parsed > 0) {
          args.timeoutMs = parsed;
          i += 1;
        }
      }
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }

  return args;
}

function printHelp() {
  console.log('Usage: diagnose-translation-connectivity.mjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --no-fallbacks        Skip GPT_API_FALLBACK_URLS checks.');
  console.log('  --timeout <ms>        Override request timeout (default 10s).');
  console.log('  -h, --help            Show this help message.');
  console.log('');
}

function formatStatus(status) {
  switch (status) {
    case 'healthy':
      return '✅ healthy';
    case 'degraded':
      return '⚠️ degraded';
    case 'offline':
      return '❌ offline';
    default:
      return `❓ ${status || 'unknown'}`;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  console.log('=== Translation Connectivity Diagnostics ===');
  console.log(`Environment: ${process.env.NODE_ENV || 'unknown'} | Node: ${process.version}`);

  const diagnostics = await runTranslationDiagnostics({
    includeFallbacks: args.includeFallbacks,
    timeoutMs: args.timeoutMs
  });

  console.log(`\nOverall Status: ${formatStatus(diagnostics.status)}`);
  console.log(`Summary       : ${diagnostics.summary}`);

  if (diagnostics.meta?.apiKeyFingerprint) {
    console.log(`API Key       : ${diagnostics.meta.apiKeyFingerprint} (${diagnostics.meta.apiKeyPresent ? 'present' : 'missing'})`);
  } else {
    console.log(`API Key       : ${diagnostics.meta?.apiKeyPresent ? 'present' : 'missing'}`);
  }

  console.log(`Model         : ${diagnostics.meta?.model ?? 'unknown'}`);
  console.log(`Primary URL   : ${diagnostics.meta?.primaryUrl ?? 'n/a'}`);

  if (diagnostics.meta?.fallbackUrls?.length) {
    console.log('Fallback URLs :');
    diagnostics.meta.fallbackUrls.forEach((url) => {
      console.log(`  - ${url}`);
    });
  }

  diagnostics.endpoints.forEach((endpoint) => {
    console.log(`\n[${endpoint.role.toUpperCase()}] ${endpoint.url}`);
    console.log(`  Status : ${formatStatus(endpoint.status)}`);
    console.log(`  Detail : ${endpoint.summary}`);
    endpoint.checks.forEach((check) => {
      const duration = typeof check.durationMs === 'number' ? `${check.durationMs}ms` : 'n/a';
      console.log(`    - ${check.name}: ${check.status} (${duration})`);
      if (check.name === 'apiCall' && check.data?.httpStatus) {
        console.log(`      HTTP ${check.data.httpStatus}`);
      }
      if (check.name === 'dnsLookup' && check.data?.addresses) {
        console.log(`      Addresses: ${check.data.addresses.join(', ')}`);
      }
      if (check.status === 'failure' || check.status === 'warning') {
        const snippet = check.data?.bodySnippet;
        if (snippet) {
          console.log(`      Body: ${snippet}`);
        }
        if (check.data?.code) {
          console.log(`      Code: ${check.data.code}`);
        }
      }
    });

    if (endpoint.recommendations?.length) {
      console.log('  Recommendations:');
      endpoint.recommendations.forEach((tip) => {
        console.log(`    • ${tip}`);
      });
    }
  });

  if (diagnostics.recommendations?.length) {
    console.log('\nGlobal Recommendations:');
    diagnostics.recommendations.forEach((tip) => {
      console.log(`  • ${tip}`);
    });
  }

  console.log(`\nDiagnostics completed at ${diagnostics.meta?.timestamp ?? new Date().toISOString()}`);

  if (diagnostics.status !== 'healthy') {
    process.exitCode = diagnostics.status === 'degraded' ? 2 : 3;
  }
}

main().catch((error) => {
  console.error('诊断脚本执行失败:', error);
  process.exitCode = 1;
});
