import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { withErrorHandling } from "../utils/api-response.server";

export const loader = async ({ request }) => {
  return withErrorHandling(async () => {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const gid = url.searchParams.get("gid");
    const resourceId = url.searchParams.get("resourceId");

    if (!gid && !resourceId) {
      return json({ error: "Missing gid or resourceId" }, { status: 400 });
    }

    const productGid = gid || `gid://shopify/Product/${resourceId}`;
    const { fetchMetafieldsForProduct } = await import("../services/shopify-graphql.server.js");
    const metafields = await fetchMetafieldsForProduct(admin, productGid);
    return json({ success: true, data: { metafields } });
  }, "fetch product metafields", request.headers.get("shopify-shop-domain") || "");
};

