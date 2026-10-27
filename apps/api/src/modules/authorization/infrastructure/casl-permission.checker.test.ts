import type {
  TenantRbacRepository,
  TenantRoleGrantView,
} from '@app/modules/authorization/domain/repositories/organization-rbac.repository';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { describe, expect, it, vi } from 'vitest';
import { CaslPermissionChecker } from './casl-permission.checker';

/**
 * CASL 裁决适配（module-rbac-dynamic-roles S2·DB 规则源落形·rehierarchy 切片 C 换租级轴）的行为测。
 * 锁 checker 自身契约（投影机制由工厂测·端口形状由守卫测分别覆盖）：
 *  ① fail-closed：无租户/无角色不触规则源；查无角色(null)/零授权([]) 皆 deny；
 *  ② lazy-ensure + 进程内缓存：miss 触发 ensure→findGrants，同 (tenant,key) 复用只查一次（ensure 携活动组织盖章）；
 *  ③ over-grant 防线：带 conditions 的 grant 行不参与类型级判定；
 *  ④ 跨租隔离：同 key 不同租户投影独立；
 *  ⑤ invalidate 失效后重查（热改生效面）；
 *  ⑥ 加载失败 deny 且淘汰缓存（下次重试，绝不视同放行）。
 */

const grant = (
  subject: string,
  action: string,
  conditions: Record<string, unknown> | null = null,
) => ({ subject, action, conditions }) as unknown as TenantRoleGrantView;

// 活动组织（写路径归属盖章）·从 ALS 读——镜测以固定租户轴桩提供（与分区键 tenantId 解耦）。
const activeOrg = (): TenantIsolationService =>
  ({ organizationId: 'orgA-active' }) as unknown as TenantIsolationService;

function makeChecker(grantsFor: (tenant: string, key: string) => TenantRoleGrantView[] | null) {
  const ensureSystemRoles = vi.fn().mockResolvedValue(undefined);
  const findGrants = vi.fn(async (tenant: string, key: string) =>
    grantsFor(tenant, key),
  ) as unknown as ReturnType<typeof vi.fn>;
  const rbac = { ensureSystemRoles, findGrants } as unknown as TenantRbacRepository;
  return {
    checker: new CaslPermissionChecker(rbac, activeOrg()),
    ensureSystemRoles,
    findGrants,
  };
}

