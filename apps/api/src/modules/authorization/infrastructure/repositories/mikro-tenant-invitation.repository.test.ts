import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantInvitation } from '../entities/rbac.entities';
import { MikroTenantInvitationManager } from './mikro-tenant-invitation.repository';

/**
 * 租级邀请自适配测（global-role-membership-tenantization 切片 D·个人通道换锚自有 `tenant_invitation`）：
 * 锁 `listPendingByEmail`（跨租·scoped:false·过期内存滤）与 `rejectForEmail`（**fail-closed 受邀邮箱匹配**·
 * 大小写不敏感·非 pending/不符一律 notFound 不泄露他邮箱邀请存在性）两新增面的守卫语义。
 * fake em 按 `find`/`findOne` 返回预置行，断言不触库即可锁逻辑（真库落行由 gated e2e 覆盖）。
 */
interface Row {
  id: string;
  tenantId: string;
  email: string;
  roleKey: string;
  invitorId: string | null;
  status: string;
  token: string;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

function row(over: Partial<Row>): Row {
  return {
    id: 'inv-1',
    tenantId: 't1',
    email: 'a@b.c',
    roleKey: 'member',
    invitorId: null,
    status: 'pending',
    token: 'tk',
    expiresAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: null,
    ...over,
  };
}

function makeManager(opts: { findRows?: Row[]; findOneRow?: Row | null } = {}) {
  const find = vi.fn(async () => opts.findRows ?? []);
  const findOne = vi.fn(async () => opts.findOneRow ?? null);
  const assign = vi.fn((entity: object, dto: Record<string, unknown>) =>
    Object.assign(entity, dto),
  );
  const flush = vi.fn(async () => {});
  const em = { find, findOne, assign, flush } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return { mgr: new MikroTenantInvitationManager(mikro), find, findOne, assign, flush, fork };
}

describe('MikroTenantInvitationManager · 个人通道面（切片 D 换锚）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('listPendingByEmail 以 scoped:false 跨租取 pending 行·内存滤过期·映射为端口视形', async () => {
    const live = row({ id: 'i1', email: 'me@acme.com' });
    const expired = row({ id: 'i2', email: 'me@acme.com', expiresAt: new Date(Date.now() - 1000) });
    const { mgr, find, fork } = makeManager({ findRows: [live, expired] });

    const result = await mgr.listPendingByEmail('me@acme.com');

    expect(fork).toHaveBeenCalledWith({ scoped: false });
    expect(find).toHaveBeenCalledWith(TenantInvitation, {
      email: 'me@acme.com',
      status: 'pending',
    });
    expect(result.map((r) => r.id)).toEqual(['i1']);
    expect(result[0]).toMatchObject({
      id: 'i1',
      tenantId: 't1',
      email: 'me@acme.com',
      status: 'pending',
    });
  });

  it('rejectForEmail：pending 且受邀邮箱匹配（大小写不敏感）→ cancelled 并落状态', async () => {
    const pending = row({ id: 'inv-1', email: 'Me@Acme.com' });
    const { mgr, findOne, assign, flush } = makeManager({ findOneRow: pending });

    const result = await mgr.rejectForEmail('inv-1', 'me@acme.com');

    expect(findOne).toHaveBeenCalledWith(TenantInvitation, { id: 'inv-1' });
    expect(result).toBe('cancelled');
    expect(assign).toHaveBeenCalledWith(pending, expect.objectContaining({ status: 'cancelled' }));
    expect(flush).toHaveBeenCalled();
  });

  it('rejectForEmail：受邀邮箱不匹配 → notFound·绝不落行（fail-closed 他人不可代拒）', async () => {
    const pending = row({ id: 'inv-1', email: 'other@acme.com' });
    const { mgr, assign, flush } = makeManager({ findOneRow: pending });

    await expect(mgr.rejectForEmail('inv-1', 'me@acme.com')).resolves.toBe('notFound');
    expect(assign).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('rejectForEmail：非 pending（已消费）→ notFound·不落行', async () => {
    const consumed = row({ id: 'inv-1', email: 'me@acme.com', status: 'accepted' });
    const { mgr, flush } = makeManager({ findOneRow: consumed });

    await expect(mgr.rejectForEmail('inv-1', 'me@acme.com')).resolves.toBe('notFound');
    expect(flush).not.toHaveBeenCalled();
  });

  it('rejectForEmail：行缺席 → notFound', async () => {
    const { mgr } = makeManager({ findOneRow: null });
    await expect(mgr.rejectForEmail('missing', 'me@acme.com')).resolves.toBe('notFound');
  });
});
