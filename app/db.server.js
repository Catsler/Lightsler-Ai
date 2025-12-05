import { PrismaClient } from "@prisma/client";
import { applySoftDeleteMiddleware } from "./utils/prisma-soft-delete.server.js";
import { applyTokenCryptoMiddleware } from "./utils/prisma-token-crypto.server.js";
import { ensureEncryptionKeyReady } from "./utils/crypto.server.js";

const EXPECTED_MODELS = [
  "subscriptionPlan",
  "shopSubscription",
  "shop",
  "language",
  "resource"
];

function getMissingModels(client) {
  if (!client || typeof client !== "object") {
    return [...EXPECTED_MODELS];
  }
  return EXPECTED_MODELS.filter(
    (model) => typeof client[model]?.findMany !== "function"
  );
}

// eslint-disable-next-line no-undef
const globalObj = typeof globalThis !== 'undefined' ? globalThis : global;
let prismaClient = globalObj.prismaGlobal;

if (process.env.NODE_ENV !== "production") {
  const hadClient = Boolean(prismaClient);
  const missing = hadClient ? getMissingModels(prismaClient) : [];

  if (!prismaClient || missing.length > 0) {
    ensureEncryptionKeyReady();
    if (prismaClient && typeof prismaClient.$disconnect === "function") {
      prismaClient.$disconnect().catch(() => {});
    }
    prismaClient = new PrismaClient({ log: ["warn", "error"] });
    applySoftDeleteMiddleware(prismaClient);
    applyTokenCryptoMiddleware(prismaClient);
    globalObj.prismaGlobal = prismaClient;

    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Prisma] Recreated client because expected models were missing: ${missing.join(
          ", "
        )}. Run "npx prisma generate" and restart the dev server if this warning repeats.`
      );
    }
  }
} else if (!prismaClient) {
  ensureEncryptionKeyReady();
  prismaClient = new PrismaClient();
  applySoftDeleteMiddleware(prismaClient);
  applyTokenCryptoMiddleware(prismaClient);
}

const prisma = prismaClient ?? new PrismaClient();
applySoftDeleteMiddleware(prisma);
applyTokenCryptoMiddleware(prisma);

if (process.env.NODE_ENV !== "production") {
  const missing = getMissingModels(prisma);
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[Prisma] Missing expected models: ${missing.join(
        ", "
      )}. Run "npx prisma generate" and restart the dev server.`
    );
  }
}

export default prisma;
export { prisma };
