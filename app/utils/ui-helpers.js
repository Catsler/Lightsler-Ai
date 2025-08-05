// UI交互工具函数库
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * 安全的事件处理包装器
 * @param {Function} handler - 原始事件处理函数
 * @param {Function} onError - 错误处理回调
 * @param {string} context - 错误上下文信息
 */
export function safeEventHandler(handler, onError = null, context = 'Unknown') {
  return async (...args) => {
    try {
      if (typeof handler !== 'function') {
        throw new Error(`Handler is not a function in context: ${context}`);
      }
      
      const result = await handler(...args);
      return result;
    } catch (error) {
      const errorMsg = `UI事件处理错误 [${context}]: ${error.message}`;
      console.error(errorMsg, error);
      
      if (onError && typeof onError === 'function') {
        try {
          onError(error, context);
        } catch (callbackError) {
          console.error('错误处理回调失败:', callbackError);
        }
      }
      
      // 记录到全局错误监控
      if (typeof window !== 'undefined' && window.reportError) {
        window.reportError(error);
      }
      
      return null;
    }
  };
}

/**
 * 防抖Hook
 * @param {Function} callback - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {Array} deps - 依赖数组
 */
export function useDebounce(callback, delay = 300, deps = []) {
  const timeoutRef = useRef(null);
  
  return useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      try {
        callback(...args);
      } catch (error) {
        console.error('防抖函数执行错误:', error);
      }
    }, delay);
  }, [callback, delay, ...deps]);
}

/**
 * 节流Hook
 * @param {Function} callback - 要节流的函数
 * @param {number} delay - 节流间隔（毫秒）
 * @param {Array} deps - 依赖数组
 */
export function useThrottle(callback, delay = 300, deps = []) {
  const lastRunRef = useRef(0);
  const timeoutRef = useRef(null);
  
  return useCallback((...args) => {
    const now = Date.now();
    
    if (now - lastRunRef.current >= delay) {
      lastRunRef.current = now;
      try {
        callback(...args);
      } catch (error) {
        console.error('节流函数执行错误:', error);
      }
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        lastRunRef.current = Date.now();
        try {
          callback(...args);
        } catch (error) {
          console.error('节流延迟函数执行错误:', error);
        }
      }, delay - (now - lastRunRef.current));
    }
  }, [callback, delay, ...deps]);
}

/**
 * 安全的状态更新Hook
 * @param {*} initialState - 初始状态
 */
export function useSafeState(initialState) {
  const [state, setState] = useState(initialState);
  const mountedRef = useRef(true);
  
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);
  
  const safeSetState = useCallback((newState) => {
    if (mountedRef.current) {
      try {
        if (typeof newState === 'function') {
          setState(prevState => {
            try {
              return newState(prevState);
            } catch (error) {
              console.error('状态更新函数错误:', error);
              return prevState;
            }
          });
        } else {
          setState(newState);
        }
      } catch (error) {
        console.error('状态更新错误:', error);
      }
    }
  }, []);
  
  return [state, safeSetState];
}

/**
 * 稳定的选项数组Hook - 避免不必要的重新渲染
 * @param {Array} options - 选项数组
 * @param {Array} deps - 依赖数组
 */
export function useStableOptions(options, deps = []) {
  return useMemo(() => {
    try {
      return Array.isArray(options) ? [...options] : [];
    } catch (error) {
      console.error('选项数组处理错误:', error);
      return [];
    }
  }, deps);
}

/**
 * 日志记录工具
 */
export const UILogger = {
  info: (message, context = '', data = null) => {
    const timestamp = new Date().toISOString();
    const fullMessage = `[UI-INFO ${timestamp}] ${context}: ${message}`;
    console.log(fullMessage, data);
  },
  
  error: (message, error = null, context = '') => {
    const timestamp = new Date().toISOString();
    const fullMessage = `[UI-ERROR ${timestamp}] ${context}: ${message}`;
    console.error(fullMessage, error);
    
    // 发送错误到监控系统
    if (typeof window !== 'undefined' && window.trackError) {
      window.trackError({
        message: fullMessage,
        error,
        context,
        timestamp
      });
    }
  },
  
  warn: (message, context = '', data = null) => {
    const timestamp = new Date().toISOString();
    const fullMessage = `[UI-WARN ${timestamp}] ${context}: ${message}`;
    console.warn(fullMessage, data);
  },
  
  debug: (message, context = '', data = null) => {
    if (process.env.NODE_ENV === 'development') {
      const timestamp = new Date().toISOString();
      const fullMessage = `[UI-DEBUG ${timestamp}] ${context}: ${message}`;
      console.debug(fullMessage, data);
    }
  }
};

/**
 * 组件性能监控Hook
 * @param {string} componentName - 组件名称
 */
export function usePerformanceMonitor(componentName) {
  const renderCountRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  
  useEffect(() => {
    renderCountRef.current += 1;
    const renderTime = Date.now() - startTimeRef.current;
    
    if (renderCountRef.current > 10 && renderTime > 16) {
      UILogger.warn(
        `组件 ${componentName} 渲染性能警告`,
        'Performance',
        {
          renderCount: renderCountRef.current,
          renderTime,
          avgRenderTime: renderTime / renderCountRef.current
        }
      );
    }
    
    startTimeRef.current = Date.now();
  });
  
  return {
    renderCount: renderCountRef.current,
    resetCounter: () => {
      renderCountRef.current = 0;
      startTimeRef.current = Date.now();
    }
  };
}

/**
 * 错误恢复Hook
 * @param {Function} resetAction - 重置操作
 */
export function useErrorRecovery(resetAction = null) {
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  const reportError = useCallback((error, context = '') => {
    setHasError(true);
    setErrorMessage(error.message || '未知错误');
    UILogger.error(`组件错误恢复: ${error.message}`, error, context);
  }, []);
  
  const recover = useCallback(() => {
    try {
      setHasError(false);
      setErrorMessage('');
      if (resetAction && typeof resetAction === 'function') {
        resetAction();
      }
      UILogger.info('组件已恢复', 'ErrorRecovery');
    } catch (error) {
      UILogger.error('错误恢复失败', error, 'ErrorRecovery');
    }
  }, [resetAction]);
  
  return {
    hasError,
    errorMessage,
    reportError,
    recover
  };
}

/**
 * 表单验证工具
 */
export const formValidators = {
  required: (value, fieldName = '字段') => {
    if (!value || (typeof value === 'string' && !value.trim())) {
      throw new Error(`${fieldName}不能为空`);
    }
    return true;
  },
  
  email: (value, fieldName = '邮箱') => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value && !emailRegex.test(value)) {
      throw new Error(`${fieldName}格式不正确`);
    }
    return true;
  },
  
  minLength: (value, minLen, fieldName = '字段') => {
    if (value && value.length < minLen) {
      throw new Error(`${fieldName}长度不能少于${minLen}个字符`);
    }
    return true;
  },
  
  custom: (value, validator, fieldName = '字段') => {
    if (typeof validator === 'function') {
      const result = validator(value);
      if (result !== true) {
        throw new Error(result || `${fieldName}验证失败`);
      }
    }
    return true;
  }
};

// 导出默认的错误处理配置
export const defaultUIConfig = {
  debounceDelay: 300,
  throttleDelay: 500,
  maxRetries: 3,
  retryDelay: 1000,
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'error'
};