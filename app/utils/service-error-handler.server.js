/**
 * 通用服务错误处理包装器
 * - 统一错误采集与日志
 * - 支持按需告警和返回兜底值
 * - 兼容同步与异步函数
 */

import { captureError } from './error-handler.server.js';
import { logger } from './logger.server.js';

const noopAlertManager = {
  async notify() {
    // 默认不做任何事，避免在未配置时抛错
  }
};

const defaultShouldNotify = (error) => {
  if (!error) return false;
  const severity = error.severity || error.level;
  if (severity && ['HIGH', 'CRITICAL', 'FATAL', 'EMERGENCY'].includes(String(severity).toUpperCase())) {
    return true;
  }
  const code = error.code || error.name;
  return code === 'FATAL' || code === 'CRITICAL_ERROR';
};

const ensureError = (error) => {
  if (error instanceof Error) {
    return error;
  }

  const deriveMessage = () => {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
      if (typeof error.message === 'string' && error.message.trim()) return error.message;
      if (typeof error.status === 'number') {
        const statusText = error.statusText ? ` ${error.statusText}` : '';
        return `HTTP ${error.status}${statusText}`;
      }
      if (Array.isArray(error.errors) && error.errors.length > 0) {
        const first = error.errors[0];
        if (typeof first === 'string') return first;
        if (first && typeof first.message === 'string') return first.message;
      }
      if (typeof error.toString === 'function') {
        const str = error.toString();
        if (str && str !== '[object Object]') return str;
      }
    }
    return 'Unknown error';
  };

  const wrapped = new Error(deriveMessage());
  if (error && typeof error === 'object') {
    Object.assign(wrapped, error);
  }
  if (error && wrapped.cause === undefined) {
    wrapped.cause = error;
  }
  return wrapped;
};

const defaultSerializeArgs = (args) => {
  return args.map((arg) => {
    if (arg === null || arg === undefined) {
      return arg;
    }

    const type = typeof arg;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return arg;
    }

    if (arg instanceof Error) {
      return { name: arg.name, message: arg.message };
    }

    if (Array.isArray(arg)) {
      return `[array:${arg.length}]`;
    }

    if (arg instanceof Date) {
      return arg.toISOString();
    }

    if (type === 'object') {
      const constructorName = arg.constructor?.name;
      if (constructorName && constructorName !== 'Object') {
        return `[${constructorName}]`;
      }
      const keys = Object.keys(arg);
      return {
        __type: 'object',
        keys: keys.slice(0, 5),
        totalKeys: keys.length
      };
    }

    return '[unserializable]';
  });
};

export function createServiceErrorHandler(serviceName, options = {}) {
  if (!serviceName) {
    throw new Error('createServiceErrorHandler: serviceName is required');
  }

  const {
    alertManager = noopAlertManager,
    captureErrors = true,
    throwErrors = true,
    shouldNotify = defaultShouldNotify,
    logLevel = 'error',
    getFallbackValue,
    serializeArgs
  } = options;

  const log = typeof logger[logLevel] === 'function' ? logger[logLevel].bind(logger) : logger.error.bind(logger);

  return function withServiceErrorHandling(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('createServiceErrorHandler: handler must be a function');
    }

    return async function wrappedServiceFunction(...args) {
      try {
        return await fn.apply(this, args);
      } catch (rawError) {
        const error = ensureError(rawError);
        const safeArgs = typeof serializeArgs === 'function' ? serializeArgs(args) : defaultSerializeArgs(args);
        const context = {
          service: serviceName,
          args: safeArgs
        };

        if (captureErrors) {
          try {
            await captureError(error, context);
          } catch (captureFailure) {
            logger.warn(`[${serviceName}] captureError failed`, {
              error: captureFailure instanceof Error ? captureFailure.message : captureFailure
            });
          }
        }

        log(`[${serviceName}] ${error.message}`, {
          error,
          service: serviceName,
          args: safeArgs
        });

        if (shouldNotify(error)) {
          try {
            await alertManager.notify({
              service: serviceName,
              message: error.message,
              severity: error.severity || 'UNKNOWN',
              code: error.code,
              args: safeArgs
            });
          } catch (notifyError) {
            logger.warn(`[${serviceName}] alert notify failed`, {
              error: notifyError instanceof Error ? notifyError.message : notifyError
            });
          }
        }

        if (throwErrors) {
          throw error;
        }

        if (typeof getFallbackValue === 'function') {
          return getFallbackValue(error, args);
        }

        return null;
      }
    };
  };
}

export default createServiceErrorHandler;