describe('CaslPermissionChecker（DB 规则源·S2）', () => {
  it('fail-closed：无租户 / 无角色直拒，不触规则源', async () => {
    const { checker, findGrants, ensureSystemRoles } = makeChecker(() => [
      grant('Workspace', 'read'),
    ]);
    await expect(
      checker.can({
        tenantId: undefined,
        role: 'member',
        action: 'read',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: undefined,
        action: 'read',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
    expect(findGrants).not.toHaveBeenCalled();
    expect(ensureSystemRoles).not.toHaveBeenCalled();
  });

  it('lazy-ensure：miss 先补种系统角色再读授权', async () => {
    const { checker, ensureSystemRoles, findGrants } = makeChecker(() => [grant('Member', 'read')]);
    await expect(
      checker.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(true);
    expect(ensureSystemRoles).toHaveBeenCalledWith('orgA');
    expect(findGrants).toHaveBeenCalledWith('orgA', 'member');
  });

  it('进程内缓存：同 (org,key) 多判只查库一次', async () => {
    const { checker, findGrants } = makeChecker(() => [grant('Member', 'read')]);
    await checker.can({
      tenantId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
    });
    await checker.can({
      tenantId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
    });
    expect(findGrants).toHaveBeenCalledTimes(1);
  });

  it('查无角色(null) 与零授权([]) 皆 deny', async () => {
    const ghost = makeChecker(() => null);
    await expect(
      ghost.checker.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'read',
        subject: 'Member',
      }),
    ).resolves.toBe(false);
    const empty = makeChecker(() => []);
    await expect(
      empty.checker.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'read',
        subject: 'Member',
      }),
    ).resolves.toBe(false);
  });

  it('over-grant 防线：条件行不入类型级判定·无整 subject 级行则类型级 deny', async () => {
    const { checker } = makeChecker(() => [
      grant('Workspace', 'update', { ownerId: '{{userId}}' }),
    ]);
    // 仅有带条件行 → 类型级 can('update','Workspace') 必拒（否则静默升为全量放行）。
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'update',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
  });

  it('整 subject 级行（conditions=null）纳入类型级 allow', async () => {
    const { checker } = makeChecker(() => [grant('Organization', 'delete')]);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'owner',
        action: 'delete',
        subject: 'Organization',
      }),
    ).resolves.toBe(true);
  });

  it('跨租隔离：同 key 在不同租户投影独立', async () => {
    const { checker, findGrants } = makeChecker((org) =>
      org === 'orgA' ? [grant('Member', 'read')] : [],
    );
    await expect(
      checker.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(true);
    await expect(
      checker.can({ tenantId: 'orgB', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(false);
    expect(findGrants).toHaveBeenCalledTimes(2); // 不同 org → 各自独立缓存条目
  });

  it('invalidate 失效后重查（热改生效）', async () => {
    let phase = 1;
    const { checker, findGrants } = makeChecker(() =>
      phase === 1 ? [grant('Member', 'read')] : [],
    );
    const c = checker as CaslPermissionChecker;
    await expect(
      c.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(true);
    phase = 2;
    // 未失效 → 命中缓存仍 true；失效 → 重查转为 [] → deny。
    await expect(
      c.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(true);
    c.invalidate('orgA');
    await expect(
      c.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(false);
    expect(findGrants).toHaveBeenCalledTimes(2);
  });

  it('加载失败：deny 且淘汰缓存（下次重试·绝不视同放行）', async () => {
    const ensureSystemRoles = vi.fn().mockRejectedValue(new Error('db down'));
    const findGrants = vi
      .fn()
      .mockResolvedValue([grant('Member', 'read')]) as unknown as ReturnType<typeof vi.fn>;
    const rbac = { ensureSystemRoles, findGrants } as unknown as TenantRbacRepository;
    const checker = new CaslPermissionChecker(rbac, activeOrg());
    await expect(
      checker.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(false);
    // 淘汰后再次尝试 → 重新触发 ensure（失败仍 deny，但不会永久缓存 rejected Promise）。
    await expect(
      checker.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Member' }),
    ).resolves.toBe(false);
    expect(ensureSystemRoles).toHaveBeenCalledTimes(2);
  });
});

describe('CaslPermissionChecker（S4·check 级实例判定）', () => {
  const ownerScoped = () => [grant('Workspace', 'update', { ownerId: '{{userId}}' })];

  it('ownerId 模板命中当前操作者 → 实例级 allow', async () => {
    const { checker } = makeChecker(ownerScoped);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'update',
        subject: 'Workspace',
        resource: { ownerId: 'u1' },
        userId: 'u1',
      }),
    ).resolves.toBe(true);
  });

  it('ownerId 不命中（他人实例）→ 实例级 deny', async () => {
    const { checker } = makeChecker(ownerScoped);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'update',
        subject: 'Workspace',
        resource: { ownerId: 'u2' },
        userId: 'u1',
      }),
    ).resolves.toBe(false);
  });

  it('无 userId → 模板不可解析（留字面）→ 保守 deny', async () => {
    const { checker } = makeChecker(ownerScoped);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'update',
        subject: 'Workspace',
        resource: { ownerId: 'u1' },
      }),
    ).resolves.toBe(false);
  });

  it('整 subject 级行（conditions=null）实例判定放行任意实例', async () => {
    const { checker } = makeChecker(() => [grant('Workspace', 'read')]);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'member',
        action: 'read',
        subject: 'Workspace',
        resource: { ownerId: 'anyone' },
        userId: 'u1',
      }),
    ).resolves.toBe(true);
  });

  it('类型级（无 resource）仍拒条件行·S2 over-grant 防线不因 S4 塔改', async () => {
    const { checker } = makeChecker(ownerScoped);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'update',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
  });

  it('实例判定复用同 (org,key) 缓存·不逐请求查库', async () => {
    const { checker, findGrants } = makeChecker(ownerScoped);
    const base = {
      tenantId: 'orgA',
      role: 'editor',
      action: 'update' as const,
      subject: 'Workspace' as const,
    };
    await expect(checker.can({ ...base, resource: { ownerId: 'u1' }, userId: 'u1' })).resolves.toBe(
      true,
    );
    await expect(checker.can({ ...base, resource: { ownerId: 'u2' }, userId: 'u1' })).resolves.toBe(
      false,
    );
    expect(findGrants).toHaveBeenCalledTimes(1);
  });
});

