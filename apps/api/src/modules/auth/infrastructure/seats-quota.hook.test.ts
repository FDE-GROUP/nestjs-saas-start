import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Invitation } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import type { EntityManager } from '@mikro-orm/core';
import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import { createSeatsQuotaPlugin, type SeatsQuotaHookDeps } from './seats-quota.hook';

/**
 * 假 Mikro 连接面（ORM 修宪案 B 切片 3d·S-d3）：`mikro.fork()` 返一个只实现 `findOne` 的假 `em`。
 * invitation 读从旧 ORM `select().from().where().limit()` 改走 `em.findOne(Invitation,…,{fields})`，
 * 命中行→返回首行（否则 `null`）——行为与旧版非弱化对齐（同一裁决口径·仅换数据通道）。
 */
function fakeMikro(row: { organizationId: string; status: string } | null) {
  const findOne = vi.fn().mockResolvedValue(row);
  const em = { findOne } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return { findOne, fork, mikro };
}

function makeDeps(opts: {
  row?: { organizationId: string; status: string } | null;
  verdict?: { ok: boolean; used: number; limit: number };
}) {
  const { findOne, fork, mikro } = fakeMikro(opts.row ?? null);
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
    it('超限 → 402（S7 assertSeats 同口径错误体）', async () => {
      const { deps, checkSeats } = makeDeps({
        row: { organizationId: 'org-1', status: 'pending' },
        verdict: { ok: false, used: 5, limit: 5 },
      });
      const { handler } = getHook(deps);
      const error = await captureError(handler, {
        path: '/organization/accept-invitation',
        body: { invitationId: 'inv-1' },
      });
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(402);
      expect(checkSeats).toHaveBeenCalledWith('org-1', 1);
    });

    it('未超限 → 放行', async () => {
      const { deps, checkSeats } = makeDeps({
        row: { organizationId: 'org-1', status: 'pending' },
        verdict: { ok: true, used: 2, limit: 5 },
      });
      const { handler } = getHook(deps);
      await expect(
        handler({ path: '/organization/accept-invitation', body: { invitationId: 'inv-1' } }),
      ).resolves.not.toThrow();
      expect(checkSeats).toHaveBeenCalledWith('org-1', 1);
    });

    it('读侧投影：仅取 organizationId/status（invitation 属 tenants 上下文·读宽松·不越 SELECT 面）', async () => {
      const { deps, findOne, fork } = makeDeps({
        row: { organizationId: 'org-1', status: 'pending' },
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

    it('邀请不存在/已消费 → 放行交由 BA 自身错误路径（配额层不越权裁决）', async () => {
      const cases: Array<{ organizationId: string; status: string } | null> = [
        null,
        { organizationId: 'org-1', status: 'accepted' },
      ];
      for (const row of cases) {
        const { deps, checkSeats } = makeDeps({ row });
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

    it('防御预留通道按 body.organizationId 裁决', async () => {
      const { deps, checkSeats } = makeDeps({ verdict: { ok: false, used: 5, limit: 5 } });
      const { handler } = getHook(deps);
      const error = await captureError(handler, {
        path: '/organization/add-member',
        body: { organizationId: 'org-9' },
      });
      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe(402);
      expect(checkSeats).toHaveBeenCalledWith('org-9', 1);
      // 无 organizationId 的预留通道请求：放行（现网无此 HTTP 路由，server-only 调用不经 hook）
      await expect(handler({ path: '/organization/add-member', body: {} })).resolves.not.toThrow();
    });
  });
});
