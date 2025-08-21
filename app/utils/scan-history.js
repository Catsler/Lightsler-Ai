/**
 * 扫描历史管理工具
 * 管理语言扫描状态，支持24小时过期策略
 */

/**
 * 检查是否需要扫描
 * @param {string} language - 语言代码
 * @param {Object} scanHistory - 扫描历史记录
 * @returns {boolean} 是否需要扫描
 */
export function needsScan(language, scanHistory) {
  // 如果没有历史记录或该语言没有记录，需要扫描
  if (!scanHistory || !scanHistory[language]) {
    console.log(`[ScanHistory] ${language} 从未扫描，需要扫描`);
    return true;
  }
  
  const lastScanned = new Date(scanHistory[language].lastScanned);
  const now = new Date();
  const hoursSinceLastScan = (now - lastScanned) / (1000 * 60 * 60);
  
  // 超过24小时需要重新扫描
  const shouldScan = hoursSinceLastScan >= 24;
  
  console.log(`[ScanHistory] ${language} 上次扫描: ${lastScanned.toLocaleString()}`);
  console.log(`[ScanHistory] 距离上次扫描: ${hoursSinceLastScan.toFixed(2)} 小时`);
  console.log(`[ScanHistory] 是否需要扫描: ${shouldScan}`);
  
  return shouldScan;
}

/**
 * 从localStorage获取扫描历史
 * @returns {Object} 扫描历史记录
 */
export function getScanHistory() {
  try {
    const history = localStorage.getItem('scanHistory');
    const parsed = history ? JSON.parse(history) : {};
    console.log('[ScanHistory] 从localStorage获取历史:', parsed);
    return parsed;
  } catch (error) {
    console.error('[ScanHistory] 读取localStorage失败:', error);
    return {};
  }
}

/**
 * 更新扫描历史
 * @param {string} language - 语言代码
 * @param {number} resourceCount - 资源数量
 * @returns {Object} 更新后的历史记录
 */
export function updateScanHistory(language, resourceCount = 0) {
  const history = getScanHistory();
  const now = new Date().toISOString();
  
  history[language] = {
    lastScanned: now,
    timestamp: Date.now(),
    resourceCount,
    status: 'completed'
  };
  
  // 保存到localStorage
  try {
    localStorage.setItem('scanHistory', JSON.stringify(history));
    console.log(`[ScanHistory] 更新 ${language} 扫描记录:`, history[language]);
  } catch (error) {
    console.error('[ScanHistory] 保存到localStorage失败:', error);
  }
  
  return history;
}

/**
 * 清除指定语言的扫描历史
 * @param {string} language - 语言代码
 */
export function clearScanHistory(language) {
  const history = getScanHistory();
  if (history[language]) {
    delete history[language];
    localStorage.setItem('scanHistory', JSON.stringify(history));
    console.log(`[ScanHistory] 清除 ${language} 扫描记录`);
  }
}

/**
 * 清除所有扫描历史
 */
export function clearAllScanHistory() {
  localStorage.removeItem('scanHistory');
  console.log('[ScanHistory] 清除所有扫描记录');
}

/**
 * 合并服务器和本地扫描历史
 * @param {Object} serverHistory - 服务器历史记录
 * @param {Object} localHistory - 本地历史记录
 * @returns {Object} 合并后的历史记录
 */
export function mergeScanHistory(serverHistory, localHistory) {
  const merged = { ...localHistory };
  
  // 服务器记录优先（更可靠）
  Object.keys(serverHistory).forEach(language => {
    const serverRecord = serverHistory[language];
    const localRecord = localHistory[language];
    
    // 如果服务器记录更新，使用服务器记录
    if (!localRecord || 
        new Date(serverRecord.lastScanned) > new Date(localRecord.lastScanned)) {
      merged[language] = serverRecord;
    }
  });
  
  console.log('[ScanHistory] 合并历史记录:', merged);
  return merged;
}

/**
 * 获取需要扫描的语言列表
 * @param {Array} languages - 所有语言列表
 * @param {Object} scanHistory - 扫描历史
 * @returns {Array} 需要扫描的语言列表
 */
export function getLanguagesNeedingScan(languages, scanHistory) {
  return languages.filter(lang => needsScan(lang, scanHistory));
}

/**
 * 格式化扫描时间显示
 * @param {string} lastScanned - ISO时间字符串
 * @returns {string} 格式化的时间显示
 */
export function formatScanTime(lastScanned) {
  if (!lastScanned) return '从未扫描';
  
  const date = new Date(lastScanned);
  const now = new Date();
  const hours = (now - date) / (1000 * 60 * 60);
  
  if (hours < 1) {
    const minutes = Math.floor(hours * 60);
    return `${minutes} 分钟前`;
  } else if (hours < 24) {
    return `${Math.floor(hours)} 小时前`;
  } else {
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  }
}