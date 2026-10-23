import { randomUUID } from 'node:crypto';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  OrganizationRole,
  OrganizationRoleAudit,
  OrganizationRoleGrant,
  type OrganizationRoleGrantRow,
  type OrganizationRoleRow,
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
  OrganizationRbacRepository,
  OrganizationRoleAuditAction,
  OrganizationRoleCreateResult,
  OrganizationRoleGrantResult,
  OrganizationRoleGrantView,
  OrganizationRoleMutationResult,
  OrganizationRoleRevokeResult,
  OrganizationRoleView,
} from '../../domain/repositories/organization-rbac.repository';

/**
 * `OrganizationRbacRepository` 的 MikroORM 适配（module-rbac-dynamic-roles S1·授权事实 SSOT 的读写通道）。
 *
 * 表属主纪律：`organization_role*` 三表属 `authorization` 上下文（领域细化重构），本类在自身 owned 表内读写（写侧合规）。
 * 每操作 `fork()` 独立 em（V4 串租户教训·同治理仓储纪律）；实体为运行时扁平形
 * （`rbac-tables.ts` companion·FK 裸值列，关系约束由 DB 物理层强制）。
 *
 * 写路径先过 domain 策略闸（key 词法 / conditions 白名单·闸外即拒 fail-closed），落行同通道
 * 追加 `organization_role_audit` 行（甲裁：每次变更一留痕·before/after 快照 JSON 规范化存储）。
 * 同格多条件行（OR 并集·甲裁表形）下的去重/撤除以 `canonicalConditions` 等值口径应用层比对
 * （DB 不建 unique(role,subject,action)——多条件行是正当形态，偏差留痕登 plan §4.1）。
 * `ensureSystemRoles` 幂等 = 「查缺补种」；并发窗口下 unique(org,key) 兜底抛错上闻（消费侧重载，不静默）。
 */
