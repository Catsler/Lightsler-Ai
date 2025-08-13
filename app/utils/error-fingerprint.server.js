/**
 * 错误指纹生成工具
 * 用于生成唯一的错误标识符，实现错误去重和分组
 */

import crypto from 'crypto';

/**
 * 生成字符串的哈希值
 * @param {string} str - 输入字符串
 * @returns {string} 哈希值
 */
function hashString(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * 标准化错误消息，移除动态内容
 * @param {string} message - 原始错误消息
 * @returns {string} 标准化后的消息
 */
function normalizeMessage(message) {
  if (!message) return '';
  
  // 移除常见的动态内容
  return message
    // 移除数字ID
    .replace(/\b\d{5,}\b/g, '[ID]')
    // 移除UUID
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]')
    // 移除时间戳
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '[TIMESTAMP]')
    // 移除IP地址
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    // 移除端口号
    .replace(/:\d{4,5}\b/g, ':[PORT]')
    // 移除具体的商品/集合等ID
    .replace(/gid:\/\/shopify\/\w+\/\d+/g, 'gid://shopify/[TYPE]/[ID]')
    // 移除具体的handle
    .replace(/handle-[\w-]+/g, 'handle-[DYNAMIC]')
    // 移除具体的文件路径
    .replace(/\/[\w\/.-]+\.(js|jsx|ts|tsx)/g, '/[FILE]')
    // 移除具体的行号
    .replace(/:\d+:\d+/g, ':[LINE]:[COL]')
    // 标准化空白字符
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从错误堆栈中提取关键位置信息
 * @param {string} stack - 错误堆栈
 * @returns {string} 关键位置
 */
