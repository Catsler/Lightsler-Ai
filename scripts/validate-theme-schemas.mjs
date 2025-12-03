#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const THEME_SCHEMA_DIR = path.join(ROOT_DIR, 'app/services/theme-schemas');
const SECTIONS_DIR = path.join(THEME_SCHEMA_DIR, 'sections');

const NON_TRANSLATABLE_IDS = new Set(['specific_time']);
const SOCIAL_URL_IDS = new Set([
  'social_facebook',
  'social_fancy',
  'social_instagram',
  'social_line',
  'social_linkedin',
  'social_pinterest',
  'social_reddit',
  'social_snapchat',
  'social_spotify',
  'social_threads',
  'social_tiktok',
  'social_tumblr',
  'social_twitter',
  'social_twitter_x',
  'social_vimeo',
  'social_wechat',
  'social_whatsapp',
  'social_youtube'
]);

const URL_PATTERNS = [/_url$/i, /_href$/i, /_link$/i, /^url_/i];

const violations = [];
let checkedSettings = 0;

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    violations.push(`无法读取 ${filePath}: ${error.message}`);
    return null;
  }
}

function isUrlLikeField(setting) {
  if (!setting) return false;
  const id = (setting.id || '').toString().toLowerCase();
  if (setting.type === 'url') return true;
  if (id && SOCIAL_URL_IDS.has(id)) return true;
  if (!id) return false;
  return URL_PATTERNS.some((pattern) => pattern.test(id));
}

function mustBeFalse(setting) {
  if (!setting?.id) return false;
  return NON_TRANSLATABLE_IDS.has(setting.id);
}

function validateSetting(setting, context) {
  if (!setting || typeof setting !== 'object') {
    return;
  }

  checkedSettings += 1;

  if (
    Object.prototype.hasOwnProperty.call(setting, 'translate') &&
    typeof setting.translate !== 'boolean'
  ) {
    violations.push(`${context}: translate 字段必须是布尔值`);
  }

  if (isUrlLikeField(setting) && setting.translate !== false) {
    violations.push(`${context}: URL 字段必须设置 translate=false`);
  }

  if (mustBeFalse(setting) && setting.translate !== false) {
    violations.push(`${context}: ${setting.id} 必须设置 translate=false`);
  }
}

function scanSettings(settings, context) {
  if (!Array.isArray(settings)) {
    return;
  }

  settings.forEach((setting, index) => {
    const idSuffix = setting?.id ? `:${setting.id}` : `#${index}`;
    const scope = `${context}[${index}]${idSuffix}`;
    validateSetting(setting, scope);

    if (Array.isArray(setting?.blocks)) {
      setting.blocks.forEach((block, blockIndex) => {
        scanSettings(block?.settings, `${scope}.blocks[${blockIndex}]`);
      });
    }
  });
}

function validateSettingsSchema() {
  const settingsSchemaPath = path.join(THEME_SCHEMA_DIR, 'settings_schema.json');
  const schema = readJson(settingsSchemaPath);
  if (!Array.isArray(schema)) {
    violations.push('settings_schema.json 顶层必须是数组');
    return;
  }

  schema.forEach((group, index) => {
    scanSettings(group?.settings, `settings_schema[${index}]`);
  });
}

function validateSectionFile(filePath, filename) {
  const schema = readJson(filePath);
  if (!schema) return;

  scanSettings(schema?.settings, `sections/${filename}`);

  if (Array.isArray(schema?.blocks)) {
    schema.blocks.forEach((block, index) => {
      scanSettings(block?.settings, `sections/${filename}.blocks[${index}]`);
    });
  }
}

function validateSectionsDirectory() {
  if (!fs.existsSync(SECTIONS_DIR)) {
    violations.push(`未找到 sections 目录: ${SECTIONS_DIR}`);
    return;
  }

  const files = fs.readdirSync(SECTIONS_DIR).filter((file) => file.endsWith('.json'));
  files.forEach((file) => {
    const filePath = path.join(SECTIONS_DIR, file);
    validateSectionFile(filePath, file);
  });
}

function main() {
  validateSettingsSchema();
  validateSectionsDirectory();

  if (violations.length > 0) {
    console.error('❌ Theme schema 校验失败:');
    violations.forEach((message) => console.error(`  - ${message}`));
    console.error(`共检查 ${checkedSettings} 个 settings，发现 ${violations.length} 个问题。`);
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Theme schema 校验通过，共检查 ${checkedSettings} 个 settings。`);
}

main();
