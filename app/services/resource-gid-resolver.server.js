import prisma from "../db.server.js";
import {
  fetchOptionsForProduct,
  fetchMetafieldsForProduct,
  RESOURCE_TYPES
} from "./shopify-graphql.server.js";

function isValidShopifyGid(value) {
  return typeof value === "string" && value.startsWith("gid://shopify/");
}

function normalizeResourceType(resourceType) {
  if (!resourceType) return "";
  return String(resourceType).trim().toUpperCase();
}

function parseContentFields(contentFields) {
  if (!contentFields) return {};
  if (typeof contentFields === "string") {
    try {
      return JSON.parse(contentFields);
    } catch (error) {
      console.warn("无法解析contentFields JSON", { error: error.message });
      return {};
    }
  }
  return contentFields;
}

function extractNumericIdFromResource(resource) {
  if (!resource) return null;
  const { resourceId = "", originalResourceId = "" } = resource;
  const candidates = [resourceId, originalResourceId];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = String(candidate).match(/(\d{5,})/);
    if (match) return match[1];
  }
  return null;
}

function deriveProductGid(resource, contentFields) {
  const possible = [
    contentFields?.productGid,
    contentFields?.product_gid,
    contentFields?.productID,
    resource?.gid,
    resource?.originalResourceId
  ];

  for (const value of possible) {
    if (isValidShopifyGid(value)) {
      if (String(value).includes("Product")) {
        return value;
      }
    }
  }

  const numericId = contentFields?.productId || extractNumericIdFromResource(resource);
  if (numericId) {
    return `gid://shopify/Product/${numericId}`;
  }

  return null;
}

