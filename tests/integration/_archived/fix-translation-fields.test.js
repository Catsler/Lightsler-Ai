/**
 * fix-translation-fields.mjs 集成测试
 *
 * 测试策略：
 * - 内存 SQLite（快速反馈，覆盖核心路径）
 * - afterAll 清理连接（防止 test runner 挂起）
 * - 验证 syncStatus 和 syncedAt 同步重置
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// 测试用 Prisma 实例（内存 SQLite）
let prisma;

/**
 * 复用 fix-translation-fields.mjs 中的函数
 * 用于单元测试和集成测试验证
 */

function deepCleanTranslationFields(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  // 检测跳过对象结构：{text, skipped, skipReason}
  if (obj.skipped === true && typeof obj.text === 'string') {
    return null;
  }

  // 检测部分跳过对象（只有 text 和 skipReason）
  if (obj.text !== undefined && obj.skipReason !== undefined && !obj.skipped) {
    return null;
  }

  // 数组递归处理
  if (Array.isArray(obj)) {
    return obj.map(deepCleanTranslationFields).filter(item => item !== null);
  }

  // 对象递归处理
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleanedValue = deepCleanTranslationFields(value);
    if (cleanedValue !== null) {
      cleaned[key] = cleanedValue;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

function hasSkippedStructure(fields) {
  if (!fields || typeof fields !== 'object') {
    return false;
  }

  // 检查顶层
  if (fields.skipped === true || fields.skipReason !== undefined) {
    return true;
  }

  // 递归检查嵌套对象
  for (const value of Object.values(fields)) {
    if (typeof value === 'object' && value !== null) {
      if (value.skipped === true || value.skipReason !== undefined) {
        return true;
      }
      // 递归检查数组
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            if (item.skipped === true || item.skipReason !== undefined) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

describe('fix-translation-fields - 单元测试', () => {
  describe('hasSkippedStructure', () => {
    it('应检测顶层跳过结构 {text, skipped, skipReason}', () => {
      const fields = {
        text: 'original text',
        skipped: true,
        skipReason: 'brand word'
      };
      expect(hasSkippedStructure(fields)).toBe(true);
    });

    it('应检测部分跳过结构 {text, skipReason}', () => {
      const fields = {
        text: 'original text',
        skipReason: 'brand word'
      };
      expect(hasSkippedStructure(fields)).toBe(true);
    });

    it('应检测嵌套对象中的跳过结构', () => {
      const fields = {
        title: 'Normal title',
        description: {
          text: 'original',
          skipped: true,
          skipReason: 'brand'
        }
      };
      expect(hasSkippedStructure(fields)).toBe(true);
    });

    it('应检测数组中的跳过结构', () => {
      const fields = {
        options: [
          { name: 'Size' },
          { name: 'Color', text: 'original', skipped: true, skipReason: 'brand' }
        ]
      };
      expect(hasSkippedStructure(fields)).toBe(true);
    });

    it('正常字段不应触发检测', () => {
      const fields = {
        title: 'Product Title',
        description: 'Product Description',
        options: ['Size', 'Color']
      };
      expect(hasSkippedStructure(fields)).toBe(false);
    });

    it('空对象或 null 不应触发检测', () => {
      expect(hasSkippedStructure(null)).toBe(false);
      expect(hasSkippedStructure(undefined)).toBe(false);
      expect(hasSkippedStructure({})).toBe(false);
    });
  });

  describe('deepCleanTranslationFields', () => {
    it('应移除顶层跳过结构', () => {
      const fields = {
        text: 'original',
        skipped: true,
        skipReason: 'brand'
      };
      expect(deepCleanTranslationFields(fields)).toBeNull();
    });

    it('应递归清理嵌套对象', () => {
      const fields = {
        title: 'Normal Title',
        description: {
          text: 'original',
          skipped: true,
          skipReason: 'brand'
        }
      };
      const cleaned = deepCleanTranslationFields(fields);
      expect(cleaned).toEqual({ title: 'Normal Title' });
    });

    it('应清理数组中的跳过结构', () => {
      const fields = {
        options: [
          { name: 'Size' },
          { text: 'Color', skipped: true, skipReason: 'brand' },
          { name: 'Material' }
        ]
      };
      const cleaned = deepCleanTranslationFields(fields);
      expect(cleaned.options).toHaveLength(2);
      expect(cleaned.options).toEqual([
        { name: 'Size' },
        { name: 'Material' }
      ]);
    });

    it('正常字段应保持不变', () => {
      const fields = {
        title: 'Product Title',
        description: 'Product Description'
      };
      const cleaned = deepCleanTranslationFields(fields);
      expect(cleaned).toEqual(fields);
    });
  });
});

describe('fix-translation-fields - 集成测试', () => {
  beforeAll(async () => {
    // 使用内存 SQLite 测试数据库
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: 'file::memory:?cache=shared'
        }
      }
    });

    // 运行迁移（创建表结构）
    // 注意：实际项目中可能需要使用 prisma migrate dev 或 prisma db push
    // 这里假设测试环境已配置好
  });

  afterAll(async () => {
    // 关键：防止 test runner 挂起
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // 清理测试数据
    await prisma.translation.deleteMany();
    await prisma.resource.deleteMany();
  });

  it('应同时重置 translationFields, syncStatus 和 syncedAt', async () => {
    // 1. 创建测试资源
    const resource = await prisma.resource.create({
      data: {
        resourceType: 'PRODUCT_OPTION',
        gid: 'gid://shopify/ProductOption/123',
        title: 'Test Option',
        contentFields: { name: 'Size' },
        shopId: 'test-shop'
      }
    });

    // 2. 创建带跳过结构的翻译记录（模拟历史数据）
    const syncedAt = new Date('2024-01-01T00:00:00Z');
    const translation = await prisma.translation.create({
      data: {
        resourceId: resource.id,
        language: 'fr',
        translationFields: {
          name: {
            text: 'Taille',
            skipped: true,
            skipReason: 'brand word detected'
          }
        },
        syncStatus: 'synced',  // 已发布状态
        syncedAt: syncedAt,    // 有发布时间戳
        shopId: 'test-shop'
      }
    });

    // 3. 模拟修复脚本逻辑
    const cleaned = deepCleanTranslationFields(translation.translationFields);

    await prisma.translation.update({
      where: { id: translation.id },
      data: {
        translationFields: cleaned,
        syncStatus: 'pending',
        syncedAt: null
      }
    });

    // 4. 验证结果
    const updated = await prisma.translation.findUnique({
      where: { id: translation.id }
    });

    expect(updated.translationFields).toEqual({ name: 'Taille' });
    expect(updated.syncStatus).toBe('pending');
    expect(updated.syncedAt).toBeNull();
  });

  it('正常翻译记录不应被修改', async () => {
    // 1. 创建测试资源
    const resource = await prisma.resource.create({
      data: {
        resourceType: 'PRODUCT',
        gid: 'gid://shopify/Product/456',
        title: 'Test Product',
        contentFields: { title: 'Product' },
        shopId: 'test-shop'
      }
    });

    // 2. 创建正常翻译记录（无跳过结构）
    const translation = await prisma.translation.create({
      data: {
        resourceId: resource.id,
        language: 'fr',
        translationFields: {
          title: 'Produit Test'
        },
        syncStatus: 'synced',
        syncedAt: new Date(),
        shopId: 'test-shop'
      }
    });

    // 3. 检查是否需要修复
    const needsFix = hasSkippedStructure(translation.translationFields);

    // 4. 验证
    expect(needsFix).toBe(false);
  });

  it('多记录批量修复应正确处理', async () => {
    // 1. 创建测试资源
    const resource1 = await prisma.resource.create({
      data: {
        resourceType: 'PRODUCT_OPTION',
        gid: 'gid://shopify/ProductOption/1',
        title: 'Option 1',
        contentFields: {},
        shopId: 'test-shop'
      }
    });

    const resource2 = await prisma.resource.create({
      data: {
        resourceType: 'PRODUCT_OPTION',
        gid: 'gid://shopify/ProductOption/2',
        title: 'Option 2',
        contentFields: {},
        shopId: 'test-shop'
      }
    });

    // 2. 创建多条需要修复的记录
    await prisma.translation.createMany({
      data: [
        {
          resourceId: resource1.id,
          language: 'fr',
          translationFields: { text: 'Option 1', skipped: true, skipReason: 'brand' },
          syncStatus: 'synced',
          shopId: 'test-shop'
        },
        {
          resourceId: resource2.id,
          language: 'fr',
          translationFields: { text: 'Option 2', skipped: true, skipReason: 'brand' },
          syncStatus: 'failed',
          shopId: 'test-shop'
        }
      ]
    });

    // 3. 查询需要修复的记录
    const allTranslations = await prisma.translation.findMany({
      where: { shopId: 'test-shop' }
    });

    const needsFix = allTranslations.filter(t => hasSkippedStructure(t.translationFields));

    // 4. 批量修复
    for (const record of needsFix) {
      const cleaned = deepCleanTranslationFields(record.translationFields);
      await prisma.translation.update({
        where: { id: record.id },
        data: {
          translationFields: cleaned,
          syncStatus: 'pending',
          syncedAt: null
        }
      });
    }

    // 5. 验证
    const pendingCount = await prisma.translation.count({
      where: { shopId: 'test-shop', syncStatus: 'pending' }
    });

    expect(pendingCount).toBe(2);
  });
});
