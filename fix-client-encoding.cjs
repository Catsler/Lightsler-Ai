#!/usr/bin/env node
/**
 * Client Encoding Fixer
 * Automatically fixes non-ASCII characters in client-side JavaScript files
 */

const fs = require('fs');
const path = require('path');
const { findClientFiles, scanFileForNonAscii } = require('./client-encoding-scanner.cjs');

// Common replacements for non-ASCII characters
const REPLACEMENTS = {
  // Chinese characters to English
  '检查': 'check',
  '错误': 'error',
  '警告': 'warning',
  '成功': 'success',
  '失败': 'failed',
  '开始': 'start',
  '结束': 'end',
  '保存': 'save',
  '加载': 'load',
  '更新': 'update',
  '删除': 'delete',
  '创建': 'create',
  '修改': 'modify',
  '验证': 'validate',
  '处理': 'process',
  '完成': 'complete',
  '取消': 'cancel',
  
  // Emojis to text labels
  '✅': '[SUCCESS]',
  '❌': '[ERROR]',
  '⚠️': '[WARNING]',
  '🚀': '[LAUNCH]',
  '🔧': '[TOOL]',
  '📁': '[FOLDER]',
  '📄': '[FILE]',
  '🔄': '[REFRESH]',
  '💾': '[SAVE]',
  '🗑️': '[DELETE]',
  '📋': '[COPY]',
  '🔍': '[SEARCH]',
  '⚡': '[FAST]',
  '🛠️': '[BUILD]',
  '🎯': '[TARGET]',
  '📊': '[DATA]',
  '🔐': '[SECURE]',
  
  // Common punctuation
  '：': ':',
  '，': ',',
  '。': '.',
  '；': ';',
  '！': '!',
  '？': '?',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '「': '"',
  '」': '"',
  '『': "'",
  '』': "'",
  '…': '...',
  '—': '-',
  '–': '-'
};

function fixFileEncoding(filePath) {
  try {
    const originalContent = fs.readFileSync(filePath, 'utf8');
    let fixedContent = originalContent;
    let changeCount = 0;
    
    // Apply replacements
    for (const [from, to] of Object.entries(REPLACEMENTS)) {
      const regex = new RegExp(escapeRegex(from), 'g');
      const matches = fixedContent.match(regex);
      if (matches) {
        fixedContent = fixedContent.replace(regex, to);
        changeCount += matches.length;
      }
    }
    
    // Check if there are still non-ASCII characters
    const remainingIssues = scanFileForNonAscii({ readFileSync: () => fixedContent });
    
    if (changeCount > 0) {
      // Create backup
      const backupPath = `${filePath}.backup-${Date.now()}`;
      fs.writeFileSync(backupPath, originalContent);
      
      // Write fixed content
      fs.writeFileSync(filePath, fixedContent);
      
      console.log(`✓ Fixed ${filePath} (${changeCount} replacements)`);
      console.log(`  Backup created: ${backupPath}`);
      
      if (remainingIssues.length > 0) {
        console.log(`  ⚠️  Still has ${remainingIssues.length} non-ASCII characters that need manual fixing`);
      }
      
      return { fixed: true, changes: changeCount, remainingIssues: remainingIssues.length };
    } else {
      console.log(`- No automatic fixes available for ${filePath}`);
      return { fixed: false, changes: 0, remainingIssues: remainingIssues.length };
    }
    
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}: ${error.message}`);
    return { fixed: false, changes: 0, error: error.message };
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mock scanFileForNonAscii for string content
function scanStringForNonAscii(content) {
  const NON_ASCII_REGEX = /[^\x00-\x7F]/;
  const lines = content.split('\n');
  const issues = [];
  
  lines.forEach((line, index) => {
    if (NON_ASCII_REGEX.test(line)) {
      const match = line.match(NON_ASCII_REGEX);
      issues.push({
        line: index + 1,
        content: line.trim(),
        character: match[0]
      });
    }
  });
  
  return issues;
}

function main() {
  console.log('[Fixer] Scanning for client files with encoding issues...');
  
  const clientFiles = findClientFiles();
  
  if (clientFiles.length === 0) {
    console.log('[Fixer] No client-side files found');
    return;
  }
  
  const problemFiles = [];
  
  for (const file of clientFiles) {
    const issues = scanFileForNonAscii(file);
    if (issues.length > 0) {
      problemFiles.push(file);
    }
  }
  
  if (problemFiles.length === 0) {
    console.log('[Fixer] ✓ No encoding issues found');
    return;
  }
  
  console.log(`[Fixer] Found ${problemFiles.length} files with encoding issues`);
  console.log('[Fixer] Attempting automatic fixes...\n');
  
  let totalFixed = 0;
  let totalChanges = 0;
  let filesWithRemaining = 0;
  
  for (const file of problemFiles) {
    const result = fixFileEncoding(file);
    if (result.fixed) {
      totalFixed++;
      totalChanges += result.changes;
    }
    if (result.remainingIssues > 0) {
      filesWithRemaining++;
    }
  }
  
  console.log(`\n[Fixer] Summary:`);
  console.log(`  Files processed: ${problemFiles.length}`);
  console.log(`  Files fixed: ${totalFixed}`);
  console.log(`  Total replacements: ${totalChanges}`);
  
  if (filesWithRemaining > 0) {
    console.log(`  Files still needing manual fixes: ${filesWithRemaining}`);
    console.log(`\n  Please manually review and fix the remaining non-ASCII characters.`);
  } else {
    console.log(`  ✓ All files should now be ASCII-only`);
  }
}

if (require.main === module) {
  main();
}