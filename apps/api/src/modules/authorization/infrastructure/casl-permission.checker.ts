import type {
  TenantRbacRepository,
  TenantRoleGrantView,
} from '@app/modules/authorization/domain/repositories/organization-rbac.repository';
import { TENANT_RBAC_REPOSITORY } from '@app/modules/authorization/domain/repositories/organization-rbac.repository';
import {
  mergePredicatesWithOr,
  toMikroPredicate,
} from '@core/saas-kit/authorization/instance-predicate';
import type {
  PermissionChecker,
  PermissionCheckInput,
  PermissionInvalidator,
  PermissionListPredicate,
  PermissionListPredicateRequest,
} from '@core/saas-kit/authorization/permission.port';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { Inject, Injectable } from '@nestjs/common';
import { buildScopedAbility, type CaslScopedAbility } from './casl-ability.factory';

/** 缓存条目：per-(tenant,key) 的授权事实源（grants）+ 派生的类型级 ability（守卫热路径复用·免重建）。 */
interface CachedEntry {
  readonly grants: readonly TenantRoleGrantView[];
  readonly typeLevel: CaslScopedAbility;
}

const USER_TEMPLATE = '{{userId}}';

/**
 * 解析 grant conditions 里的 `{{userId}}` 模板为当前操作者实值（S4 check 级）。
 * 无 userId（未登录/未透传）→ 保留字面模板，CASL mongo 等值匹配必然落空 → 保守 deny（fail-closed）。
 * 值面只处理字符串（写侧策略闸已锁 conditions 为平铺原始量）。
 */
function resolveConditions(
  conditions: Record<string, unknown> | null,
  userId?: string,
): Record<string, unknown> | null {
  if (conditions === null || userId === undefined) return conditions;
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(conditions)) {
    out[field] =
      typeof value === 'string' && value.includes(USER_TEMPLATE)
        ? value.split(USER_TEMPLATE).join(userId)
        : value;
  }
  return out;
}

/**
 * `PermissionChecker` 的 CASL 适配（module-rbac-casl §2.2 · module-rbac-dynamic-roles §2.3·S2 落形）。
 *
 * 新宪（丙裁）：**授权事实 SSOT 在 DB grant 行**——本类经 `TENANT_RBAC_REPOSITORY` 端口读
 * per-租户角色规则集（rehierarchy 片三 K5·角色塌纯租级：分区键=隔离主轴
 * tenantId·unique(tenantId,key)，同租内跨组织互见），投影为 CASL ability 后判定，自身零内置权限知识。语义约束：
 *  - **lazy-ensure**：miss 时先 `ensureSystemRoles`（缺则补种三系统角色·纯租级无归属盖章）再 `findGrants`；
 *  - **fail-closed**：无租户/无角色/查无角色（null）/零授权（[]）/加载抛错 → 恒 deny，绝不视同放行；
 *  - **进程内版本缓存**：同 (tenant,key) 记忆 ability（含在途 Promise 防并发重入），守卫热路径不逐请求查库；
 *    `invalidate` 为热改生效面（S3 门面在 grant/revoke/create/delete 后调用）。
 *
 * over-grant 防线（S2·类型级）：守卫热路径（`can` 不带 `resource`）用**仅含 conditions=null 行**的
 * 类型级 ability——CASL v7 类型级 `can(action, subject)` 不下推 conditions，纳入会静默升为全量放行。
 * 人裁改判（module-rbac-guard-instance-read A1·2026-10-17「同意」·首批仅 list 面）：守卫路径仅对
 * `action==='read'` 放宽为「存在任一匹配 grant 行（含 conditions 行）即放行」——判据直接复用
 * 已验收的 `listPredicate` 三态（kind!=='none'），行可见集仍由列表面谓词下推治理（「列表 ⊆ 逐条」
 * 同源同解·无越权增量）；写动作（create/update/delete/cancel）防线原样不变。
 * S4（check 级·乙裁）：当 `check.resource` 存在时走**实例判定**——纳入全部 grant 行、把 `{{userId}}`
 * 模板按 `check.userId` 解析为实值后携 `__caslSubjectType__` 交 CASL mongo 匹配；query 级列表过滤仍缓账。
 */
@Injectable()
export class CaslPermissionChecker implements PermissionChecker, PermissionInvalidator {
  constructor(
    @Inject(TENANT_RBAC_REPOSITORY) private readonly rbac: TenantRbacRepository,
    @Inject(TenantIsolationService) private readonly ctx: TenantIsolationService,
  ) {}

  /** `(tenant,key)` 复合键 → 在途/已决投影 Promise（防并发重入·加载失败即时淘汰）。 */
  private readonly abilities = new Map<string, Promise<CachedEntry>>();

