import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import type { TenantScopeResolver } from '@core/saas-kit/tenant-isolation/tenant-scope-resolver.port';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `TenantScopeResolver` 的 **MikroORM 适配**（global-tenant-organization-rehierarchy 切片 C · 换轴派生链
 * 应用侧落地·沿 `AuthSessionReader` 端口倒置同构）。
 *
 * 单查 `organization.tenantId` 真列（活动组织 → 所属租户）：本体缺失/未归属（expand 段未盖章增量）
 * → `undefined`，由中间件不绑主轴、guard fail-closed 403。**纯读**——绝不在此懒建租户行
 * （读路径生写违 CQRS 纪律；租户归属由写链显式盖章：provisioning.submit / seed / 切片 D 租内自助建 org）。
 * 每次 `fork()` 取独立 em（沿各仓储适配同律）。
 */
@Injectable()
export class MikroTenantScopeResolver implements TenantScopeResolver {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async resolveTenantIdOf(organizationId: string): Promise<string | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(Organization, { id: organizationId } as never, {
      fields: ['id', 'tenantId'] as never,
    });
    return row?.tenantId ?? undefined;
  }
}
