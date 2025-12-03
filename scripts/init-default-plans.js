#!/usr/bin/env node

import { prisma } from '../app/db.server.js';

const DEFAULT_PLANS = [
  { name: 'free', displayName: 'Free', price: 0, monthlyCredits: 0, maxLanguages: 2, features: { scanOnly: true }, sortOrder: 0 },
  { name: 'starter', displayName: 'Starter', price: 9.99, monthlyCredits: 10, maxLanguages: 5, features: { support: 'email' }, sortOrder: 1 },
  { name: 'pro', displayName: 'Pro', price: 29.99, monthlyCredits: 40, maxLanguages: 20, features: { support: 'priority' }, sortOrder: 2 },
  { name: 'enterprise', displayName: 'Enterprise', price: 99.99, monthlyCredits: 130, maxLanguages: null, features: { support: 'dedicated', templates: true }, sortOrder: 3 }
];

(async () => {
  try {
    for (const plan of DEFAULT_PLANS) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await prisma.subscriptionPlan.findUnique({ where: { name: plan.name } });
      if (existing) {
        // eslint-disable-next-line no-console
        console.log(`Subscription plan "${plan.name}" already exists, skipping.`);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await prisma.subscriptionPlan.create({ data: plan });
      // eslint-disable-next-line no-console
      console.log(`Created subscription plan "${plan.name}"`);
    }
  } catch (error) {
    console.error('Failed to initialise default subscription plans', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
