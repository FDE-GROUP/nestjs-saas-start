import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  TenantRole,
  TenantRoleAudit,
  TenantRoleGrant,
} from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import type { EntityManager } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MikroTenantRbacRepository } from './mikro-tenant-rbac.repository';

/**
 * RBAC 仓储适配单测（module-rbac-dynamic-roles S1·fake `em` 镜像断言·治理仓储测试同法）。
 * 锁四类行为：① ensure 幂等与 seed 展开行数；② 策略闸拒形（invalidKey/invalidConditions）；
 * ③ is_system 应屏（rename/delete 保护）；④ 每次变更同通道落审计行（甲裁留痕）。
 */

function makeHarness() {
  const created: Array<{ entity: unknown; row: Record<string, unknown> }> = [];
  const find = vi.fn().mockResolvedValue([]);
  const findOne = vi.fn().mockResolvedValue(null);
  const create = vi.fn((entity: unknown, data: Record<string, unknown>) => {
    const row = { ...data };
    created.push({ entity, row });
    return row;
  });
  const assign = vi.fn((entity: Record<string, unknown>, dto: Record<string, unknown>) =>
    Object.assign(entity, dto),
  );
  const persist = vi.fn();
  const flush = vi.fn().mockResolvedValue(undefined);
  const nativeDelete = vi.fn().mockResolvedValue(1);
  const em = {
    find,
    findOne,
    create,
    assign,
    persist,
    flush,
    nativeDelete,
  } as unknown as EntityManager;
  const mikro = { fork: vi.fn().mockResolvedValue(em) } as unknown as MikroOrmService;
  const createdOf = (entity: unknown) => created.filter((c) => c.entity === entity);
  return {
    repo: new MikroTenantRbacRepository(mikro),
    created,
    createdOf,
    spies: { find, findOne, create, assign, persist, flush, nativeDelete },
  };
}

const roleRow = (over: Record<string, unknown> = {}) => ({
  id: 'role-1',
  organizationId: 'orgA',
  key: 'editor',
  name: 'Editor',
  isSystem: false,
  createdAt: new Date(),
  updatedAt: null,
  ...over,
});

