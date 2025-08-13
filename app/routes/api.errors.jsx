/**
 * 错误管理API路由
 * 提供错误查询、统计、更新等API接口
 */

import { json } from "@remix-run/node";
import { prisma } from "../db.server";
import { 
  getErrorStats, 
  collectError,
  ERROR_STATUS 
} from "../services/error-collector.server";
import { 
  analyzeTrends, 
  findRelatedErrors, 
  generateErrorReport,
  predictErrorTrends 
} from "../services/error-analyzer.server";
import { authenticate } from "../shopify.server";
import { withErrorHandling, successResponse, errorResponse } from "../utils/api-response.server";

/**
 * 处理GET请求 - 获取错误列表或详情
 */
export async function loader({ request }) {
  try {
    const { admin, session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "list"; // 默认为list
    
    return withErrorHandling(async () => {
      const shopId = session?.shop;
      
      switch (action) {
        case "list":
          return await getErrorList(url, shopId);
          
        case "detail":
          return await getErrorDetail(url);
          
        case "stats":
          return await getErrorStatistics(url, shopId);
          
        case "trends":
          return await getErrorTrends(url, shopId);
          
        case "related":
          return await getRelatedErrors(url);
          
        case "report":
          return await getErrorReport(url, shopId);
          
        case "predict":
          return await getPrediction(url, shopId);
          
        default:
          // 对于未知的action，返回默认列表
          return await getErrorList(url, shopId);
      }
    }, `错误管理API - ${action}`, session?.shop);
  } catch (error) {
    // 确保始终返回JSON响应
    console.error("API错误:", error);
    return json({
      success: false,
      data: null,
      error: error.message || "服务器内部错误"
    }, { status: 500 });
  }
}

/**
 * 处理POST请求 - 更新错误状态或收集新错误
 */
export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  
  return withErrorHandling(async () => {
    const shopId = session?.shop;
    
    switch (action) {
      case "collect":
        return await collectNewError(formData, shopId);
        
      case "update":
        return await updateErrorStatus(formData);
        
      case "acknowledge":
        return await acknowledgeError(formData);
        
      case "resolve":
        return await resolveError(formData);
        
      case "ignore":
        return await ignoreError(formData);
        
      case "batch-update":
        return await batchUpdateErrors(formData);
        
      case "add-note":
        return await addErrorNote(formData);
        
      default:
        return errorResponse("无效的操作", null, 400);
    }
  }, `错误管理操作 - ${action}`, session?.shop);
}

/**
 * 获取错误列表
 */
async function getErrorList(url, shopId) {
  const page = parseInt(url.searchParams.get("page") || "1");
  const pageSize = parseInt(url.searchParams.get("pageSize") || "20");
  const status = url.searchParams.get("status");
  const errorType = url.searchParams.get("errorType");
  const severity = url.searchParams.get("severity");
  const search = url.searchParams.get("search");
  const sortBy = url.searchParams.get("sortBy") || "createdAt";
  const sortOrder = url.searchParams.get("sortOrder") || "desc";
  const timeRange = url.searchParams.get("timeRange") || "24h";
  
  // 构建查询条件
  const where = {
    ...(shopId && { shopId }),
    ...(status && { status }),
    ...(errorType && { errorType }),
    ...(severity && { severity: parseInt(severity) }),
    ...(search && {
      OR: [
        { message: { contains: search } },
        { errorCode: { contains: search } },
        { fingerprint: { contains: search } }
      ]
    })
  };
  
  // 添加时间过滤
  if (timeRange !== "all") {
    const timeFilter = getTimeFilter(timeRange);
    where.createdAt = timeFilter;
  }
  
  // 执行查询
  const [total, errors] = await Promise.all([
    prisma.errorLog.count({ where }),
    prisma.errorLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        errorType: true,
        errorCategory: true,
        errorCode: true,
        message: true,
        fingerprint: true,
        occurrences: true,
        severity: true,
        status: true,
        priority: true,
        createdAt: true,
        lastSeenAt: true,
        resolvedAt: true,
        suggestedFix: true,
        resourceType: true,
        resourceId: true,
        operation: true
      }
    })
  ]);
  
  return successResponse({
    errors,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  });
}

