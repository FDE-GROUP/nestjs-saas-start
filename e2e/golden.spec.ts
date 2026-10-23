import { expect, test } from '@playwright/test';

/**
 * 部署态黄金流（[global-playwright-browser-e2e] 切片 B）。
 *
 * 真 SPA（vite dev :5173）+ 真 API（编译产物 :7009·经 vite proxy 同源）+ 真库（Testcontainers 一次性 PG·seed）。
 * 栈生命周期归编排器 `scripts/e2e-web.ts`——它跑完 seed 后本 spec 才执行，故 `admin@example.com`/`admin123`
 * 及其唯一成员组织 `seed-acme` 必已就位（登录后首页 loader「引导落租」自动激活唯一组织）。
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123';

/** 密码登录黄金流前置：登录→等首页会话墙放行（`session-email` 可见即代表已过会话 + 引导落租）。 */
async function loginAs(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(email);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByTestId('session-email')).toHaveText(email, { timeout: 15_000 });
}

test.describe('认证会话墙', () => {
  test('未登录访问受保护页 /posts → 弹回 /login', async ({ page }) => {
    await page.goto('/posts');
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    // 落回登录页须渲染密码表单（非魔法链接分区）——以「登录」提交按钮为锚。
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  });
});

test.describe('核心写黄金流：登录 → 引导落租 → 建文章', () => {
  test('建 post 并回显于列表', async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await page.goto('/posts');
    // posts loader 过会话墙后拉列表；建表单以「标题」字段为锚。
    await expect(page.getByLabel('标题')).toBeVisible({ timeout: 15_000 });

    const title = `E2E 黄金流文章 ${Date.now()}`;
    await page.getByLabel('标题').fill(title);
    await page.getByRole('button', { name: '创建' }).click();

    // 成功反馈文案（useAction successMessage）+ 新建项经 loader 重跑回显于表格。
    await expect(page.getByText('文章已创建')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('cell', { name: title, exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