  async can(check: PermissionCheckInput): Promise<boolean> {
    const { tenantId, role, action, subject } = check;
    // fail-closed：无租户上下文 / 无角色 → 直拒，不触规则源。
    if (!tenantId || !role) return false;
    const cacheKey = `${tenantId}\u0000${role}`;
    try {
      const entry = await this.entryFor(cacheKey, tenantId, role);
      // 守卫路径（不带 resource）。
      if (check.resource === undefined) {
        // 人裁 A1（module-rbac-guard-instance-read·仅 list 面）：read 入口级判定复用
        // `listPredicate` 三态——存在任一匹配 grant 行（含 conditions 行）即过门；行级可见
        // 仍由列表面谓词下推治理。守卫面无 userId 不影响过门（模板留字面 → 行落空 deny）。
        if (action === 'read') {
          const pred = await this.listPredicate({ tenantId, role, action, subject });
          return pred.kind !== 'none';
        }
        // 写动作：类型级判定·复用缓存 ability·conditions 行保守 deny（S2 防线原样）。
        return entry.typeLevel.can(action, subject);
      }
      // 实例路径（check 级·S4）：纳入全部 grant 行·按操作者解析 {{userId}} 后交 CASL mongo 匹配。
      const instance = buildScopedAbility(
        entry.grants.map((g) => ({
          subject: g.subject,
          action: g.action,
          conditions: resolveConditions(g.conditions ?? null, check.userId),
        })),
      );
      return instance.can(action, { __caslSubjectType__: subject, ...check.resource });
    } catch {
      // 加载失败绝不视同放行：淘汰缓存以待下次重试，本次 deny（fail-closed）。
      this.abilities.delete(cacheKey);
      return false;
    }
  }

  /** 失效本租户全部角色投影（写侧热改生效面·实现 `PermissionInvalidator`·S3 门面写后调用）。 */
  invalidate(tenantId: string): void {
    const prefix = `${tenantId}\u0000`;
    for (const key of this.abilities.keys()) {
      if (key.startsWith(prefix)) this.abilities.delete(key);
    }
  }

  /**
   * query 级列表谓词（module-rbac-query-level-filtering 切片 B·dynamic-roles §2.4 缓账兑现）。
   * 复用 `entryFor` 同一缓存（不逐请求查库）·与 `can` 同源同解：
   *  - 无租户/无角色 → none（fail-closed·与 `can` 同前置）；
   *  - action/subject 精确匹配行（词表无 manage/all 通配）：零行 → none；
   *  - 存在任一 conditions=null 类型级行 → all（无条件全量·人裁②$or 并入 TRUE 支·与 CASL check 级同解）；
   *  - 否则全带 conditions 行→切片 A 转换器→$or 合并 → where（单行省一层 $or）；
   *  - 转换器 grammar 外抛错 / 加载抛错 → catch 归 none + 汰缓存（fail-closed 双保险）。
   */
  async listPredicate(check: PermissionListPredicateRequest): Promise<PermissionListPredicate> {
    const { tenantId, role, action, subject } = check;
    if (!tenantId || !role) return { kind: 'none' };
    const cacheKey = `${tenantId}\u0000${role}`;
    try {
      const entry = await this.entryFor(cacheKey, tenantId, role);
      const matched = entry.grants.filter((g) => g.action === action && g.subject === subject);
      if (matched.length === 0) return { kind: 'none' };
      // 人裁②：存在无条件类型级行 ⇒ 该角色对此 action/subject 有无条件全量授权。
      if (matched.some((g) => (g.conditions ?? null) === null)) return { kind: 'all' };
      // 全部带 conditions 行 → 逐行译词 → $or 合并（matched 已排 conditions=null，故非 null）。
      const rowPredicates = matched.map((g) =>
        toMikroPredicate(g.conditions as Record<string, unknown>, check.userId),
      );
      const merged = mergePredicatesWithOr(rowPredicates);
      return merged ? { kind: 'where', where: merged } : { kind: 'none' };
    } catch {
      // 不可解析/加载失败绝不回退全量：汰缓存 + 归空集（fail-closed）。
      this.abilities.delete(cacheKey);
      return { kind: 'none' };
    }
  }

  private entryFor(cacheKey: string, tenantId: string, roleKey: string): Promise<CachedEntry> {
    let pending = this.abilities.get(cacheKey);
    if (!pending) {
      pending = this.buildEntry(tenantId, roleKey);
      this.abilities.set(cacheKey, pending);
    }
    return pending;
  }

  private async buildEntry(tenantId: string, roleKey: string): Promise<CachedEntry> {
    // lazy-ensure 纯租级（片三 K5）：角色无归属组织可盖·不再传活动组织（缺活动组织仍能懒建租级行）。
    await this.rbac.ensureSystemRoles(tenantId);
    // 查无角色（null）与零授权（[]）同归空 grants → 类型级/实例级投影皆落空 → 全拒（fail-closed 双保险）。
    const grants = (await this.rbac.findGrants(tenantId, roleKey)) ?? [];
    // 类型级投影：over-grant 防线——conditions 行（conditions≠null）不入类型级 ability。
    const typeLevel = buildScopedAbility(grants.filter((g) => (g.conditions ?? null) === null));
    return { grants, typeLevel };
  }
}
