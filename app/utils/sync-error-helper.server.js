/**
 * 同步错误辅助工具 - 极简版
 *
 * 提供统一的 syncError 字段处理，支持：
 * - 新格式：JSON {message, warnings}
 * - 旧格式：纯字符串（向后兼容）
 */

/**
 * @typedef {Object} SyncWarning
 * @property {string} field - 字段名
 * @property {string} reason - 原因代码（当前仅支持 FIELD_NOT_IN_TRANSLATABLE_CONTENT）
 * @property {string} message - 用户消息
 */

/**
 * 创建同步警告（工厂函数，避免字段拼写错误）
 * @param {string} field - 字段名
 * @param {string} reason - 原因代码
 * @returns {SyncWarning}
 */
export function createSyncWarning(field, reason) {
  return {
    field,
    reason,
    message: `字段 "${field}" 因Shopify API限制无法同步`
  };
}

/**
 * 格式化为存储格式（固定字段顺序：message, warnings）
 * @param {SyncWarning[]} warnings - 警告列表
 * @returns {string|null}
 */
export function formatSyncError(warnings = []) {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  // 固定顺序方便 diff 调试
  return JSON.stringify({
    message: '部分字段因Shopify平台限制无法同步',
    warnings: warnings
  });
}

/**
 * 解析 syncError（兼容历史字符串）
 * @param {string|null} syncError - 数据库中的 syncError 字段
 * @returns {{ message: string|null, warnings: SyncWarning[] }}
 */
export function parseSyncError(syncError) {
  if (!syncError) {
    return { message: null, warnings: [] };
  }

  try {
    const parsed = JSON.parse(syncError);
    return {
      message: parsed.message || null,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    };
  } catch {
    // 兼容历史纯字符串格式
    return {
      message: syncError,
      warnings: []
    };
  }
}

/**
 * 获取显示消息（用于旧UI，向后兼容）
 * @param {string|null} syncError - 数据库中的 syncError 字段
 * @returns {string}
 */
export function getSyncErrorMessage(syncError) {
  const { message, warnings } = parseSyncError(syncError);

  if (warnings.length > 0) {
    const fields = warnings.map(w => w.field).join(', ');
    return `${message} (${fields})`;
  }

  return message || '未知错误';
}