function extractOptionIndex(resourceId = "") {
  const match = String(resourceId).match(/option-(\d+)/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function extractOptionValueIndex(resourceId = "") {
  const match = String(resourceId).match(/value-(\d+)/i);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function compareNormalized(a = "", b = "") {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function arrayEqualsIgnoreOrder(a = [], b = []) {
  if (a.length !== b.length) return false;
  const normalizedA = a.map(value => String(value).trim().toLowerCase()).sort();
  const normalizedB = b.map(value => String(value).trim().toLowerCase()).sort();
  for (let index = 0; index < normalizedA.length; index += 1) {
    if (normalizedA[index] !== normalizedB[index]) return false;
  }
  return true;
}

async function resolveProductOptionGid(admin, resource, contentFields) {
  if (!admin) {
    return { reason: "ADMIN_CLIENT_REQUIRED" };
  }

  const productGid = deriveProductGid(resource, contentFields);
  if (!isValidShopifyGid(productGid)) {
    return { reason: "PRODUCT_GID_UNAVAILABLE", details: { productGid } };
  }

  const optionName = contentFields?.optionName || contentFields?.name || resource?.title || "";
  const optionIndex = extractOptionIndex(resource?.resourceId);
  const optionValues = Array.isArray(contentFields?.values) ? contentFields.values : [];

  const remoteOptions = await fetchOptionsForProduct(admin, productGid);
  if (!Array.isArray(remoteOptions) || remoteOptions.length === 0) {
    return { reason: "REMOTE_OPTIONS_EMPTY", details: { productGid } };
  }

  let matchedOption = null;
  if (Number.isInteger(optionIndex) && remoteOptions[optionIndex]) {
    matchedOption = remoteOptions[optionIndex];
  }

  if (!matchedOption && optionName) {
    matchedOption = remoteOptions.find(option => compareNormalized(option.name || "", optionName));
  }

  if (!matchedOption && optionValues.length > 0) {
    matchedOption = remoteOptions.find(option => arrayEqualsIgnoreOrder(option.values || [], optionValues));
  }

  if (matchedOption && isValidShopifyGid(matchedOption.id)) {
    return {
      gid: matchedOption.id,
      details: {
        matchedBy: optionIndex != null ? "index" : "name",
        productGid,
        optionName: matchedOption.name,
        optionIndex
      }
    };
  }

  return {
    reason: "OPTION_GID_NOT_FOUND",
    details: {
      productGid,
      optionName,
      optionIndex
    }
  };
}

async function resolveProductOptionValueGid(admin, resource, contentFields) {
  if (!admin) {
    return { reason: "ADMIN_CLIENT_REQUIRED" };
  }

  const productGid = deriveProductGid(resource, contentFields);
  if (!isValidShopifyGid(productGid)) {
    return { reason: "PRODUCT_GID_UNAVAILABLE", details: { productGid } };
  }

  const optionName = contentFields?.optionName || contentFields?.name || "";
  const valueName = contentFields?.valueName || resource?.title || "";
  const optionIndex = extractOptionIndex(resource?.resourceId);
  const valueIndex = extractOptionValueIndex(resource?.resourceId);

  const remoteOptions = await fetchOptionsForProduct(admin, productGid);
  if (!Array.isArray(remoteOptions) || remoteOptions.length === 0) {
    return { reason: "REMOTE_OPTIONS_EMPTY", details: { productGid } };
  }

  let matchedOption = null;
  if (Number.isInteger(optionIndex) && remoteOptions[optionIndex]) {
    matchedOption = remoteOptions[optionIndex];
  }

  if (!matchedOption && optionName) {
    matchedOption = remoteOptions.find(option => compareNormalized(option.name || "", optionName));
  }

  if (!matchedOption) {
    return {
      reason: "OPTION_NOT_FOUND",
      details: {
        productGid,
        optionIndex,
        optionName
      }
    };
  }

  const valueNodes = matchedOption.valueNodes || [];
  if (valueNodes.length === 0) {
    return {
      reason: "OPTION_VALUES_EMPTY",
      details: {
        optionName,
        productGid
      }
    };
  }

  let matchedValue = null;
  if (Number.isInteger(valueIndex) && valueNodes[valueIndex]) {
    matchedValue = valueNodes[valueIndex];
  }

  if (!matchedValue && valueName) {
    matchedValue = valueNodes.find(node => compareNormalized(node.name || "", valueName));
  }

  if (!matchedValue && Array.isArray(contentFields?.values)) {
    const flattened = contentFields.values.map(v => (typeof v === "string" ? v : v?.value)).filter(Boolean);
    matchedValue = valueNodes.find(node => flattened.includes(node.name));
  }

  if (matchedValue && isValidShopifyGid(matchedValue.id)) {
    return {
      gid: matchedValue.id,
      details: {
        matchedBy: valueIndex != null ? "index" : "name",
        productGid,
        optionName,
        valueName: matchedValue.name
      }
    };
  }

  return {
    reason: "OPTION_VALUE_NOT_FOUND",
    details: {
      productGid,
      optionName,
      valueName
    }
  };
}

async function resolveProductMetafieldGid(admin, resource, contentFields) {
  if (!admin) {
    return { reason: "ADMIN_CLIENT_REQUIRED" };
  }

  const productGid = deriveProductGid(resource, contentFields);
  if (!isValidShopifyGid(productGid)) {
    return { reason: "PRODUCT_GID_UNAVAILABLE", details: { productGid } };
  }

  const namespace = contentFields?.namespace;
  const key = contentFields?.key;
  if (!namespace || !key) {
    return { reason: "METAFIELD_NAMESPACE_OR_KEY_MISSING" };
  }

  const remoteMetafields = await fetchMetafieldsForProduct(admin, productGid);
  if (!Array.isArray(remoteMetafields) || remoteMetafields.length === 0) {
    return {
      reason: "REMOTE_METAFIELDS_EMPTY",
      details: {
        productGid
      }
    };
  }

  const matchedMetafield = remoteMetafields.find(node => (
    node.namespace === namespace && node.key === key
  ));

  if (matchedMetafield && isValidShopifyGid(matchedMetafield.id)) {
    return {
      gid: matchedMetafield.id,
      details: {
        productGid,
        namespace,
        key
      }
    };
  }

  return {
    reason: "METAFIELD_NOT_FOUND",
    details: {
      productGid,
      namespace,
      key
    }
  };
}

export async function ensureValidResourceGid(admin, resource) {
  if (!resource) {
    return { success: false, reason: "MISSING_RESOURCE" };
  }

  if (isValidShopifyGid(resource.gid)) {
    return { success: true, gid: resource.gid, updated: false };
  }

  const contentFields = parseContentFields(resource.contentFields);
  const resourceType = normalizeResourceType(resource.resourceType);

  let resolution;
  switch (resourceType) {
    case RESOURCE_TYPES.PRODUCT_OPTION:
      resolution = await resolveProductOptionGid(admin, resource, contentFields);
      break;
    case RESOURCE_TYPES.PRODUCT_OPTION_VALUE:
      resolution = await resolveProductOptionValueGid(admin, resource, contentFields);
      break;
    case RESOURCE_TYPES.PRODUCT_METAFIELD:
      resolution = await resolveProductMetafieldGid(admin, resource, contentFields);
      break;
    default:
      return {
        success: false,
        reason: "UNSUPPORTED_RESOURCE_TYPE",
        details: { resourceType }
      };
  }

  if (resolution?.gid && isValidShopifyGid(resolution.gid)) {
    if (resource.id) {
      try {
        await prisma.resource.update({
          where: { id: resource.id },
          data: { gid: resolution.gid }
        });
      } catch (error) {
        console.warn("更新资源gid失败", {
          resourceId: resource.id,
          error: error.message
        });
      }
    }

    return {
      success: true,
      gid: resolution.gid,
      updated: true,
      details: resolution.details || {}
    };
  }

  return {
    success: false,
    reason: resolution?.reason || "RESOLUTION_FAILED",
    details: resolution?.details || {}
  };
}

export { isValidShopifyGid };