@Injectable()
export class MikroOrganizationRbacRepository implements OrganizationRbacRepository {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async ensureSystemRoles(organizationId: string): Promise<void> {
    const em = await this.mikro.fork();
    const existing = await em.find(OrganizationRole, { organizationId });
    const existingKeys = new Set(existing.map((r) => r.key));
    const missing = SYSTEM_ROLE_SEED.filter((s) => !existingKeys.has(s.key));
    if (missing.length === 0) return;
    const now = new Date();
    const roleRows: OrganizationRoleRow[] = [];
    // bigintAutoPk 不显传 id：传 0 会被视为已设主键——同批多行经 identity map 坍缩只剩一行
    // （真库实跑自捕：seed 30+ grant 行仅落 1 行），交给序列表自增。
    const grantRows: Omit<OrganizationRoleGrantRow, 'id'>[] = [];
    for (const seed of missing) {
      const id = randomUUID();
      roleRows.push({
        id,
        organizationId,
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
    em.persist(roleRows.map((r) => em.create(OrganizationRole, r)));
    await em.flush();
    em.persist(grantRows.map((g) => em.create(OrganizationRoleGrant, g)));
    await em.flush();
  }

  async findRole(organizationId: string, key: string): Promise<OrganizationRoleView | null> {
    const em = await this.mikro.fork();
    const row = await em.findOne(OrganizationRole, { organizationId, key });
    return row ? toView(row) : null;
  }

  async listRoleKeys(organizationId: string): Promise<string[]> {
    const em = await this.mikro.fork();
    const rows = await em.find(OrganizationRole, { organizationId });
    return rows.map((r) => r.key);
  }

  async listRoles(organizationId: string): Promise<OrganizationRoleView[]> {
    const em = await this.mikro.fork();
    const rows = await em.find(OrganizationRole, { organizationId });
    return rows.map(toView);
  }

  async findGrants(
    organizationId: string,
    roleKey: string,
  ): Promise<OrganizationRoleGrantView[] | null> {
    const em = await this.mikro.fork();
    const role = await em.findOne(OrganizationRole, { organizationId, key: roleKey });
    if (!role) return null;
    const rows = await em.find(OrganizationRoleGrant, { roleId: role.id });
    return rows.map(toGrantView);
  }

  async createRole(
    organizationId: string,
    key: string,
    name: string,
    actorId: string | null,
  ): Promise<OrganizationRoleCreateResult> {
    if (!isValidRoleKey(key)) return 'invalidKey';
    const em = await this.mikro.fork();
    if (await em.findOne(OrganizationRole, { organizationId, key })) return 'duplicate';
    const now = new Date();
    const role = em.create(OrganizationRole, {
      id: randomUUID(),
      organizationId,
      key,
      name,
      isSystem: false,
      createdAt: now,
      updatedAt: null,
    });
    await this.audit(em, organizationId, actorId, 'create', key, null, toView(role), now);
    await em.flush();
    return 'created';
  }

  async renameRole(
    organizationId: string,
    key: string,
    name: string,
    actorId: string | null,
  ): Promise<OrganizationRoleMutationResult> {
    const em = await this.mikro.fork();
    const role = await em.findOne(OrganizationRole, { organizationId, key });
    if (!role) return 'notFound';
    // is_system 应屏（丙裁：系统三 key 不可改——名也不放开，防门面伪造系统角色身份）。
    if (role.isSystem) return 'systemRoleProtected';
    const before = { name: role.name };
    em.assign(role, { name, updatedAt: new Date() });
    await this.audit(em, organizationId, actorId, 'update', key, before, { name }, new Date());
    await em.flush();
    return 'ok';
  }

  async deleteRole(
    organizationId: string,
    key: string,
    actorId: string | null,
  ): Promise<OrganizationRoleMutationResult> {
    const em = await this.mikro.fork();
    const role = await em.findOne(OrganizationRole, { organizationId, key });
    if (!role) return 'notFound';
    if (role.isSystem) return 'systemRoleProtected';
    const before = toView(role);
    // grant 行由 DB FK cascade 消灭（与治理面 destroy 的 nativeDelete 同律·不走身份图级联）。
    await em.nativeDelete(OrganizationRole, { id: role.id });
    await this.audit(em, organizationId, actorId, 'delete', key, before, null, new Date());
    await em.flush();
    return 'ok';
  }

  async grant(
    organizationId: string,
    roleKey: string,
    entry: OrganizationRoleGrantView,
    actorId: string | null,
  ): Promise<OrganizationRoleGrantResult> {
    if (entry.conditions !== null && !isValidGrantConditions(entry.conditions)) {
      return 'invalidConditions';
    }
    const em = await this.mikro.fork();
    const role = await em.findOne(OrganizationRole, { organizationId, key: roleKey });
    if (!role) return 'roleNotFound';
    const siblings = await em.find(OrganizationRoleGrant, {
      roleId: role.id,
      subject: entry.subject,
      action: entry.action,
    });
    const target = canonicalConditions(entry.conditions);
    if (siblings.some((r) => canonicalConditions(r.conditions ?? null) === target)) {
      return 'duplicate';
    }
    em.create(OrganizationRoleGrant, {
      roleId: role.id,
      subject: entry.subject,
      action: entry.action,
      conditions: entry.conditions,
      createdAt: new Date(),
    });
    await this.audit(em, organizationId, actorId, 'grant', roleKey, null, entry, new Date());
    await em.flush();
    return 'granted';
  }

  async revoke(
    organizationId: string,
    roleKey: string,
    subject: AuthorizationSubject,
    action: AuthorizationAction,
    conditions: Record<string, unknown> | null,
    actorId: string | null,
  ): Promise<OrganizationRoleRevokeResult> {
    const em = await this.mikro.fork();
    const role = await em.findOne(OrganizationRole, { organizationId, key: roleKey });
    if (!role) return 'roleNotFound';
    const siblings = await em.find(OrganizationRoleGrant, { roleId: role.id, subject, action });
    const target = canonicalConditions(conditions);
    const hit = siblings.find((r) => canonicalConditions(r.conditions ?? null) === target);
    if (!hit) return 'notFound';
    await em.nativeDelete(OrganizationRoleGrant, { id: hit.id });
    await this.audit(
      em,
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
    organizationId: string,
    actorId: string | null,
    action: OrganizationRoleAuditAction,
    roleKey: string,
    before: unknown,
    after: unknown,
    now: Date,
  ): Promise<void> {
    em.create(OrganizationRoleAudit, {
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

function toView(row: OrganizationRoleRow): OrganizationRoleView {
  return { id: row.id, key: row.key, name: row.name, isSystem: row.isSystem };
}

function toGrantView(row: OrganizationRoleGrantRow): OrganizationRoleGrantView {
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