describe('CaslPermissionChecker（query 级列表过滤·listPredicate 切片 B）', () => {
  // fixture subject 取词汇表内合法值（'Workspace'）——checker 测的是裁决机制本身，与切片 C 生产接入端点选型解耦。
  const base = {
    tenantId: 'orgA',
    role: 'editor',
    action: 'read' as const,
    subject: 'Workspace' as const,
  };

  it('无租户 / 无角色 → none（fail-closed·不触规则源）', async () => {
    const { checker, findGrants } = makeChecker(() => [
      grant('Workspace', 'read', { ownerId: '{{userId}}' }),
    ]);
    await expect(checker.listPredicate({ ...base, tenantId: undefined })).resolves.toEqual({
      kind: 'none',
    });
    await expect(checker.listPredicate({ ...base, role: undefined })).resolves.toEqual({
      kind: 'none',
    });
    expect(findGrants).not.toHaveBeenCalled();
  });

  it('无任何匹配 action/subject 行 → none（该角色无此 read 权）', async () => {
    const { checker } = makeChecker(() => [grant('Member', 'read', null)]);
    await expect(checker.listPredicate(base)).resolves.toEqual({ kind: 'none' });
  });

  it('存在 conditions=null 类型级行 → all（无条件全量·$or 并入 TRUE 支·与 check 级同解）', async () => {
    const { checker } = makeChecker(() => [grant('Workspace', 'read', null)]);
    await expect(checker.listPredicate(base)).resolves.toEqual({ kind: 'all' });
  });

  it('类型级行与受限行共存 → all（无条件行优先·不因受限行收窄）', async () => {
    const { checker } = makeChecker(() => [
      grant('Workspace', 'read', { ownerId: '{{userId}}' }),
      grant('Workspace', 'read', null),
    ]);
    await expect(checker.listPredicate(base)).resolves.toEqual({ kind: 'all' });
  });

  it('单受限行 → where（省一层 $or·{{userId}} 按操作者解析）', async () => {
    const { checker } = makeChecker(() => [grant('Workspace', 'read', { ownerId: '{{userId}}' })]);
    await expect(checker.listPredicate({ ...base, userId: 'u9' })).resolves.toEqual({
      kind: 'where',
      where: { ownerId: 'u9' },
    });
  });

  it('多受限行 → where $or 并语义（人裁②·任一 allow 即可见）', async () => {
    const { checker } = makeChecker(() => [
      grant('Workspace', 'read', { ownerId: '{{userId}}' }),
      grant('Workspace', 'read', { teamId: { $in: ['t1', 't2'] } }),
    ]);
    await expect(checker.listPredicate({ ...base, userId: 'u9' })).resolves.toEqual({
      kind: 'where',
      where: { $or: [{ ownerId: 'u9' }, { teamId: { $in: ['t1', 't2'] } }] },
    });
  });

  it('受限行含 grammar 外 conditions → none + 汰缓存（读侧双保险 fail-closed）', async () => {
    const { checker, findGrants } = makeChecker(() => [
      grant('Workspace', 'read', { n: { $gt: 1 } }),
    ]);
    await expect(checker.listPredicate(base)).resolves.toEqual({ kind: 'none' });
    // 缓存已汰：下次再调重查（与加载失败同处理）
    await checker.listPredicate(base);
    expect(findGrants).toHaveBeenCalledTimes(2);
  });

  it('复用同 (org,key) 缓存·不逐请求查库', async () => {
    const { checker, findGrants } = makeChecker(() => [
      grant('Workspace', 'read', { ownerId: '{{userId}}' }),
    ]);
    await checker.listPredicate({ ...base, userId: 'u1' });
    await checker.listPredicate({ ...base, userId: 'u2' });
    expect(findGrants).toHaveBeenCalledTimes(1);
  });

  it('加载抛错 → none（绝不视同放行）', async () => {
    const rbac = {
      ensureSystemRoles: vi.fn().mockResolvedValue(undefined),
      findGrants: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as TenantRbacRepository;
    await expect(new CaslPermissionChecker(rbac, activeOrg()).listPredicate(base)).resolves.toEqual(
      {
        kind: 'none',
      },
    );
  });
});

describe('一致性回归（query 级列表过滤 切片 C·「listPredicate 与逐行 can() 同解」）', () => {
  /** 本测试自带的受限求值器：只解切片 A grammar 的形（等值 / $in / $or·与转换器输出同形）。 */
  function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, cond]) => {
      if (key === '$or')
        return (cond as Record<string, unknown>[]).some((sub) => matchesWhere(row, sub));
      if (key === '$and')
        return (cond as Record<string, unknown>[]).every((sub) => matchesWhere(row, sub));
      if (cond !== null && typeof cond === 'object' && '$in' in cond) {
        return (cond as { $in: unknown[] }).$in.includes(row[key]);
      }
      return row[key] === cond;
    });
  }

  const rows: Record<string, unknown>[] = [
    { ownerId: 'u1', teamId: 't9' }, // 左支命中（ownerId 模板）
    { ownerId: 'u2', teamId: 't1' }, // 右支命中（$in）
    { ownerId: 'u1', teamId: 't1' }, // 双支皆命中
    { ownerId: 'u3', teamId: 't2' }, // 仅右支命中
    { ownerId: 'u3', teamId: 't7' }, // 两支都不命中
  ];

  it('受限行集：谓词过滤可见集 = 逐行 can() 允许集（写侧闸/转换器/CASL 三层共 grammar 锁形）', async () => {
    const { checker } = makeChecker(() => [
      grant('Workspace', 'read', { ownerId: '{{userId}}' }),
      grant('Workspace', 'read', { teamId: { $in: ['t1', 't2'] } }),
    ]);
    const userId = 'u1';
    const check = {
      tenantId: 'orgA',
      role: 'editor',
      action: 'read' as const,
      subject: 'Workspace' as const,
      userId,
    };

    const predicate = await checker.listPredicate(check);
    expect(predicate.kind).toBe('where'); // 防御断言：非 where 则下方取 where 必红
    if (predicate.kind !== 'where') throw new Error('expected where');
    const listVisible = rows.filter((row) => matchesWhere(row, predicate.where));

    const perRow = await Promise.all(rows.map((row) => checker.can({ ...check, resource: row })));
    const canVisible = rows.filter((_, i) => perRow[i]);

    expect(listVisible).toEqual(canVisible);
    // 钉牢非空平凡解：夹具确实同纳两支与排除行。
    expect(listVisible).toHaveLength(4);
  });

  it('类型级行共存：listPredicate 归 all 时逐行 can() 恒全允许（无 instance 限制同解）', async () => {
    const { checker } = makeChecker(() => [
      grant('Workspace', 'read', { ownerId: '{{userId}}' }),
      grant('Workspace', 'read', null),
    ]);
    const check = {
      tenantId: 'orgA',
      role: 'editor',
      action: 'read' as const,
      subject: 'Workspace' as const,
      userId: 'u1',
    };
    await expect(checker.listPredicate(check)).resolves.toEqual({ kind: 'all' });
    for (const row of rows) {
      await expect(checker.can({ ...check, resource: row })).resolves.toBe(true);
    }
  });
});

