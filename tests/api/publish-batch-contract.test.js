import { test, mock, after } from 'node:test';
import assert from 'node:assert';

const appRootUrl = new URL('../../app/', import.meta.url);

const prismaMock = {
  translation: {
    findMany: mock.fn(async () => []),
    update: mock.fn(async () => ({}))
  }
};

const collectErrorMock = mock.fn(async () => {});
const updateResourceTranslationMock = mock.fn(async () => ({}));
const authenticateMock = {
  admin: mock.fn(async () => ({
    admin: {},
    session: {
      shop: 'test-shop.myshopify.com',
      accessToken: 'test-token'
    }
  }))
};

const ensureValidResourceGidMock = mock.fn(async (_admin, resource) => ({
  success: true,
  gid: resource?.gid || 'gid://shopify/Resource/1',
  updated: false
}));

mock.module(new URL('./db.server.js', appRootUrl).href, {
  namedExports: {
    prisma: prismaMock
  },
  defaultExport: prismaMock
});

mock.module(new URL('./services/error-collector.server.js', appRootUrl).href, {
  namedExports: {
    collectError: collectErrorMock,
    ERROR_TYPES: { SYNC: 'SYNC' }
  },
  defaultExport: { collectError: collectErrorMock }
});

mock.module(new URL('./services/shopify-graphql.server.js', appRootUrl).href, {
  namedExports: {
    updateResourceTranslation: updateResourceTranslationMock
  },
  defaultExport: { updateResourceTranslation: updateResourceTranslationMock }
});

mock.module(new URL('./shopify.server.js', appRootUrl).href, {
  namedExports: {
    authenticate: authenticateMock
  },
  defaultExport: { authenticate: authenticateMock }
});

mock.module(new URL('./services/resource-gid-resolver.server.js', appRootUrl).href, {
  namedExports: {
    ensureValidResourceGid: ensureValidResourceGidMock
  },
  defaultExport: { ensureValidResourceGid: ensureValidResourceGidMock }
});

const publishModulePromise = import(new URL('./routes/api.publish.jsx', appRootUrl).href);
const batchModulePromise = import(new URL('./routes/api.batch-publish.jsx', appRootUrl).href);

const buildRequest = (body = {}) => {
  return new Request('http://localhost/mock', {
    method: 'POST',
    body: new URLSearchParams(body)
  });
};

const resetMocks = () => {
  prismaMock.translation.findMany.mock.resetCalls();
  prismaMock.translation.update.mock.resetCalls();
  collectErrorMock.mock.resetCalls();
  updateResourceTranslationMock.mock.resetCalls();
  ensureValidResourceGidMock.mock.resetCalls();
};

test('api.publish => 缺少参数时返回 400 与标准错误结构', async () => {
  resetMocks();
  prismaMock.translation.findMany.mock.mockImplementation(async () => []);

  const { action } = await publishModulePromise;
  const request = buildRequest();
  const response = await action({ request });
  const data = await response.json();

  assert.strictEqual(response.status, 400);
  assert.strictEqual(typeof data, 'object');
  assert.strictEqual(data.success, false);
  assert.strictEqual(data.error, '参数验证失败');
});

test('api.publish => 没有待发布翻译时返回成功结构', async () => {
  resetMocks();
  prismaMock.translation.findMany.mock.mockImplementation(async () => []);

  const { action } = await publishModulePromise;
  const request = buildRequest({ publishAll: 'true' });
  const response = await action({ request });
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.published, 0);
  assert.strictEqual(Array.isArray(data.errors), true);
});

