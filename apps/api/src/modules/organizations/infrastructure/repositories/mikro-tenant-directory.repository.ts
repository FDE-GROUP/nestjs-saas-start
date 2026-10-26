import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import type {
  TenantDirectoryEntry,
  TenantDirectoryRepository,
} from '../../domain/repositories/tenant-directory.repository';

/**
 * 租户目录读面的 **MikroORM 适配**（`TENANT_DIRECTORY_REPOSITORY` 绑定指本类）。
 *
 * @remarks
 * 用户级可见面：以 `userId` 命中 `member` 行取成员组织 → 批量取 `organization`（携 `tenantId` 派生边）
 * → 批量取 `tenant` 准入态，内存按 `tenantId` 归组（无关系对象·折叠 LEFT JOIN·沿 governance 同法）。
 * `as never` 仅系调用边界 cast（`mikro-orm.factory.ts` 以 `entities as never` 装配致 `FilterQuery`/`fields`
 * 宽化不匹配·不改运行时谓词）。expand 段未盖章增量的组织（`tenantId` 缺席）回落自身 id 作 1:1 租户替身，
 * 绝不误并他租。
 */
@Injectable()
export class MikroTenantDirectoryRepository implements TenantDirectoryRepository {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async listForUser(userId: string): Promise<TenantDirectoryEntry[]> {
    const em = await this.mikro.fork();
    const members = await em.find(Member, { userId } as never, {
      fields: ['organizationId'] as never,
    });
    const orgIds = [
      ...new Set(members.map((m) => (m as { organizationId: string }).organizationId)),
    ];
    if (orgIds.length === 0) return [];

    const orgs = (await em.find(Organization, { id: { $in: orgIds } } as never, {
      fields: ['id', 'name', 'slug', 'tenantId', 'status'] as never,
    })) as { id: string; name: string; slug: string; tenantId: string | null; status: string }[];

    const tenantIds = [...new Set(orgs.map((o) => o.tenantId).filter((id): id is string => !!id))];
    const tenants = tenantIds.length
      ? ((await em.find(Tenant, { id: { $in: tenantIds } } as never, {
          fields: ['id', 'name', 'slug', 'status'] as never,
        })) as { id: string; name: string; slug: string; status: string }[])
      : [];
    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    const grouped = new Map<
      string,
      {
        tenantId: string;
        name: string;
        slug: string;
        status: OrganizationStatus;
        organizations: { organizationId: string; name: string; slug: string }[];
      }
    >();
    for (const org of orgs) {
      const tenantId = org.tenantId ?? org.id;
      const tenant = tenantById.get(tenantId);
      let entry = grouped.get(tenantId);
      if (!entry) {
        entry = {
          tenantId,
          name: tenant?.name ?? org.name,
          slug: tenant?.slug ?? org.slug,
          status: (tenant?.status ?? org.status) as OrganizationStatus,
          organizations: [],
        };
        grouped.set(tenantId, entry);
      }
      entry.organizations.push({ organizationId: org.id, name: org.name, slug: org.slug });
    }
    return [...grouped.values()];
  }
}
