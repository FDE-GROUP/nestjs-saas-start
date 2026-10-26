import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizationProvisioningRepository } from '../../../domain/repositories/organization-provisioning.repository';
import { RejectOrganizationCommand } from '../reject-organization.command';
import { RejectOrganizationCommandHandler } from './reject-organization.command-handler';

function makeHandler(
  read: ReturnType<typeof vi.fn>,
  remove: ReturnType<typeof vi.fn>,
  opts: { publishError?: Error } = {},
) {
  const audit = { logOrganizationGovernance: vi.fn() };
  const published: DomainEvent[] = [];
  const publisher = {
    publishAll: vi.fn(async (events: readonly DomainEvent[]) => {
      if (opts.publishError) throw opts.publishError;
      published.push(...events);
    }),
  } as unknown as DomainEventPublisher;
  const handler = new RejectOrganizationCommandHandler(
    { remove } as unknown as OrganizationProvisioningRepository,
    { read } as unknown as TenantStatusService,
    audit as unknown as PlatformAuditService,
    publisher,
    // ES Phase B 后半：pass-through UoW（单测不开库事务；真事务装配行为由 e2e/relay 验）
    { run: <T>(fn: () => Promise<T>) => fn() },
  );
  return { handler, audit, published, publisher };
}

describe('RejectOrganizationCommandHandler (S4/S5 · FR-1 仅 pending 可驳回 · FR-6 审计)', () => {
  it('deletes an explicit pending organization and audits the transition', async () => {
    const read = vi.fn().mockResolvedValue(ORGANIZATION_STATUS.PENDING);
    const remove = vi.fn().mockResolvedValue(true);
    const { handler, audit, published } = makeHandler(read, remove);
    await expect(handler.execute(new RejectOrganizationCommand('org-1', 'op-1'))).resolves.toBe(
      true,
    );
    expect(remove).toHaveBeenCalledWith('org-1');
    expect(audit.logOrganizationGovernance).toHaveBeenCalledWith('reject', 'org-1', 'op-1', {
      from: ORGANIZATION_STATUS.PENDING,
      to: ORGANIZATION_STATUS.DELETED,
      error: undefined,
    });
    // ES 第四切片：硬删成功产出唯一耐久痕迹（org 行消失后「存在过并被驳回」）
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      aggregateType: 'tenant',
      aggregateId: 'org-1',
      eventType: 'tenant.rejected',
      eventVersion: 1,
      // PII 边界：只留审计事实，不携 name/slug/reason（命令无此字段）
      payload: { actorId: 'op-1' },
    });
    expect(typeof published[0].eventId).toBe('string');
  });

  it('misses (controller → 404) and audits when nothing is removed', async () => {
    const read = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(false);
    const { handler, audit, published } = makeHandler(read, remove);
    await expect(handler.execute(new RejectOrganizationCommand('ghost', 'op-1'))).resolves.toBe(
      false,
    );
    expect(audit.logOrganizationGovernance).toHaveBeenCalledWith('reject', 'ghost', 'op-1', {
      from: undefined,
      to: ORGANIZATION_STATUS.DELETED,
      error: 'not_found',
    });
    // 无事实不发：未命中行零事件
    expect(published).toHaveLength(0);
  });

  it('rejects a non-pending (e.g. active) tenant with 409 without deleting', async () => {
    const read = vi.fn().mockResolvedValue(ORGANIZATION_STATUS.ACTIVE);
    const remove = vi.fn();
    const { handler, audit, published } = makeHandler(read, remove);
    await expect(
      handler.execute(new RejectOrganizationCommand('org-1', 'op-1')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(remove).not.toHaveBeenCalled();
    expect(audit.logOrganizationGovernance).toHaveBeenCalledWith('reject', 'org-1', 'op-1', {
      from: ORGANIZATION_STATUS.ACTIVE,
      error: 'not_pending',
    });
    expect(published).toHaveLength(0);
  });

  it('fails loud when publishing fails after hard delete（宁缺勿错发·错误不吞）', async () => {
    const read = vi.fn().mockResolvedValue(ORGANIZATION_STATUS.PENDING);
    const remove = vi.fn().mockResolvedValue(true);
    const { handler } = makeHandler(read, remove, { publishError: new Error('append blew up') });
    await expect(handler.execute(new RejectOrganizationCommand('org-1', 'op-1'))).rejects.toThrow(
      'append blew up',
    );
    // 删先行、发布在后：非事务窗口与系列切片同语义（如实反映，不做补偿）
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
