import dotenv from 'dotenv';
import { purgeSoftDeletedData } from '../app/services/gdpr-compliance.server.js';

dotenv.config();

async function main() {
  const before = new Date();
  const shopId = process.env.PURGE_SHOP_ID || undefined;

  console.info('[GDPR] Starting purge of soft-deleted data', {
    before: before.toISOString(),
    shopId: shopId || 'all',
  });

  const result = await purgeSoftDeletedData({ shopId, before });

  console.info('[GDPR] Purge completed', result);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[GDPR] Purge failed', error);
    process.exit(1);
  });
