import process from "node:process";
import { performIncrementalScan } from "../app/services/incremental-translation.server.js";

function parseCliOptions(args) {
  const options = {
    resourceType: null,
    includeDetails: false,
    limit: 200,
    resourceIds: [],
    minCoverage: 0
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (!arg.startsWith("--")) {
      continue;
    }

    const [flag, value] = arg.includes("=") ? arg.split("=", 2) : [arg, args[index + 1]];
    const normalizedFlag = flag.replace(/^--/, "");

    switch (normalizedFlag) {
      case "resource-type":
      case "resourceType":
        options.resourceType = typeof value === "string" && value.trim() ? value.trim() : null;
        if (!arg.includes("=") && value) {
          index += 1;
        }
        break;
      case "include-details":
      case "includeDetails":
        options.includeDetails = true;
        if (!arg.includes("=")) {
          // flag without equals, no need to skip next
        }
        break;
      case "limit": {
        const parsed = Number.parseInt(value, 10);
        if (!arg.includes("=") && value) {
          index += 1;
        }
        if (Number.isFinite(parsed) && parsed > 0) {
          options.limit = parsed;
        }
        break;
      }
      case "resource-ids":
      case "resourceIds": {
        const idsValue = arg.includes("=") ? value : args[index + 1];
        if (!arg.includes("=") && idsValue) {
          index += 1;
        }

        try {
          const parsed = JSON.parse(idsValue ?? "[]");
          if (Array.isArray(parsed)) {
            options.resourceIds = parsed.filter((item) => typeof item === "string" && item.trim() !== "");
          }
        } catch (error) {
          console.warn("resourceIds 参数解析失败，将忽略该选项", error);
        }
        break;
      }
      case "min-coverage":
      case "minCoverage": {
        const parsed = Number.parseFloat(value);
        if (!arg.includes("=") && value) {
          index += 1;
        }
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
          options.minCoverage = parsed;
        }
        break;
      }
      default:
        console.warn(`未知选项: ${flag}`);
    }
  }

  return options;
}

const [shopId, language, ...rest] = process.argv.slice(2);

if (!shopId || !language) {
  console.error('用法: node scripts/check-translation-coverage.mjs <shopId> <language> [--resource-type=<type>] [--include-details] [--limit=<n>] [--resource-ids=\'["id"]\'] [--min-coverage=<0-1>]');
  process.exit(1);
}

const options = parseCliOptions(rest);

async function run() {
  const report = await performIncrementalScan({
    shopId,
    language,
    resourceType: options.resourceType,
    includeDetails: options.includeDetails,
    limit: options.limit,
    resourceIds: options.resourceIds
  });

  console.log(JSON.stringify({
    shopId,
    language,
    parameters: options,
    summary: report.summary,
    details: options.includeDetails ? report.details : undefined
  }, null, 2));

  if (options.minCoverage > 0 && report.summary.coverageRate < options.minCoverage) {
    console.error(`⚠️ 覆盖率 ${report.summary.coverageRate} 低于阈值 ${options.minCoverage}`);
    process.exitCode = 2;
  }
}

run().catch((error) => {
  console.error("执行翻译覆盖率检测失败:", error);
  process.exit(1);
});
