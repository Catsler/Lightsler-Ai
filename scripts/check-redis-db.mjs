import process from "node:process";
import { spawn } from "node:child_process";

const uri = process.env.REDIS_URL || "redis://localhost:6379";
const shopId = process.env.SHOP_ID || "default";
const dbIndex = Number(getDatabaseIndex(shopId));

function getDatabaseIndex(shopIdentifier) {
  const match = /^shop(\d+)$/.exec(shopIdentifier.trim());
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 15) {
      return parsed;
    }
  }
  return 0;
}

function runRedisCommand(database) {
  return new Promise((resolve, reject) => {
    const child = spawn("redis-cli", ["-u", uri, "-n", String(database), "info", "keyspace"], {
      stdio: "pipe"
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`redis-cli exited with code ${code}: ${stderr}`));
      }
    });
  });
}

async function main() {
  console.log(`检查店铺 ${shopId} (DB ${dbIndex}) 的 Redis keyspace...`);

  try {
    const info = await runRedisCommand(dbIndex);
    console.log(info || "(没有key)");
  } catch (error) {
    console.error("执行失败:", error.message || error);
    process.exit(1);
  }
}

main();
