import type { PermissionListPredicate } from '@core/saas-kit/authorization/permission.port';
import type { Page } from '@core/saas-kit/shared-kernel/domain/pagination';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRecord } from '../../../domain/repositories/workspace.repository';
import type { WorkspaceReadModel } from '../../read-models/workspace.read-model';
import { ListWorkspacesQuery } from '../list-workspaces.query';
import { ListWorkspacesQueryHandler } from './list-workspaces.query-handler';

/**
 * workspaces 列表 query handler 锁测（module-rbac-query-level-filtering 切片 C·人裁③⑤）：
 * 锁定 handler 携 ALS `{tenantId, role, userId, organizationId}` 取 `listPredicate({action:'read', subject:'Workspace'})`
 * 后的三分支——`all`→透传 (request, undefined)（现状不变）/ `where`→下推实例谓词 /
 * `none`→短路空页**不触 port**（fail-closed·绝不回退全量）。
 * rehierarchy 切片 C 换轴：谓词入参主轴从 organizationId 升 tenantId（租级角色）。
 * 第三次复裁 切片 2（D1）：ALS 活动 organizationId 一并透传供 org-scoped grant 适用集裁决。
 */

const ctx = { tenantId: 'tenantA', organizationId: 'orgA', userId: 'u1', role: 'editor' };

function makeHandler(predicate: PermissionListPredicate) {
  const page: Page<WorkspaceRecord> = { items: [], total: 0, limit: 7, offset: 3 };
  const list = vi.fn().mockResolvedValue(page);
  const listPredicate = vi.fn().mockResolvedValue(predicate);
  const tenant = new TenantIsolationService();
  const handler = new ListWorkspacesQueryHandler(
    { list } as never,
    { listPredicate } as never,
    tenant,
  );
  return { handler, list, listPredicate, tenant, page };
}

describe('ListWorkspacesQueryHandler · listPredicate 三分支下推（切片 C）', () => {
  const request = { limit: 7, offset: 3 };

  it('all → 携 ALS 事实取谓词，透传 (request, undefined) 并原样交回 Page 信封', async () => {
    const { handler, list, listPredicate, tenant, page } = makeHandler({ kind: 'all' });

    const result = await tenant.run(ctx, () => handler.execute(new ListWorkspacesQuery(request)));

    expect(listPredicate).toHaveBeenCalledWith({
      tenantId: 'tenantA',
      role: 'editor',
      userId: 'u1',
      organizationId: 'orgA',
      action: 'read',
      subject: 'Workspace',
    });
    expect(list).toHaveBeenCalledWith(request, undefined);
    expect(result).toBe(page as Page<WorkspaceReadModel>);
  });

  it('where → 实例谓词作第二参下推 port（仓储层再与 tenantId 主轴合并）', async () => {
    const where = { $or: [{ ownerId: 'u1' }, { teamId: { $in: ['t1', 't2'] } }] };
    const { handler, list, tenant } = makeHandler({ kind: 'where', where });

    await tenant.run(ctx, () => handler.execute(new ListWorkspacesQuery(request)));

    expect(list).toHaveBeenCalledWith(request, where);
  });

  it('none → 空页信封（total 0·limit/offset 循请求）且绝不触 port（fail-closed 不查库）', async () => {
    const { handler, list, tenant } = makeHandler({ kind: 'none' });

    const result = await tenant.run(ctx, () => handler.execute(new ListWorkspacesQuery(request)));

    expect(list).not.toHaveBeenCalled();
    expect(result).toEqual({ items: [], total: 0, limit: 7, offset: 3 });
  });

  it('无租户上下文（ALS 空）→ 谓词入参 tenantId/role/userId/organizationId 皆 undefined，归 none 即空页', async () => {
    const { handler, list, listPredicate } = makeHandler({ kind: 'none' });

    const result = await handler.execute(new ListWorkspacesQuery(request));

    expect(listPredicate).toHaveBeenCalledWith({
      tenantId: undefined,
      role: undefined,
      userId: undefined,
      organizationId: undefined,
      action: 'read',
      subject: 'Workspace',
    });
    expect(list).not.toHaveBeenCalled();
    expect(result).toEqual({ items: [], total: 0, limit: 7, offset: 3 });
  });
});
