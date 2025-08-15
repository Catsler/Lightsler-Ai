/**
 * Webhook配置
 * 从环境变量读取webhook相关配置
 */

// 读取环境变量，提供默认值
export const webhookConfig = {
  // 是否启用自动翻译
  autoTranslateEnabled: process.env.WEBHOOK_AUTO_TRANSLATE_ENABLED === 'true',
  
  // 翻译延迟（避免频繁更新）
  translateDelay: parseInt(process.env.WEBHOOK_TRANSLATE_DELAY || '5000'),
  
  // 批量处理阈值
  batchThreshold: parseInt(process.env.WEBHOOK_BATCH_THRESHOLD || '10'),
  
  // 去重时间窗口（秒）
  dedupWindow: parseInt(process.env.WEBHOOK_DEDUP_WINDOW || '60'),
  
  // 事件保留天数
  eventRetentionDays: parseInt(process.env.WEBHOOK_EVENT_RETENTION_DAYS || '30'),
  
  // 资源优先级配置
  priorities: {
    PRODUCT: process.env.WEBHOOK_PRODUCT_PRIORITY || 'HIGH',
    COLLECTION: process.env.WEBHOOK_COLLECTION_PRIORITY || 'HIGH',
    PAGE: process.env.WEBHOOK_PAGE_PRIORITY || 'NORMAL',
    ARTICLE: process.env.WEBHOOK_ARTICLE_PRIORITY || 'NORMAL',
    THEME: process.env.WEBHOOK_THEME_PRIORITY || 'LOW'
  },
  
  // 错误通知
  errorNotification: process.env.WEBHOOK_ERROR_NOTIFICATION === 'true',
  
  // 通知配置（从主配置继承）
  notification: {
    slackWebhook: process.env.SLACK_WEBHOOK_URL,
    alertEmail: process.env.ALERT_EMAIL,
    alertWebhook: process.env.ALERT_WEBHOOK_URL
  }
};

/**
 * 获取资源类型的优先级
 */
export function getResourcePriority(resourceType) {
  return webhookConfig.priorities[resourceType] || 'NORMAL';
}

/**
 * 检查是否应该批量处理
 */
export function shouldBatchProcess(eventCount) {
  return eventCount >= webhookConfig.batchThreshold;
}

/**
 * 获取去重时间窗口（毫秒）
 */
export function getDedupWindowMs() {
  return webhookConfig.dedupWindow * 1000;
}

/**
 * 获取事件清理截止时间
 */
export function getEventCleanupDate() {
  const date = new Date();
  date.setDate(date.getDate() - webhookConfig.eventRetentionDays);
  return date;
}

export default webhookConfig;