describe('人裁 A1 read/write 分治（module-rbac-guard-instance-read·守卫路径入口级判定）', () => {
  // 人 2026-10-17 令「同意」（首批仅 list 面）：read 入口级过门 = 存在任一匹配 grant 行（含 conditions 行），
  // 判据复用 listPredicate 三态；写动作维持 S2 over-grant 防线。行可见集仍由列表面谓词下推治理。
  const condReadGrants = () => [grant('Workspace', 'read', { ownerId: '{{userId}}' })];

  it('conditions-only read 行 → 守卫路径（无 resource·无 userId）放行（入口级面·模板留字面不影响过门）', async () => {
    const { checker } = makeChecker(condReadGrants);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'limited',
        action: 'read',
        subject: 'Workspace',
      }),
    ).resolves.toBe(true);
  });

  it('同源同解：同一受限行 can() 过门且 listPredicate 归 where（行级可见仍由谓词治理·无越权增量）', async () => {
    const { checker } = makeChecker(condReadGrants);
    const check = {
      tenantId: 'orgA',
      role: 'limited',
      action: 'read' as const,
      subject: 'Workspace' as const,
      userId: 'u9',
    };
    await expect(checker.can(check)).resolves.toBe(true);
    await expect(checker.listPredicate(check)).resolves.toEqual({
      kind: 'where',
      where: { ownerId: 'u9' },
    });
  });

  it('写动作 conditions-only 行 → 守卫路径四动作（create/update/delete/cancel）恒拒（over-grant 防线原样）', async () => {
    const { checker } = makeChecker(() => [grant('Workspace', 'update', { ownerId: 'u1' })]);
    for (const action of ['create', 'update', 'delete', 'cancel'] as const) {
      await expect(
        checker.can({ tenantId: 'orgA', role: 'limited', action, subject: 'Workspace' }),
      ).resolves.toBe(false);
    }
  });

  it('无任何匹配 read 行 → 守卫路径拒（none 不过门·fail-closed 不变）', async () => {
    const { checker } = makeChecker(() => [grant('Workspace', 'create', null)]);
    await expect(
      checker.can({
        tenantId: 'orgA',
        role: 'limited',
        action: 'read',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
    // 受限 grammar 外脏行同样不过门（listPredicate catch 归 none 的入口级映像）。
    const dirty = makeChecker(() => [grant('Workspace', 'read', { n: { $gt: 1 } })]);
    await expect(
      dirty.checker.can({
        tenantId: 'orgA',
        role: 'limited',
        action: 'read',
        subject: 'Workspace',
      }),
    ).resolves.toBe(false);
  });

  it('conditions=null read 行 → 照常放行（零回归·all 分支与旧 typeLevel 判定同解）', async () => {
    const { checker } = makeChecker(() => [grant('Workspace', 'read', null)]);
    await expect(
      checker.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Workspace' }),
    ).resolves.toBe(true);
  });
});

describe('CaslPermissionChecker（第三次复裁 切片 2·D1·org-scoped grant 轴）', () => {
  it('check.organizationId 存在 → findGrants 携活动 org 第三参；缺省则不传（向后兼容两参契约）', async () => {
    const { checker, findGrants } = makeChecker(() => [grant('Member', 'read')]);
    await checker.can({ tenantId: 'orgA', role: 'member', action: 'read', subject: 'Member' });
    expect(findGrants).toHaveBeenCalledWith('orgA', 'member'); // 无 org → 仅两参
    await checker.can({
      tenantId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
      organizationId: 'org1',
    });
    expect(findGrants).toHaveBeenCalledWith('orgA', 'member', 'org1'); // 有 org → 三参
  });

  it('同 (tenant,role) 不同活动 org → 各自独立缓存条目（各查一次·D1 缓存键加 org 轴）', async () => {
    const { checker, findGrants } = makeChecker(() => [grant('Member', 'read')]);
    await checker.can({
      tenantId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
      organizationId: 'org1',
    });
    await checker.can({
      tenantId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
      organizationId: 'org2',
    });
    expect(findGrants).toHaveBeenCalledTimes(2); // org1/org2 各自 miss
  });

  it('invalidate(tenant) 清该租户全部活动 org 缓存（前缀仍盖 org 轴）', async () => {
    const { checker, findGrants } = makeChecker(() => [grant('Member', 'read')]);
    const c = checker as CaslPermissionChecker;
    await c.can({
      tenantId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
      organizationId: 'org1',
    });
    expect(findGrants).toHaveBeenCalledTimes(1);
    await c.can({
      tenantId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
      organizationId: 'org1',
    }); // 命中缓存
    expect(findGrants).toHaveBeenCalledTimes(1);
    c.invalidate('orgA');
    await c.can({
      tenantId: 'orgA',
      role: 'member',
      action: 'read',
      subject: 'Member',
      organizationId: 'org1',
    });
    expect(findGrants).toHaveBeenCalledTimes(2);
  });

  it('实例判定解 {{organizationId}} 为活动 org 实值（命中 allow·失配 deny）', async () => {
    const findGrants = vi.fn().mockResolvedValue([
      {
        subject: 'Workspace',
        action: 'update',
        conditions: { organizationId: '{{organizationId}}' },
      },
    ]);
    const rbac = {
      ensureSystemRoles: vi.fn().mockResolvedValue(undefined),
      findGrants,
    } as unknown as TenantRbacRepository;
    const orgScoped = new CaslPermissionChecker(rbac, activeOrg());
    // grants 回形带 conditions={{organizationId}}·checker 按活动 org 解析后交 CASL mongo 匹配 resource。
    await expect(
      orgScoped.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'update',
        subject: 'Workspace',
        resource: { organizationId: 'orgX' },
        userId: 'u1',
        organizationId: 'orgX',
      }),
    ).resolves.toBe(true);
    await expect(
      orgScoped.can({
        tenantId: 'orgA',
        role: 'editor',
        action: 'update',
        subject: 'Workspace',
        resource: { organizationId: 'orgY' },
        userId: 'u1',
        organizationId: 'orgX',
      }),
    ).resolves.toBe(false);
  });

  it('列表面解 {{organizationId}} 为活动 org 实值（受限行 → where）', async () => {
    const { checker } = makeChecker(
      () =>
        [
          {
            subject: 'Workspace',
            action: 'read',
            conditions: { organizationId: '{{organizationId}}' },
          },
        ] as unknown as TenantRoleGrantView[],
    );
    await expect(
      checker.listPredicate({
        tenantId: 'orgA',
        role: 'editor',
        action: 'read',
        subject: 'Workspace',
        organizationId: 'orgZ',
      }),
    ).resolves.toEqual({ kind: 'where', where: { organizationId: 'orgZ' } });
  });
});

