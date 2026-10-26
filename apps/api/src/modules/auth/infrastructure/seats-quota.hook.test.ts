import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Invitation,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import type { EntityManager } from '@mikro-orm/core';
import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import { createSeatsQuotaPlugin, type SeatsQuotaHookDeps } from './seats-quota.hook';

/**
 * 假 Mikro 连接面（ORM 修宪案 B 切片 3d·S-d3 + rehierarchy 切片 D）：`mikro.fork()` 返一个只实现
 * `findOne` 的假 `em`，**按实体分派**——`Invitation` 返回邀请行、`Organization` 返回租户归属行
 * （目标租户经 `organization.tenantId` 派生·不取 invitation.tenantId）。命中行→返回、否则 `null`。
 */
function fakeMikro(
  invitation: { organizationId: string; status: string } | null,
  org: { tenantId: string | null } | null,
) {
  const findOne = vi.fn(
    async (entity: unknown, _where?: Record<string, unknown>, _options?: { fields?: string[] }) => {
      if (entity === Invitation) return invitation;
      if (entity === Organization) return org;
      return null;
    },
  );
  const em = { findOne } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return { findOne, fork, mikro };
}

function makeDeps(opts: {
  invitation?: { organizationId: string; status: string } | null;
  org?: { tenantId: string | null } | null;
  verdict?: { ok: boolean; used: number; limit: number };
}) {
  const { findOne, fork, mikro } = fakeMikro(opts.invitation ?? null, opts.org ?? null);
  const checkSeats = vi.fn().mockResolvedValue(opts.verdict ?? { ok: true, used: 1, limit: 5 });
  const deps: SeatsQuotaHookDeps = {
    mikro,
    quota: { checkSeats } as unknown as SeatsQuotaHookDeps['quota'],
  };
  return { deps, findOne, fork, checkSeats };
}

function getHook(deps: SeatsQuotaHookDeps) {
  const plugin = createSeatsQuotaPlugin(deps);
  const hook = plugin.hooks?.before?.[0];
  if (!hook) throw new Error('seats-quota plugin before-hook missing');
  return hook as unknown as {
    matcher: (ctx: { path?: string }) => boolean;
    handler: (ctx: { path?: string; body?: unknown }) => Promise<unknown>;
  };
}

/** 执行 handler 并捕获抛错（APIError 实例断言需拿原始对象查 status）。 */
async function captureError(
  handler: (ctx: { path?: string; body?: unknown }) => Promise<unknown>,
  ctx: { path?: string; body?: unknown },
): Promise<unknown> {
  try {
    await handler(ctx);
    return null;
  } catch (error) {
    return error;
  }
}

