import type { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import type { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { RequestSessionReader } from '@core/saas-kit/tenant-isolation/session/request-session.port';
import { TenantIsolationMiddleware } from '@core/saas-kit/tenant-isolation/tenant-isolation.middleware';
import {
  type TenantIsolationScope,
  tenantIsolationStorage,
} from '@core/saas-kit/tenant-isolation/tenant-isolation-scope';
import type { TenantScopeResolver } from '@core/saas-kit/tenant-isolation/tenant-scope-resolver.port';
import { describe, expect, it, vi } from 'vitest';

/**
 * §9.5.4①B · P1b：中间件经 `RequestSessionReader` 端口消费会话（不再打桩 Better Auth 实例）。
 * 会话解析（cookie / 旁路 / getSession）细节改由 `AuthSessionReader` 适配单测覆盖。
 * rehierarchy 切片 C：封禁通过后另经 `TenantScopeResolver` 把活动组织升为主轴 `tenantId`。
 * rehierarchy 切片 E-F 治理换轴：先派生 tenantId、再对**租户**判失能（deny-list 读 `tenant.status`）。
 */
function makeMiddleware(opts: {
  activeOrganizationId?: string;
  userId?: string;
  blocked?: boolean | 'throw';
  userBlocked?: boolean;
  noSession?: boolean;
  /** 派生租主轴返回值（默认为活动组织加前缀）；传 `null` 模拟未归属 → 不绑主轴。 */
  resolvedTenantId?: string | null;
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
  const status = { isBlocked } as unknown as TenantStatusService;

  const userIsBlocked = vi.fn().mockResolvedValue(opts.userBlocked ?? false);
  const userStatus = { isBlocked: userIsBlocked } as unknown as UserStatusService;

  // 主轴派生桩：默认「活动组织 → tenant-<org>」；`resolvedTenantId:null` → undefined（未归属）。
  const resolveTenantIdOf = vi.fn(async () =>
    opts.resolvedTenantId === null
      ? undefined
      : (opts.resolvedTenantId ?? `tenant-${opts.activeOrganizationId}`),
  );
  const tenantScope = { resolveTenantIdOf } as unknown as TenantScopeResolver;

  return {
    mw: new TenantIsolationMiddleware(session, status, userStatus, tenantScope),
    isBlocked,
    userIsBlocked,
    resolveTenantIdOf,
    read,
  };
}

function reqWith(headers: Record<string, unknown> = {}) {
  return { headers: { cookie: 'session=abc', ...headers }, url: '/api/v1/posts' };
}

async function run(
  mw: TenantIsolationMiddleware,
  req: unknown,
): Promise<TenantIsolationScope | undefined> {
  let store: TenantIsolationScope | undefined;
  await new Promise<void>((resolve) => {
    mw.use(req, {}, () => {
      store = tenantIsolationStorage.getStore();
      resolve();
    });
  });
  return store;
}

describe('TenantIsolationMiddleware · S4 approval fail-closed (deny-list)', () => {
  it('binds NO tenant when the active tenant is blocked (pending/suspended/deleted)', async () => {
    const { mw, isBlocked } = makeMiddleware({ activeOrganizationId: 'orgP', blocked: true });
    const store = await run(mw, reqWith());
    // 治理换轴（E-F）：失能卡点改读**租户**态——isBlocked 以派生 tenantId 为参。
    expect(isBlocked).toHaveBeenCalledWith('tenant-orgP');
    expect(store?.organizationId).toBeUndefined();
    expect(store?.userId).toBe('u1'); // user-level identity still resolved
  });

  it('binds the tenant when it is not blocked (active / legacy unrecorded)', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: false });
    const store = await run(mw, reqWith());
    expect(store?.organizationId).toBe('orgA');
    expect(store?.tenantId).toBe('tenant-orgA'); // 主轴经活动组织派生
  });

  it('换轴 fail-closed：活动组织未归属租户 → 不绑主轴（guard 下游 403）但保留组织轴', async () => {
    const { mw, resolveTenantIdOf } = makeMiddleware({
      activeOrganizationId: 'orgA',
      blocked: false,
      resolvedTenantId: null,
    });
    const store = await run(mw, reqWith());
    expect(resolveTenantIdOf).toHaveBeenCalledWith('orgA');
    expect(store?.organizationId).toBe('orgA');
    expect(store?.tenantId).toBeUndefined();
  });

  it('fails closed when the status lookup throws', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: 'throw' });
    const store = await run(mw, reqWith());
    expect(store?.organizationId).toBeUndefined();
  });

  it('skips the status read entirely when no tenant is resolved', async () => {
    const { mw, isBlocked } = makeMiddleware({});
    const store = await run(mw, reqWith());
    expect(isBlocked).not.toHaveBeenCalled();
    expect(store?.organizationId).toBeUndefined();
  });

  it('still narrows by the x-workspace-id selector within the active tenant (S3)', async () => {
    const { mw } = makeMiddleware({ activeOrganizationId: 'orgA', blocked: false });
    const store = await run(mw, reqWith({ 'x-workspace-id': 'ws7' }));
    expect(store?.organizationId).toBe('orgA');
    expect(store?.workspaceId).toBe('ws7');
  });

  it('passes straight through (no ALS bind) when the port reports no session context', async () => {
    const { mw, read } = makeMiddleware({ noSession: true });
    const store = await run(mw, reqWith());
    expect(read).toHaveBeenCalled();
    expect(store).toBeUndefined();
  });
});

describe('TenantIsolationMiddleware · S6 user suspension fail-closed (deny-list · 全局失能)', () => {
  it('binds NEITHER tenant NOR identity for a suspended user (all layers red)', async () => {
    const { mw, userIsBlocked } = makeMiddleware({
      activeOrganizationId: 'orgA',
      userId: 'u1',
      userBlocked: true,
    });
    const store = await run(mw, reqWith());
    expect(userIsBlocked).toHaveBeenCalledWith('u1');
    expect(store?.organizationId).toBeUndefined();
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
    expect(store?.organizationId).toBe('orgA');
    expect(store?.userId).toBe('u1');
  });
});
