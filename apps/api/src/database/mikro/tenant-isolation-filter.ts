import { tenantIsolationStorage } from '@core/saas-kit/tenant-isolation/tenant-isolation-scope';
import type { EntityManager } from '@mikro-orm/core';

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
 * filter 条件工厂：有 tenantId 恒挂 `tenantId=:t`；isolated 且有活动 org 追加 `organizationId=:org`。
 * 无 tenantId 上下文 → `{}`（不筛·豁免/跨租面无 ALS 租户上下文时命中此支）。
 */
export function tenantIsolationCondition(args: TenantFilterArgs = {}): Record<string, unknown> {
  if (!args.tenantId) return {};
  const cond: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.orgIsolated && args.organizationId) cond.organizationId = args.organizationId;
  return cond;
}

/** 实体 `defineEntity({ filters })` 复用的单例定义（`default:true` 使常规 fork 默认生效）。 */
export const TENANT_ISOLATION_ENTITY_FILTER = {
  name: TENANT_ISOLATION_FILTER,
  cond: (args: TenantFilterArgs) => tenantIsolationCondition(args),
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
