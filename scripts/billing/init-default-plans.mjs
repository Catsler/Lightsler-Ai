#!/usr/bin/env node

import { prisma } from '../../app/db.server.js';

const DEFAULT_PLANS = [
  {
    name: 'free',
    displayName: 'Free',
    monthlyCredits: 0,
    maxLanguages: 2,
    price: 0,
    sortOrder: 0,
    features: {
      scanOnly: true,
      autoTranslation: false,
      editTranslation: false,
      languageSwitcher: false
    }
  },
  {
    name: 'starter',
    displayName: 'Starter',
    monthlyCredits: 10,
    maxLanguages: 5,
    price: 9.99,
    sortOrder: 1,
    features: {
      autoTranslation: true,
      editTranslation: true,
      languageSwitcher: true
    }
  },
  {
    name: 'pro',
    displayName: 'Pro',
    monthlyCredits: 40,
    maxLanguages: 20,
    price: 29.99,
    sortOrder: 2,
    features: {
      autoTranslation: true,
      editTranslation: true,
      languageSwitcher: true,
      themeTranslation: true
    }
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    monthlyCredits: 130,
    maxLanguages: null,
    price: 99.99,
    sortOrder: 3,
    features: {
      autoTranslation: true,
      editTranslation: true,
      languageSwitcher: true,
      themeTranslation: true,
      prioritySupport: true
    }
  }
];

async function main() {
  for (const plan of DEFAULT_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {
        displayName: plan.displayName,
        monthlyCredits: plan.monthlyCredits,
        maxLanguages: plan.maxLanguages,
        price: plan.price,
        sortOrder: plan.sortOrder,
        features: plan.features,
        isActive: true
      },
      create: plan
    });
  }

  console.log(`Initialized ${DEFAULT_PLANS.length} billing plans (or updated existing ones).`);
}

main()
  .catch((error) => {
    console.error('Failed to initialize billing plans', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
