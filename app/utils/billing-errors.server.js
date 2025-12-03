export class InsufficientCreditsError extends Error {
  constructor({ available = 0, required = 0, planName = 'unknown' } = {}) {
    super('Insufficient credits available for translation');
    this.name = 'InsufficientCreditsError';
    this.code = 'INSUFFICIENT_CREDITS';
    this.available = available;
    this.required = required;
    this.planName = planName;
  }
}

export class MissingSubscriptionError extends Error {
  constructor({ shopId }) {
    super('No active subscription found for shop');
    this.name = 'MissingSubscriptionError';
    this.code = 'MISSING_SUBSCRIPTION';
    this.shopId = shopId;
  }
}

export class BillingConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BillingConfigurationError';
    this.code = 'BILLING_CONFIGURATION_ERROR';
  }
}
