import { playwright } from '@vitest/browser-playwright';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// 浏览器端到端测试面（global-playwright-browser-e2e · 切片 A 设施）——
// 独立 config，经 `pnpm run ci:e2e:web` opt-in 触发；**不并入默认 vitest.config.ts / ci / pre-push**。
// 用 Vitest Browser Mode（provider=playwright·仅 chromium·headless）：真浏览器 DOM，
// 补 jsdom 覆盖不到的「真栈端到端」。tsconfigPaths + swc 复用主链配置（供 apps/web .tsx 黄金流）。
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', tsx: true, decorators: true, dynamicImport: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          react: { runtime: 'automatic' },
        },
        keepClassNames: true,
      },
    }) as never,
  ],
  test: {
    include: ['apps/web/src/**/*.browser.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
