#!/usr/bin/env node
/**
 * Seed ULTRA_PLANS into SubscriptionPlan table.
 * Safe to re-run (upsert by name).
 */
import { PrismaClient } from '@prisma/client';
import { ULTRA_PLANS } from '../app/utils/pricing-config.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ULTRA_PLANS into SubscriptionPlan...');

  for (const plan of ULTRA_PLANS) {
    // Skip hidden free plan in grid but still seed for safety
    const data = {
      id: plan.id, // use stable id so planId references are predictable
      name: plan.name,
      displayName: plan.displayName,
      price: plan.price,
      monthlyCredits: plan.monthlyCredits,
      maxLanguages: plan.maxLanguages ?? null,
      features: {
        topUpRate: plan.topUpRate ?? null,
        badge: plan.badge ?? null,
        rateLimit: plan.rateLimit ?? null,
        originalPrice: plan.originalPrice ?? null,
        description: plan.description ?? null
      },
      sortOrder: plan.order ?? 0,
      isActive: plan.hidden !== true
    };

    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: data,
      create: data
    });

    console.log(`- upserted plan ${plan.name} (${plan.displayName})`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
