/**
 * E2E测试: 零辅语言场景
 *
 * 测试目标:
 * 1. 验证商店未配置辅助语言时的友好提示
 * 2. 验证"重新翻译"按钮正确禁用
 * 3. 验证不发送不必要的API请求
 * 4. 验证页面无JavaScript错误
 *
 * 前置条件:
 * - 需要一个只配置了主语言（无辅助语言）的测试商店
 * - 需要有已扫描的资源数据
 *
 * 运行方式:
 * E2E_BASE_URL=https://translate.ease-joy.com:3000 \
 * E2E_STORAGE_STATE=playwright/.auth/admin.json \
 * E2E_ZERO_LANG_RESOURCE_ID=<resource-id> \
 * npm run test:e2e -- zero-secondary-language.spec.js
 */

import { test, expect } from '@playwright/test';

// 从环境变量获取测试资源ID（需要是零辅语言商店的资源）
const RESOURCE_ID = process.env.E2E_ZERO_LANG_RESOURCE_ID || 'gid://shopify/Product/123';
const RESOURCE_TYPE = 'product'; // 可以根据需要调整

test.describe('零辅语言场景测试', () => {
  test.beforeEach(async ({ page }) => {
    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('Console Error:', msg.text());
      }
    });
  });

  test('应显示零辅语言警告Banner并禁用翻译按钮', async ({ page }) => {
    // 记录所有网络请求
    const apiRequests = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/')) {
        apiRequests.push({
          url,
          method: request.method(),
          timestamp: Date.now()
        });
      }
    });

    // 访问资源详情页（使用主语言作为lang参数）
    await page.goto(`/app/resource/${RESOURCE_TYPE}/${RESOURCE_ID}?lang=zh-CN`);

    // 等待页面加载完成
    await page.waitForLoadState('networkidle');

    // ========================================
    // 验证点1: 警告Banner显示
    // ========================================
    const banner = page.locator('[role="status"]').filter({ hasText: '当前商店未配置次要语言' });
    await expect(banner).toBeVisible({ timeout: 5000 });

    // 验证Banner内容
    await expect(banner).toContainText('无法进行翻译');
    await expect(banner).toContainText('请先在 Shopify 设置中添加目标语言');

    // ========================================
    // 验证点2: "重新翻译"按钮禁用
    // ========================================
    const translateButton = page.getByRole('button', { name: /重新翻译/i });
    await expect(translateButton).toBeVisible();
    await expect(translateButton).toBeDisabled();

    // 验证按钮确实无法点击
    const isDisabled = await translateButton.isDisabled();
    expect(isDisabled).toBe(true);

    // ========================================
    // 验证点3: 不发送产品相关API请求
    // ========================================
    // 等待一段时间确保没有延迟加载的请求
    await page.waitForTimeout(2000);

    // 检查不应该发送的请求
    const productOptionsRequests = apiRequests.filter(r => r.url.includes('/api/product-options'));
    const productMetafieldsRequests = apiRequests.filter(r => r.url.includes('/api/product-metafields'));
    const coverageRequests = apiRequests.filter(r => r.url.includes('/api/language-coverage') || r.url.includes('/api/resource-coverage'));

    expect(productOptionsRequests).toHaveLength(0);
    expect(productMetafieldsRequests).toHaveLength(0);
    // 注意: 初始加载可能会有一次coverage请求，但后续不应有更多
    expect(coverageRequests.length).toBeLessThanOrEqual(1);

    // ========================================
    // 验证点4: 页面副标题显示主语言
    // ========================================
    // 检查页面是否正常渲染（有标题和内容）
    await expect(page.locator('text=/当前语言/i')).toBeVisible();

    // ========================================
    // 验证点5: 双语对比UI不显示译文部分
    // ========================================
    // 译文部分不应该显示（因为hasNoSecondaryLanguages=true）
    const translationContent = page.locator('text=/译文.*zh-CN/i');
    await expect(translationContent).not.toBeVisible();

    // ========================================
    // 验证点6: 无JavaScript错误
    // ========================================
    // 检查页面没有明显的渲染错误
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('null');
    expect(bodyText).not.toContain('[object Object]');
  });

  test('页面刷新后状态保持一致', async ({ page }) => {
    // 首次访问
    await page.goto(`/app/resource/${RESOURCE_TYPE}/${RESOURCE_ID}?lang=zh-CN`);
    await page.waitForLoadState('networkidle');

    // 验证Banner存在
    const banner = page.locator('text=/当前商店未配置次要语言/i');
    await expect(banner).toBeVisible();

    // 刷新页面
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 验证状态保持
    await expect(banner).toBeVisible();
    const translateButton = page.getByRole('button', { name: /重新翻译/i });
    await expect(translateButton).toBeDisabled();
  });

  test('尝试点击禁用按钮不触发任何操作', async ({ page }) => {
    let translateRequestSent = false;

    // 监听翻译API请求
    page.on('request', request => {
      if (request.url().includes('/api/translate')) {
        translateRequestSent = true;
      }
    });

    await page.goto(`/app/resource/${RESOURCE_TYPE}/${RESOURCE_ID}?lang=zh-CN`);
    await page.waitForLoadState('networkidle');

    const translateButton = page.getByRole('button', { name: /重新翻译/i });

    // 尝试点击（应该无效）
    await translateButton.click({ force: true }).catch(() => {
      // 预期点击失败，因为按钮禁用
    });

    // 等待确保没有请求发送
    await page.waitForTimeout(1000);

    expect(translateRequestSent).toBe(false);
  });
});

test.describe('零辅语言场景 - 列表页导航', () => {
  test('从列表页导航到详情页应正确处理', async ({ page }) => {
    // 如果列表页也是零辅语言商店，语言选择器可能为空
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // 注意: 这个测试依赖列表页的具体实现
    // 如果零辅语言商店的列表页有特殊处理，需要相应调整

    // 尝试点击资源卡片（如果存在）
    const resourceCards = page.locator('[data-testid="resource-card"]').or(page.locator('button, a').filter({ hasText: /product|collection/i })).first();

    if (await resourceCards.count() > 0) {
      await resourceCards.click();
      await page.waitForLoadState('networkidle');

      // 验证跳转后的页面状态
      const banner = page.locator('text=/当前商店未配置次要语言/i');
      await expect(banner).toBeVisible();
    }
  });
});