/**
 * 获取错误详情
 */
async function getErrorDetail(url) {
  const id = url.searchParams.get("id");
  
  if (!id) {
    return errorResponse("错误ID必需", null, 400);
  }
  
  const error = await prisma.errorLog.findUnique({
    where: { id }
  });
  
  if (!error) {
    return errorResponse("错误记录不存在", null, 404);
  }
  
  // 获取相关错误
  const related = await findRelatedErrors(id);
  
  return successResponse({
    error,
    related
  });
}

/**
 * 获取错误统计
 */
async function getErrorStatistics(url, shopId) {
  const timeRange = url.searchParams.get("timeRange") || "24h";
  
  const stats = await getErrorStats(shopId, timeRange);
  
  // 获取额外的统计信息
  const timeFilter = getTimeFilter(timeRange);
  const where = {
    createdAt: timeFilter,
    ...(shopId && { shopId })
  };
  
  const [
    criticalCount,
    unresolvedCount,
    todayCount,
    uniqueCount
  ] = await Promise.all([
    prisma.errorLog.count({
      where: { ...where, severity: { gte: 4 } }
    }),
    prisma.errorLog.count({
      where: { ...where, status: { notIn: ["resolved", "ignored"] } }
    }),
    prisma.errorLog.count({
      where: {
        ...where,
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      }
    }),
    prisma.errorLog.findMany({
      where,
      distinct: ["fingerprint"],
      select: { fingerprint: true }
    }).then(r => r.length)
  ]);
  
  return successResponse({
    ...stats,
    critical: criticalCount,
    unresolved: unresolvedCount,
    today: todayCount,
    unique: uniqueCount,
    timeRange
  });
}

/**
 * 获取错误趋势
 */
async function getErrorTrends(url, shopId) {
  const timeRange = url.searchParams.get("timeRange") || "7d";
  const groupBy = url.searchParams.get("groupBy") || "hour";
  
  const trends = await analyzeTrends({
    shopId,
    timeRange,
    groupBy
  });
  
  return successResponse(trends);
}

/**
 * 获取相关错误
 */
async function getRelatedErrors(url) {
  const id = url.searchParams.get("id");
  
  if (!id) {
    return errorResponse("错误ID必需", null, 400);
  }
  
  const related = await findRelatedErrors(id);
  
  return successResponse(related);
}

/**
 * 获取错误报告
 */
async function getErrorReport(url, shopId) {
  const timeRange = url.searchParams.get("timeRange") || "7d";
  const includeDetails = url.searchParams.get("includeDetails") === "true";
  
  const report = await generateErrorReport({
    shopId,
    timeRange,
    includeDetails
  });
  
  return successResponse(report);
}

/**
 * 获取错误预测
 */
async function getPrediction(url, shopId) {
  const lookbackDays = parseInt(url.searchParams.get("lookbackDays") || "7");
  const predictDays = parseInt(url.searchParams.get("predictDays") || "3");
  
  const prediction = await predictErrorTrends({
    shopId,
    lookbackDays,
    predictDays
  });
  
  return successResponse(prediction);
}

/**
 * 收集新错误（从前端）
 */
async function collectNewError(formData, shopId) {
  const errorData = JSON.parse(formData.get("errorData") || "{}");
  const context = JSON.parse(formData.get("context") || "{}");
  
  // 添加shop信息
  context.shopId = shopId;
  context.source = "frontend";
  
  const result = await collectError(errorData, context);
  
  return successResponse(result, "错误已收集");
}

/**
 * 更新错误状态
 */
