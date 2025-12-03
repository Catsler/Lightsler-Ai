/**
 * API端点：Translation session management
 * 提供Sequential Thinking智能翻译会话的创建、管理和控制
 */

import { createApiRoute } from "../utils/base-route.server.js";
import {
  createTranslationSession,
  startTranslationSession,
  pauseTranslationSession,
  resumeTranslationSession,
  getRecoveryRecommendations
} from "../services/sequential-thinking.server.js";

/**
 * GET请求：获取会话列表或单个会话详情
 */
async function handleTranslationSessionsLoader({ request, admin, session, searchParams }) {
    
    const sessionId = searchParams.get("sessionId");
    const shopId = session.shop;
    
    if (sessionId) {
      // 获取单个会话详情
      const { default: prisma } = await import("../db.server.js");
      const translationSession = await prisma.translationSession.findUnique({
        where: { id: sessionId },
        include: {
          resources: {
            take: 10,
            orderBy: { updatedAt: 'desc' }
          }
        }
      });
      
      if (!translationSession) {
        throw new Error("Session not found");
      }
      
      // 获取恢复建议
      const recovery = await getRecoveryRecommendations(sessionId);
      
      return {
        success: true,
        session: translationSession,
        recovery
      };
    } else {
      // 获取会话列表
      const { default: prisma } = await import("../db.server.js");
      const sessions = await prisma.translationSession.findMany({
        where: { shopId },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      
      return {
        success: true,
        sessions,
        total: sessions.length
      };
    }
}

export const loader = createApiRoute(handleTranslationSessionsLoader, {
  requireAuth: true,
  operationName: 'translation session info'
});

/**
 * POST请求：创建或控制会话
 */
async function handleTranslationSessionsAction({ request, admin, session }) {
    
    const formData = await request.formData();
    const action = formData.get("action");
    const shopId = session.shop;
    
    switch (action) {
      case "create": {
        // 创建新会话
        const name = formData.get("name") || "翻译会话";
        const description = formData.get("description") || "";
        const targetLanguage = formData.get("targetLanguage") || "zh-CN";
        const categoryKey = formData.get("categoryKey");
        const subcategoryKey = formData.get("subcategoryKey");
        const resourceTypes = formData.get("resourceTypes");
        
        const options = {
          name,
          description,
          targetLanguage,
          categoryKey,
          subcategoryKey
        };
        
        if (resourceTypes) {
          try {
            options.resourceTypes = JSON.parse(resourceTypes);
          } catch (e) {
            console.error('Failed to parse resourceTypes:', e);
          }
        }
        
        const translationSession = await createTranslationSession(shopId, options);
        
        return {
          success: true,
          message: `Session created: ${name}`,
          session: translationSession
        };
      }
      
      case "start": {
        // 启动会话
        const sessionId = formData.get("sessionId");
        
        if (!sessionId) {
          throw new Error("Session ID is required");
        }
        
        const translationSession = await startTranslationSession(sessionId);
        
        return {
          success: true,
          message: "Session started",
          session: translationSession
        };
      }
      
      case "pause": {
        // 暂停会话
        const sessionId = formData.get("sessionId");
        
        if (!sessionId) {
          throw new Error("Session ID is required");
        }
        
        const translationSession = await pauseTranslationSession(sessionId);
        
        return {
          success: true,
          message: "Session paused",
          session: translationSession
        };
      }
      
      case "resume": {
        // 恢复会话
        const sessionId = formData.get("sessionId");
        
        if (!sessionId) {
          throw new Error("Session ID is required");
        }
        
        const translationSession = await resumeTranslationSession(sessionId);
        
        return {
          success: true,
          message: "Session resumed",
          session: translationSession
        };
      }
      
      case "complete": {
        // 完成会话
        const sessionId = formData.get("sessionId");
        
        if (!sessionId) {
          throw new Error("Session ID is required");
        }
        
        const { default: prisma } = await import("../db.server.js");
        const translationSession = await prisma.translationSession.update({
          where: { id: sessionId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            progressPercentage: 100
          }
        });
        
        return {
          success: true,
          message: "Session completed",
          session: translationSession
        };
      }
      
      case "delete": {
        // 删除会话
        const sessionId = formData.get("sessionId");
        
        if (!sessionId) {
          throw new Error("Session ID is required");
        }
        
        const { default: prisma } = await import("../db.server.js");
        await prisma.translationSession.delete({
          where: { id: sessionId }
        });
        
        return {
          success: true,
          message: "Session deleted"
        };
      }
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
}

export const action = createApiRoute(handleTranslationSessionsAction, {
  requireAuth: true,
  operationName: 'Translation session management'
});