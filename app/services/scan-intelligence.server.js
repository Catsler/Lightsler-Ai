import { 
  DecisionEngine, 
  TranslationScheduler,
  ThinkingChain,
  OptimizationAnalyzer 
} from './sequential-thinking-core.server.js';
import { fetchResourcesByType, RESOURCE_TYPES } from './shopify-graphql.server.js';
import { saveResources } from './database.server.js';
import { logger } from '../utils/logger.server.js';

// 全局进度存储
if (!global.scanProgress) {
  global.scanProgress = {};
}

/**
 * 智能扫描服务
 * 集成Sequential Thinking进行优化扫描
 */
export async function scanWithIntelligence({
  admin,
  language,
  resourceType = 'ALL',
  options = {}
}) {
  const sessionId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const thinkingChain = new ThinkingChain();
  const decisionEngine = new DecisionEngine();
  const scheduler = new TranslationScheduler();
  const optimizer = new OptimizationAnalyzer();
  
  // 初始化进度
  global.scanProgress[sessionId] = {
    progress: 0,
    phase: 'initializing',
    currentResource: null,
    scannedResources: 0,
    totalResources: 0,
    thinkingChain: [],
    stats: null
  };
  
  const updateProgress = (updates) => {
    global.scanProgress[sessionId] = {
      ...global.scanProgress[sessionId],
      ...updates
    };
  };
  
  try {
    logger.info('[ScanIntelligence] 开始智能扫描', { sessionId, language, resourceType });
    
    // 阶段1：初始化和分析
    updateProgress({ 
      phase: 'analyzing',
      progress: 5 
    });
    
    thinkingChain.addThought('开始分析扫描需求', {
      language,
      resourceType,
      timestamp: new Date().toISOString()
    });
    
    // 决定要扫描的资源类型
    const resourcesToScan = resourceType === 'ALL' 
      ? Object.keys(RESOURCE_TYPES)
      : [resourceType];
    
    thinkingChain.addThought(`确定扫描范围: ${resourcesToScan.length} 种资源类型`, {
      types: resourcesToScan
    });
    
    updateProgress({ 
      thinkingChain: thinkingChain.getChain(),
      progress: 10
    });
    
    // 阶段2：优化扫描策略
    updateProgress({ phase: 'optimizing' });
    
    // 使用决策引擎分析扫描优先级
    const scanPriorities = await analyzeScanPriorities(resourcesToScan, decisionEngine);
    thinkingChain.addThought('制定扫描优先级策略', scanPriorities);
    
    // 计算批处理大小
    const batchStrategy = optimizer.determineBatchSize ? 
      await optimizer.determineBatchSize(resourcesToScan.length) :
      { size: 5, reasoning: '默认批处理大小' };
      
    thinkingChain.addThought(`优化批处理策略: 每批 ${batchStrategy.size} 个资源`, batchStrategy);
    
    updateProgress({ 
      thinkingChain: thinkingChain.getChain(),
      progress: 20
    });
    
    // 阶段3：执行扫描
    updateProgress({ phase: 'scanning' });
    
    const allResources = [];
    const scanStats = {
      total: 0,
      byType: {},
      pending: 0,
      completed: 0,
      categories: {}
    };
    
    let progressIncrement = 70 / resourcesToScan.length;
    let currentProgress = 20;
    
    // 按优先级顺序扫描
    for (const [index, typeInfo] of scanPriorities.entries()) {
      const resourceType = typeInfo.type;
      
      updateProgress({
        currentResource: { 
          title: RESOURCE_TYPES[resourceType]?.name || resourceType 
        },
        progress: currentProgress
      });
      
      thinkingChain.addThought(`扫描 ${resourceType} 资源 (优先级: ${typeInfo.priority})`, {
        step: index + 1,
        total: resourcesToScan.length
      });
      
      try {
        // 获取资源
        const resources = await fetchResourcesByType(admin, resourceType);
        
        if (resources && resources.length > 0) {
          // 保存到数据库
          await saveResources(resources, resourceType);
          
          allResources.push(...resources);
          scanStats.byType[resourceType] = resources.length;
          scanStats.total += resources.length;
          
          // 统计分类
          const categoryName = getCategoryName(resourceType);
          scanStats.categories[categoryName] = (scanStats.categories[categoryName] || 0) + resources.length;
          
          thinkingChain.addThought(`成功扫描 ${resources.length} 个 ${resourceType} 资源`);
        } else {
          thinkingChain.addThought(`${resourceType} 暂无资源`);
        }
      } catch (error) {
        logger.error(`[ScanIntelligence] 扫描 ${resourceType} 失败:`, error);
        thinkingChain.addThought(`扫描 ${resourceType} 时遇到错误: ${error.message}`, {
          error: true
        });
      }
      
      currentProgress += progressIncrement;
      updateProgress({
        scannedResources: scanStats.total,
        totalResources: scanStats.total,
        progress: Math.min(currentProgress, 90),
        thinkingChain: thinkingChain.getChain()
      });
    }
    
    // 阶段4：处理结果
    updateProgress({ 
      phase: 'processing',
      progress: 95
    });
    
    // 分析扫描结果
    const analysis = await analyzeResults(allResources, language, optimizer);
    thinkingChain.addThought('分析扫描结果', analysis);
    
    // 统计待翻译和已完成
    for (const resource of allResources) {
      if (resource.translations?.some(t => t.language === language)) {
        scanStats.completed++;
      } else {
        scanStats.pending++;
      }
    }
    
    // 阶段5：完成
    updateProgress({ 
      phase: 'completing',
      progress: 100
    });
    
    const finalStats = {
      ...scanStats,
      duration: Date.now() - parseInt(sessionId.split('_')[1]),
      sessionId
    };
    
    thinkingChain.addThought('扫描任务完成', finalStats);
    
    updateProgress({
      stats: finalStats,
      thinkingChain: thinkingChain.getChain(),
      progress: 100
    });
    
    // 清理进度（延迟清理，让前端有时间获取最终状态）
    setTimeout(() => {
      delete global.scanProgress[sessionId];
    }, 60000);
    
    logger.info('[ScanIntelligence] 智能扫描完成', finalStats);
    
    return {
      success: true,
      sessionId,
      resources: allResources,
      stats: finalStats,
      thinkingChain: thinkingChain.getChain(),
      analysis,
      priorities: scanPriorities
    };
    
  } catch (error) {
    logger.error('[ScanIntelligence] 智能扫描失败:', error);
    
    thinkingChain.addThought(`扫描失败: ${error.message}`, { 
      error: true,
      stack: error.stack 
    });
    
    updateProgress({
      phase: 'error',
      error: error.message,
      thinkingChain: thinkingChain.getChain()
    });
    
    throw error;
  }
}

