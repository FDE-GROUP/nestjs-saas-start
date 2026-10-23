import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthBootstrapService } from './auth.bootstrap';

// BA HTTP 面接线（module-auth-http-surface·丁-2 配套单测）：
// 锁三件事——authInstance 装配落位、通配路由 pattern（basePath 对齐·乙1）、
// handler 抛错时的 500 兜底（防悬挂连接）。真 HTTP 全链见 auth-http-surface.e2e.test.ts。

const makeService = (overrides?: Record<string, unknown>) => {
  const registered: {
    pattern: string;
    handler: (req: unknown, reply: unknown) => Promise<void>;
  }[] = [];
  const authInstance = { get: () => undefined as unknown, set: vi.fn() };
  const configService = {
    getAppConfig: () => ({ name: 'test', apiPrefix: 'api', version: 'v1' }),
    getAuthConfig: () => ({ jwt: { secret: 'test-secret-value' } }),
    getCorsConfig: () => ({ origin: ['*'] }),
    getOAuthConfig: () => ({
      providers: [{ type: 'github', enabled: true }], // 无凭证 → 应被过滤跳过（不抛）
      genericProviders: [],
      secrets: {},
    }),
    ...overrides,
  };
  const httpAdapterHost = {
    httpAdapter: {
      getInstance: () => ({
        all: (pattern: string, handler: never) => {
          registered.push({ pattern, handler });
        },
      }),
    },
  };
  const service = new AuthBootstrapService(
    configService as never,
    // ORM 修宪案 B · Phase 2 彻底去旧 ORM：旧 `db`（原数据库服务）形参退场。
    // 本测只验 bootstrap 装配（不真查库），`createAuthAdapter` 返回**适配器工厂函数**（`database`
    // 为 function → BA 走自定义 adapter 分支，不触 Kysely 初始化），避免无真库时的异步拒绝。
    { createAuthAdapter: async () => () => ({ id: 'test-adapter' }) } as never,
    { checkSeats: async () => {} } as never,
    authInstance as never,
    httpAdapterHost as never,
    // AuthBootstrapService 第 6 依赖 mailerService（auth 接入邮件/magic-link 时新增）：
    // 本测仅验 bootstrap 装配、不触发发信（CreateAuth 装配期不 eager 调用它），故给轻量 mock。
    { sendMail: async () => {} } as never,
  );
  return { service, registered, authInstance };
};

describe('AuthBootstrapService（BA HTTP 面接线）', () => {
  const prevEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...prevEnv };
    vi.restoreAllMocks();
  });

  it('onApplicationBootstrap：装配 auth 实例并按 basePath 对齐注册通配路由', async () => {
    const { service, registered, authInstance } = makeService();
    await service.onApplicationBootstrap();

    expect(authInstance.set).toHaveBeenCalledTimes(1);
    expect(registered).toHaveLength(1);
    // 乙1：basePath 维持 CreateAuth 现值 /api/v1/auth；通配语法=裸尾 `*`（spike 实锤：
    // fastify 5.12.5/find-my-way 9.10.0 不支持 `{*name}`）
    expect(registered[0].pattern).toBe('/api/v1/auth/*');
  });

  it('接线 handler：非法请求 → 500 行为契约（不悬挂、响应落写）', async () => {
    const { service, registered } = makeService();
    await service.onApplicationBootstrap();

    const code = vi.fn();
    const send = vi.fn();
    // 空壳 req（无 headers/raw）使 BA handler 处理失败；实走 CreateAuth 内部 catch 兜底
    // （bootstrap 外层 catch 为第二层防悬挂保险）——对外契约统一：500 响应必落写。
    await registered[0].handler(
      {} as never,
      {
        raw: { writableEnded: false },
        code,
        send,
      } as never,
    );
    expect(code).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
