import { encryptToken, decryptToken, isTokenEncrypted } from './crypto.server.js';

const TARGET_MODELS = new Set(['Shop', 'Session']);

function encryptField(value) {
  if (!value) return value;
  if (typeof value !== 'string') return value;
  if (isTokenEncrypted(value)) return value;
  return encryptToken(value);
}

function decryptField(value) {
  if (!value) return value;
  if (typeof value !== 'string') return value;
  try {
    return decryptToken(value);
  } catch {
    return value;
  }
}

function encryptArgs(args) {
  if (!args || typeof args !== 'object') return;

  if (Array.isArray(args.data)) {
    args.data = args.data.map(item => ({
      ...item,
      accessToken: encryptField(item.accessToken)
    }));
    return;
  }

  if (args.data) {
    args.data.accessToken = encryptField(args.data.accessToken);
  }

  if (args.create) {
    args.create.accessToken = encryptField(args.create.accessToken);
  }

  if (args.update) {
    args.update.accessToken = encryptField(args.update.accessToken);
  }
}

function decryptResult(result) {
  if (!result) return result;

  if (Array.isArray(result)) {
    return result.map(item => decryptResult(item));
  }

  if (typeof result === 'object') {
    if ('accessToken' in result) {
      result.accessToken = decryptField(result.accessToken);
    }
    return result;
  }

  return result;
}

export function applyTokenCryptoMiddleware(prisma) {
  if (!prisma || typeof prisma.$use !== 'function') return;

  prisma.$use(async (params, next) => {
    if (!TARGET_MODELS.has(params.model)) {
      return next(params);
    }

    const op = params.action;

    // 写入路径加密
    if (['create', 'update', 'upsert', 'createMany', 'updateMany'].includes(op)) {
      encryptArgs(params.args);
    }

    const result = await next(params);

    // 读路径解密
    if (['findUnique', 'findFirst', 'findMany', 'create', 'update', 'upsert'].includes(op)) {
      return decryptResult(result);
    }

    return result;
  });
}