/**
 * 分析扫描优先级
 */
async function analyzeScanPriorities(resourceTypes, decisionEngine) {
  const priorities = [];
  
  // 定义资源类型权重
  const typeWeights = {
    'PRODUCT': 10,          // 产品最重要
    'COLLECTION': 9,        // 集合次之
    'PAGE': 8,              // 页面
    'ARTICLE': 7,           // 文章
    'BLOG': 6,              // 博客
    'MENU': 5,              // 菜单
    'ONLINE_STORE_THEME': 4 // 主题
  };
  
  for (const type of resourceTypes) {
    const weight = typeWeights[type] || 1;
    const priority = {
      type,
      priority: weight,
      reasoning: getPriorityReasoning(type, weight)
    };
    priorities.push(priority);
  }
  
  // 按优先级排序
  priorities.sort((a, b) => b.priority - a.priority);
  
  return priorities;
}

/**
 * 获取优先级理由
 */
function getPriorityReasoning(type, weight) {
  const reasonMap = {
    'PRODUCT': '产品是核心内容，直接影响销售',
    'COLLECTION': '集合组织产品，影响导航体验',
    'PAGE': '页面包含重要信息',
    'ARTICLE': '文章提供内容价值',
    'BLOG': '博客支持内容营销',
    'MENU': '菜单影响网站导航',
    'ONLINE_STORE_THEME': '主题设置影响整体体验'
  };
  
  return reasonMap[type] || `权重: ${weight}`;
}

/**
 * 分析扫描结果
 */
async function analyzeResults(resources, language, optimizer) {
  const analysis = {
    totalResources: resources.length,
    resourcesByType: {},
    translationCoverage: 0,
    recommendations: []
  };
  
  // 按类型统计
  for (const resource of resources) {
    const type = resource.resourceType;
    if (!analysis.resourcesByType[type]) {
      analysis.resourcesByType[type] = {
        count: 0,
        translated: 0,
        pending: 0
      };
    }
    
    analysis.resourcesByType[type].count++;
    
    if (resource.translations?.some(t => t.language === language)) {
      analysis.resourcesByType[type].translated++;
    } else {
      analysis.resourcesByType[type].pending++;
    }
  }
  
  // 计算翻译覆盖率
  const totalTranslated = Object.values(analysis.resourcesByType)
    .reduce((sum, type) => sum + type.translated, 0);
  analysis.translationCoverage = resources.length > 0 
    ? Math.round((totalTranslated / resources.length) * 100)
    : 0;
  
  // 生成建议
  if (analysis.translationCoverage < 30) {
    analysis.recommendations.push({
      type: 'low_coverage',
      message: '翻译覆盖率较低，建议优先翻译核心内容'
    });
  }
  
  // 找出待翻译最多的类型
  const pendingByType = Object.entries(analysis.resourcesByType)
    .filter(([_, stats]) => stats.pending > 0)
    .sort((a, b) => b[1].pending - a[1].pending);
  
  if (pendingByType.length > 0) {
    const [topType, stats] = pendingByType[0];
    analysis.recommendations.push({
      type: 'priority_type',
      message: `${topType} 有 ${stats.pending} 个资源待翻译，建议优先处理`
    });
  }
  
  return analysis;
}

/**
 * 获取资源分类名称
 */
function getCategoryName(resourceType) {
  const categoryMap = {
    'PRODUCT': '产品',
    'COLLECTION': '产品系列',
    'ARTICLE': '文章',
    'BLOG': '博客',
    'PAGE': '页面',
    'MENU': '导航',
    'LINK': '链接',
    'FILTER': '筛选器',
    'PRODUCT_OPTION': '产品选项',
    'SELLING_PLAN': '销售计划',
    'SHOP': '店铺',
    'SHOP_POLICY': '店铺政策'
  };
  
  // Theme相关资源归为一类
  if (resourceType.startsWith('ONLINE_STORE_THEME')) {
    return '主题';
  }
  
  return categoryMap[resourceType] || '其他';
}

/**
 * 获取扫描进度
 */
export function getScanProgress(sessionId) {
  return global.scanProgress[sessionId] || null;
}