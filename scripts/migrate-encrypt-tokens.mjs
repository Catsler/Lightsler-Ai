import { PrismaClient } from '@prisma/client';
import { encryptToken, isTokenEncrypted, ensureEncryptionKeyReady } from '../app/utils/crypto.server.js';

const prisma = new PrismaClient();

async function migrateTable(tableName) {
  const select = { id: true, accessToken: true };
  if (tableName === 'session') {
    select.shop = true;
  }

  const items = await prisma[tableName].findMany({ select });

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    try {
      if (!item.accessToken || isTokenEncrypted(item.accessToken)) {
        skipped++;
        continue;
      }
      const encrypted = encryptToken(item.accessToken);
      await prisma[tableName].update({
        where: { id: item.id },
        data: { accessToken: encrypted }
      });
      migrated++;
    } catch (error) {
      failed++;
      console.error(`[migrate] ${tableName} ${item.id} 加密失败: ${error.message}`);
    }
  }

  return { migrated, skipped, failed, total: items.length };
}

async function main() {
  ensureEncryptionKeyReady();
  console.log('🔐 开始访问令牌加密迁移（Shop, Session）');

  const shopResult = await migrateTable('shop');
  console.log(`[Shop] total=${shopResult.total} migrated=${shopResult.migrated} skipped=${shopResult.skipped} failed=${shopResult.failed}`);

  const sessionResult = await migrateTable('session');
  console.log(`[Session] total=${sessionResult.total} migrated=${sessionResult.migrated} skipped=${sessionResult.skipped} failed=${sessionResult.failed}`);

  const totalFailed = shopResult.failed + sessionResult.failed;
  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('迁移失败', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
