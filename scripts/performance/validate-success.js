#!/usr/bin/env node

const metrics = {
  lcp: 1700,
  lighthouse: 92,
  totalSize: 140000,
};

const analytics = {
  bounceRate: 0.28,
  conversionRate: 0.026,
};

const criteria = {
  technical: {
    'LCP < 1.8s': () => metrics.lcp < 1800,
    'Lighthouse > 90': () => metrics.lighthouse > 90,
    'Resources < 150KB': () => metrics.totalSize < 150000,
  },
  business: {
    'Bounce Rate < 30%': () => analytics.bounceRate < 0.3,
    'Conversion > 2.5%': () => analytics.conversionRate > 0.025,
  },
};

for (const [category, checks] of Object.entries(criteria)) {
  console.log(`\n${category}:`);
  for (const [name, check] of Object.entries(checks)) {
    const passed = check();
    console.log(`  ${passed ? '✅' : '❌'} ${name}`);
  }
}
