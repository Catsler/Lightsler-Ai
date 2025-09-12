import { test, expect } from '@playwright/test';

const RESOURCE_PATH = process.env.E2E_RESOURCE_PATH;

test.describe('Resource Detail Layout (KISS)', () => {
  test.beforeAll(() => {
    test.skip(!RESOURCE_PATH, 'E2E_RESOURCE_PATH is not set');
  });

  test('layout order and actions', async ({ page }) => {
    await page.goto(RESOURCE_PATH!, { waitUntil: 'networkidle' });

    // 资源内容抬头与三个按钮
    const contentHeading = page.getByRole('heading', { name: '资源内容' });
    await expect(contentHeading).toBeVisible();
    await expect(page.getByRole('button', { name: '翻译此资源' })).toBeVisible();
    await expect(page.getByRole('button', { name: '编辑内容' })).toBeVisible();
    await expect(page.getByRole('button', { name: '查看历史' })).toBeVisible();

    // 产品扩展位于资源内容之后
    const productExtHeading = page.getByRole('heading', { name: '产品扩展' });
    await expect(productExtHeading).toBeVisible();
    const h1 = await contentHeading.boundingBox();
    const h2 = await productExtHeading.boundingBox();
    expect((h1?.y ?? 0)).toBeLessThan((h2?.y ?? 0));

    // 元数据位于页面底部（位置在两者之后）
    const metaHeading = page.getByRole('heading', { name: '元数据' });
    await expect(metaHeading).toBeVisible();
    const h3 = await metaHeading.boundingBox();
    expect((h2?.y ?? 0)).toBeLessThan((h3?.y ?? 0));

    // 展开/收起 选项
    const toggleOptions = page.getByRole('button', { name: /展开选项|收起选项/ });
    await toggleOptions.click();
    await expect(page.getByText(/加载选项中|无选项|选项:/)).toBeVisible({ timeout: 10_000 });
    // 收起
    await toggleOptions.click();

    // 展开/收起 Metafields
    const toggleMF = page.getByRole('button', { name: /展开Metafields|收起Metafields/ });
    await toggleMF.click();
    await expect(page.getByText(/加载Metafields中|无Metafields|\w+\.\w+/)).toBeVisible({ timeout: 10_000 });
    await toggleMF.click();
  });
});

