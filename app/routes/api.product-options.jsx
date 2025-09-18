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

    const optionTypes = [
      "PRODUCT_OPTION",
      "product_option",
      "PRODUCT_OPTION_VALUE",
      "product_option_value"
    ];

    let localOptions = [];

    // 尝试从本地数据库读取关联的选项及翻译
    const productRecord = await prisma.resource.findFirst({
      where: {
        shopId,
        gid: productGid
      }
    });

    if (productRecord) {
      const productStableId = String(
        productRecord.resourceId ||
        productRecord.originalResourceId ||
        productRecord.contentFields?.productId ||
        productRecord.id
      );
      const productLegacyId = String(productRecord.id);
      const optionTranslations = await prisma.translation.findMany({
        where: {
          language: targetLanguage,
          resource: {
            shopId,
            resourceType: { in: optionTypes }
          }
        },
        include: {
          resource: true
        }
      });

      const optionMap = new Map();

      for (const translation of optionTranslations) {
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
          resourceId.includes(productLegacyId)
        );

        if (!(matchesStableId || matchesStableGid || (!productStableId && matchesLegacyId))) {
          continue;
        }

        const translationFields = translation.translationFields || {};
        const originalValues = Array.isArray(contentFields.values)
          ? contentFields.values
          : (typeof contentFields.values === "string"
              ? contentFields.values.split(",")
              : []);
        const translatedValuesRaw = translationFields.values ?? translation.descTrans;
        const translatedValues = Array.isArray(translatedValuesRaw)
          ? translatedValuesRaw
          : (typeof translatedValuesRaw === "string" && translatedValuesRaw.length > 0
              ? translatedValuesRaw.split(",")
              : []);

        const name = contentFields.name || contentFields.optionName || resource.title || "";
        const valuesSignature = JSON.stringify(originalValues);
        const optionKey = `${productGid}::${name.toLowerCase()}::${valuesSignature}`;
        const priority = (matchesStableId || matchesStableGid) ? 0 : 1;

        const payload = {
          id: resource.id,
          name,
          values: originalValues,
          translatedName: translation.titleTrans || translationFields.name || null,
          translatedValues,
          syncStatus: translation.syncStatus,
          source: "database",
          priority
        };

        const existing = optionMap.get(optionKey);
        if (!existing || priority < existing.priority) {
          optionMap.set(optionKey, payload);
        }
      }

      localOptions = Array.from(optionMap.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ priority, ...option }) => option);
    }

    if (localOptions.length > 0) {
      return json({ success: true, data: { options: localOptions, source: "database" } });
    }

    // 回退到Shopify实时数据
    const { fetchOptionsForProduct } = await import("../services/shopify-graphql.server.js");
    const shopifyOptions = await fetchOptionsForProduct(admin, productGid);
    const formattedShopifyOptions = (shopifyOptions || []).map((option, index) => ({
      id: `${productGid}-option-${index}`,
      name: option.name || "",
      values: Array.isArray(option.values) ? option.values : [],
      translatedName: null,
      translatedValues: null,
      syncStatus: null,
      source: "shopify"
    }));

    return json({ success: true, data: { options: formattedShopifyOptions, source: "shopify" } });
  }, "fetch product options", request.headers.get("shopify-shop-domain") || "");
};