/**
 * P0 D1：abilities 有界 LRU。原 Map 随 (tenant,role,org) 无界增长 → 内存慢漏。锁：
 *  - 超上限灌键 → size 不越界（驱逐最旧）；
 *  - 命中重插标最近（先删后插·Map.set 不改既有键插入序）；
 *  - 被驱逐者下次 miss 重建（与冷启动同路·不缓存失效语义）。
 * 经实例级 `maxEntries` seam 下调上限验驱逐（生产取静态 2048）。
 */
describe('CaslPermissionChecker · P0 D1 abilities 有界 LRU', () => {
  const abilitiesOf = (checker: CaslPermissionChecker) =>
    (checker as unknown as { abilities: Map<string, unknown> }).abilities;

  it('超 cap 灌键 → size 不越界·驱逐者下次重建', async () => {
    const { checker, findGrants } = makeChecker(() => [grant('Workspace', 'read')]);
    (checker as unknown as { maxEntries: number }).maxEntries = 2;
    const drive = (tenantId: string) =>
      checker.can({ tenantId, role: 'r', action: 'update', subject: 'Workspace' });

    await drive('t1');
    await drive('t2');
    expect(abilitiesOf(checker).size).toBe(2);
    // 再灌 t3 → 超限驱逐最旧 t1 → size 仍为 2（不越界）。
    await drive('t3');
    expect(abilitiesOf(checker).size).toBe(2);
    expect(abilitiesOf(checker).has('t1\u0000r\u0000')).toBe(false);

    // t1 已被驱逐→ 命中 t1 触发重建（findGrants 多一次）。
    const before = (findGrants as ReturnType<typeof vi.fn>).mock.calls.length;
    await drive('t1');
    expect((findGrants as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before + 1);
  });

  it('命中重插标最近：反复访问者存活·最久未访问者被驱逐', async () => {
    const { checker } = makeChecker(() => [grant('Workspace', 'read')]);
    (checker as unknown as { maxEntries: number }).maxEntries = 2;
    const drive = (tenantId: string) =>
      checker.can({ tenantId, role: 'r', action: 'update', subject: 'Workspace' });
    const survivingTenants = () =>
      [...abilitiesOf(checker).keys()].map((k) => k.split('\u0000')[0]);

    await drive('t1');
    await drive('t2');
    // 复访 t1 → 标最近（至队尾）·现队首（最旧）为 t2。
    await drive('t1');
    // 灌 t3 → 驱逐队首 t2（非刚被重插的 t1）。
    await drive('t3');
    const survived = survivingTenants();
    expect(survived).toContain('t1'); // 最近访问键存活
    expect(survived).toContain('t3');
    expect(survived).not.toContain('t2'); // 最久未访问者被驱逐
  });
});
