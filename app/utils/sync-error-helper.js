/**
 * 同步错误辅助工具 - 客户端版本
 *
 * 提供统一的 syncError 字段处理，支持：
 * - 新格式：JSON {message, warnings}
 * - 旧格式：纯字符串（向后兼容）
 *
 * 注意：这是客户端可用的版本，不包含 createSyncWarning 和 formatSyncError
 * 这些函数只在服务器端使用（在 sync-error-helper.server.js 中）
 */

/**
 * 解析 syncError（兼容历史字符串）
 * @param {string|null} syncError - 数据库中的 syncError 字段
 * @returns {{ message: string|null, warnings: Array }}
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
 * 获取显示消息（用于UI显示，向后兼容）
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
