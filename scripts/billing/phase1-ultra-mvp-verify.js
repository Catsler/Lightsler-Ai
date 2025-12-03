import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      select: { id: true, name: true, maxLanguages: true },
      orderBy: { price: 'asc' }
    });

    console.log('\n📋 SubscriptionPlan maxLanguages check');
    console.table(plans.map(p => ({
      id: p.id,
      name: p.name,
      maxLanguages: p.maxLanguages === null ? 'Unlimited' : p.maxLanguages
    })));

    const expected = new Map([
      ['Free', '2'],
      ['Starter', '5'],
      ['Pro', '20'],
      ['Enterprise', 'Unlimited'],
    ]);

    const mismatches = plans.filter(plan => {
      const expectedValue = expected.get(plan.name);
      const actualValue = plan.maxLanguages === null ? 'Unlimited' : String(plan.maxLanguages);
      return expectedValue && expectedValue !== actualValue;
    });

    if (mismatches.length === 0) {
      console.log('\n✅ All plans have expected maxLanguages values.');
    } else {
      console.log('\n❌ Found mismatches:');
      mismatches.forEach((plan) => {
        const expectedValue = expected.get(plan.name);
        const actualValue = plan.maxLanguages === null ? 'Unlimited' : String(plan.maxLanguages);
        console.log(`  - ${plan.name}: expected ${expectedValue}, got ${actualValue}`);
      });
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

verify();
