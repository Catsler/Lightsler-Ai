import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

await mock.module('../../app/shopify.server.js', {
  namedExports: {
    authenticate: {
      admin: async () => ({ admin: undefined, session: undefined })
    },
    apiVersion: 'test'
  },
  defaultExport: {}
});

await mock.module('../../app/utils/logger.server.js', {
  namedExports: {
    apiLogger: {
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    }
  }
});

const {
  resetApiMonitor,
  getApiMetrics,
  configureApiMonitor
} = await import('../../app/services/api-monitor.server.js');

configureApiMonitor({ operations: [], minSample: 1 });
resetApiMonitor();

const { createApiRoute } = await import('../../app/utils/base-route.server.js');

const noopRouteParams = {};

function buildRequest(url, init) {
  return new Request(url, init);
}

test('createApiRoute exposes params and searchParams for GET requests', async () => {
  resetApiMonitor();
  let receivedContext;

  const route = createApiRoute(async (context) => {
    receivedContext = context;
    return { success: true, data: { echo: context.params } };
  }, { requireAuth: false, operationName: '测试-G' });

  const request = buildRequest('https://example.com/api/example?foo=bar&count=2', { method: 'GET' });
  const response = await route({ request, params: noopRouteParams });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.deepEqual(payload.data.echo, { foo: 'bar', count: '2' });

  assert.equal(receivedContext.request.method, 'GET');
  assert.equal(receivedContext.params.foo, 'bar');
  assert.equal(receivedContext.params.count, '2');
  assert.ok(receivedContext.searchParams instanceof URLSearchParams);
  assert.equal(receivedContext.searchParams.get('foo'), 'bar');
  assert.equal(receivedContext.searchParams.get('count'), '2');
  assert.equal(receivedContext.routeParams, noopRouteParams);

  const metrics = getApiMetrics({ operation: '/api/example' });
  assert.ok(metrics);
  assert.equal(metrics.totals.total, 1);
  assert.equal(metrics.totals.success, 1);
  assert.equal(metrics.totals.failure, 0);
  const window1m = metrics.windows['1m'];
  assert.equal(window1m.sampleSize, 1);
  assert.equal(window1m.statusCounts['200'], 1);
});

test('createApiRoute merges body payload into params for POST requests', async () => {
  resetApiMonitor();
  let receivedContext;

  const route = createApiRoute(async (context) => {
    receivedContext = context;
    return { success: true };
  }, { requireAuth: false, operationName: '测试-P' });

  const request = buildRequest('https://example.com/api/example?foo=bar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Alice', count: 2 })
  });

  const response = await route({ request, params: noopRouteParams });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);

  assert.equal(receivedContext.request.method, 'POST');
  assert.equal(receivedContext.params.foo, 'bar');
  assert.equal(receivedContext.params.name, 'Alice');
  assert.equal(receivedContext.params.count, 2);
  assert.ok(receivedContext.searchParams instanceof URLSearchParams);
  assert.equal(receivedContext.searchParams.get('foo'), 'bar');

  const metrics = getApiMetrics({ operation: '/api/example' });
  assert.ok(metrics);
  assert.equal(metrics.totals.total, 1);
  assert.equal(metrics.totals.success, 1);
  assert.equal(metrics.totals.failure, 0);
  const window1m = metrics.windows['1m'];
  assert.equal(window1m.sampleSize, 1);
  assert.equal(window1m.statusCounts['200'], 1);
});

test('createApiRoute allows both context.params and direct request body access', async () => {
  resetApiMonitor();
  let receivedContext;

  const route = createApiRoute(async (context) => {
    receivedContext = context;

    // 验证context.params可以访问
    const paramsData = context.params;

    // 验证原始request.formData()也可以访问（修复后不应报错）
    const formData = await context.request.formData();

    return {
      success: true,
      paramsValue: paramsData.test,
      formDataValue: formData.get('test'),
      bothMatch: paramsData.test === formData.get('test')
    };
  }, { requireAuth: false, operationName: '测试-双通道访问' });

  const formData = new FormData();
  formData.append('test', 'dual-access-value');
  formData.append('language', 'zh-CN');

  const request = buildRequest('https://example.com/api/test', {
    method: 'POST',
    body: formData
  });

  const response = await route({ request, params: noopRouteParams });
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.paramsValue, 'dual-access-value');
  assert.equal(payload.formDataValue, 'dual-access-value');
  assert.equal(payload.bothMatch, true);

  // 验证context中的数据
  assert.equal(receivedContext.params.test, 'dual-access-value');
  assert.equal(receivedContext.params.language, 'zh-CN');

  const metrics = getApiMetrics({ operation: '/api/test' });
  assert.ok(metrics);
  assert.equal(metrics.totals.total, 1);
  assert.equal(metrics.totals.success, 1);
});

test('createApiRoute surfaces pre-timeout errors without reference failures', async () => {
  resetApiMonitor();
  const route = createApiRoute(
    async () => {
      throw new Error('handler should not run');
    },
    {
      requireAuth: false,
      operationName: '测试-前置错误',
      validateParams: () => {
        throw new Error('pre-timeout failure');
      }
    }
  );

  const request = buildRequest('https://example.com/api/example', { method: 'GET' });
  const response = await route({ request, params: noopRouteParams });

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.equal(payload.success, false);
  assert.equal(payload.message, 'pre-timeout failure');

  const metrics = getApiMetrics({ operation: '/api/example' });
  assert.ok(metrics);
  assert.equal(metrics.totals.total, 1);
  assert.equal(metrics.totals.failure, 1);
  const window1m = metrics.windows['1m'];
  assert.equal(window1m.sampleSize, 1);
  assert.equal(window1m.statusCounts['500'], 1);
});

test('createApiRoute passes through Response without re-wrapping (headers/status/body preserved)', async () => {
  resetApiMonitor();

  const route = createApiRoute(
    async () => new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { 'x-test-header': 'keep-me' }
    }),
    { requireAuth: false, operationName: '测试-透传' }
  );

  const request = buildRequest('https://example.com/api/example', { method: 'GET' });
  const response = await route({ request, params: noopRouteParams });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-test-header'), 'keep-me');
  const payload = await response.json();
  assert.deepEqual(payload, { ok: true });

  const metrics = getApiMetrics({ operation: '/api/example' });
  assert.ok(metrics);
  assert.equal(metrics.totals.total, 1);
  assert.equal(metrics.totals.success, 1);
  const window1m = metrics.windows['1m'];
  assert.equal(window1m.statusCounts['201'], 1);
});