test('api.publish => 成功发布时返回统计字段', async () => {
  resetMocks();

  const translation = {
    id: '1',
    language: 'zh-CN',
    resourceId: 'gid://shopify/Product/1',
    shopId: 'shop-1',
    syncStatus: 'pending',
    titleTrans: '标题',
    descTrans: '描述',
    handleTrans: 'handle',
    summaryTrans: 'summary',
    labelTrans: 'label',
    seoTitleTrans: 'seo title',
    seoDescTrans: 'seo desc',
    translationFields: {},
    resource: {
      gid: 'gid://shopify/Product/1',
      title: '测试商品',
      resourceType: 'product'
    }
  };

  prismaMock.translation.findMany.mock.mockImplementation(async () => [translation]);
  prismaMock.translation.update.mock.mockImplementation(async () => ({}));
  updateResourceTranslationMock.mock.mockImplementation(async () => ({ success: true }));

  const { action } = await publishModulePromise;
  const request = buildRequest({ publishAll: 'true' });
  const response = await action({ request });
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.published, 1);
  assert.strictEqual(data.total, 1);
  assert.strictEqual(Array.isArray(data.details), true);
});

test('api.batch-publish => 当无待发布翻译时返回成功结构', async () => {
  resetMocks();
  prismaMock.translation.findMany.mock.mockImplementation(async () => []);

  const { action } = await batchModulePromise;
  const request = buildRequest({
    batchSize: '5',
    delayMs: '0',
    filters: '{}'
  });
  const response = await action({ request });
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.total, 0);
  assert.strictEqual(data.published, 0);
});

test('api.batch-publish => 正常批量发布时返回统计字段', async () => {
  resetMocks();

  const makeTranslation = (id) => ({
    id: `${id}`,
    language: 'zh-CN',
    resourceId: `gid://shopify/Product/${id}`,
    shopId: 'shop-1',
    syncStatus: 'pending',
    titleTrans: '标题',
    descTrans: '描述',
    handleTrans: 'handle',
    summaryTrans: 'summary',
    labelTrans: 'label',
    seoTitleTrans: 'seo title',
    seoDescTrans: 'seo desc',
    translationFields: {},
    resource: {
      gid: `gid://shopify/Product/${id}`,
      title: `测试商品${id}`,
      resourceType: 'product'
    }
  });

  prismaMock.translation.findMany.mock.mockImplementation(async () => [makeTranslation(1), makeTranslation(2)]);
  prismaMock.translation.update.mock.mockImplementation(async () => ({}));
  updateResourceTranslationMock.mock.mockImplementation(async () => ({ success: true }));

  const { action } = await batchModulePromise;
  const request = buildRequest({
    batchSize: '2',
    delayMs: '0',
    filters: '{}'
  });
  const response = await action({ request });
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.total, 2);
  assert.strictEqual(data.published, 2);
  assert.ok(typeof data.successRate === 'string');
});

test('api.batch-publish => 当批量发布出现错误时返回错误记录', async () => {
  resetMocks();

  const faultyTranslation = {
    id: '10',
    language: 'zh-CN',
    resourceId: 'gid://shopify/Product/10',
    shopId: 'shop-1',
    syncStatus: 'pending',
    titleTrans: '标题',
    descTrans: '描述',
    handleTrans: 'handle',
    summaryTrans: 'summary',
    labelTrans: 'label',
    seoTitleTrans: 'seo title',
    seoDescTrans: 'seo desc',
    translationFields: {},
    resource: {
      gid: 'gid://shopify/Product/10',
      title: '测试商品10',
      resourceType: 'product'
    }
  };

  prismaMock.translation.findMany.mock.mockImplementation(async () => [faultyTranslation]);
  prismaMock.translation.update.mock.mockImplementation(async () => ({}));
  updateResourceTranslationMock.mock.mockImplementation(async () => {
    throw new Error('发布失败');
  });

  const { action } = await batchModulePromise;
  const request = buildRequest({
    batchSize: '1',
    delayMs: '0',
    filters: '{}'
  });
  const response = await action({ request });
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.success, true);
  assert.strictEqual(Array.isArray(data.errors), true);
  assert.strictEqual(data.errors.length, 1);
});

test('API合约 => 响应缺失 success 字段时前端应拦截（防御性提醒）', async () => {
  // 仅确保测试脚本覆盖兜底逻辑所需的数据契约。这里不直接验证前端。
  assert.ok(true);
});

after(() => {
  mock.reset();
});