describe('seats-quota plugin hook（S7 收尾·BA 成员增量配额接线）', () => {
  describe('matcher 命中面', () => {
    const { deps } = makeDeps({});
    const { matcher } = getHook(deps);

    it('命中 accept-invitation（现网唯一真实入组通道）与防御预留字面量', () => {
      expect(matcher({ path: '/organization/accept-invitation' })).toBe(true);
      expect(matcher({ path: '/organization/add-member' })).toBe(true);
      expect(matcher({ path: '/organization/add-team-member' })).toBe(true);
    });

    it('不命中非成员增量端点（宁漏勿误伤）', () => {
      expect(matcher({ path: '/organization/remove-member' })).toBe(false);
      expect(matcher({ path: '/organization/update-member-role' })).toBe(false);
      expect(matcher({ path: '/organization/invite-member' })).toBe(false);
      expect(matcher({ path: '/organization/list-members' })).toBe(false);
      expect(matcher({ path: '/sign-in/email' })).toBe(false);
      expect(matcher({})).toBe(false);
    });
  });

  describe('handler 裁决面', () => {
    it('超限 → 402（S7 assertSeats 同口径错误体·目标租户经 organization.tenantId 派生）', async () => {
      const { deps, checkSeats } = makeDeps({
        invitation: { organizationId: 'org-1', status: 'pending' },
        org: { tenantId: 'tenant-1' },
        verdict: { ok: false, used: 5, limit: 5 },
      });
      const { handler } = getHook(deps);
      const error = await captureError(handler, {
        path: '/organization/accept-invitation',
        body: { invitationId: 'inv-1' },
      });
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(402);
      expect(checkSeats).toHaveBeenCalledWith('tenant-1', 1);
    });

    it('未超限 → 放行', async () => {
      const { deps, checkSeats } = makeDeps({
        invitation: { organizationId: 'org-1', status: 'pending' },
        org: { tenantId: 'tenant-1' },
        verdict: { ok: true, used: 2, limit: 5 },
      });
      const { handler } = getHook(deps);
      await expect(
        handler({ path: '/organization/accept-invitation', body: { invitationId: 'inv-1' } }),
      ).resolves.not.toThrow();
      expect(checkSeats).toHaveBeenCalledWith('tenant-1', 1);
    });

    it('读侧投影：邀请仅取 organizationId/status（目标租户再经 organization.tenantId 派生）', async () => {
      const { deps, findOne, fork } = makeDeps({
        invitation: { organizationId: 'org-1', status: 'pending' },
        org: { tenantId: 'tenant-1' },
      });
      const { handler } = getHook(deps);
      await handler({ path: '/organization/accept-invitation', body: { invitationId: 'inv-1' } });
      // 懒 fork：仅在命中 matcher 的请求内建 em（保 DB-free 不变量）。
      expect(fork).toHaveBeenCalledTimes(1);
      const [entity, where, options] = findOne.mock.calls[0] as [
        unknown,
        Record<string, unknown>,
        { fields: string[] },
      ];
      expect(entity).toBe(Invitation);
      expect(where).toEqual({ id: 'inv-1' });
      expect(options.fields).toEqual(['organizationId', 'status']);
    });

    it('目标组织无租户归属（organization.tenantId null）→ 放行（配额层不越权裁决）', async () => {
      const { deps, checkSeats } = makeDeps({
        invitation: { organizationId: 'org-1', status: 'pending' },
        org: { tenantId: null },
      });
      const { handler } = getHook(deps);
      await expect(
        handler({ path: '/organization/accept-invitation', body: { invitationId: 'inv-1' } }),
      ).resolves.not.toThrow();
      expect(checkSeats).not.toHaveBeenCalled();
    });

    it('邀请不存在/已消费 → 放行交由 BA 自身错误路径（配额层不越权裁决）', async () => {
      const cases: Array<{ organizationId: string; status: string } | null> = [
        null,
        { organizationId: 'org-1', status: 'accepted' },
      ];
      for (const invitation of cases) {
        const { deps, checkSeats } = makeDeps({ invitation, org: { tenantId: 'tenant-1' } });
        const { handler } = getHook(deps);
        await expect(
          handler({ path: '/organization/accept-invitation', body: { invitationId: 'inv-x' } }),
        ).resolves.not.toThrow();
        expect(checkSeats).not.toHaveBeenCalled();
      }
    });

    it('body 缺失/畸形 → 放行（不代 BA 做 400 裁决）', async () => {
      const { deps, checkSeats } = makeDeps({});
      const { handler } = getHook(deps);
      await expect(
        handler({ path: '/organization/accept-invitation', body: undefined }),
      ).resolves.not.toThrow();
      await expect(
        handler({ path: '/organization/accept-invitation', body: {} }),
      ).resolves.not.toThrow();
      expect(checkSeats).not.toHaveBeenCalled();
    });

    it('防御预留通道按 body.tenantId 裁决', async () => {
      const { deps, checkSeats } = makeDeps({ verdict: { ok: false, used: 5, limit: 5 } });
      const { handler } = getHook(deps);
      const error = await captureError(handler, {
        path: '/organization/add-member',
        body: { tenantId: 'org-9' },
      });
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(402);
      expect(checkSeats).toHaveBeenCalledWith('org-9', 1);
      // 无 tenantId 的预留通道请求：放行（现网无此 HTTP 路由，server-only 调用不经 hook）
      await expect(handler({ path: '/organization/add-member', body: {} })).resolves.not.toThrow();
    });
  });
});
