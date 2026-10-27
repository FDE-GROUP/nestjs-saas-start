import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateAuth } from './auth.implement';

/**
 * 认证配置结构锁（module-test-coverage-gaps G3+G4·追溯对拍拓出两处零测）。
 *
 * 承 `auth.ip-trust.test.ts` 的 `CreateAuth` 装配 harness（stub `createAuthAdapter` 返工厂函数避免
 * 真库初始化·只断言 BA options 装配不查库），锁两枚**配置边界在场性**（防误删/篡改回归）：
 *  - G3 并号特权：`account.accountLinking = { enabled: true, trustedProviders: ['google','github'] }`
 *    ——仅邮箱由 IdP 强校验的 provider 方可自动并号（安全边界·非验 BA 并号算法，算法归上游）；
 *  - G4 密码面：`emailAndPassword.minPasswordLength === 8`；`enabled` 随 `NODE_ENV`
 *    （生产关邮箱密码面·非生产开，与 Epic 01.1/01.2 定性一致）。
 */

const minimalConfigService = () =>
  ({
    getAppConfig: () => ({ name: 'test', apiPrefix: 'api', version: 'v1' }),
    getAuthConfig: () => ({ jwt: { secret: 'test-secret-value' } }),
    getCorsConfig: () => ({ origin: ['*'] }),
  }) as never;

const createAuthWithOptions = () =>
  CreateAuth(
    undefined,
    [],
    { createAuthAdapter: async () => () => ({ id: 'test-adapter' }) } as never,
    minimalConfigService(),
    { sendMagicLinkEmail: async () => {} } as never,
  );

const opts = async () => (await createAuthWithOptions()).auth.options as Record<string, any>;

describe('accountLinking 并号特权边界（G3）', () => {
  it('enabled=true 且 trustedProviders 恰为 [google, github]', async () => {
    const options = await opts();
    const linking = options.account.accountLinking;
    expect(linking.enabled).toBe(true);
    expect(linking.trustedProviders).toEqual(expect.arrayContaining(['google', 'github']));
    expect(linking.trustedProviders).toHaveLength(2);
  });
});

describe('emailAndPassword 配置面（G4）', () => {
  const prevEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...prevEnv };
    vi.restoreAllMocks();
  });

  it('minPasswordLength === 8', async () => {
    const options = await opts();
    expect(options.emailAndPassword.minPasswordLength).toBe(8);
  });

  it('enabled 随 NODE_ENV：生产关邮箱密码面·非生产开', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'http://localhost:7009'; // 隔离 magic-link「prod 缺 APP_URL」warn（非本测焦点）
    const prod = await opts();
    expect(prod.emailAndPassword.enabled).toBe(false);

    process.env.NODE_ENV = 'test';
    const dev = await opts();
    expect(dev.emailAndPassword.enabled).toBe(true);
  });
});
