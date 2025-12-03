#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '../app/locales');
const namespaces = ['common', 'home', 'billing', 'monitoring', 'errorsPage', 'languages', 'privacy'];
const languages = ['en', 'zh-CN'];

function flattenKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(flattenKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

let hasErrors = false;

for (const ns of namespaces) {
  const enFile = path.join(localesDir, 'en', `${ns}.json`);
  const zhFile = path.join(localesDir, 'zh-CN', `${ns}.json`);

  if (!fs.existsSync(enFile) || !fs.existsSync(zhFile)) {
    console.error(`❌ Missing locale file for namespace: ${ns}`);
    hasErrors = true;
    continue;
  }

  const enData = JSON.parse(fs.readFileSync(enFile, 'utf-8'));
  const zhData = JSON.parse(fs.readFileSync(zhFile, 'utf-8'));

  const enKeys = flattenKeys(enData);
  const zhKeys = flattenKeys(zhData);

  const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));
  const missingInEn = zhKeys.filter((k) => !enKeys.includes(k));

  if (missingInZh.length > 0) {
    console.error(`❌ ${ns}: zh-CN missing keys ->`, missingInZh);
    hasErrors = true;
  }

  if (missingInEn.length > 0) {
    console.error(`❌ ${ns}: en missing keys ->`, missingInEn);
    hasErrors = true;
  }

  if (missingInZh.length === 0 && missingInEn.length === 0) {
    console.log(`✅ ${ns}: key symmetry OK`);
  }
}

if (hasErrors) {
  console.error('\n❌ i18n key symmetry check failed');
  process.exit(1);
}

console.log('\n✅ All i18n key symmetry checks passed');
