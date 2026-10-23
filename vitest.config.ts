import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Vitest configuration for the Nest 12 / Node / ESM project.
// - `resolve.tsconfigPaths` (Vite 8+ native) resolves `@app/*` and other tsconfig paths.
// - `unplugin-swc` transforms TS with decorator + emitDecoratorMetadata support,
//   required for Nest's DI / reflect-metadata (esbuild alone cannot emit metadata).
// - `test.env` supplies the minimum env vars needed at module-import time, so
//   ConfigModule's Joi validation passes without requiring a real .env file.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: {
          syntax: 'typescript',
          decorators: true,
          dynamicImport: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          // apps/web 的 .tsx 经同一 swc 链变换（后端 .ts 无 JSX，此配置不触）。
          react: { runtime: 'automatic' },
        },
        keepClassNames: true,
      },
    }) as never,
  ],
  test: {
    globals: false,
    environment: 'node',
    // Importing the full AppModule graph (now including CqrsModule) under a cold
    // swc transform can exceed the 5s default on the first test.
    testTimeout: 20000,
    hookTimeout: 20000,
    include: [
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'libs/**/*.test.ts',
      'packages/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.browser.test.ts', '**/*.browser.test.tsx'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // DB-free 默认：真实件不连库（boot 冒烟 override MikroOrmService）。仅当外部传入
      // DATABASE_URL（如 env-gated 全栈 e2e 指向已 migrate 的 dev 库）时才用它。
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/test-db',
      JWT_SECRET: 'test-jwt-secret',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
      ALLOWED_ORIGINS: 'http://localhost:3000',
      STORAGE_REGION: 'us-east-1',
      STORAGE_ENDPOINT: 'https://s3.example.com',
      STORAGE_ACCESS_KEY_ID: 'test-access-key',
      STORAGE_ACCESS_KEY_SECRET: 'test-access-secret',
      STRIPE_SECRET_KEY: 'sk_test_placeholder',
      STRIPE_PUBLIC_KEY: 'pk_test_placeholder',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_placeholder',
      STRIPE_API_VERSION: '2025-02-24.acacia',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['apps/**/*.ts', 'libs/**/*.ts', 'packages/**/*.ts'],
      exclude: [
        'apps/**/*.test.ts',
        'apps/**/dto/**',
        'apps/**/interfaces/**',
        'apps/**/main.ts',
        'apps/**/database/seed.ts',
        'apps/**/*.module.ts',
        // packages/api-client：schema.d.ts 为 openapi.yaml 生成物（非手写逻辑），index.ts 为纯 barrel。
        'packages/**/schema.d.ts',
        'packages/**/*.test.ts',
      ],
    },
  },
});
