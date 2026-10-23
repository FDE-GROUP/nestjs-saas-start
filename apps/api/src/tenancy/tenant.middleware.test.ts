import type { OrganizationStatusService } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.service';
import type { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { RequestSessionReader } from '@core/saas-kit/tenancy/session/request-session.port';
import { TenantMiddleware } from '@core/saas-kit/tenancy/tenant.middleware';
import { type TenantContext, tenantStorage } from '@core/saas-kit/tenancy/tenant-context';
import { describe, expect, it, vi } from 'vitest';

/**
 * §9.5.4①B · P1b：中间件经 `RequestSessionReader` 端口消费会话（不再打桩 Better Auth 实例）。
 * 会话解析（cookie / 旁路 / getSession）细节改由 `AuthSessionReader` 适配单测覆盖。
 */
function makeMiddleware(opts: {
  activeOrganizationId?: string;
  userId?: string;
  blocked?: boolean | 'throw';
  userBlocked?: boolean;
  noSession?: boolean;
}) {
  const read = vi
    .fn()
    .mockResolvedValue(
      opts.noSession
        ? null
        : { activeOrganizationId: opts.activeOrganizationId, userId: opts.userId ?? 'u1' },
    );
  const session = { read } as unknown as RequestSessionReader;

  const isBlocked =
    opts.blocked === 'throw'
      ? vi.fn().mockRejectedValue(new Error('db down'))
      : vi.fn().mockResolvedValue(opts.blocked ?? false);
  const status = { isBlocked } as unknown as OrganizationStatusService;

  const userIsBlocked = vi.fn().mockResolvedValue(opts.userBlocked ?? false);
  const userStatus = { isBlocked: userIsBlocked } as unknown as UserStatusService;

  return { mw: new TenantMiddleware(session, status, userStatus), isBlocked, userIsBlocked, read };
}

function reqWith(headers: Record<string, unknown> = {}) {
  return { headers: { cookie: 'session=abc', ...headers }, url: '/api/v1/posts' };
}

async function run(mw: TenantMiddleware, req: unknown): Promise<TenantContext | undefined> {
  let store: TenantContext | undefined;
  await new Promise<void>((resolve) => {
    mw.use(req, {}, () => {
      store = tenantStorage.getStore();
      resolve();
    });
  });
  return store;
}

describe('TenantMiddleware · S4 approval fail-closed (deny-list)', () => {
  it('binds NO tenant when the active tenant is blocked (pending/suspended/deleted)', async () => {
    const { mw, isBlocked } = makeMiddleware({ activeOrganizationId: 'orgP', blocked: true });
    const store = await run(mw, reqWith());
    expect(isBlocked).toHaveBeenCalledWith('orgP');
    expect(store?.tenantId).toBeUndefined();
    expect(store?.userId).toBe('u1'); // user-level identity still resolved
  });

  it('binds the tenant when it is not blocked (active / legacy unrecorded)', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: false });
    const store = await run(mw, reqWith());
    expect(store?.tenantId).toBe('orgA');
  });

  it('fails closed when the status lookup throws', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: 'throw' });
    const store = await run(mw, reqWith());
    expect(store?.tenantId).toBeUndefined();
  });

  it('skips the status read entirely when no tenant is resolved', async () => {
    const { mw, isBlocked } = makeMiddleware({});
    const store = await run(mw, reqWith());
    expect(isBlocked).not.toHaveBeenCalled();
    expect(store?.tenantId).toBeUndefined();
  });

  it('still narrows by the x-workspace-id selector within the active tenant (S3)', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: false });
    const store = await run(mw, reqWith({ 'x-workspace-id': 'ws7' }));
    expect(store?.tenantId).toBe('orgA');
    expect(store?.workspaceId).toBe('ws7');
  });

  it('passes straight through (no ALS bind) when the port reports no session context', async () => {
    const { mw, read } = makeMiddleware({ noSession: true });
    const store = await run(mw, reqWith());
    expect(read).toHaveBeenCalled();
    expect(store).toBeUndefined();
  });
});

describe('TenantMiddleware · S6 user suspension fail-closed (deny-list · 全局失能)', () => {
  it('binds NEITHER tenant NOR identity for a suspended user (all layers red)', async () => {
    const { mw, userIsBlocked } = makeMiddleware({
      activeOrganizationId: 'orgA',
      userId: 'u1',
      userBlocked: true,
    });
    const store = await run(mw, reqWith());
    expect(userIsBlocked).toHaveBeenCalledWith('u1');
    expect(store?.tenantId).toBeUndefined();
    expect(store?.userId).toBeUndefined();
  });

  it('skips the tenant status read when the user is already suspended', async () => {
    const { mw, isBlocked } = makeMiddleware({
      activeOrganizationId: 'orgA',
      userId: 'u1',
      userBlocked: true,
    });
    await run(mw, reqWith());
    expect(isBlocked).not.toHaveBeenCalled();
  });

  it('preserves identity + tenant for an active user (no regression)', async () => {
    const { mw } = makeMiddleware({
      activeOrganizationId: 'orgA',
      userId: 'u1',
      blocked: false,
      userBlocked: false,
    });
    const store = await run(mw, reqWith());
    expect(store?.tenantId).toBe('orgA');
    expect(store?.userId).toBe('u1');
  });
});
