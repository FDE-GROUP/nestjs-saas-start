import type { PermissionInvalidator } from '@core/saas-kit/authorization/permission.port';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantRbacRepository } from '../domain/repositories/organization-rbac.repository';
import { TenantRbacAdminService } from './organization-rbac-admin.service';

/**
 * 角色/授权管理门面应用服务测（module-rbac-dynamic-roles S3·§2.5/§2.6）。
 * 锁三件事：① 领域结果码 → HTTP 语义转译（invalidKey→400/duplicate→409/notFound→404/
 * systemRoleProtected→409/invalidConditions→400）；② **写成功后才失效投影缓存**（热改生效面·
 * 失败不失效）；③ 成员挂载存在性闸（系统 key 短路不查库·自定义查库 fail-closed）。
 * rehierarchy 切片 C 换轴：分区键/失效锁主轴 `tenantId`（租级角色）·写路径双盖章携 `organizationId`。
 * @Can 授权裁决归守卫链（另片锁测），本测只覆盖服务自身的转译与失效编排。
 */

function makeHarness() {
  const rbac: Record<string, ReturnType<typeof vi.fn>> = {
    listRoles: vi.fn().mockResolvedValue([{ id: 'r1', key: 'editor', name: 'E', isSystem: false }]),
    listRoleKeys: vi.fn().mockResolvedValue(['editor']),
    findRole: vi.fn().mockResolvedValue(null),
    findGrants: vi.fn().mockResolvedValue([]),
    listAllGrantsForRole: vi.fn().mockResolvedValue([]),
    createRole: vi.fn().mockResolvedValue('created'),
    renameRole: vi.fn().mockResolvedValue('ok'),
    deleteRole: vi.fn().mockResolvedValue('ok'),
    grant: vi.fn().mockResolvedValue('granted'),
    revoke: vi.fn().mockResolvedValue('revoked'),
  };
  const invalidate = vi.fn();
  const ctx = {
    requireActiveTenantId: vi.fn().mockReturnValue('tenantA'),
    requireActiveOrganizationId: vi.fn().mockReturnValue('orgA'),
    get: vi.fn().mockReturnValue({ tenantId: 'tenantA', organizationId: 'orgA', userId: 'u1' }),
  } as unknown as TenantIsolationService;
  const svc = new TenantRbacAdminService(
    rbac as unknown as TenantRbacRepository,
    { invalidate } as unknown as PermissionInvalidator,
    ctx,
  );
  return { svc, rbac, invalidate };
}

