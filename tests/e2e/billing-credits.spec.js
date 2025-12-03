/**
 * 额度与取消订阅 E2E 场景
 *
 * 运行前需准备：
 *  - E2E_BASE_URL：应用基础地址（例如：https://translate.ease-joy.com:3000）
 *  - E2E_LOW_CREDIT_PATH：额度耗尽店铺的应用路径（如 /app?shop=low-credit-shop.myshopify.com）
 *  - E2E_SUFFICIENT_CREDIT_PATH：额度充足店铺的应用路径
 *  - E2E_BILLING_PAGE_PATH：计费页面路径（用于验证取消按钮）
 *
 * 运行示例：
 * E2E_BASE_URL=https://translate.ease-joy.com:3000 \
 * E2E_STORAGE_STATE=playwright/.auth/admin.json \
 * E2E_LOW_CREDIT_PATH=/app \
 * E2E_SUFFICIENT_CREDIT_PATH=/app \
 * E2E_BILLING_PAGE_PATH=/app/billing \
 * npm run test:e2e -- billing-credits.spec.js
 */

import { test, expect } from '@playwright/test';

const baseUrl = process.env.E2E_BASE_URL || '';
const lowCreditPath = process.env.E2E_LOW_CREDIT_PATH || '';
const sufficientPath = process.env.E2E_SUFFICIENT_CREDIT_PATH || '';
const billingPath = process.env.E2E_BILLING_PAGE_PATH || '';

function requireEnv(path, name) {
  if (!baseUrl || !path) {
    test.skip(`缺少 ${name} 环境变量，已跳过测试。`);
    return false;
  }
  return true;
}

test.describe('额度与订阅流程', () => {
  test('额度不足时按钮禁用并提示升级', async ({ page }) => {
    if (!requireEnv(lowCreditPath, 'E2E_LOW_CREDIT_PATH')) return;

    await page.goto(`${baseUrl}${lowCreditPath}`);
    await page.waitForLoadState('networkidle');

    const warningBanner = page.locator('text=/额度不足|升级套餐/i');
    await expect(warningBanner).toBeVisible();

    const translateAllButton = page.getByRole('button', { name: /翻译全部/i });
    await expect(translateAllButton).toBeDisabled();

    const upgradeButton = page.getByRole('button', { name: /升级套餐|查看套餐/i });
    await expect(upgradeButton).toBeVisible();
  });

  test('额度充足时可触发翻译请求', async ({ page }) => {
    if (!requireEnv(sufficientPath, 'E2E_SUFFICIENT_CREDIT_PATH')) return;

    let translateRequestCount = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/translate') && request.method() === 'POST') {
        translateRequestCount += 1;
      }
    });

    await page.goto(`${baseUrl}${sufficientPath}`);
    await page.waitForLoadState('networkidle');

    const translateAllButton = page.getByRole('button', { name: /翻译全部/i });
    await expect(translateAllButton).toBeEnabled();

    await translateAllButton.click();
    await page.waitForTimeout(1500);

    expect(translateRequestCount).toBeGreaterThanOrEqual(1);
  });

  test('计费页面可触发取消订阅确认', async ({ page }) => {
    if (!requireEnv(billingPath, 'E2E_BILLING_PAGE_PATH')) return;

    await page.goto(`${baseUrl}${billingPath}`);
    await page.waitForLoadState('networkidle');

    const cancelButton = page.getByRole('button', { name: /取消订阅/i });
    if (!(await cancelButton.isVisible())) {
      test.skip('当前环境未显示取消按钮，跳过验证。');
      return;
    }

    await cancelButton.click();
    const modal = page.getByRole('dialog', { name: /取消订阅/i });
    await expect(modal).toBeVisible();

    const confirmButton = modal.getByRole('button', { name: /确认取消|处理中\.\.\./i });
    await expect(confirmButton).toBeVisible();
  });
});
