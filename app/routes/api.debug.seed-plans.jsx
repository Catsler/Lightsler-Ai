import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ULTRA_PLANS } from "../utils/pricing-config";

export const loader = async ({ request }) => {
    await authenticate.admin(request);

    const results = [];

    for (const plan of ULTRA_PLANS) {
        const upsert = await prisma.subscriptionPlan.upsert({
            where: { id: plan.id },
            update: {
                name: plan.name,
                displayName: plan.displayName,
                price: plan.price,
                monthlyCredits: plan.monthlyCredits,
                rateLimit: plan.rateLimit,
                isActive: true,
                features: JSON.stringify(plan.features || {}), // Assuming features is a JSON field or we store it somehow
                // Add other fields if necessary
            },
            create: {
                id: plan.id,
                name: plan.name,
                displayName: plan.displayName,
                price: plan.price,
                currency: 'USD',
                interval: 'EVERY_30_DAYS',
                monthlyCredits: plan.monthlyCredits,
                rateLimit: plan.rateLimit,
                isActive: true,
                features: JSON.stringify(plan.features || {}),
            }
        });
        results.push(upsert);
    }

    return json({ success: true, seeded: results.length, plans: results });
};
