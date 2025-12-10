import { creditManager } from '../credit-manager.server.js';
import { creditCalculator } from '../credit-calculator.server.js';
import { InsufficientCreditsError } from '../../utils/billing-errors.server.js';

export function shouldEnforceBilling(options = {}) {
  const BILLING_ENABLED = process.env.SHOPIFY_BILLING_ENABLED === 'true';
  const BILLING_BYPASS = process.env.BILLING_BYPASS === 'true';
  if (!BILLING_ENABLED) return false;
  if (BILLING_BYPASS) return false;
  if (options.billingBypass || options.skipBilling) return false;
  if (!options.shopId) return false;
  return true;
}

export async function reserveBillingIfNeeded(text, targetLang, options, logger) {
  if (!shouldEnforceBilling(options)) {
    return { billingEnabled: false };
  }

  const estimatedUsage = creditCalculator.calculateEstimated(text, targetLang, options.resourceType, {
    stripHtmlTags: true
  });

  let reservationId = null;
  if (estimatedUsage?.credits > 0) {
    reservationId = await creditManager.reserveCredits(options.shopId, estimatedUsage.credits, {
      debug: options.debugBilling,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      fieldName: options.fieldName,
      operation: options.operation || 'translate_text'
    });
  }

  return {
    billingEnabled: true,
    reservationId,
    estimatedUsage
  };
}

export async function confirmBillingIfNeeded(reservationId, sourceText, translatedText, targetLang, options, estimatedUsage) {
  if (!reservationId) return;

  const actualUsage = creditCalculator.calculateActual(
    sourceText,
    translatedText || '',
    targetLang,
    options.resourceType,
    { stripHtmlTags: true }
  );

  const usageMetadata = {
    ...(options.metadata || {})
  };

  if (options.fieldName && !usageMetadata.fieldName) {
    usageMetadata.fieldName = options.fieldName;
  }
  if (estimatedUsage?.details) {
    usageMetadata.estimatedCreditsDetails = estimatedUsage.details;
  }
  usageMetadata.actualCreditsDetails = actualUsage.details;

  await creditManager.confirmUsage(reservationId, actualUsage.credits, {
    resourceId: options.resourceId,
    resourceType: options.resourceType,
    operation: options.operation || 'translate_text',
    sourceLanguage: options.sourceLanguage,
    targetLanguage: targetLang,
    batchId: options.batchId,
    sessionId: options.sessionId,
    sourceCharCount: actualUsage.details.sourceEffectiveChars,
    metadata: usageMetadata
  });
}

export async function ensureReservationReleased(reservationId) {
  if (!reservationId) return;
  await creditManager.ensureReservationHandled(reservationId);
}

export function handleBillingError(error, billingEnabled, estimatedUsage, optionPayload, targetLang, translationLogger) {
  if (billingEnabled && error instanceof InsufficientCreditsError) {
    translationLogger.warn('[Billing] 翻译被拒绝：额度不足', {
      shopId: optionPayload.shopId,
      fieldName: optionPayload.fieldName,
      resourceType: optionPayload.resourceType,
      targetLang,
      requiredCredits: estimatedUsage?.credits,
      availableCredits: error.available,
      planName: error.planName
    });
  }
}
