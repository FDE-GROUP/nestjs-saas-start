import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
// 解析单源已出至 common/trusted-proxies（module-common-rate-limit 乙裁双链同源）。
import { parseTrustedProxies } from '../../../common/trusted-proxies';
import { CreateAuth } from './auth.implement';

// 生产限流信任链（module-auth-ip-trust）：
// - parseTrustedProxies 四态（本仓解析面）；
// - CreateAuth 装配透传（auth.options.advanced.ipAddress.trustedProxies 结构锁）；
// - 乙1：生产未配 → 启动 warn 一响；已配/非生产 → 不响。
// 说明：BA getIP 的库内算法（XFF 反跳/单值信任）为 better-auth 上游测试主防线，本仓未配时
// 不传 trustedProxies 即保持库安全默认——plan 戊-2 依 @better-auth/core 非可导入（deep import
// 脆弱）降级为「透传断言 + 源码行号存照」，如实登记于 plan v0.3。

describe('parseTrustedProxies', () => {
  it('undefined / 空串 / 仅分隔符 → undefined（不传，保持库安全默认）', () => {
    expect(parseTrustedProxies(undefined)).toBeUndefined();
    expect(parseTrustedProxies('')).toBeUndefined();
    expect(parseTrustedProxies(' , , ')).toBeUndefined();
  });

  it('逗号分隔 CIDR → 去空白过滤后的数组', () => {
    expect(parseTrustedProxies(' 172.16.0.0/12 , 127.0.0.1 ')).toEqual([
      '172.16.0.0/12',
      '127.0.0.1',
    ]);
  });
});

const minimalConfigService = () =>
  ({
    getAppConfig: () => ({ name: 'test', apiPrefix: 'api', version: 'v1' }),
    getAuthConfig: () => ({ jwt: { secret: 'test-secret-value' } }),
    getCorsConfig: () => ({ origin: ['*'] }),
  }) as never;

// `CreateAuth` 已于切片 3b 转 async（需 `await createAuthAdapter`）；ORM 修宪案 B · Phase 2
// 彻底去旧 ORM 后，`mikroOrmService` 桩恒被传。本测只断言 BA options 装配（不查库），故
// `createAuthAdapter` 返回**适配器工厂函数**（`database` 为 function → BA 走自定义 adapter 分支，
// 不触 Kysely 初始化），避免无真库时的 `Failed to initialize database adapter` 异步拒绝。
const createAuthWithOptions = () =>
  CreateAuth(
    undefined,
    [],
    { createAuthAdapter: async () => () => ({ id: 'test-adapter' }) } as never,
    minimalConfigService(),
    { checkSeats: async () => {} } as never,
    // magic-link 无条件挂载（含生产）：sendMagicLink 闭包仅运行期触达、挂载不求解，此处桩仅为签名完备。
    { sendMagicLinkEmail: async () => {} } as never,
  );

describe('CreateAuth ip-trust wiring', () => {
  const prevEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...prevEnv };
    vi.restoreAllMocks();
  });

  it('AUTH_TRUSTED_PROXIES 配置后透传进 BA options（结构在场）', async () => {
    process.env.AUTH_TRUSTED_PROXIES = '172.16.0.0/12,127.0.0.1';
    const { auth } = await createAuthWithOptions();
    const advanced = (auth.options as Record<string, any>).advanced;
    expect(advanced.ipAddress.trustedProxies).toEqual(['172.16.0.0/12', '127.0.0.1']);
    // 丙：限流结构显式在场（值跟库默认语义，enabled=true）
    expect((auth.options as Record<string, any>).rateLimit).toMatchObject({ enabled: true });
  });

  it('未配置时不传 trustedProxies（保持库安全默认，而非空数组）', async () => {
    delete process.env.AUTH_TRUSTED_PROXIES;
    const { auth } = await createAuthWithOptions();
    const advanced = (auth.options as Record<string, any>).advanced;
    expect(advanced.ipAddress.trustedProxies).toBeUndefined();
  });

  it('乙1：production 未配 → 启动 warn 一响；已配 → 不响', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';
    // 隔离 magic-link 「prod 缺 APP_URL」warn（非本测焦点·module-auth-magic-link-production）：
    // 置 APP_URL 使本测只观察 AUTH_TRUSTED_PROXIES 一响。
    process.env.APP_URL = 'http://localhost:7009';

    delete process.env.AUTH_TRUSTED_PROXIES;
    await createAuthWithOptions();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('AUTH_TRUSTED_PROXIES');

    warn.mockClear();
    process.env.AUTH_TRUSTED_PROXIES = '172.16.0.0/12';
    await createAuthWithOptions();
    expect(warn).not.toHaveBeenCalled();
  });

  it('生产环境仍无条件挂载 magic-link（module-auth-magic-link-production 乙·仅存量登录）', async () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'http://app.test';
    const { auth } = await createAuthWithOptions();
    const plugins = ((auth.options as Record<string, unknown>).plugins ?? []) as Array<{
      id: string;
    }>;
    expect(plugins.some((p) => p.id === 'magic-link')).toBe(true);
  });
});
