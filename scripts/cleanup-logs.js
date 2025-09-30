#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    path: 'logs',
    days: 30,
    dryRun: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--path' || arg === '-p') {
      options.path = args[i + 1] ?? options.path;
      i += 1;
    } else if (arg === '--days' || arg === '-d') {
      const value = Number(args[i + 1]);
      if (Number.isFinite(value) && value > 0) {
        options.days = value;
      }
      i += 1;
    } else if (arg === '--dry-run' || arg === '--preview') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/cleanup-logs.js [options]

Options:
  -p, --path <dir>   Directory that stores log files (default: logs)
  -d, --days <num>   Retention days for archived logs (default: 30)
      --dry-run      List files that would be removed without deleting
  -h, --help         Show this help message
`);
}

function main() {
  const options = parseArgs();
  const targetDir = path.resolve(process.cwd(), options.path);

  if (!fs.existsSync(targetDir)) {
    console.error(`[cleanup-logs] Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const retentionMs = options.days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let removed = 0;
  let skipped = 0;

  const entries = fs.readdirSync(targetDir);

  entries.forEach((entry) => {
    // 只处理归档日志，例如 app-2025-10-03T12-00-00.log
    if (!/^app-\d{4}-\d{2}-\d{2}T/.test(entry)) {
      skipped += 1;
      return;
    }

    const fullPath = path.join(targetDir, entry);
    const stats = fs.statSync(fullPath);
    const age = now - stats.mtimeMs;

    if (age >= retentionMs) {
      if (options.dryRun) {
        console.log(`[cleanup-logs] would remove ${fullPath}`);
      } else {
        fs.rmSync(fullPath);
        console.log(`[cleanup-logs] removed ${fullPath}`);
      }
      removed += 1;
    }
  });

  console.log(`Cleanup complete. Removed=${removed}, Skipped=${skipped}, Path=${targetDir}, RetentionDays=${options.days}, DryRun=${options.dryRun}`);
}

main();
