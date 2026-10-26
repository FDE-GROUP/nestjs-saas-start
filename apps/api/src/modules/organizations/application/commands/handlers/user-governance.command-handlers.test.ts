import type { AuthSessionStore } from '@app/modules/auth/domain/ports/session-store.port';
import { TENANCY_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import {
  USER_STATUS,
  type UserStatusService,
} from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import type { UnitOfWork } from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ResumeUserCommand } from '../resume-user.command';
import { SuspendUserCommand } from '../suspend-user.command';
import { ResumeUserCommandHandler } from './resume-user.command-handler';
import { SuspendUserCommandHandler } from './suspend-user.command-handler';

function deps(result: unknown) {
  const transition = vi.fn().mockResolvedValue(result);
  const audit = { logUserGovernance: vi.fn() };
  // 架构精度修宪 S3：session 删走 AUTH_SESSION_STORE 端口；uow fake 记录作用域时序
  // （锁「状态迁移与 session 删同事务关键段」——删除必须在 tx-begin/tx-end 之间）。
  const order: string[] = [];
  transition.mockImplementation(async () => {
    order.push('transition');
    return result;
  });
  const deleteAllForUser = vi.fn(async () => {
    order.push('session-delete');
    return 1;
  });
  const sessions = { deleteAllForUser } as unknown as AuthSessionStore;
  const uow = {
    run: async <T>(fn: () => Promise<T>): Promise<T> => {
      order.push('tx-begin');
      try {
        return await fn();
      } finally {
        order.push('tx-end');
      }
    },
  } as unknown as UnitOfWork;
  return {
    transition,
    status: { transition } as unknown as UserStatusService,
    audit: audit as unknown as PlatformAuditService,
    auditSpy: audit.logUserGovernance,
    deleteAllForUser,
    sessions,
    uow,
    order,
  };
}

describe('SuspendUserCommandHandler (S6 · FR-10 暂停 + session 硬删)', () => {
  it('transitions to suspended, deletes sessions, and audits', async () => {
    const d = deps({
      kind: 'ok',
      previous: TENANCY_STATUS.ACTIVE,
      status: USER_STATUS.SUSPENDED,
    });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.uow, d.sessions);
    await expect(handler.execute(new SuspendUserCommand('u1', 'op-1', 'fraud'))).resolves.toEqual({
      userId: 'u1',
      status: USER_STATUS.SUSPENDED,
    });
    expect(d.transition).toHaveBeenCalledWith('u1', USER_STATUS.SUSPENDED, {
      reason: 'fraud',
      actorId: 'op-1',
    });
    expect(d.deleteAllForUser).toHaveBeenCalledWith('u1'); // FR-10 immediate session invalidation
    // S3 原子性锁：迁移与 session 删同处一个 uow 关键段（时序 tx-begin → transition → session-delete → tx-end）
    expect(d.order).toEqual(['tx-begin', 'transition', 'session-delete', 'tx-end']);
    expect(d.auditSpy).toHaveBeenCalledWith('suspend', 'u1', 'op-1', {
      from: TENANCY_STATUS.ACTIVE,
      to: USER_STATUS.SUSPENDED,
      reason: 'fraud',
    });
  });

  it('returns null on not-found without deleting sessions or auditing', async () => {
    const d = deps({ kind: 'not-found' });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.uow, d.sessions);
    await expect(handler.execute(new SuspendUserCommand('ghost', 'op-1'))).resolves.toBeNull();
    expect(d.deleteAllForUser).not.toHaveBeenCalled();
    expect(d.auditSpy).not.toHaveBeenCalled();
  });

  it('409s + audits an illegal transition and does NOT delete sessions', async () => {
    const d = deps({
      kind: 'illegal',
      from: TENANCY_STATUS.DELETED,
      to: USER_STATUS.SUSPENDED,
    });
    const handler = new SuspendUserCommandHandler(d.status, d.audit, d.uow, d.sessions);
    await expect(handler.execute(new SuspendUserCommand('u1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(d.deleteAllForUser).not.toHaveBeenCalled();
    expect(d.auditSpy).toHaveBeenCalledWith('suspend', 'u1', 'op-1', {
      from: TENANCY_STATUS.DELETED,
      to: USER_STATUS.SUSPENDED,
      error: 'illegal_transition',
    });
  });
});

describe('ResumeUserCommandHandler (S6 · FR-10 恢复·不重建 session)', () => {
  it('transitions suspended → active and audits (no session delete side-effect)', async () => {
    const d = deps({
      kind: 'ok',
      previous: TENANCY_STATUS.SUSPENDED,
      status: USER_STATUS.ACTIVE,
    });
    const handler = new ResumeUserCommandHandler(d.status, d.audit);
    await expect(handler.execute(new ResumeUserCommand('u1', 'op-1'))).resolves.toEqual({
      userId: 'u1',
      status: USER_STATUS.ACTIVE,
    });
    expect(d.transition).toHaveBeenCalledWith('u1', USER_STATUS.ACTIVE, { actorId: 'op-1' });
    expect(d.auditSpy).toHaveBeenCalledWith('resume', 'u1', 'op-1', {
      from: TENANCY_STATUS.SUSPENDED,
      to: USER_STATUS.ACTIVE,
    });
  });

  it('409s + audits an illegal resume (active user is a no-op edge? deleted is terminal)', async () => {
    const d = deps({
      kind: 'illegal',
      from: TENANCY_STATUS.DELETED,
      to: USER_STATUS.ACTIVE,
    });
    const handler = new ResumeUserCommandHandler(d.status, d.audit);
    await expect(handler.execute(new ResumeUserCommand('u1', 'op-1'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(d.auditSpy).toHaveBeenCalledWith('resume', 'u1', 'op-1', {
      from: TENANCY_STATUS.DELETED,
      to: USER_STATUS.ACTIVE,
      error: 'illegal_transition',
    });
  });
});
