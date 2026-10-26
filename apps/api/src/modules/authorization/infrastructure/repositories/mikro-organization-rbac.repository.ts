import { randomUUID } from 'node:crypto';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  TenantRole,
  TenantRoleAudit,
  TenantRoleGrant,
  type TenantRoleGrantRow,
  type TenantRoleRow,
} from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import type {
  AuthorizationAction,
  AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';
import { Inject, Injectable } from '@nestjs/common';
import { SYSTEM_ROLE_SEED } from '../../domain/constants/system-role-seed';
import {
  canonicalConditions,
  isValidGrantConditions,
  isValidRoleKey,
} from '../../domain/policies/rbac.policy';
import type {
  TenantRbacRepository,
  TenantRoleAuditAction,
  TenantRoleCreateResult,
  TenantRoleGrantResult,
  TenantRoleGrantView,
  TenantRoleMutationResult,
  TenantRoleRevokeResult,
  TenantRoleView,
} from '../../domain/repositories/organization-rbac.repository';

/**
 * `TenantRbacRepository` 的 MikroORM 适配（module-rbac-dynamic-roles S1·授权事实 SSOT 的读写通道）。
 *
 * 表属主纪律：`tenant_role*` 三表属 `authorization` 上下文（领域细化重构），本类在自身 owned 表内读写（写侧合规）。
 * 每操作 `fork()` 独立 em（V4 串租户教训·同治理仓储纪律）；实体为运行时扁平形
 * （`rbac-tables.ts` companion·FK 裸值列，关系约束由 DB 物理层强制）。
 *
 * 换轴（global-tenant-organization-rehierarchy 片三 K5·第三次复裁切片 2 追平）：角色**目录**寻址/查询
 * 锚 `{ tenantId, key }`；`tenant_role` 无 `organizationId` 列·`unique(tenantId,key)`·tenantId NOT NULL。
 * 授权 **grant 行可依组织收窄**（D1）：`tenant_role_grant.organizationId` NULL=租级通配·非 NULL=仅该 org 生效；
 * `findGrants` 按活动 org 取「NULL ∪ 本 org」适用集（存量行皆 NULL→零行为变更）。CRUD 入参 `organizationId`
 * 仍透传 `tenant_role_audit` 归属盖章（活动组织缺位仍 fail-closed 拒写·seed 面不再需 org）。
 * 同租内 key 唯一性由 `unique(tenantId,key)` 物理兜底；grant scope 与同格 (subject,action,conditions)
 * 的重复判定按 `organizationId` 维度隔离（不同 org 的同格行系正当并存形态）。
 *
 * 写路径先过 domain 策略闸（key 词法 / conditions 白名单·闸外即拒 fail-closed），落行同通道
 * 追加 `tenant_role_audit` 行（甲裁：每次变更一留痕·before/after 快照 JSON 规范化存储）。
 * 同格多条件行（OR 并集·甲裁表形）下的去重/撤除以 `canonicalConditions` 等值口径应用层比对
 * （DB 不建 unique(role,subject,action)——多条件行是正当形态，偏差留痕登 plan §4.1）。
 * `ensureSystemRoles` 幂等 = 「查缺补种」；并发窗口下 unique(tenantId,key) 兜底抛错上闻（消费侧重载，不静默）。
 */
@Injectable()
export class MikroTenantRbacRepository implements TenantRbacRepository {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async ensureSystemRoles(tenantId: string): Promise<void> {
    const em = await this.mikro.fork();
    const existing = await em.find(TenantRole, { tenantId });
    const existingKeys = new Set(existing.map((r) => r.key));
    const missing = SYSTEM_ROLE_SEED.filter((s) => !existingKeys.has(s.key));
    if (missing.length === 0) return;
    const now = new Date();
    const roleRows: TenantRoleRow[] = [];
    // bigintAutoPk 不显传 id：传 0 会被视为已设主键——同批多行经 identity map 坍缩只剩一行
    // （真库实跑自捕：seed 30+ grant 行仅落 1 行），交给序列表自增。
    const grantRows: Omit<TenantRoleGrantRow, 'id'>[] = [];
    for (const seed of missing) {
      const id = randomUUID();
      roleRows.push({
        id,
        tenantId,
        key: seed.key,
        name: seed.name,
        isSystem: true,
        createdAt: now,
        updatedAt: null,
      });
      for (const grant of seed.grants) {
        for (const action of grant.actions) {
          grantRows.push({
            roleId: id,
            subject: grant.subject,
            action,
            conditions: null,
            createdAt: now,
          });
        }
      }
    }
    // 两段 flush：运行时扁平实体的 roleId 是普通 string 列（无 relation 依赖边），
    // 同批 persist 会被归入同一条 nativeInsertMany 批，grant 先于 role 即 FK 抢跑（真库实跑自捕：
    // seed 整滚失败→checker.can catch 归静默 false）；角色行先落库后再补授权行。
    em.persist(roleRows.map((r) => em.create(TenantRole, r)));
    await em.flush();
    em.persist(grantRows.map((g) => em.create(TenantRoleGrant, g)));
    await em.flush();
  }

  async findRole(tenantId: string, key: string): Promise<TenantRoleView | null> {
    const em = await this.mikro.fork();
    const row = await em.findOne(TenantRole, { tenantId, key });
    return row ? toView(row) : null;
  }

  async listRoleKeys(tenantId: string): Promise<string[]> {
    const em = await this.mikro.fork();
    const rows = await em.find(TenantRole, { tenantId });
    return rows.map((r) => r.key);
  }

  async listRoles(tenantId: string): Promise<TenantRoleView[]> {
    const em = await this.mikro.fork();
    const rows = await em.find(TenantRole, { tenantId });
    return rows.map(toView);
  }

  async findGrants(
    tenantId: string,
    roleKey: string,
    activeOrgId?: string,
  ): Promise<TenantRoleGrantView[] | null> {
    const em = await this.mikro.fork();
    const role = await em.findOne(TenantRole, { tenantId, key: roleKey });
    if (!role) return null;
    // D1：租级通配（org IS NULL）恒纳入；有活动 org 时追加本 org 收窄行（`$or`·不做包含校验·越界即空）。
    // 无活动 org（租级操作）仅取通配行——org-scoped 行 fail-closed 不参与无 org 上下文裁决。存量行皆 NULL→与原全量同解。
    const where = activeOrgId
      ? { roleId: role.id, $or: [{ organizationId: null }, { organizationId: activeOrgId }] }
      : { roleId: role.id, organizationId: null };
    const rows = await em.find(TenantRoleGrant, where);
    return rows.map(toGrantView);
  }

  async createRole(
    tenantId: string,
    organizationId: string | undefined,
    key: string,
    name: string,
    actorId: string | null,
  ): Promise<TenantRoleCreateResult> {
    if (!isValidRoleKey(key)) return 'invalidKey';
    if (!organizationId) return 'invalidKey'; // fail-closed：无活动组织可盖审计归属（角色**目录**本体租级·本方法的 org 入参仅供 `tenant_role_audit` 盖章·grant 行的 org scope 另由 `entry.organizationId` 承载）
    const em = await this.mikro.fork();
    if (await em.findOne(TenantRole, { tenantId, key })) return 'duplicate';
    const now = new Date();
    const role = em.create(TenantRole, {
      id: randomUUID(),
      tenantId,
      key,
      name,
      isSystem: false,
      createdAt: now,
      updatedAt: null,
    });
    await this.audit(em, tenantId, organizationId, actorId, 'create', key, null, toView(role), now);
    await em.flush();
    return 'created';
  }

  async renameRole(
    tenantId: string,
    organizationId: string | undefined,
    key: string,
    name: string,
    actorId: string | null,
  ): Promise<TenantRoleMutationResult> {
    if (!organizationId) return 'notFound'; // fail-closed：无归属可盖审计行
    const em = await this.mikro.fork();
    const role = await em.findOne(TenantRole, { tenantId, key });
    if (!role) return 'notFound';
    // is_system 应屏（丙裁：系统三 key 不可改——名也不放开，防门面伪造系统角色身份）。
    if (role.isSystem) return 'systemRoleProtected';
    const before = { name: role.name };
    em.assign(role, { name, updatedAt: new Date() });
    await this.audit(
      em,
      tenantId,
      organizationId,
      actorId,
      'update',
      key,
      before,
      { name },
      new Date(),
    );
    await em.flush();
    return 'ok';
  }

  async deleteRole(
    tenantId: string,
    organizationId: string | undefined,
    key: string,
    actorId: string | null,
  ): Promise<TenantRoleMutationResult> {
    if (!organizationId) return 'notFound'; // fail-closed：无归属可盖审计行
    const em = await this.mikro.fork();
    const role = await em.findOne(TenantRole, { tenantId, key });
    if (!role) return 'notFound';
    if (role.isSystem) return 'systemRoleProtected';
    const before = toView(role);
    // grant 行由 DB FK cascade 消灭（与治理面 destroy 的 nativeDelete 同律·不走身份图级联）。
    await em.nativeDelete(TenantRole, { id: role.id });
    await this.audit(
      em,
      tenantId,
      organizationId,
      actorId,
      'delete',
      key,
      before,
      null,
      new Date(),
    );
    await em.flush();
    return 'ok';
  }

  async grant(
    tenantId: string,
    organizationId: string | undefined,
    roleKey: string,
    entry: TenantRoleGrantView,
    actorId: string | null,
  ): Promise<TenantRoleGrantResult> {
    if (entry.conditions !== null && !isValidGrantConditions(entry.conditions)) {
      return 'invalidConditions';
    }
    if (!organizationId) return 'roleNotFound'; // fail-closed：无归属可盖审计行
    const em = await this.mikro.fork();
    const role = await em.findOne(TenantRole, { tenantId, key: roleKey });
    if (!role) return 'roleNotFound';
    // D1：grant 行组织 scope——`entry.organizationId` 缺省/null = 租级通配（存量默认·跨 org 生效），
    // 字符串 = 仅该 org 生效。去重按同 scope 维度隔离（不同 org 的同格行可并存）。
    const grantOrg = entry.organizationId ?? null;
    const siblings = await em.find(TenantRoleGrant, {
      roleId: role.id,
      organizationId: grantOrg,
      subject: entry.subject,
      action: entry.action,
    });
    const target = canonicalConditions(entry.conditions);
    if (siblings.some((r) => canonicalConditions(r.conditions ?? null) === target)) {
      return 'duplicate';
    }
    em.create(TenantRoleGrant, {
      roleId: role.id,
      organizationId: grantOrg,
      subject: entry.subject,
      action: entry.action,
      conditions: entry.conditions,
      createdAt: new Date(),
    });
    await this.audit(
      em,
      tenantId,
      organizationId,
      actorId,
      'grant',
      roleKey,
      null,
      entry,
      new Date(),
    );
    await em.flush();
    return 'granted';
  }

  async revoke(
    tenantId: string,
    organizationId: string | undefined,
    roleKey: string,
    subject: AuthorizationSubject,
    action: AuthorizationAction,
    conditions: Record<string, unknown> | null,
    actorId: string | null,
    scopeOrgId?: string | null,
  ): Promise<TenantRoleRevokeResult> {
    if (!organizationId) return 'roleNotFound'; // fail-closed：无归属可盖审计行
    const em = await this.mikro.fork();
    const role = await em.findOne(TenantRole, { tenantId, key: roleKey });
    if (!role) return 'roleNotFound';
    // D1：撤权按组织 scope 精确定位（`scopeOrgId` 缺省/null = 租级通配行·存量默认）。
    const siblings = await em.find(TenantRoleGrant, {
      roleId: role.id,
      organizationId: scopeOrgId ?? null,
      subject,
      action,
    });
    const target = canonicalConditions(conditions);
    const hit = siblings.find((r) => canonicalConditions(r.conditions ?? null) === target);
    if (!hit) return 'notFound';
    await em.nativeDelete(TenantRoleGrant, { id: hit.id });
    await this.audit(
      em,
      tenantId,
      organizationId,
      actorId,
      'revoke',
      roleKey,
      { subject, action, conditions: hit.conditions ?? null },
      null,
      new Date(),
    );
    await em.flush();
    return 'revoked';
  }

  /** 审计行与业务行同 em 同事务落（留痕与变更原子·flush 由调用侧统一触发或本行 nativeInsert 语义并入）。 */
  private async audit(
    em: Awaited<ReturnType<MikroOrmService['fork']>>,
    tenantId: string,
    organizationId: string,
    actorId: string | null,
    action: TenantRoleAuditAction,
    roleKey: string,
    before: unknown,
    after: unknown,
    now: Date,
  ): Promise<void> {
    em.create(TenantRoleAudit, {
      tenantId,
      organizationId,
      actorId,
      action,
      roleKey,
      before: before == null ? null : canonicalJson(before),
      after: after == null ? null : canonicalJson(after),
      createdAt: now,
    });
  }
}

function toView(row: TenantRoleRow): TenantRoleView {
  return { id: row.id, key: row.key, name: row.name, isSystem: row.isSystem };
}

function toGrantView(row: TenantRoleGrantRow): TenantRoleGrantView {
  return {
    subject: row.subject,
    action: row.action,
    conditions: row.conditions ?? null,
  };
}

/** before/after 快照落库前规范化（键序稳定·供留痕逐字节比对；非对象值包成 {value} 防丢痕）。 */
function canonicalJson(value: unknown): Record<string, unknown> {
  const normalized =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value };
  return JSON.parse(canonicalConditions(normalized)) as Record<string, unknown>;
}