function extractStackLocation(stack) {
  if (!stack) return 'unknown';
  
  const lines = stack.split('\n');
  
  // 查找第一个有意义的代码位置（忽略node_modules和内置模块）
  for (const line of lines) {
    // 跳过node_modules
    if (line.includes('node_modules')) continue;
    // 跳过内置模块
    if (line.includes('internal/')) continue;
    
    // 提取文件路径和行号
    const match = line.match(/at\s+(?:.*?\s+\()?(.*?):(\d+):(\d+)/);
    if (match) {
      const [, file, line] = match;
      // 只保留文件名，不保留完整路径
      const fileName = file.split('/').pop();
      return `${fileName}:${line}`;
    }
    
    // 提取函数名
    const funcMatch = line.match(/at\s+(\w+(?:\.\w+)*)/);
    if (funcMatch) {
      return funcMatch[1];
    }
  }
  
  return 'unknown';
}

/**
 * 生成错误指纹
 * @param {Object} error - 错误对象
 * @param {Object} options - 配置选项
 * @returns {string} 错误指纹
 */
export function generateErrorFingerprint(error, options = {}) {
  const {
    includeContext = false,
    includeUserAgent = false,
    includeUrl = false
  } = options;
  
  // 基础组件
  const components = [];
  
  // 错误类型
  if (error.errorType || error.type) {
    components.push(error.errorType || error.type);
  }
  
  // 错误代码
  if (error.errorCode || error.code) {
    components.push(error.errorCode || error.code);
  }
  
  // 错误分类
  if (error.errorCategory || error.category) {
    components.push(error.errorCategory || error.category);
  }
  
  // 标准化的错误消息
  const normalizedMessage = normalizeMessage(error.message);
  if (normalizedMessage) {
    components.push(normalizedMessage);
  }
  
  // 堆栈位置
  const stackLocation = extractStackLocation(error.stackTrace || error.stack);
  components.push(stackLocation);
  
  // 操作类型（如果有）
  if (error.operation) {
    components.push(error.operation);
  }
  
  // 资源类型（如果有）
  if (error.resourceType) {
    components.push(error.resourceType);
  }
  
  // 可选：包含上下文信息
  if (includeContext && error.context) {
    const contextKey = typeof error.context === 'string' 
      ? error.context 
      : JSON.stringify(error.context);
    components.push(normalizeMessage(contextKey));
  }
  
  // 可选：包含用户代理
  if (includeUserAgent && error.userAgent) {
    // 只保留浏览器类型和主版本号
    const uaMatch = error.userAgent.match(/(Chrome|Firefox|Safari|Edge)\/(\d+)/);
    if (uaMatch) {
      components.push(`${uaMatch[1]}/${uaMatch[2]}`);
    }
  }
  
  // 可选：包含URL路径（不包含查询参数）
  if (includeUrl && error.requestUrl) {
    const urlPath = error.requestUrl.split('?')[0];
    components.push(urlPath);
  }
  
  // 生成指纹
  const fingerprintString = components.filter(Boolean).join('|');
  return hashString(fingerprintString);
}

/**
 * 生成错误组ID（用于相似错误分组）
 * @param {Object} error - 错误对象
 * @returns {string} 错误组ID
 */
export function generateErrorGroupId(error) {
  // 使用更宽松的规则生成组ID
  const components = [];
  
  // 错误类型和分类
  if (error.errorType) {
    components.push(error.errorType);
  }
  
  // 只包含错误消息的前几个词（通常是错误的核心描述）
  if (error.message) {
    const words = error.message.split(/\s+/).slice(0, 3).join(' ');
    components.push(normalizeMessage(words));
  }
  
  // 操作类型
  if (error.operation) {
    components.push(error.operation);
  }
  
  const groupString = components.filter(Boolean).join('|');
  return hashString(groupString);
}

/**
 * 检查两个错误是否相似
 * @param {Object} error1 - 第一个错误
 * @param {Object} error2 - 第二个错误
 * @returns {boolean} 是否相似
 */
export function areErrorsSimilar(error1, error2) {
  // 如果指纹相同，肯定相似
  if (generateErrorFingerprint(error1) === generateErrorFingerprint(error2)) {
    return true;
  }
  
  // 如果组ID相同，也认为相似
  if (generateErrorGroupId(error1) === generateErrorGroupId(error2)) {
    return true;
  }
  
  // 检查其他相似性条件
  const sameType = error1.errorType === error2.errorType;
  const sameOperation = error1.operation === error2.operation;
  const similarMessage = calculateMessageSimilarity(error1.message, error2.message) > 0.7;
  
  // 如果类型相同且消息相似，认为是相似错误
  return sameType && similarMessage;
}

/**
 * 计算两个消息的相似度（0-1之间）
 * @param {string} msg1 - 第一个消息
 * @param {string} msg2 - 第二个消息
 * @returns {number} 相似度
 */
function calculateMessageSimilarity(msg1, msg2) {
  if (!msg1 || !msg2) return 0;
  
  const norm1 = normalizeMessage(msg1).toLowerCase();
  const norm2 = normalizeMessage(msg2).toLowerCase();
  
  if (norm1 === norm2) return 1;
  
  // 简单的Jaccard相似度计算
  const words1 = new Set(norm1.split(/\s+/));
  const words2 = new Set(norm2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * 提取错误的关键特征
 * @param {Object} error - 错误对象
 * @returns {Object} 关键特征
 */
export function extractErrorFeatures(error) {
  return {
    fingerprint: generateErrorFingerprint(error),
    groupId: generateErrorGroupId(error),
    normalizedMessage: normalizeMessage(error.message),
    stackLocation: extractStackLocation(error.stackTrace || error.stack),
    errorType: error.errorType || error.type || 'UNKNOWN',
    errorCategory: error.errorCategory || error.category || 'ERROR',
    operation: error.operation || null,
    resourceType: error.resourceType || null,
    httpStatus: error.responseStatus || error.statusCode || null,
    isRetryable: error.retryable || false,
    environment: error.environment || process.env.NODE_ENV || 'development'
  };
}

/**
 * 生成错误的唯一标识符（用于完全去重）
 * @param {Object} error - 错误对象
 * @returns {string} 唯一标识符
 */
export function generateErrorUniqueId(error) {
  // 包含更多细节以确保唯一性
  return generateErrorFingerprint(error, {
    includeContext: true,
    includeUserAgent: true,
    includeUrl: true
  });
}

export default {
  generateErrorFingerprint,
  generateErrorGroupId,
  generateErrorUniqueId,
  areErrorsSimilar,
  extractErrorFeatures,
  normalizeMessage,
  extractStackLocation
};