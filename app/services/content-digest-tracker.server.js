/**
 * 内容指纹追踪服务
 * - 记录并对比每个可翻译字段(key)的源内容digest
 * - 用于在源语言变动后仅翻译变动字段
 */

import { prisma } from '../db.server.js';
import { createServiceErrorHandler } from '../utils/service-error-handler.server.js';

/**
 * 从 translatableContent 数组提取 key->digest 映射
 * @param {Array<{key: string, digest?: string}>} translatableContent
 */
export function extractDigestMap(translatableContent = []) {
  const map = {};
  for (const item of translatableContent) {
    if (item?.key) {
      map[item.key] = item.digest || null;
    }
  }
  return map;
}

/**
 * 合并并更新资源的 contentDigests
 * @param {string} resourceId Resource.id
 * @param {Array} translatableContent Shopify translatableContent
 */
const handleDigestTrackerError = createServiceErrorHandler('CONTENT_DIGEST_TRACKER');

async function updateResourceDigestsInternal(resourceId, translatableContent = []) {
  const digestMap = extractDigestMap(translatableContent);
  if (!resourceId || Object.keys(digestMap).length === 0) return null;

  const resource = await prisma.resource.findUnique({ where: { id: resourceId }, select: { contentDigests: true } });
  const prev = resource?.contentDigests || {};
  const next = { ...prev, ...digestMap };

  // 仅当有变化时写入
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  if (!changed) return { changed: false, digests: next };

  await prisma.resource.update({ where: { id: resourceId }, data: { contentDigests: next } });
  return { changed: true, digests: next };
}

export const updateResourceDigests = handleDigestTrackerError(updateResourceDigestsInternal);

/**
 * 对比新旧digest，返回发生变化的字段key列表
 * @param {Object} oldMap { key: digest }
 * @param {Array} translatableContent Shopify translatableContent
 */
export function diffChangedKeys(oldMap = {}, translatableContent = []) {
  const changed = [];
  for (const item of translatableContent) {
    if (!item?.key) continue;
    const prev = oldMap[item.key] || null;
    const now = item.digest || null;
    if (prev !== now) changed.push(item.key);
  }
  return changed;
}

/**
 * 给定资源，计算需要“增量翻译”的字段列表
 * @param {string} resourceId Resource.id
 * @param {Array} translatableContent Shopify translatableContent
 */
async function getIncrementalFieldsInternal(resourceId, translatableContent = []) {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId }, select: { contentDigests: true } });
  const oldMap = resource?.contentDigests || {};
  const changedKeys = diffChangedKeys(oldMap, translatableContent);
  return changedKeys;
}

export const getIncrementalFields = handleDigestTrackerError(getIncrementalFieldsInternal);

export default {
  extractDigestMap,
  updateResourceDigests,
  diffChangedKeys,
  getIncrementalFields,
};
