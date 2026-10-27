import { tenantIsolationStorage } from '@core/saas-kit/tenant-isolation/tenant-isolation-scope';
import type { EntityManager, EntityName } from '@mikro-orm/core';

/**
 * MikroORM 全局行级隔离 filter（global-tenant-organization-rehierarchy 第三次复裁 · 切片 1）。
 *
 * 立意（评审 pt6）：租内跨组织可见性自本复裁起为可强制的权限/机密维，行级隔离须由**机制**（全局
 * filter）而非仅**手写谓词纪律**兜底。本模块把「在册租户作用域业务实体」的读/改/删统一挂一道
 * `tenantId` 恒过滤，并在每租户策略 `orgVisibility=isolated` 且已激活组织时追加 `organizationId` 收窄。
 *
 * 安全底线不可动摇：`tenantId` 仍是永不放松的跨租硬地板；filter 只在**租内**收紧，绝不利弱跨租
 * fail-closed。**双保险**——存量仓储手写 `{tenantId}` where 一律保留不删（机制 + 纪律并存）。
 *
 * fail-open 豁免语义（关键）：filter `default:true`，但 `cond` 在**无活动 tenantId 上下文**时返回 `{}`
 * （恒真·不筛）——平台治理/租户目录/seed/provisioning saga/迁移等**跨租或无请求上下文**的读写天然
 * 不被过滤（它们本就无 ALS 租户上下文）；`scoped:false` 供「有上下文仍须跨租」面显式绕过（见
 * `MikroOrmService.fork`）。故本机制是租户上下文内的纵深防御，不改变无上下文面的既有行为。
 *
 * `orgVisibility` 字段由切片 3 落 `TenantIsolationScope`/DB；本切片先按缺省（非 isolated·shared）
 * 读回，forward-compatible，切片 3 落地后自动激活 org 收窄。
 */

/** filter 名（实体 `filters` 字典键 + em 参数存取键·全仓单点）。 */
export const TENANT_ISOLATION_FILTER = 'tenantIsolation';

/** filter 运行参数（由 ALS 作用域经 `MikroOrmService.fork` 注入 `em.setFilterParams`）。 */
export interface TenantFilterArgs {
  tenantId?: string;
  organizationId?: string;
  /** 租内是否强制组织隔离（`tenant.orgVisibility === 'isolated'`·缺省 false=shared 互见）。 */
  orgIsolated?: boolean;
}

/**
 * filter 判定的**实体维上下文**（P0 X3）：谓词除 ALS 参数外，须知道当前被筛实体是否为
 * org-partitioned（携 `organizationId` 分区列）——据此在 `isolated + 无活动 org` 下决定收 fail-closed。
 */
export interface TenantFilterCtx {
  /** 目标实体是否携带 `organizationId` 分区列（true 时 isolated 无 org 上下文收拒所有）。 */
  orgPartitioned?: boolean;
}

/** 从 ALS 当前作用域派生 filter 参数（无上下文→全 undefined→`cond` 恒真不筛）。 */
export function tenantFilterArgsFromScope(): TenantFilterArgs {
  const scope = tenantIsolationStorage.getStore();
  if (!scope) return {};
  // orgVisibility 由切片 3 补入 scope；此处按可选读回，forward-compatible。
  const orgVisibility = (scope as { orgVisibility?: string }).orgVisibility;
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    orgIsolated: orgVisibility === 'isolated',
  };
}

/**
 * P0 X3 拒所有哨兵值：`isolated + 无 org` 命中 org-partitioned 在册实体时挂于租户地板上，令
 * `tenantId = <不可能 id>` → 空集。**仅对 org-partitioned 实体触发**，而此等实体皆为在册过滤实体
 * （共享 filter 已按 `{tenantId}` 筛之，故必有 `tenantId` 列），此哨兵谓词类型安全且实体无关。
 * 租户/组织 id 皆 `text` 列（见实体定义），故普通不可能字符串即安全拒所有——**切勿含 `\u0000`**：
 * Postgres 文本协议在参数中带 null 字节会抛 `invalid message format`（真库 e2e 实测坐实）。
 */
