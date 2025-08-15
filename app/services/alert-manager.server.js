/**
 * 告警管理服务
 * 监控系统指标，当超过阈值时触发告警
 */

import { prisma } from '../db.server.js';
import { collectError } from './error-collector.server.js';
import { persistentLogger } from './log-persistence.server.js';

// 告警级别
export const ALERT_LEVELS = {
  INFO: 'INFO',
  WARNING: 'WARNING', 
  CRITICAL: 'CRITICAL',
  EMERGENCY: 'EMERGENCY'
};

// 告警类型
export const ALERT_TYPES = {
  ERROR_RATE: 'ERROR_RATE',
  QUEUE_LENGTH: 'QUEUE_LENGTH',
  TRANSLATION_FAILURE: 'TRANSLATION_FAILURE',
  API_LIMIT: 'API_LIMIT',
  PERFORMANCE: 'PERFORMANCE',
  SYSTEM_HEALTH: 'SYSTEM_HEALTH'
};

// 告警配置
export const ALERT_THRESHOLDS = {
  // 错误率阈值（百分比）
  ERROR_RATE: {
    WARNING: 5,
    CRITICAL: 10,
    EMERGENCY: 20
  },
  
  // 队列长度阈值
  QUEUE_LENGTH: {
    WARNING: 50,
    CRITICAL: 100,
    EMERGENCY: 200
  },
  
  // 翻译失败率（百分比）
  TRANSLATION_FAILURE: {
    WARNING: 10,
    CRITICAL: 25,
    EMERGENCY: 50
  },
  
  // API限流次数（每小时）
  API_LIMIT: {
    WARNING: 10,
    CRITICAL: 25,
    EMERGENCY: 50
  },
  
  // 响应时间（毫秒）
  RESPONSE_TIME: {
    WARNING: 3000,
    CRITICAL: 5000,
    EMERGENCY: 10000
  },
  
  // 系统健康分数
  HEALTH_SCORE: {
    WARNING: 80,
    CRITICAL: 60,
    EMERGENCY: 40
  }
};

// 告警管理器
export class AlertManager {
  constructor() {
    this.alerts = new Map(); // 当前活跃告警
    this.alertHistory = []; // 告警历史
    this.notificationChannels = []; // 通知渠道
    this.checkInterval = 60000; // 检查间隔（1分钟）
    this.checkTimer = null;
    this.lastCheck = new Date();
  }
  
  // 启动监控
  start() {
    this.check(); // 立即执行一次检查
    
    // 定期检查
    this.checkTimer = setInterval(() => {
      this.check();
    }, this.checkInterval);
    
    persistentLogger.info('告警管理器已启动', {
      checkInterval: this.checkInterval,
      thresholds: ALERT_THRESHOLDS
    });
  }
  