describe('MikroTenantRbacRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('ensureSystemRoles（幂等 seed·§2.3）', () => {
    it('空租户 → 落 3 系统角色 + 40 授权行（19+18+3 与 seed 展开逐行等）', async () => {
      const h = makeHarness();
      await h.repo.ensureSystemRoles('orgA');
      expect(h.createdOf(TenantRole)).toHaveLength(3);
      expect(h.createdOf(TenantRoleGrant)).toHaveLength(40);
      expect(h.createdOf(TenantRole).map((c) => c.row.key)).toEqual(['owner', 'admin', 'member']);
      expect(h.created.every((c) => c.row.isSystem !== false)).toBe(true);
      // 两段 flush（module-workspace-owner-column 真库实跑自捕后修形）：角色行先落库再补授权行，
      // 扁平实体无 relation 依赖序·同批会 grant FK 抢跑；grant 行另不再显传 id=0（identity map 坍缩）。
      expect(h.spies.flush).toHaveBeenCalledTimes(2);
      expect(h.createdOf(TenantRoleGrant).every((c) => !('id' in c.row))).toBe(true);
    });

    it('三角色已在 → 零写入零 flush（幂等）', async () => {
      const h = makeHarness();
      h.spies.find.mockResolvedValueOnce(
        ['owner', 'admin', 'member'].map((key) => roleRow({ key, isSystem: true })),
      );
      await h.repo.ensureSystemRoles('orgA');
      expect(h.created).toHaveLength(0);
      expect(h.spies.flush).not.toHaveBeenCalled();
    });

    it('部分缺失 → 只补种缺的角色（owner 在、补 admin+member）', async () => {
      const h = makeHarness();
      h.spies.find.mockResolvedValueOnce([roleRow({ key: 'owner', isSystem: true })]);
      await h.repo.ensureSystemRoles('orgA');
      expect(h.createdOf(TenantRole).map((c) => c.row.key)).toEqual(['admin', 'member']);
    });
  });

  describe('读侧（投影输入·S2 消费）', () => {
    it('findGrants 查无角色 → null（区别于零授权的 []）', async () => {
      const h = makeHarness();
      await expect(h.repo.findGrants('orgA', 'ghost')).resolves.toBeNull();
    });

    it('findGrants 映射 grant 行为端口视形（conditions 缺省归一 null）', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValueOnce(roleRow());
      h.spies.find.mockResolvedValueOnce([
        { subject: 'Workspace', action: 'update', conditions: { ownerId: '{{userId}}' } },
        { subject: 'Member', action: 'read', conditions: null },
      ]);
      await expect(h.repo.findGrants('orgA', 'editor')).resolves.toEqual([
        { subject: 'Workspace', action: 'update', conditions: { ownerId: '{{userId}}' } },
        { subject: 'Member', action: 'read', conditions: null },
      ]);
    });

    it('listRoleKeys 返回本租户全部 key', async () => {
      const h = makeHarness();
      h.spies.find.mockResolvedValueOnce([roleRow({ key: 'owner' }), roleRow()]);
      await expect(h.repo.listRoleKeys('orgA')).resolves.toEqual(['owner', 'editor']);
    });
  });

  describe('createRole', () => {
    it('词法闸/保留 key 拒（不落行）', async () => {
      const h = makeHarness();
      await expect(h.repo.createRole('orgA', 'Owner', 'x', 'u1')).resolves.toBe('invalidKey');
      await expect(h.repo.createRole('orgA', 'owner', 'x', 'u1')).resolves.toBe('invalidKey');
      expect(h.created).toHaveLength(0);
    });

    it('撞 key → duplicate（findOne 命中）', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValueOnce(roleRow());
      await expect(h.repo.createRole('orgA', 'editor', 'x', 'u1')).resolves.toBe('duplicate');
    });

    it('成功 → 角色行 isSystem=false + 审计 create 行（after 快照）', async () => {
      const h = makeHarness();
      await expect(h.repo.createRole('orgA', 'editor', 'Editor', 'u1')).resolves.toBe('created');
      const role = h.createdOf(TenantRole)[0].row;
      expect(role).toMatchObject({ organizationId: 'orgA', key: 'editor', isSystem: false });
      const audit = h.createdOf(TenantRoleAudit)[0].row;
      expect(audit).toMatchObject({ action: 'create', roleKey: 'editor', actorId: 'u1' });
      expect(audit.before).toBeNull();
      expect(audit.after).toMatchObject({ key: 'editor', isSystem: false });
    });
  });

  describe('is_system 应屏（丙裁：系统角色不可改删）', () => {
    it('renameRole/deleteRole 对系统角色 → systemRoleProtected 且零写', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValue(roleRow({ key: 'owner', isSystem: true }));
      await expect(h.repo.renameRole('orgA', 'owner', 'Boss', 'u1')).resolves.toBe(
        'systemRoleProtected',
      );
      await expect(h.repo.deleteRole('orgA', 'owner', 'u1')).resolves.toBe('systemRoleProtected');
      expect(h.spies.nativeDelete).not.toHaveBeenCalled();
      expect(h.created).toHaveLength(0);
    });

    it('renameRole 自定义角色 → assign name+updatedAt 并落 update 审计（before/after 快照）', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValueOnce(roleRow());
      await expect(h.repo.renameRole('orgA', 'editor', 'Editors', 'u1')).resolves.toBe('ok');
      expect(h.spies.assign).toHaveBeenCalledWith(expect.objectContaining({ id: 'role-1' }), {
        name: 'Editors',
        updatedAt: expect.any(Date),
      });
      const audit = h.createdOf(TenantRoleAudit)[0].row;
      expect(audit).toMatchObject({ action: 'update', roleKey: 'editor' });
      expect(audit.before).toEqual({ name: 'Editor' });
      expect(audit.after).toEqual({ name: 'Editors' });
    });

    it('deleteRole 自定义角色 → nativeDelete（FK cascade 清 grant）+ delete 审计带 before', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValueOnce(roleRow());
      await expect(h.repo.deleteRole('orgA', 'editor', 'u1')).resolves.toBe('ok');
      expect(h.spies.nativeDelete).toHaveBeenCalledWith(TenantRole, { id: 'role-1' });
      const audit = h.createdOf(TenantRoleAudit)[0].row;
      expect(audit).toMatchObject({ action: 'delete', roleKey: 'editor', after: null });
      expect(audit.before).toMatchObject({ key: 'editor', isSystem: false });
    });
  });

  describe('grant / revoke（行式 OR 并集·canonical 等值口径）', () => {
    it('白名单外 conditions → invalidConditions（先于 DB 读·零查询）', async () => {
      const h = makeHarness();
      await expect(
        h.repo.grant(
          'orgA',
          'editor',
          { subject: 'Workspace', action: 'update', conditions: { ownerId: { $in: [] } } },
          'u1',
        ),
      ).resolves.toBe('invalidConditions');
      expect(h.spies.findOne).not.toHaveBeenCalled();
    });

    it('查无角色 → roleNotFound', async () => {
      const h = makeHarness();
      await expect(
        h.repo.grant(
          'orgA',
          'ghost',
          { subject: 'Member', action: 'read', conditions: null },
          'u1',
        ),
      ).resolves.toBe('roleNotFound');
    });

    it('同格同 conditions（键序不同也算）→ duplicate', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValueOnce(roleRow());
      h.spies.find.mockResolvedValueOnce([
        { subject: 'Workspace', action: 'update', conditions: { a: 1, b: 2 } },
      ]);
      await expect(
        h.repo.grant(
          'orgA',
          'editor',
          { subject: 'Workspace', action: 'update', conditions: { b: 2, a: 1 } },
          'u1',
        ),
      ).resolves.toBe('duplicate');
    });

    it('granted → 新行 + grant 审计（conditions 整 subject 级 = null）', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValueOnce(roleRow());
      h.spies.find.mockResolvedValueOnce([]);
      await expect(
        h.repo.grant(
          'orgA',
          'editor',
          { subject: 'Member', action: 'read', conditions: null },
          'u1',
        ),
      ).resolves.toBe('granted');
      const grant = h.createdOf(TenantRoleGrant)[0].row;
      expect(grant).toMatchObject({ roleId: 'role-1', subject: 'Member', action: 'read' });
      expect(h.createdOf(TenantRoleAudit)[0].row).toMatchObject({
        action: 'grant',
        roleKey: 'editor',
      });
    });

    it('revoke 按 canonical 精确命中条件行 → nativeDelete + revoke 审计带 before', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValueOnce(roleRow());
      h.spies.find.mockResolvedValueOnce([
        { subject: 'Workspace', action: 'update', conditions: { ownerId: 'u7' } },
        { subject: 'Workspace', action: 'update', conditions: { ownerId: '{{userId}}' } },
      ]);
      await expect(
        h.repo.revoke('orgA', 'editor', 'Workspace', 'update', { ownerId: '{{userId}}' }, 'u1'),
      ).resolves.toBe('revoked');
      expect(h.spies.nativeDelete).toHaveBeenCalledTimes(1);
      const audit = h.createdOf(TenantRoleAudit)[0].row;
      expect(audit).toMatchObject({ action: 'revoke', after: null });
      expect(audit.before).toEqual({
        subject: 'Workspace',
        action: 'update',
        conditions: { ownerId: '{{userId}}' },
      });
    });

    it('revoke conditions=null 只撤整 subject 级行；无等值行 → notFound', async () => {
      const h = makeHarness();
      h.spies.findOne.mockResolvedValueOnce(roleRow());
      h.spies.find.mockResolvedValueOnce([
        { subject: 'Member', action: 'read', conditions: { ownerId: 'u1' } },
      ]);
      await expect(h.repo.revoke('orgA', 'editor', 'Member', 'read', null, 'u1')).resolves.toBe(
        'notFound',
      );
      expect(h.spies.nativeDelete).not.toHaveBeenCalled();
    });
  });
});
