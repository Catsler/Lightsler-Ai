#!/usr/bin/env node
/**
 * Client Encoding Scanner
 * Scans client-side JavaScript files for non-ASCII characters
 * Ensures Vite/Remix ES module compatibility
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Pattern to match client-side files
const CLIENT_FILE_PATTERNS = [
  '**/*.client.js',
  '**/*.client.jsx',
  '**/*.client.ts',
  '**/*.client.tsx'
];

// Non-ASCII character detection regex
const NON_ASCII_REGEX = /[^\x00-\x7F]/;

function findClientFiles() {
  const files = [];
  for (const pattern of CLIENT_FILE_PATTERNS) {
    try {
      const result = execSync(`find . -name "${pattern.replace('**/', '')}" -not -path "./node_modules/*"`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] 
      });
      const foundFiles = result.trim().split('\n').filter(file => file.length > 0);
      files.push(...foundFiles);
    } catch (error) {
      // Ignore find errors (pattern not found)
    }
  }
  return [...new Set(files)]; // Remove duplicates
}

function scanFileForNonAscii(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
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
  } catch (error) {
    console.warn(`[WARN] Could not read file ${filePath}: ${error.message}`);
    return [];
  }
}

function main() {
  const checkMode = process.argv.includes('--check');
  
  console.log('[Scanner] Scanning client-side files for non-ASCII characters...');
  
  const clientFiles = findClientFiles();
  
  if (clientFiles.length === 0) {
    console.log('[Scanner] No client-side files found');
    process.exit(0);
  }
  
  console.log(`[Scanner] Found ${clientFiles.length} client files to scan`);
  
  let hasIssues = false;
  const problemFiles = [];
  
  for (const file of clientFiles) {
    const issues = scanFileForNonAscii(file);
    if (issues.length > 0) {
      hasIssues = true;
      problemFiles.push({ file, issues });
      
      if (checkMode) {
        console.log(`\n❌ ${file}:`);
        issues.slice(0, 3).forEach(issue => {
          console.log(`   Line ${issue.line}: ${issue.content}`);
          console.log(`   Contains: '${issue.character}' (non-ASCII)`);
        });
        if (issues.length > 3) {
          console.log(`   ... and ${issues.length - 3} more issues`);
        }
      }
    }
  }
  
  if (hasIssues) {
    console.log(`\n[ERROR] Found non-ASCII characters in ${problemFiles.length} client files`);
    if (checkMode) {
      console.log('\nFiles with issues:');
      problemFiles.forEach(({ file, issues }) => {
        console.log(`  ${file} (${issues.length} issues)`);
      });
    }
    process.exit(1);
  } else {
    console.log('[Scanner] ✓ All client files use ASCII characters only');
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = { findClientFiles, scanFileForNonAscii };