  // 停止监控
  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    persistentLogger.info('告警管理器已停止');
  }
  
  // 执行检查
  async check() {
    try {
      const now = new Date();
      const metrics = await this.collectMetrics();
      
      // 检查各项指标
      await this.checkErrorRate(metrics);
      await this.checkQueueLength(metrics);
      await this.checkTranslationFailureRate(metrics);
      await this.checkApiLimits(metrics);
      await this.checkPerformance(metrics);
      await this.checkSystemHealth(metrics);
      
      this.lastCheck = now;
      
      // 清理过期告警
      this.cleanupExpiredAlerts();
      
    } catch (error) {
      persistentLogger.error('告警检查失败', {
        error: error.message,
        stack: error.stack
      });
    }
  }
  
  // 收集指标
  async collectMetrics() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // 并行收集各种指标
    const [
      totalTranslations,
      failedTranslations,
      recentErrors,
      queueLength,
      apiLimitErrors,
      avgResponseTime,
      healthScore
    ] = await Promise.all([
      // 总翻译数（最近1小时）
      prisma.translation.count({
        where: { createdAt: { gte: oneHourAgo } }
      }),
      
      // 失败的翻译（最近1小时）
      prisma.translation.count({
        where: {
          createdAt: { gte: oneHourAgo },
          syncStatus: 'failed'
        }
      }),
      
      // 最近的错误（最近5分钟）
      prisma.errorLog.count({
        where: { createdAt: { gte: fiveMinutesAgo } }
      }),
      
      // 队列长度
      prisma.translation.count({
        where: { syncStatus: 'pending' }
      }),
      
      // API限流错误（最近1小时）
      prisma.errorLog.count({
        where: {
          createdAt: { gte: oneHourAgo },
          errorCode: { in: ['RATE_LIMIT', 'API_LIMIT', 'THROTTLED'] }
        }
      }),
      
      // 平均响应时间（模拟数据，实际应从日志计算）
      Promise.resolve(1500),
      
      // 系统健康分数
      this.calculateHealthScore()
    ]);
    
    return {
      totalTranslations,
      failedTranslations,
      recentErrors,
      queueLength,
      apiLimitErrors,
      avgResponseTime,
      healthScore,
      errorRate: totalTranslations > 0 
        ? (failedTranslations / totalTranslations * 100) 
        : 0,
      translationFailureRate: totalTranslations > 0
        ? (failedTranslations / totalTranslations * 100)
        : 0
    };
  }
  
  // 计算系统健康分数
  async calculateHealthScore() {
    // 简化的健康分数计算
    let score = 100;
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const errorCount = await prisma.errorLog.count({
      where: {
        createdAt: { gte: oneHourAgo },
        severity: { gte: 3 }
      }
    });
    
    if (errorCount > 50) score -= 30;
    else if (errorCount > 20) score -= 15;
    else if (errorCount > 10) score -= 5;
    
    return Math.max(0, score);
  }
  
  // 检查错误率
  async checkErrorRate(metrics) {
    const { errorRate } = metrics;
    
    if (errorRate >= ALERT_THRESHOLDS.ERROR_RATE.EMERGENCY) {
      await this.createAlert(
        ALERT_TYPES.ERROR_RATE,
        ALERT_LEVELS.EMERGENCY,
        `错误率达到 ${errorRate.toFixed(1)}%，超过紧急阈值`,
        { errorRate, threshold: ALERT_THRESHOLDS.ERROR_RATE.EMERGENCY }
      );
    } else if (errorRate >= ALERT_THRESHOLDS.ERROR_RATE.CRITICAL) {
      await this.createAlert(
        ALERT_TYPES.ERROR_RATE,
        ALERT_LEVELS.CRITICAL,
        `错误率达到 ${errorRate.toFixed(1)}%，超过严重阈值`,
        { errorRate, threshold: ALERT_THRESHOLDS.ERROR_RATE.CRITICAL }
      );
    } else if (errorRate >= ALERT_THRESHOLDS.ERROR_RATE.WARNING) {
      await this.createAlert(
        ALERT_TYPES.ERROR_RATE,
        ALERT_LEVELS.WARNING,
        `错误率达到 ${errorRate.toFixed(1)}%，超过警告阈值`,
        { errorRate, threshold: ALERT_THRESHOLDS.ERROR_RATE.WARNING }
      );
    } else {
      // 错误率正常，清除相关告警
      this.clearAlert(ALERT_TYPES.ERROR_RATE);
    }
  }
  
  // 检查队列长度
  async checkQueueLength(metrics) {
    const { queueLength } = metrics;
    
    if (queueLength >= ALERT_THRESHOLDS.QUEUE_LENGTH.EMERGENCY) {
      await this.createAlert(
        ALERT_TYPES.QUEUE_LENGTH,
        ALERT_LEVELS.EMERGENCY,
        `队列积压 ${queueLength} 项，系统可能已停滞`,
        { queueLength, threshold: ALERT_THRESHOLDS.QUEUE_LENGTH.EMERGENCY }
      );
    } else if (queueLength >= ALERT_THRESHOLDS.QUEUE_LENGTH.CRITICAL) {
      await this.createAlert(
        ALERT_TYPES.QUEUE_LENGTH,
        ALERT_LEVELS.CRITICAL,
        `队列积压 ${queueLength} 项，处理速度严重下降`,
        { queueLength, threshold: ALERT_THRESHOLDS.QUEUE_LENGTH.CRITICAL }
      );
    } else if (queueLength >= ALERT_THRESHOLDS.QUEUE_LENGTH.WARNING) {
      await this.createAlert(
        ALERT_TYPES.QUEUE_LENGTH,
        ALERT_LEVELS.WARNING,
        `队列积压 ${queueLength} 项，需要关注`,
        { queueLength, threshold: ALERT_THRESHOLDS.QUEUE_LENGTH.WARNING }
      );
    } else {
      this.clearAlert(ALERT_TYPES.QUEUE_LENGTH);
    }
  }
  
  // 检查翻译失败率
  async checkTranslationFailureRate(metrics) {
    const { translationFailureRate } = metrics;
    
    if (translationFailureRate >= ALERT_THRESHOLDS.TRANSLATION_FAILURE.EMERGENCY) {
      await this.createAlert(
        ALERT_TYPES.TRANSLATION_FAILURE,
        ALERT_LEVELS.EMERGENCY,
        `翻译失败率 ${translationFailureRate.toFixed(1)}%，服务基本不可用`,
        { failureRate: translationFailureRate }
      );
    } else if (translationFailureRate >= ALERT_THRESHOLDS.TRANSLATION_FAILURE.CRITICAL) {
      await this.createAlert(
        ALERT_TYPES.TRANSLATION_FAILURE,
        ALERT_LEVELS.CRITICAL,
        `翻译失败率 ${translationFailureRate.toFixed(1)}%，服务质量严重下降`,
        { failureRate: translationFailureRate }
      );
    } else if (translationFailureRate >= ALERT_THRESHOLDS.TRANSLATION_FAILURE.WARNING) {
      await this.createAlert(
        ALERT_TYPES.TRANSLATION_FAILURE,
        ALERT_LEVELS.WARNING,
        `翻译失败率 ${translationFailureRate.toFixed(1)}%，高于正常水平`,
        { failureRate: translationFailureRate }
      );
    } else {
      this.clearAlert(ALERT_TYPES.TRANSLATION_FAILURE);
    }
  }
  
  // 检查API限流
  async checkApiLimits(metrics) {
    const { apiLimitErrors } = metrics;
    
    if (apiLimitErrors >= ALERT_THRESHOLDS.API_LIMIT.EMERGENCY) {
      await this.createAlert(
        ALERT_TYPES.API_LIMIT,
        ALERT_LEVELS.EMERGENCY,
        `API限流触发 ${apiLimitErrors} 次，可能已达到配额上限`,
        { apiLimitErrors }
      );
    } else if (apiLimitErrors >= ALERT_THRESHOLDS.API_LIMIT.CRITICAL) {
      await this.createAlert(
        ALERT_TYPES.API_LIMIT,
        ALERT_LEVELS.CRITICAL,
        `API限流触发 ${apiLimitErrors} 次，接近配额上限`,
        { apiLimitErrors }
      );
    } else if (apiLimitErrors >= ALERT_THRESHOLDS.API_LIMIT.WARNING) {
      await this.createAlert(
        ALERT_TYPES.API_LIMIT,
        ALERT_LEVELS.WARNING,
        `API限流触发 ${apiLimitErrors} 次，请注意调用频率`,
        { apiLimitErrors }
      );
    } else {
      this.clearAlert(ALERT_TYPES.API_LIMIT);
    }
  }
  
  // 检查性能
  async checkPerformance(metrics) {
    const { avgResponseTime } = metrics;
    
    if (avgResponseTime >= ALERT_THRESHOLDS.RESPONSE_TIME.EMERGENCY) {
      await this.createAlert(
        ALERT_TYPES.PERFORMANCE,
        ALERT_LEVELS.EMERGENCY,
        `平均响应时间 ${avgResponseTime}ms，系统响应极慢`,
        { avgResponseTime }
      );
    } else if (avgResponseTime >= ALERT_THRESHOLDS.RESPONSE_TIME.CRITICAL) {
      await this.createAlert(
        ALERT_TYPES.PERFORMANCE,
        ALERT_LEVELS.CRITICAL,
        `平均响应时间 ${avgResponseTime}ms，性能严重下降`,
        { avgResponseTime }
      );
    } else if (avgResponseTime >= ALERT_THRESHOLDS.RESPONSE_TIME.WARNING) {
      await this.createAlert(
        ALERT_TYPES.PERFORMANCE,
        ALERT_LEVELS.WARNING,
        `平均响应时间 ${avgResponseTime}ms，性能有所下降`,
        { avgResponseTime }
      );
    } else {
      this.clearAlert(ALERT_TYPES.PERFORMANCE);
    }
  }
  
  // 检查系统健康
  async checkSystemHealth(metrics) {
    const { healthScore } = metrics;
    
    if (healthScore <= ALERT_THRESHOLDS.HEALTH_SCORE.EMERGENCY) {
      await this.createAlert(
        ALERT_TYPES.SYSTEM_HEALTH,
        ALERT_LEVELS.EMERGENCY,
        `系统健康分数 ${healthScore}/100，系统状态危急`,
        { healthScore }
      );
    } else if (healthScore <= ALERT_THRESHOLDS.HEALTH_SCORE.CRITICAL) {
      await this.createAlert(
        ALERT_TYPES.SYSTEM_HEALTH,
        ALERT_LEVELS.CRITICAL,
        `系统健康分数 ${healthScore}/100，系统状态不佳`,
        { healthScore }
      );
    } else if (healthScore <= ALERT_THRESHOLDS.HEALTH_SCORE.WARNING) {
      await this.createAlert(
        ALERT_TYPES.SYSTEM_HEALTH,
        ALERT_LEVELS.WARNING,
        `系统健康分数 ${healthScore}/100，需要关注`,
        { healthScore }
      );
    } else {
      this.clearAlert(ALERT_TYPES.SYSTEM_HEALTH);
    }
  }
  
  // 创建告警
  async createAlert(type, level, message, details = {}) {
    const alertKey = `${type}_${level}`;
    
    // 检查是否已存在相同告警
    if (this.alerts.has(alertKey)) {
      const existingAlert = this.alerts.get(alertKey);
      existingAlert.lastOccurrence = new Date();
      existingAlert.occurrences++;
      return;
    }
    
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      level,
      message,
      details,
      createdAt: new Date(),
      lastOccurrence: new Date(),
      occurrences: 1,
      acknowledged: false
    };
    
    this.alerts.set(alertKey, alert);
    this.alertHistory.push(alert);
    
    // 发送通知
    await this.sendNotification(alert);
    
    // 记录到数据库
    await this.persistAlert(alert);
    
    persistentLogger.warn(`告警触发: ${message}`, {
      type,
      level,
      details
    });
  }
  
  // 清除告警
  clearAlert(type) {
    const keysToRemove = [];
    
    for (const [key, alert] of this.alerts.entries()) {
      if (alert.type === type) {
        keysToRemove.push(key);
        
        persistentLogger.info(`告警解除: ${alert.message}`, {
          type: alert.type,
          level: alert.level,
          duration: Date.now() - alert.createdAt.getTime()
        });
      }
    }
    
    keysToRemove.forEach(key => this.alerts.delete(key));
  }
  
  // 发送通知
  async sendNotification(alert) {
    // 根据告警级别决定通知方式
    switch (alert.level) {
      case ALERT_LEVELS.EMERGENCY:
        // 紧急告警：多渠道通知
        await this.sendEmailNotification(alert);
        await this.sendWebhookNotification(alert);
        await this.sendDashboardNotification(alert);
        break;
        
      case ALERT_LEVELS.CRITICAL:
        // 严重告警：邮件和仪表板
        await this.sendEmailNotification(alert);
        await this.sendDashboardNotification(alert);
        break;
        
      case ALERT_LEVELS.WARNING:
        // 警告：仅仪表板
        await this.sendDashboardNotification(alert);
        break;
        
      default:
        // 信息：记录日志
        break;
    }
  }
  
  // 发送邮件通知（示例）
  async sendEmailNotification(alert) {
    // TODO: 实现邮件发送逻辑
    console.log('发送邮件告警:', alert.message);
  }
  
  // 发送Webhook通知（示例）
  async sendWebhookNotification(alert) {
    // TODO: 实现Webhook通知（如Slack、钉钉等）
    console.log('发送Webhook告警:', alert.message);
  }
  
  // 发送仪表板通知
  async sendDashboardNotification(alert) {
    // 将告警信息保存到数据库，供仪表板展示
    await collectError({
      errorType: 'ALERT',
      errorCategory: alert.level,
      errorCode: `ALERT_${alert.type}`,
      message: alert.message,
      context: alert.details,
      severity: this.getLevelSeverity(alert.level),
      status: 'new'
    });
  }
  
  // 持久化告警
  async persistAlert(alert) {
    await collectError({
      errorType: 'ALERT',
      errorCategory: alert.level,
      errorCode: alert.type,
      message: alert.message,
      context: {
        alertId: alert.id,
        details: alert.details,
        occurrences: alert.occurrences
      },
      severity: this.getLevelSeverity(alert.level),
      status: 'active'
    });
  }
  
  // 获取级别对应的严重度
  getLevelSeverity(level) {
    const severityMap = {
      [ALERT_LEVELS.INFO]: 1,
      [ALERT_LEVELS.WARNING]: 2,
      [ALERT_LEVELS.CRITICAL]: 4,
      [ALERT_LEVELS.EMERGENCY]: 5
    };
    return severityMap[level] || 2;
  }
  
  // 清理过期告警
  cleanupExpiredAlerts() {
    const expirationTime = 60 * 60 * 1000; // 1小时
    const now = Date.now();
    
    for (const [key, alert] of this.alerts.entries()) {
      if (now - alert.lastOccurrence.getTime() > expirationTime) {
        this.alerts.delete(key);
        persistentLogger.info(`告警过期自动清除: ${alert.message}`);
      }
    }
  }
  
  // 获取当前告警列表
  getActiveAlerts() {
    return Array.from(this.alerts.values());
  }
  
  // 获取告警历史
  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(-limit);
  }
  
  // 确认告警
  acknowledgeAlert(alertId) {
    for (const alert of this.alerts.values()) {
      if (alert.id === alertId) {
        alert.acknowledged = true;
        persistentLogger.info(`告警已确认: ${alert.message}`);
        return true;
      }
    }
    return false;
  }
}

// 创建全局告警管理器实例
export const alertManager = new AlertManager();

// 在生产环境自动启动
if (process.env.NODE_ENV === 'production') {
  alertManager.start();
}

// 导出用于API的函数
export async function getAlertStatus() {
  const activeAlerts = alertManager.getActiveAlerts();
  const metrics = await alertManager.collectMetrics();
  
  return {
    activeAlerts,
    metrics,
    lastCheck: alertManager.lastCheck,
    thresholds: ALERT_THRESHOLDS
  };
}

export default alertManager;