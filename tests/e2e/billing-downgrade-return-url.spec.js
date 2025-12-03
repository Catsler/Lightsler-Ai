/**
 * 订阅降级 ReturnUrl 回归测试
 *
 * 运行前需配置：
 *  - E2E_BASE_URL：基础域名（如 https://translate.ease-joy.com:3000）
 *  - E2E_BILLING_PAGE_PATH：计费页相对路径（如 /app/billing?shop=xxx）
 *  - E2E_STORAGE_STATE：Playwright 登录态（参考 README）
 */

import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || '';
const billingPath = process.env.E2E_BILLING_PAGE_PATH || '';

const requireEnv = () => {
  if (!baseUrl || !billingPath) {
    test.skip('缺少 E2E_BASE_URL 或 E2E_BILLING_PAGE_PATH，跳过测试');
    return false;
  }
  return true;
};

test.describe('计费降级 ReturnUrl 检查', () => {
  test('发送 switch-plan 请求时附带 returnUrl', async ({ page }) => {
    if (!requireEnv()) return;

    let capturedBody = '';
    await page.route('**/api/billing/switch-plan', async (route) => {
      const request = route.request();
      capturedBody = request.postData() || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, message: 'mock intercept' })
      });
    });

    await page.goto(`${baseUrl}${billingPath}`);
    await page.waitForLoadState('networkidle');

    const selectablePlanButton = page.getByRole('button', { name: /选择此套餐/i }).first();
    if (!(await selectablePlanButton.isVisible())) {
      test.skip('当前环境没有可切换的套餐');
      return;
    }

    await selectablePlanButton.click();
    await page.waitForTimeout(500); // 等待 fetcher 提交

    expect(capturedBody).not.toBe('');
    const params = new URLSearchParams(capturedBody);
    const returnUrl = params.get('returnUrl');
    expect(returnUrl).toBeTruthy();
    expect(returnUrl).toMatch(/\/app\/billing/i);
  });
});
