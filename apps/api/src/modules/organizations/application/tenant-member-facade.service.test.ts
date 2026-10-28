import type { RoleAssignabilityReader } from '@app/modules/authorization/domain/ports/role-assignability.port';
import type { TenantInvitationManager } from '@app/modules/authorization/domain/ports/tenant-invitation.port';
import type { TenantMembershipManager } from '@app/modules/authorization/domain/ports/tenant-membership.port';
import type { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaMemberDirectoryWriter } from '../domain/repositories/ba-member-writer.repository';
import { TenantMemberFacadeService } from './tenant-member-facade.service';

/**
 * 租级成员门面单测（切片 G）：锁 G1（`leaveSelf`/`removeMember` 撤权撤席 + BA 双轴同步）与
 * G3（`acceptInvitation` 经 `admitAtomically` 单事务原子入租的 HTTP 译码）。DB-free：仅验门面编排契约。
 */
type MockFn = ReturnType<typeof vi.fn>;
type Stub = {
  facade: TenantMemberFacadeService;
  members: Record<string, MockFn>;
  invitations: Record<string, MockFn>;
  baMembers: Record<string, MockFn>;
  quota: Record<string, MockFn>;
};

function makeStub(): Stub {
  const ctx = {
    requireActiveTenantId: vi.fn().mockReturnValue('t1'),
    get: vi.fn().mockReturnValue({ userId: 'actor-1' }),
  } as unknown as TenantIsolationService;
  const members: Stub['members'] = {
    revokeMembership: vi.fn().mockResolvedValue('ok'),
    removeMember: vi.fn().mockResolvedValue('ok'),
    updateMemberRole: vi.fn().mockResolvedValue('ok'),
  };
  const invitations: Stub['invitations'] = {
    findPendingById: vi.fn().mockResolvedValue({
      id: 'inv-1',
      tenantId: 't1',
      email: 'invitee@x.com',
      roleKey: 'member',
    }),
    admitAtomically: vi.fn().mockResolvedValue({
      status: 'accepted',
      tenantId: 't1',
      roleKey: 'member',
    }),
  };
  const roleAssignability = {
    isRoleAssignable: vi.fn().mockResolvedValue(true),
  } as unknown as RoleAssignabilityReader;
  const quota = {
    checkSeats: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 5 }),
  } as unknown as Stub['quota'];
  const baMembers: Stub['baMembers'] = {
    removeAcrossTenant: vi.fn().mockResolvedValue(1),
  };
  const facade = new TenantMemberFacadeService(
    ctx,
    members as unknown as TenantMembershipManager,
    invitations as unknown as TenantInvitationManager,
    roleAssignability,
    quota as unknown as QuotaService,
    baMembers as unknown as BaMemberDirectoryWriter,
  );
  return { facade, members, invitations, baMembers, quota };
}

describe('TenantMemberFacadeService（切片 G 编排）', () => {
  let s: Stub;
  beforeEach(() => {
    vi.clearAllMocks();
    s = makeStub();
  });

  describe('leaveSelf（G1·P1 撤权撤席 + 双轴同步）', () => {
    it('撤租级成员成功 → 连带清 BA member 行', async () => {
      await s.facade.leaveSelf('u-1');
      expect(s.members.revokeMembership).toHaveBeenCalledWith('t1', 'u-1');
      expect(s.baMembers.removeAcrossTenant).toHaveBeenCalledWith('t1', 'u-1');
    });
    it('唯一 owner 拒退 → 403（不清 BA·未撤权）', async () => {
      s.members.revokeMembership.mockResolvedValueOnce('lastOwner');
      await expect(s.facade.leaveSelf('u-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(s.baMembers.removeAcrossTenant).not.toHaveBeenCalled();
    });
    it('非成员 → 404', async () => {
      s.members.revokeMembership.mockResolvedValueOnce('notFound');
      await expect(s.facade.leaveSelf('u-1')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('BA 轴清理失败不回滚（best-effort·撤权既成）', async () => {
      s.baMembers.removeAcrossTenant.mockRejectedValueOnce(new Error('ba write failed'));
      await expect(s.facade.leaveSelf('u-1')).resolves.toBeUndefined();
    });
  });

  describe('removeMember（G1·管理员面同形撤权 + 双轴）', () => {
    it('委派 revoke→ok 后连清 BA member 行', async () => {
      await s.facade.removeMember('u-2');
      expect(s.members.removeMember).toHaveBeenCalledWith('t1', 'u-2', 'actor-1');
      expect(s.baMembers.removeAcrossTenant).toHaveBeenCalledWith('t1', 'u-2');
    });
    it('自移拒 → 403（不清 BA）', async () => {
      s.members.removeMember.mockResolvedValueOnce('self');
      await expect(s.facade.removeMember('u-2')).rejects.toBeInstanceOf(ForbiddenException);
      expect(s.baMembers.removeAcrossTenant).not.toHaveBeenCalled();
    });
    it('最后 owner 拒 → 403', async () => {
      s.members.removeMember.mockResolvedValueOnce('lastOwner');
      await expect(s.facade.removeMember('u-2')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('acceptInvitation（G3·经 admitAtomically 单事务原子入租）', () => {
    const invitee = { userId: 'u-9', email: 'invitee@x.com' };
    it('原子入租成功 → 返回租+角色·席位终裁在锁内（不再分开 checkSeats/ensure/mark）', async () => {
      const out = await s.facade.acceptInvitation('inv-1', invitee);
      expect(s.invitations.admitAtomically).toHaveBeenCalledWith({
        invitationId: 'inv-1',
        email: invitee.email,
        userId: invitee.userId,
        seatsLimit: 5,
      });
      expect(out).toEqual({ tenantId: 't1', roleKey: 'member' });
    });
    it('邮箱不符 → 403 fail-closed（未进原子面）', async () => {
      await expect(
        s.facade.acceptInvitation('inv-1', { userId: 'u-9', email: 'other@x.com' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(s.invitations.admitAtomically).not.toHaveBeenCalled();
    });
    it('锁内超席 overLimit → 402', async () => {
      s.invitations.admitAtomically.mockResolvedValueOnce({ status: 'overLimit' });
      const err = await s.facade.acceptInvitation('inv-1', invitee).catch((e) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(402);
    });
    it('pending 失效/双消费 notFound → 404', async () => {
      s.invitations.admitAtomically.mockResolvedValueOnce({ status: 'notFound' });
      await expect(s.facade.acceptInvitation('inv-1', invitee)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
    it('邀请不存在 → 404（预检）', async () => {
      s.invitations.findPendingById.mockResolvedValueOnce(null);
      await expect(s.facade.acceptInvitation('inv-x', invitee)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
