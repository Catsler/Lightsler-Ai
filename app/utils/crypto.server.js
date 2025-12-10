/* eslint-disable no-console */
import crypto from 'crypto';
// 使用 console 避免日志模块与 Prisma/加密的循环依赖

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 12 字节
const ENCODING = 'hex';
const MIN_KEY_LENGTH = 32;

function resolveKey() {
  const raw = process.env.ENCRYPTION_KEY || '';

  if (!raw || raw.length < MIN_KEY_LENGTH) {
    const message = !raw
      ? 'ENCRYPTION_KEY 未设置'
      : `ENCRYPTION_KEY 长度不足: ${raw.length} < ${MIN_KEY_LENGTH}`;

    console.error(`[crypto] ${message}`);

    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }

    console.warn('[crypto] 使用临时密钥，仅限非生产环境');
    return crypto.randomBytes(MIN_KEY_LENGTH);
  }

  return crypto.scryptSync(raw, 'salt', 32);
}

const KEY = resolveKey();

export function isTokenEncrypted(token) {
  return typeof token === 'string' && token.split(':').length === 3;
}

export function encryptToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token must be a non-empty string');
  }

  if (isTokenEncrypted(token)) {
    return token;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString(ENCODING),
    authTag.toString(ENCODING),
    encrypted.toString(ENCODING)
  ].join(':');
}

export function decryptToken(encryptedToken) {
  if (!encryptedToken || typeof encryptedToken !== 'string') {
    throw new Error('Encrypted token must be a non-empty string');
  }

  if (!isTokenEncrypted(encryptedToken)) {
    // 兼容旧数据：直接返回明文
    return encryptedToken;
  }

  const [ivHex, authTagHex, encryptedHex] = encryptedToken.split(':');

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, ENCODING));
    decipher.setAuthTag(Buffer.from(authTagHex, ENCODING));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, ENCODING)),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('[crypto] 令牌解密失败', { error: error.message });
    throw new Error('Failed to decrypt token');
  }
}

export function ensureEncryptionKeyReady() {
  // 触发模块初始化的 key 校验
  return Boolean(KEY);
}
