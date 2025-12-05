import { describe, it, expect, beforeAll } from 'vitest';

let encryptToken;
let decryptToken;
let isTokenEncrypted;

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = 'test-key-must-be-at-least-32-chars-long-for-security';
  const cryptoModule = await import('../../app/utils/crypto.server.js');
  ({ encryptToken, decryptToken, isTokenEncrypted } = cryptoModule);
});

describe('Token encryption', () => {
  const TOKEN = 'shpat_test_token_123';

  it('encrypts and decrypts', () => {
    const encrypted = encryptToken(TOKEN);
    expect(encrypted).not.toBe(TOKEN);
    expect(isTokenEncrypted(encrypted)).toBe(true);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(TOKEN);
  });

  it('treats plaintext as plaintext during migration', () => {
    const decrypted = decryptToken(TOKEN);
    expect(decrypted).toBe(TOKEN);
  });

  it('throws on empty token', () => {
    expect(() => encryptToken('')).toThrow();
  });
});
