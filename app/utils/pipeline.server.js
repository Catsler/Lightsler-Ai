/**
 * 流水线埋点与分步日志工具
 * 目标：在“抓取 → 翻译 → 发布”各环节形成统一的可检索日志与错误上下文
 */

import crypto from 'crypto';
import { logger } from './logger.server.js';
import { collectError } from '../services/error-collector.server.js';

// 标准化的环节与步骤枚举
export const PIPELINE_PHASE = {
  FETCH: 'FETCH',
  TRANSLATE: 'TRANSLATE',
  PUBLISH: 'PUBLISH',
};

export const STEP_STATUS = {
  STARTED: 'STARTED',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
};

function nowISO() {
  return new Date().toISOString();
}

function genId(prefix = 'run') {
  const rnd = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${Date.now()}_${rnd}`;
}

/**
 * 创建流水线运行上下文
 * @param {Object} params { shopId, sessionId, phase, resourceType, resourceId, targetLanguage, sessionName, extra }
 */
export function startPipeline(params = {}) {
  const ctx = {
    pipelineId: genId('pipeline'),
    startedAt: Date.now(),
    phase: params.phase || 'PIPELINE',
    shopId: params.shopId || null,
    sessionId: params.sessionId || null,
    translationSessionId: params.translationSessionId || null,
    resourceType: params.resourceType || null,
    resourceId: params.resourceId || null,
    targetLanguage: params.targetLanguage || null,
    sessionName: params.sessionName || null,
    extra: params.extra || {},
  };

  logger.info('流水线开始', { ...ctx, event: 'pipeline.start', timestamp: nowISO() });
  return ctx;
}

/**
 * 结束流水线
 */
export function endPipeline(pipelineCtx, status = 'COMPLETED', stats = {}) {
  const duration = Date.now() - (pipelineCtx.startedAt || Date.now());
  logger.info('流水线结束', {
    ...pipelineCtx,
    event: 'pipeline.end',
    status,
    duration,
    stats,
    timestamp: nowISO()
  });
}

/**
 * 执行一步（带自动开始/结束日志与错误收集）
 * @param {Object} pipelineCtx startPipeline返回的对象
 * @param {string} stepName 步骤名
 * @param {Function} fn 实际执行的异步函数，形如 async () => ({ metrics })
 * @param {Object} options 附加上下文 { resourceId, resourceType, targetLanguage, meta }
 */
export async function runStep(pipelineCtx, stepName, fn, options = {}) {
  const stepCtx = {
    stepId: genId('step'),
    stepName,
    status: STEP_STATUS.STARTED,
    startedAt: Date.now(),
    ...pipelineCtx,
    resourceId: options.resourceId || pipelineCtx.resourceId,
    resourceType: options.resourceType || pipelineCtx.resourceType,
    targetLanguage: options.targetLanguage || pipelineCtx.targetLanguage,
    meta: options.meta || {},
  };

  logger.info('步骤开始', { ...stepCtx, event: 'step.start', timestamp: nowISO() });

  try {
    const result = await fn();
    const duration = Date.now() - stepCtx.startedAt;
    logger.info('步骤成功', {
      ...stepCtx,
      status: STEP_STATUS.SUCCEEDED,
      event: 'step.success',
      duration,
      metrics: result?.metrics || null,
      timestamp: nowISO(),
    });
    if (result?.metrics) {
      logger.info('性能指标', {
        operation: `${pipelineCtx.phase}.${stepName}`,
        duration,
        metrics: result.metrics,
      });
    }
    return { success: true, ...result };
  } catch (error) {
    const duration = Date.now() - stepCtx.startedAt;
    const errPayload = {
      errorType: 'SYSTEM',
      errorCategory: 'ERROR',
      errorCode: error.code || 'STEP_FAILED',
      message: error.message || `步骤 ${stepName} 失败`,
      stack: error.stack,
      operation: `${pipelineCtx.phase}.${stepName}`,
      resourceType: stepCtx.resourceType,
      resourceId: stepCtx.resourceId,
      shopId: pipelineCtx.shopId || null,
      translationSessionId: pipelineCtx.translationSessionId || null,
      context: {
        pipelineId: pipelineCtx.pipelineId,
        stepId: stepCtx.stepId,
        targetLanguage: stepCtx.targetLanguage,
        meta: stepCtx.meta,
        duration,
      },
    };
    await collectError(errPayload, { operation: errPayload.operation });
    logger.error('步骤失败', { ...stepCtx, status: STEP_STATUS.FAILED, event: 'step.fail', duration, error: error.message });
    return { success: false, error };
  }
}

/**
 * 便捷包装器：按顺序运行多个步骤
 * steps: [{ name, fn, options }]
 */
export async function runPipeline(pipelineCtx, steps = []) {
  const results = [];
  for (const step of steps) {
    const res = await runStep(pipelineCtx, step.name, step.fn, step.options || {});
    results.push({ name: step.name, ...res });
    if (!res.success) {
      endPipeline(pipelineCtx, 'FAILED', { failedStep: step.name });
      return { success: false, results };
    }
  }
  endPipeline(pipelineCtx, 'COMPLETED');
  return { success: true, results };
}

export default {
  PIPELINE_PHASE,
  STEP_STATUS,
  startPipeline,
  endPipeline,
  runStep,
  runPipeline,
};

