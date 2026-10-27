import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantRoleAssignment } from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import type { TenantRole } from '@core/saas-kit/authorization/authorization-rules';
import type {
  TenantScopeResolution,
  TenantScopeResolver,
} from '@core/saas-kit/tenant-isolation/tenant-scope-resolver.port';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `TenantScopeResolver` 的 **MikroORM 适配**（global-tenant-organization-rehierarchy 切片 C · 换轴派生链
 * 应用侧落地·沿 `AuthSessionReader` 端口倒置同构）。
 *
 * 单查 `organization.tenantId` 真列（活动组织 → 所属租户）：本体缺失/未归属（expand 段未盖章增量）
 * → `undefined`，由中间件不绑主轴、guard fail-closed 403。**纯读**——继租户归属后「顺带读回」
 * 该租户的 `orgVisibility`（第三次复裁切片 3·供切片 1 全局 filter 消费），同一次 fork 二查询、无额外
 * 上下文依赖。绝不在此懒建租户行（读路径生写违 CQRS 纪律；租户归属由写链显式盖章：provisioning.submit /
 * seed / 切片 D 租内自助建 org）。每次 `fork()` 取独立 em（沿各仓储适配同律）。
 */
@Injectable()
export class MikroTenantScopeResolver implements TenantScopeResolver {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async resolveTenantScopeOf(organizationId: string): Promise<TenantScopeResolution | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(Organization, { id: organizationId } as never, {
      fields: ['id', 'tenantId'] as never,
    });
    const tenantId = row?.tenantId ?? undefined;
    if (!tenantId) return undefined;
    // 顺带读回租户的租内可见性策略（Tenant 根表无隔离 filter·纯读无副作用）。
    const tenant = await em.findOne(Tenant, { id: tenantId } as never, {
      fields: ['id', 'orgVisibility'] as never,
    });
    return { tenantId, orgVisibility: tenant?.orgVisibility };
  }

  /**
   * 直读给定租户的 `orgVisibility`（第三次复裁切片 4·D7 显式租级激活路径：会话携 activeTenantId
   * 但无活动组织时·中间件据此读回可见性供切片 1 filter 消费）。Tenant 根表无隔离 filter·纯读无副作用；
   * 本体缺失/读不回 → undefined（视同 shared）。
   */
  async readOrgVisibility(tenantId: string): Promise<string | undefined> {
    const em = await this.mikro.fork();
    const tenant = await em.findOne(Tenant, { id: tenantId } as never, {
      fields: ['id', 'orgVisibility'] as never,
    });
    return tenant?.orgVisibility;
  }

  /**
   * 按**活动租户**读自有 `tenant_role_assignment` 解析会话角色（global-role-membership-tenantization
   * 切片 C 换源·弃 BA `getActiveMemberRole` org 维）：`unique(tenantId,userId)` 至多一行，取 `roleKey`。
   * `tenant_role_assignment` 不入全局 `tenantIsolation` filter 注册集（同 `tenant_role*` 目录表口径）·
   * 故经显式 `where{tenantId,userId}` 锚定即可·无分配行 → `undefined`（中间件/守卫 fail-closed）。纯读、无副作用。
   */
  async resolveTenantRole(tenantId: string, userId: string): Promise<TenantRole | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(TenantRoleAssignment, { tenantId, userId });
    const roleKey = row?.roleKey;
    return typeof roleKey === 'string' && roleKey.length > 0 ? roleKey : undefined;
  }
}
