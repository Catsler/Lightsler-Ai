#!/usr/bin/env node

import https from 'https';
import http from 'http';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: process.env.STATUS_BASE_URL || 'http://localhost:3000',
    language: process.env.STATUS_LANGUAGE || 'zh-CN',
    filterMode: process.env.STATUS_FILTER_MODE || 'without-translations',
    path: '/api/status',
    token: process.env.STATUS_SESSION_TOKEN || null
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if ((arg === '--language' || arg === '-l') && args[i + 1]) {
      options.language = args[i + 1];
      i += 1;
    } else if ((arg === '--base-url' || arg === '-b') && args[i + 1]) {
      options.baseUrl = args[i + 1];
      i += 1;
    } else if ((arg === '--filter' || arg === '-f') && args[i + 1]) {
      options.filterMode = args[i + 1];
      i += 1;
    } else if (arg === '--token' && args[i + 1]) {
      options.token = args[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/report-untranslated.js [options]

Options:
  -b, --base-url <url>        Base URL of Remix app (default: http://localhost:3000)
  -l, --language <code>       Target language to query (default: zh-CN)
  -f, --filter <mode>         filterMode passed to /api/status (default: without-translations)
      --token <sessionToken>  Optional session token if API requires authentication
  -h, --help                  Show this help message
`);
}

async function fetchStatus(baseUrl, language, filterMode, token) {
  const url = new URL('/api/status', baseUrl);
  if (language) {
    url.searchParams.set('language', language);
  }
  if (filterMode) {
    url.searchParams.set('filterMode', filterMode);
  }

  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(url, { method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const json = JSON.parse(body);
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function printSummary(data, language) {
  if (!data?.success) {
    console.error('[report-untranslated] status API failed:', data?.message || 'unknown error');
    process.exit(1);
  }

  const payload = data.data || {};
  const summary = payload.summary || {};
  const resources = payload.resources || [];
  const total = summary.total ?? resources.length;
  const untranslated = summary.untranslated ?? 0;
  const translated = summary.translated ?? (total - untranslated);

  console.log(`Status for ${language}`);
  console.log('----------------------------------------');
  console.log(`Total resources:       ${total}`);
  console.log(`Translated resources:  ${translated}`);
  console.log(`Untranslated resources:${untranslated}`);
  console.log('');

  if (untranslated === 0) {
    console.log('No untranslated resources 🎉');
    return;
  }

  console.log('Sample untranslated resource IDs:');
  (summary.untranslatedResourceIds || []).forEach((id) => console.log(`  - ${id}`));

  console.log('\nDetails by resource:');
  resources
    .filter((r) => !r.hasTranslationForLanguage)
    .forEach((r) => {
      console.log(`- ${r.id} | ${r.resourceType} | ${r.title || r.handle || r.gid}`);
    });
}

async function main() {
  const options = parseArgs();
  try {
    const response = await fetchStatus(options.baseUrl, options.language, options.filterMode, options.token);
    printSummary(response, options.language);
  } catch (error) {
    console.error('[report-untranslated] request failed:', error.message);
    process.exit(1);
  }
}

main();
