/**
 * 错误管理API路由
 * 提供错误查询、统计、更新等API接口
 */

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
import { createApiRoute } from "../utils/base-route.server.js";

/**
 * GET请求处理函数 - 获取错误列表或详情
 */
async function handleErrorsQuery({ request, session, searchParams }) {
  const action = searchParams.get("action") || "list"; // 默认为list
  const shopId = session?.shop;
  
  switch (action) {
    case "list":
      return await getErrorList(searchParams, shopId);
      
    case "detail":
      return await getErrorDetail(searchParams);
      
    case "stats":
      return await getErrorStatistics(searchParams, shopId);
      
    case "trends":
      return await getErrorTrends(searchParams, shopId);
      
    case "related":
      return await getRelatedErrors(searchParams);
      
    case "report":
      return await getErrorReport(searchParams, shopId);
      
    case "predict":
      return await getPrediction(searchParams, shopId);
      
    default:
      // 对于未知的action，返回默认列表
      return await getErrorList(searchParams, shopId);
  }
}

export const loader = createApiRoute(handleErrorsQuery, {
  requireAuth: true,
  operationName: '错误管理查询'
});

/**
 * POST请求处理函数 - 更新错误状态或收集新错误
 */
async function handleErrorsAction({ request, session }) {
  const formData = await request.formData();
  const action = formData.get("action");
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
      throw new Error("无效的操作");
  }
}

export const action = createApiRoute(handleErrorsAction, {
  requireAuth: true,
  operationName: '错误管理操作'
});

/**
 * 获取错误列表
 */
async function getErrorList(searchParams, shopId) {
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "20");
  const status = searchParams.get("status");
  const errorType = searchParams.get("errorType");
  const severity = searchParams.get("severity");
  const search = searchParams.get("search");
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const timeRange = searchParams.get("timeRange") || "24h";
  
  // Build query conditions
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
  
  // Add time filter
  if (timeRange !== "all") {
    const timeFilter = getTimeFilter(timeRange);
    where.createdAt = timeFilter;
  }
  
  // Execute query
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
  
  return {
    errors,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  };
}

/**
 * 获取错误详情
 */
async function getErrorDetail(searchParams) {
  const id = searchParams.get("id");
  
  if (!id) {
    throw new Error("Error ID is required");
  }
  
  const error = await prisma.errorLog.findUnique({
    where: { id }
  });
  
  if (!error) {
    throw new Error("Error record not found");
  }
  
  // Get related errors
  const related = await findRelatedErrors(id);
  
  return {
    error,
    related
  };
}

/**
 * 获取错误统计
 */
async function getErrorStatistics(searchParams, shopId) {
  const timeRange = searchParams.get("timeRange") || "24h";
  
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
  
  return {
    ...stats,
    critical: criticalCount,
    unresolved: unresolvedCount,
    today: todayCount,
    unique: uniqueCount,
    timeRange
  };
}

/**
 * 获取错误趋势
 */
async function getErrorTrends(searchParams, shopId) {
  const timeRange = searchParams.get("timeRange") || "7d";
  const groupBy = searchParams.get("groupBy") || "hour";
  
  const trends = await analyzeTrends({
    shopId,
    timeRange,
    groupBy
  });
  
  return trends;
}

/**
 * 获取相关错误
 */
async function getRelatedErrors(searchParams) {
  const id = searchParams.get("id");
  
  if (!id) {
    throw new Error("Error ID is required");
  }
  
  const related = await findRelatedErrors(id);
  
  return related;
}

/**
 * 获取错误报告
 */
async function getErrorReport(searchParams, shopId) {
  const timeRange = searchParams.get("timeRange") || "7d";
  const includeDetails = searchParams.get("includeDetails") === "true";
  
  const report = await generateErrorReport({
    shopId,
    timeRange,
    includeDetails
  });
  
  return report;
}

/**
 * 获取错误预测
 */
async function getPrediction(searchParams, shopId) {
  const lookbackDays = parseInt(searchParams.get("lookbackDays") || "7");
  const predictDays = parseInt(searchParams.get("predictDays") || "3");
  
  const prediction = await predictErrorTrends({
    shopId,
    lookbackDays,
    predictDays
  });
  
  return prediction;
}

/**
 * 收集新错误（从前端）
 */
async function collectNewError(formData, shopId) {
  const errorData = JSON.parse(formData.get("errorData") || "{}");
  const context = JSON.parse(formData.get("context") || "{}");
  
  // Add shop info
  context.shopId = shopId;
  context.source = "frontend";
  
  const result = await collectError(errorData, context);
  
  return { ...result, message: "Error collected" };
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
    throw new Error("ID and status are required");
  }
  
  const updateData = {
    status,
    updatedAt: new Date(),
    ...(resolution && { resolution }),
    ...(fixVersion && { fixVersion }),
    ...(assignedTo && { assignedTo })
  };
  
  // Record resolution time when status is resolved
  if (status === ERROR_STATUS.RESOLVED) {
    updateData.resolvedAt = new Date();
  }
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: updateData
  });
  
  return { ...updated, message: "Error status updated" };
}

/**
 * 确认错误
 */
async function acknowledgeError(formData) {
  const id = formData.get("id");
  const assignedTo = formData.get("assignedTo");
  
  if (!id) {
    throw new Error("Error ID is required");
  }
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: {
      status: ERROR_STATUS.ACKNOWLEDGED,
      acknowledgedAt: new Date(),
      ...(assignedTo && { assignedTo })
    }
  });
  
  return { ...updated, message: "Error acknowledged" };
}

/**
 * 解决错误
 */
async function resolveError(formData) {
  const id = formData.get("id");
  const resolution = formData.get("resolution");
  const fixVersion = formData.get("fixVersion");
  
  if (!id || !resolution) {
    throw new Error("ID and resolution are required");
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
  
  return { ...updated, message: "Error resolved" };
}

/**
 * 忽略错误
 */
async function ignoreError(formData) {
  const id = formData.get("id");
  const reason = formData.get("reason");
  
  if (!id) {
    throw new Error("Error ID is required");
  }
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: {
      status: ERROR_STATUS.IGNORED,
      notes: reason || "Ignored"
    }
  });
  
  return { ...updated, message: "错误Ignored" };
}

/**
 * 批量更新错误
 */
async function batchUpdateErrors(formData) {
  const ids = JSON.parse(formData.get("ids") || "[]");
  const status = formData.get("status");
  const assignedTo = formData.get("assignedTo");
  
  if (!ids.length || !status) {
    throw new Error("ID list and status are required");
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
  
  return { ...result, message: `${result.count} errors updated` };
}

/**
 * 添加错误备注
 */
async function addErrorNote(formData) {
  const id = formData.get("id");
  const note = formData.get("note");
  
  if (!id || !note) {
    throw new Error("ID and note are required");
  }
  
  const error = await prisma.errorLog.findUnique({
    where: { id },
    select: { notes: true }
  });
  
  if (!error) {
    throw new Error("Error record not found");
  }
  
  const existingNotes = error.notes || "";
  const timestamp = new Date().toISOString();
  const newNote = `[${timestamp}] ${note}`;
  const updatedNotes = existingNotes 
    ? `${existingNotes}
${newNote}`
    : newNote;
  
  const updated = await prisma.errorLog.update({
    where: { id },
    data: { notes: updatedNotes }
  });
  
  return { ...updated, message: "Note added" };
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