#!/usr/bin/env node
import { prisma } from '../app/db.server.js';
import { PRICING_CONFIG, getPlanNetRevenue } from '../app/utils/pricing-config.js';

const COST_PER_CREDIT = PRICING_CONFIG.COST_PER_CREDIT;
const SAFE_MARGIN = 0.3;
const MIN_USAGE = 0.4;
const MAX_USAGE = 0.85;

const monthStart = ((d) => new Date(d.getFullYear(), d.getMonth(), 1))(new Date());

async function loadData() {
  const [subs, usageAgg] = await Promise.all([
    prisma.shopSubscription.findMany({ where: { status: 'active' }, include: { plan: true } }),
    prisma.creditUsage.groupBy({
      by: ['shopId'],
      where: { usageDate: { gte: monthStart }, status: 'completed' },
      _sum: { creditsUsed: true }
    })
  ]);
  return { subs, usageByShop: new Map(usageAgg.map((row) => [row.shopId, row._sum.creditsUsed || 0])) };
}

function summarisePlans(subs, usageByShop) {
  const plans = new Map();
  let totalCredits = 0;
  for (const { plan, shopId } of subs) {
    if (!plan) continue;
    const credits = usageByShop.get(shopId) || 0;
    totalCredits += credits;
    const entry =
      plans.get(plan.id) ||
      plans.set(plan.id, {
        name: plan.displayName,
        price: plan.price,
        monthlyCredits: plan.monthlyCredits,
        users: 0,
        credits: 0
      }).get(plan.id);
    entry.users += 1;
    entry.credits += credits;
  }
  return { plans, totalCredits };
}

function buildReport(plansSummary) {
  const rows = [];
  const warnings = [];
  for (const summary of plansSummary.values()) {
    const { name, price, monthlyCredits, users, credits } = summary;
    const usageRate = users && monthlyCredits ? credits / (monthlyCredits * users) : 0;
    const revenue = price * users;
    const profit = getPlanNetRevenue(price) * users - credits * COST_PER_CREDIT;
    const margin = revenue > 0 ? profit / revenue : 0;

    rows.push({
      套餐: name,
      用户数: users,
      月费: `$${price.toFixed(2)}`,
      平均使用率: `${(usageRate * 100).toFixed(1)}%`,
      消耗额度: credits,
      毛利率: revenue > 0 ? `${(margin * 100).toFixed(1)}%` : '—',
      健康度: revenue === 0 ? '🟦' : margin >= SAFE_MARGIN ? '✅' : '⚠️'
    });

    if (revenue > 0 && margin < SAFE_MARGIN) {
      warnings.push(`毛利率偏低：${name} ≈ ${(margin * 100).toFixed(1)}%`);
    }
    if (users) {
      if (usageRate > MAX_USAGE) warnings.push(`额度偏紧：${name} 使用率 ${(usageRate * 100).toFixed(1)}%`);
      else if (usageRate < MIN_USAGE) warnings.push(`额度偏松：${name} 使用率 ${(usageRate * 100).toFixed(1)}%`);
    }
  }
  return { rows, warnings };
}

async function main() {
  const { subs, usageByShop } = await loadData();
  const { plans, totalCredits } = summarisePlans(subs, usageByShop);
  const { rows, warnings } = buildReport(plans);

  console.log('\n📊 套餐健康度矩阵');
  rows.length ? console.table(rows) : console.log('暂无激活套餐或使用数据。');

  console.log('\n💰 成本与使用情况');
  console.log(
    `本月总消耗额度：${totalCredits} · 估算 API 成本：$${(totalCredits * COST_PER_CREDIT).toFixed(2)}`
  );

  console.log('\n⚠️ 监控提示');
  warnings.length ? warnings.forEach((w) => console.log(`- ${w}`)) : console.log('暂无异常，维持现有配置即可。');
}

main()
  .catch((error) => {
    console.error('Failed to generate monthly metrics', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