describe('TenantRbacAdminService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createRole 成功 → 落库后回查视图 + 失效投影（actor 取 ALS userId）', async () => {
    const h = makeHarness();
    h.rbac.findRole.mockResolvedValueOnce({
      id: 'r1',
      key: 'editor',
      name: 'Editor',
      isSystem: false,
    });
    const view = await h.svc.createRole('editor', 'Editor');
    expect(view).toMatchObject({ key: 'editor', isSystem: false });
    expect(h.rbac.createRole).toHaveBeenCalledWith('tenantA', 'orgA', 'editor', 'Editor', 'u1');
    expect(h.invalidate).toHaveBeenCalledWith('tenantA');
  });

  it('createRole：invalidKey→400·duplicate→409·均不失效缓存', async () => {
    const h = makeHarness();
    h.rbac.createRole.mockResolvedValueOnce('invalidKey');
    await expect(h.svc.createRole('Owner', 'x')).rejects.toBeInstanceOf(BadRequestException);
    h.rbac.createRole.mockResolvedValueOnce('duplicate');
    await expect(h.svc.createRole('editor', 'x')).rejects.toBeInstanceOf(ConflictException);
    expect(h.invalidate).not.toHaveBeenCalled();
  });

  it('rename/delete：systemRoleProtected→409·notFound→404·ok→失效', async () => {
    const h = makeHarness();
    h.rbac.renameRole.mockResolvedValueOnce('systemRoleProtected');
    await expect(h.svc.renameRole('owner', 'Boss')).rejects.toBeInstanceOf(ConflictException);
    h.rbac.deleteRole.mockResolvedValueOnce('notFound');
    await expect(h.svc.deleteRole('ghost')).rejects.toBeInstanceOf(NotFoundException);
    await h.svc.deleteRole('editor');
    expect(h.invalidate).toHaveBeenCalledWith('tenantA');
  });

  it('grant：invalidConditions→400·roleNotFound→404·duplicate→409·granted→失效', async () => {
    const h = makeHarness();
    const entry = { subject: 'Workspace' as const, action: 'update' as const, conditions: null };
    h.rbac.grant.mockResolvedValueOnce('invalidConditions');
    await expect(h.svc.grant('editor', entry)).rejects.toBeInstanceOf(BadRequestException);
    h.rbac.grant.mockResolvedValueOnce('roleNotFound');
    await expect(h.svc.grant('ghost', entry)).rejects.toBeInstanceOf(NotFoundException);
    h.rbac.grant.mockResolvedValueOnce('duplicate');
    await expect(h.svc.grant('editor', entry)).rejects.toBeInstanceOf(ConflictException);
    await h.svc.grant('editor', entry);
    expect(h.invalidate).toHaveBeenCalledWith('tenantA');
  });

  it('revoke：roleNotFound/notFound→404·revoked→失效', async () => {
    const h = makeHarness();
    h.rbac.revoke.mockResolvedValueOnce('roleNotFound');
    await expect(h.svc.revoke('ghost', 'Workspace', 'update', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    h.rbac.revoke.mockResolvedValueOnce('notFound');
    await expect(h.svc.revoke('editor', 'Workspace', 'update', null)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await h.svc.revoke('editor', 'Workspace', 'update', null);
    expect(h.invalidate).toHaveBeenCalledWith('tenantA');
  });

  it('getGrants 走 listAllGrantsForRole（全量回显·含 org-scoped 行）·查无角色（null）→ 404', async () => {
    const h = makeHarness();
    h.rbac.listAllGrantsForRole.mockResolvedValueOnce([
      { subject: 'Workspace', action: 'read', conditions: null, organizationId: null },
      { subject: 'Workspace', action: 'update', conditions: null, organizationId: 'orgX' },
    ]);
    const grants = await h.svc.getGrants('editor');
    // P0 X6：管理面回显含 org-scoped 行 + organizationId（非仅通配行）。
    expect(grants).toHaveLength(2);
    expect(grants.map((g) => g.organizationId)).toEqual([null, 'orgX']);
    expect(h.rbac.listAllGrantsForRole).toHaveBeenCalledWith('tenantA', 'editor');
    h.rbac.listAllGrantsForRole.mockResolvedValueOnce(null);
    await expect(h.svc.getGrants('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('grant/revoke 透传 organizationId（P0 X6·org scope → repo）', async () => {
    const h = makeHarness();
    await h.svc.grant('editor', {
      subject: 'Workspace',
      action: 'update',
      conditions: null,
      organizationId: 'orgX',
    });
    expect(h.rbac.grant).toHaveBeenCalledWith(
      'tenantA',
      'orgA',
      'editor',
      { subject: 'Workspace', action: 'update', conditions: null, organizationId: 'orgX' },
      'u1',
    );
    await h.svc.revoke('editor', 'Workspace', 'update', null, 'orgX');
    expect(h.rbac.revoke).toHaveBeenCalledWith(
      'tenantA',
      'orgA',
      'editor',
      'Workspace',
      'update',
      null,
      'u1',
      'orgX',
    );
  });

  it('isRoleAssignable：系统 key 短路（不查库）·自定义 key 查库 fail-closed', async () => {
    const h = makeHarness();
    await expect(h.svc.isRoleAssignable('owner')).resolves.toBe(true);
    expect(h.rbac.findRole).not.toHaveBeenCalled();
    h.rbac.findRole.mockResolvedValueOnce({ id: 'r1', key: 'editor', name: 'E', isSystem: false });
    await expect(h.svc.isRoleAssignable('editor')).resolves.toBe(true);
    h.rbac.findRole.mockResolvedValueOnce(null);
    await expect(h.svc.isRoleAssignable('ghost')).resolves.toBe(false);
  });
});
