/**
 * Translation diagnostics service for API connectivity checks.
 */
import { logger } from '../../utils/logger.server.js';

/**
 * Quick API connectivity check stub.
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function quickApiConnectivityCheck() {
  return { ok: true, message: 'Diagnostics stub: connectivity not implemented' };
}

/**
 * Run translation diagnostics.
 * @returns {Promise<{diagnostics: Array}>}
 */
export async function runTranslationDiagnostics() {
  const result = await quickApiConnectivityCheck();
  logger.info('[Diagnostics] Translation diagnostics executed', result);
  return { diagnostics: [result] };
}

export default {
  quickApiConnectivityCheck,
  runTranslationDiagnostics,
};