const TENANT_ISOLATION_DENY_SENTINEL = '__tenant_isolation_deny__';

/**
 * filter 条件工厂：有 tenantId 恒挂 `tenantId=:t`；isolated 且有活动 org 追加 `organizationId=:org`。
 * 无 tenantId 上下文 → `{}`（不筛·豁免/跨租面无 ALS 租户上下文时命中此支）。
 *
 * P0 X3：`isolated 且无活动 org`（显式激活租·未选 org）下——
 *  - org-partitioned 实体（`ctx.orgPartitioned`）→ **fail-closed 拒所有**（不跨 org 泄露·绝不利弱租内机密维）；
 *  - 租级根实体（无 org 维）→ 仅留租户地板（本无 org 可收窄·不受累）。
 */
export function tenantIsolationCondition(
  args: TenantFilterArgs = {},
  ctx: TenantFilterCtx = {},
): Record<string, unknown> {
  if (!args.tenantId) return {};
  if (args.orgIsolated) {
    // 有活动 org：追加 org 收窄（AND 叠加·不做包含校验·越界即空）。
    if (args.organizationId) {
      return { tenantId: args.tenantId, organizationId: args.organizationId };
    }
    // 无活动 org：org-partitioned 实体收拒所有；租级根实体仅留租户地板。
    if (ctx.orgPartitioned) return { tenantId: TENANT_ISOLATION_DENY_SENTINEL };
  }
  return { tenantId: args.tenantId };
}

/**
 * 判定目标实体是否 org-partitioned（携 `organizationId` 分区列）——经 em 元数据自持解析（零手维护登记表）。
 * 元数据 API 缺位/异常 → false（保守：宁退化为仅租户地板·不误伤租级读面；真库 e2e 锁 Workspace/Post 实拒）。
 */
export function isOrgPartitionedEntity(
  em: EntityManager | undefined,
  entityName?: string,
): boolean {
  if (!em || !entityName) return false;
  try {
    const meta = em.getMetadata().find(entityName as unknown as EntityName<object>) as
      | { properties?: Record<string, unknown> }
      | undefined;
    return meta?.properties ? 'organizationId' in meta.properties : false;
  } catch {
    return false;
  }
}

/**
 * 实体 `defineEntity({ filters })` 复用的单例定义（`default:true` 使常规 fork 默认生效）。
 * MikroORM v7 动态 cond 五元形 `(args, op, em, options, entityName)`——借 em/entityName 定
 * org-partitioned 维（P0 X3），shared 与无 org 实体路径与原谓词逐字等价。
 */
export const TENANT_ISOLATION_ENTITY_FILTER = {
  name: TENANT_ISOLATION_FILTER,
  cond: (
    args: TenantFilterArgs,
    _op: 'read' | 'update' | 'delete',
    em: EntityManager,
    _options?: unknown,
    entityName?: string,
  ) => tenantIsolationCondition(args, { orgPartitioned: isOrgPartitionedEntity(em, entityName) }),
  default: true,
} as const;

/** 实体 `filters` 字典片段（各在册业务实体 `defineEntity` / META 复用）。 */
export const TENANT_ISOLATION_FILTERS = {
  [TENANT_ISOLATION_FILTER]: TENANT_ISOLATION_ENTITY_FILTER,
} as const;

/**
 * 在给定 em 上装配租户隔离 filter 参数。scoped 常规 fork 传 ALS 派生参数；
 * `scoped:false`（跨租/治理/seed 面）传 `{}`——filter `cond` 无 tenantId 即恒真不筛，
 * 无须 EM 级 disable（MikroORM v7 filter 开关即由参数驱动·`default:true` 只决定挂不挂、筛不筛看参数）。
 */
export function applyTenantFilterParams(em: EntityManager, args: TenantFilterArgs): void {
  em.setFilterParams(TENANT_ISOLATION_FILTER, args as Record<string, unknown>);
}
