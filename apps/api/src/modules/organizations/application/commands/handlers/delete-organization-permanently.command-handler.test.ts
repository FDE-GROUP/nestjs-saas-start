import {
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import type { UnitOfWork } from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type {
  OrganizationGovernanceRepository,
  PlatformTenantDetail,
} from '../../../domain/repositories/organization-governance.repository';
import { DeleteOrganizationPermanentlyCommand } from '../delete-organization-permanently.command';
import { DeleteOrganizationPermanentlyCommandHandler } from './delete-organization-permanently.command-handler';

/**
 * 硬删租户 handler 单测（rehierarchy 片一 治理台改锚 tenant）：锁租户连带编排——
 * `findTenantDetail` 一次取准入态（前置闸）+ 名下组织名册（事件双维补删：tenantId + 每 orgId），
 * ①补删 + ②`destroyTenant` 包单 `uow.run`（原子接线·真回滚由 gated e2e 锁）。
 */
/** 调用序记录（坐实「先补删事件、后连带删主行」的顺序契约）。 */
const calls: string[] = [];
const state = {
  detail: undefined as PlatformTenantDetail | undefined,
  purgedOrgs: 2,
};

const findTenantDetail: Mock = vi.fn();
const destroyTenant: Mock = vi.fn();
const deleteByAggregate: Mock = vi.fn();
const logOrganizationGovernance: Mock = vi.fn();
const run: Mock = vi.fn();

const governance = {
  findTenantDetail,
  destroyTenant,
} as unknown as OrganizationGovernanceRepository;
const eventStore = { deleteByAggregate } as unknown as EventStore;
const audit = { logOrganizationGovernance } as unknown as PlatformAuditService;
// #2 甲档 uow 透传替身：`run(fn)` 直执行 fn（真事务回滚由 gated e2e 锁；本单测锁「①② 包进 run」的接线与 reject 传播）。
const uow = { run } as unknown as UnitOfWork;

const handler = new DeleteOrganizationPermanentlyCommandHandler(governance, eventStore, audit, uow);

function tenantDetail(
  tenantId: string,
  status: TenantStatus,
  orgIds: string[],
): PlatformTenantDetail {
  return {
    tenantId,
    name: tenantId,
    slug: tenantId,
    status,
    createdAt: new Date(),
    organizations: orgIds.map((id) => ({
      organizationId: id,
      name: id,
      slug: id,
      status,
      odooCompanyId: null,
      odooBindingStatus: null,
      odooCompanyName: null,
    })),
  } as PlatformTenantDetail;
}

describe('DeleteOrganizationPermanentlyCommandHandler (NFR-6 删除半 · 租户连带)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    // 基础实现每次重建（clearAllMocks 不复位 implementation，跨用例覆盖会污染后续）
    findTenantDetail.mockImplementation(async (id: string) => {
      calls.push('findTenantDetail');
      return state.detail ? tenantDetail(id, state.detail.status, ['orgA', 'orgB']) : undefined;
    });
    // 每聚合补删 1 行：tenantId + 每 orgId（名下 2 org）→ 合计 3（顺序契约·双维）。
    deleteByAggregate.mockImplementation(async () => {
      calls.push('purgeEvents');
      return 1;
    });
    destroyTenant.mockImplementation(async () => {
      calls.push('destroyTenant');
      return { purgedOrgs: state.purgedOrgs };
    });
    run.mockImplementation((fn: () => Promise<unknown>) => {
      calls.push('uow');
      return fn();
    });
    state.detail = tenantDetail('tenantA', TENANT_STATUS.DELETED, ['orgA', 'orgB']);
    state.purgedOrgs = 2;
  });

  it('deleted 终态：先双维补删事件后连带删主行，返回 purgedOrgs/purgedEvents 并落成功审计', async () => {
    const result = await handler.execute(
      new DeleteOrganizationPermanentlyCommand('tenantA', 'op1'),
    );
    // 顺序契约（§3.1·①② 同经 uow.run）：读态 → run → 租户 + 每 org 补删 → 连带删主行。
    expect(calls).toEqual([
      'findTenantDetail',
      'uow',
      'purgeEvents',
      'purgeEvents',
      'purgeEvents',
      'destroyTenant',
    ]);
    expect(result).toEqual({ tenantId: 'tenantA', purgedOrgs: 2, purgedEvents: 3 });
    // 事件双维补删（假设④）：租户本体 + 名下每组织各一次。
    expect(deleteByAggregate).toHaveBeenCalledWith('tenant', 'tenantA');
    expect(deleteByAggregate).toHaveBeenCalledWith('tenant', 'orgA');
    expect(deleteByAggregate).toHaveBeenCalledWith('tenant', 'orgB');
    expect(logOrganizationGovernance).toHaveBeenCalledWith(
      'hard_delete',
      'tenantA',
      'op1',
      expect.objectContaining({ from: TENANT_STATUS.DELETED }),
    );
  });

  it('非 deleted 终态（active）→ 409 前置闸，绝不触事件/连带删', async () => {
    state.detail = tenantDetail('tenantA', TENANT_STATUS.ACTIVE, ['orgA']);
    await expect(
      handler.execute(new DeleteOrganizationPermanentlyCommand('tenantA', 'op1')),
    ).rejects.toThrow(ConflictException);
    expect(calls).toEqual(['findTenantDetail']);
    expect(logOrganizationGovernance).toHaveBeenCalledWith(
      'hard_delete',
      'tenantA',
      'op1',
      expect.objectContaining({ error: 'not_deleted_terminal' }),
    );
  });

  it('租户不存在 → null（404 幂等），无任何删除动作', async () => {
    state.detail = undefined;
    await expect(
      handler.execute(new DeleteOrganizationPermanentlyCommand('ghost', 'op1')),
    ).resolves.toBeNull();
    expect(calls).toEqual(['findTenantDetail']);
  });

  it('事件补删失败 fail-loud：主行不删，租户仍在可整请求重试', async () => {
    deleteByAggregate.mockImplementation(async () => {
      calls.push('purgeEvents');
      throw new Error('db down');
    });
    await expect(
      handler.execute(new DeleteOrganizationPermanentlyCommand('tenantA', 'op1')),
    ).rejects.toThrow('db down');
    expect(calls).toEqual(['findTenantDetail', 'uow', 'purgeEvents']); // destroyTenant 未被触达
  });

  it('#2 甲档：①② 包单 uow.run；②连带删主行失败 → uow 传播 reject（无部分提交）', async () => {
    destroyTenant.mockImplementation(async () => {
      calls.push('destroyTenant');
      throw new Error('fk violation');
    });
    await expect(
      handler.execute(new DeleteOrganizationPermanentlyCommand('tenantA', 'op1')),
    ).rejects.toThrow('fk violation');
    expect(run).toHaveBeenCalledTimes(1); // ①② 确经单 uow.run 包裹（原子接线·真回滚由 e2e 锁）
    expect(calls).toEqual([
      'findTenantDetail',
      'uow',
      'purgeEvents',
      'purgeEvents',
      'purgeEvents',
      'destroyTenant',
    ]);
  });

  it('并发窗口：状态检查后主行已被删（purgedOrgs=0）→ null + already_gone 审计', async () => {
    state.purgedOrgs = 0;
    await expect(
      handler.execute(new DeleteOrganizationPermanentlyCommand('tenantA', 'op1')),
    ).resolves.toBeNull();
    expect(logOrganizationGovernance).toHaveBeenCalledWith(
      'hard_delete',
      'tenantA',
      'op1',
      expect.objectContaining({ error: 'already_gone' }),
    );
  });
});