async function updateErrorStatus(formData) {
  const id = formData.get("id");
  const status = formData.get("status");
  const resolution = formData.get("resolution");
  const fixVersion = formData.get("fixVersion");
  const assignedTo = formData.get("assignedTo");
  
  if (!id || !status) {
    return errorResponse("ID和状态必需", null, 400);
  }
  
  const updateData = {
    status,
    updatedAt: new Date(),
    ...(resolution && { resolution }),
    ...(fixVersion && { fixVersion }),
    ...(assignedTo && { assignedTo })
  };
  
  // 如果是解决状态，记录解决时间
  if (status === ERROR_STATUS.RESOLVED) {
    updateData.resolvedAt = new Date();
  }
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: updateData
  });
  
  return successResponse(updated, "错误状态已更新");
}

/**
 * 确认错误
 */
async function acknowledgeError(formData) {
  const id = formData.get("id");
  const assignedTo = formData.get("assignedTo");
  
  if (!id) {
    return errorResponse("错误ID必需", null, 400);
  }
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: {
      status: ERROR_STATUS.ACKNOWLEDGED,
      acknowledgedAt: new Date(),
      ...(assignedTo && { assignedTo })
    }
  });
  
  return successResponse(updated, "错误已确认");
}

/**
 * 解决错误
 */
async function resolveError(formData) {
  const id = formData.get("id");
  const resolution = formData.get("resolution");
  const fixVersion = formData.get("fixVersion");
  
  if (!id || !resolution) {
    return errorResponse("ID和解决方案必需", null, 400);
  }
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: {
      status: ERROR_STATUS.RESOLVED,
      resolution,
      fixVersion,
      resolvedAt: new Date()
    }
  });
  
  return successResponse(updated, "错误已解决");
}

/**
 * 忽略错误
 */
async function ignoreError(formData) {
  const id = formData.get("id");
  const reason = formData.get("reason");
  
  if (!id) {
    return errorResponse("错误ID必需", null, 400);
  }
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: {
      status: ERROR_STATUS.IGNORED,
      notes: reason || "已忽略"
    }
  });
  
  return successResponse(updated, "错误已忽略");
}

/**
 * 批量更新错误
 */
async function batchUpdateErrors(formData) {
  const ids = JSON.parse(formData.get("ids") || "[]");
  const status = formData.get("status");
  const assignedTo = formData.get("assignedTo");
  
  if (!ids.length || !status) {
    return errorResponse("ID列表和状态必需", null, 400);
  }
  
  const updateData = {
    status,
    updatedAt: new Date(),
    ...(assignedTo && { assignedTo })
  };
  
  if (status === ERROR_STATUS.RESOLVED) {
    updateData.resolvedAt = new Date();
  }
  
  const result = await prisma.errorLog.updateMany({
    where: { id: { in: ids } },
    data: updateData
  });
  
  return successResponse(result, `${result.count}个错误已更新`);
}

/**
 * 添加错误备注
 */
async function addErrorNote(formData) {
  const id = formData.get("id");
  const note = formData.get("note");
  
  if (!id || !note) {
    return errorResponse("ID和备注必需", null, 400);
  }
  
  const error = await prisma.errorLog.findUnique({
    where: { id },
    select: { notes: true }
  });
  
  if (!error) {
    return errorResponse("错误记录不存在", null, 404);
  }
  
  const existingNotes = error.notes || "";
  const timestamp = new Date().toISOString();
  const newNote = `[${timestamp}] ${note}`;
  const updatedNotes = existingNotes 
    ? `${existingNotes}\n${newNote}`
    : newNote;
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: { notes: updatedNotes }
  });
  
  return successResponse(updated, "备注已添加");
}

/**
 * 获取时间过滤器
 */
function getTimeFilter(timeRange) {
  const now = new Date();
  let since;
  
  switch (timeRange) {
    case "1h":
      since = new Date(now - 60 * 60 * 1000);
      break;
    case "24h":
      since = new Date(now - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      since = new Date(now - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      since = new Date(now - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      since = new Date(now - 24 * 60 * 60 * 1000);
  }
  
  return { gte: since };
}