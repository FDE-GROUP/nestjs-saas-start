import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * ORM 修宪案 B · 切片 1 —— authFlow 一致性套件的**专用** vitest 配置（env-gated）。
 *
 * 与默认 `vitest.config.ts` 隔离：默认 `include` 只收 `*.test.ts`，本配置**只**收本切片的一致性
 * `*.spec.ts`。如此默认 `pnpm test` / `pnpm run ci` 基线（358）完全不受影响；本套件仅经
 * `pnpm run test:auth-consistency`（即 `vitest run --config vitest.consistency.config.ts`）显式驱动，
 * 且需 `BA_MIKRO_CONSISTENCY=1` + 真 PG 方执行（否则 `describe.skip` 零连接）。
 *
 * 一致性判据：authFlow 全绿 → 进程 EXIT=0。并入 `ci` 硬门禁链这一步（改 `scripts/ci.ts`）触高危清单 3，
 * 按 plan §3/§5 待切片 1 随实现由人签核后**另行接入**，本阶段不预改门禁。
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
      },
    }) as never,
  ],
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    include: ['apps/api/src/database/ba/auth-adapter.consistency.spec.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgres://postgres:postgres@localhost:5432/mikro_ba_consistency',
      BA_MIKRO_CONSISTENCY: process.env.BA_MIKRO_CONSISTENCY ?? '1',
    },
  },
});
