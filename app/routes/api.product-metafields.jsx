import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server.js";
import { withErrorHandling } from "../utils/api-response.server";

export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin, session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const gid = url.searchParams.get("gid");
    const resourceId = url.searchParams.get("resourceId");
    const targetLanguage = url.searchParams.get("lang") || "zh-CN";

    if (!gid && !resourceId) {
      return json({ error: "Missing gid or resourceId" }, { status: 400 });
    }

    const productGid = gid || `gid://shopify/Product/${resourceId}`;
    const shopId = session.shop;

    const metafieldTypes = [
      "PRODUCT_METAFIELD",
      "product_metafield",
      "METAFIELD"
    ];

    let localMetafields = [];

    const productRecord = await prisma.resource.findFirst({
      where: {
        shopId,
        gid: productGid
      }
    });

    const productStableId = productRecord
      ? String(
          productRecord.resourceId ||
          productRecord.originalResourceId ||
          productRecord.contentFields?.productId ||
          productRecord.id
        )
      : null;
    const productLegacyId = productRecord ? String(productRecord.id) : null;

    const metafieldTranslations = await prisma.translation.findMany({
      where: {
        language: targetLanguage,
        resource: {
          shopId,
          resourceType: { in: metafieldTypes }
        }
      },
      include: {
        resource: true
      }
    });

    const metafieldMap = new Map();

    for (const translation of metafieldTranslations) {
      const resource = translation.resource;
      if (!resource) continue;

      const contentFields = resource.contentFields || {};
      const resourceId = resource.resourceId || resource.id || '';
      const matchesStableId = productStableId && (
        contentFields.productId === productStableId ||
        resourceId.includes(productStableId)
      );
      const matchesStableGid = contentFields.productGid === productGid;
      const matchesLegacyId = productLegacyId && (
        contentFields.productId === productLegacyId ||
        contentFields.legacyProductId === productLegacyId ||
        resourceId.includes(productLegacyId)
      );

      if (!(matchesStableId || matchesStableGid || (!productStableId && matchesLegacyId))) {
        continue;
      }

      const value =
        typeof contentFields.value === "string" && contentFields.value.trim().length > 0
          ? contentFields.value
          : (resource.description || "");

      const translatedValue = (translation.translationFields && translation.translationFields.value) || translation.descTrans || null;

      const metaKey = `${contentFields.namespace || ''}::${contentFields.key || ''}`;
      const priority = (matchesStableId || matchesStableGid) ? 0 : 1;

      const payload = {
        id: resource.id,
        namespace: contentFields.namespace || "",
        key: contentFields.key || "",
        value,
        translatedValue,
        syncStatus: translation.syncStatus,
        source: "database",
        priority
      };

      const existing = metafieldMap.get(metaKey);
      if (!existing || priority < existing.priority) {
        metafieldMap.set(metaKey, payload);
      }
    }

    localMetafields = Array.from(metafieldMap.values())
      .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key))
      .map(({ priority, ...mf }) => mf);

    if (localMetafields.length > 0) {
      return json({ success: true, data: { metafields: localMetafields, source: "database" } });
    }

    const { fetchMetafieldsForProduct } = await import("../services/shopify-graphql.server.js");
    const shopifyMetafields = await fetchMetafieldsForProduct(admin, productGid);
    const formattedShopifyMetafields = (shopifyMetafields || []).map((metafield) => ({
      id: metafield.id,
      namespace: metafield.namespace,
      key: metafield.key,
      value: metafield.value,
      translatedValue: null,
      syncStatus: null,
      source: "shopify"
    }));

    return json({ success: true, data: { metafields: formattedShopifyMetafields, source: "shopify" } });
  }, "fetch product metafields", request.headers.get("shopify-shop-domain") || "");
};
