const SOFT_DELETE_MODELS = new Set([
  'Resource',
  'Translation',
  'TranslationSession',
  'TranslationLog',
  'ErrorLog',
  'WebhookEvent',
  'QueueBackup',
  'CreditUsage',
  'CreditReservation',
  'ShopSettings'
]);

const READ_ACTIONS = new Set([
  'findFirst',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy'
]);

const DELETE_ACTIONS = new Set(['delete', 'deleteMany']);

function addDeletedFilter(args = {}) {
  return {
    ...args,
    where: {
      ...(args.where || {}),
      deletedAt: null
    }
  };
}

export function applySoftDeleteMiddleware(prisma) {
  if (!prisma || prisma.__softDeleteMiddlewareApplied) {
    return prisma;
  }

  if (typeof prisma.$use !== 'function') {
    // 环境或 client 可能不支持 middleware（例如 edge client）；直接跳过避免崩溃
    // eslint-disable-next-line no-console
    console.warn('[SoftDelete] prisma.$use is not available; soft delete middleware skipped');
    return prisma;
  }

  prisma.$use(async (params, next) => {
    if (!params.model || !SOFT_DELETE_MODELS.has(params.model)) {
      return next(params);
    }

    const originalArgs = params.args || {};
    const { skipSoftDeleteFilter, applySoftDelete, ...restArgs } = originalArgs;
    let nextArgs = restArgs;

    // Normalize reads to skip soft-deleted rows (unless显式跳过)
    if (READ_ACTIONS.has(params.action)) {
      let isUniqueOrThrow = false;
      if (params.action === 'findUnique') {
        params.action = 'findFirst';
      } else if (params.action === 'findUniqueOrThrow') {
        params.action = 'findFirst';
        isUniqueOrThrow = true;
      }

      // 只有在未显式跳过且查询未指定 deletedAt 时追加过滤
      if (!skipSoftDeleteFilter) {
        const where = nextArgs.where || {};
        if (where.deletedAt === undefined) {
          nextArgs = addDeletedFilter(nextArgs);
        }
      }

      params.args = nextArgs;

      // 如果原始调用是 findUniqueOrThrow，手动抛错确保语义一致
      if (isUniqueOrThrow) {
        const result = await next(params);
        if (!result) {
          throw new Error('Record not found');
        }
        return result;
      }
    }

    // 拦截删除操作，改为软删除（除非显式要求硬删）
    if (DELETE_ACTIONS.has(params.action)) {
      if (applySoftDelete === false) {
        params.args = nextArgs;
        return next(params);
      }

      const now = new Date();
      const { deletionType, deletionToken } = nextArgs?.data || {};
      params.action = params.action === 'delete' ? 'update' : 'updateMany';
      params.args = {
        ...nextArgs,
        data: {
          ...(nextArgs.data || {}),
          deletedAt: now,
          deletionType: deletionType || 'soft-delete',
          deletionToken: deletionToken || `soft_${now.getTime()}`
        }
      };
    }

    // 确保非读非删操作也移除标记字段
    if (!READ_ACTIONS.has(params.action) && !DELETE_ACTIONS.has(params.action)) {
      params.args = nextArgs;
    }

    return next(params);
  });

  prisma.__softDeleteMiddlewareApplied = true;
  return prisma;
}

export { SOFT_DELETE_MODELS };
