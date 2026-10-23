import { defineConfig } from '@playwright/test';

/**
 * 部署态黄金流 E2E（[global-playwright-browser-e2e] 切片 B · ⓐ 反悔修订后采 `@playwright/test`）。
 *
 * 与 Vitest Browser Mode（切片 A·组件/逻辑级·免起栈）正交互补：本配置驱动**真部署态 SPA**
 * （`page.goto` 跨路由导航）——登录→首页引导落租→建 post 一条核心写。
 *
 * 生命周期归编排器 `scripts/e2e-web.ts`（起 Testcontainers PG + 迁移 + seed + 编译产物 API :7009
 * + vite dev :5173 proxy），本配置**不**用 `webServer` 自起（避免与编排器抢端口/重复起栈）；
 * 只从 env `E2E_BASE_URL` 读 baseURL、跑 `e2e/` 下 `*.spec.ts`。
 *
 * opt-in：经 `pnpm run test:e2e:web`（→ 编排器）触发，**不入默认 `ci`/`pre-push`**（守 E2E gate 策略）。
 */
export default defineConfig({
  testDir: './e2e',
  // 编排器提供单一共享真栈 → 串行、免重试掩盖竞态（黄金流是状态机链·非独立可并测）。
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    // 编排器注入（默认 vite dev :5173·同源经 proxy 打 API :7009·cookie/CSRF 天然通）。
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    headless: true,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
