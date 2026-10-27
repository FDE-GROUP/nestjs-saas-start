import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import {
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
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
 *
 * **P0 修复 X1（锁死链）· scoped:false 必守**：本读面是**按 `userId` 收敛的天然跨租名册**（非租户自服务面），
 * 须 `fork({ scoped: false })` 绕 tenantId 全局 filter——否则带会话打 `/tenants` 时 ALS 已绑活动租 → `Organization`
 * 被过滤到本租 → 多租用户目录丢他租 org → `setActiveTenant` 成员闸（复用本读面）切他租恒 403 → 锁死。安全不降级：
 * 可见集仍由 `userId` 命中 `member` 行界定，无跨用户泄露。
 */
@Injectable()
export class MikroTenantDirectoryRepository implements TenantDirectoryRepository {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async listForUser(userId: string): Promise<TenantDirectoryEntry[]> {
    // P0 修复 X1：跨租名册须 scoped:false 绕 tenantId 全局 filter（详见类注），否则带会话请求只回本租 org。
    const em = await this.mikro.fork({ scoped: false });
    const members = await em.find(Member, { userId } as never, {
      fields: ['organizationId'] as never,
    });
    const orgIds = [
      ...new Set(members.map((m) => (m as { organizationId: string }).organizationId)),
    ];
    if (orgIds.length === 0) return [];

    const orgs = (await em.find(Organization, { id: { $in: orgIds } } as never, {
      fields: ['id', 'name', 'slug', 'tenantId'] as never,
    })) as { id: string; name: string; slug: string; tenantId: string | null }[];

    // 准入态单一锥归位 `tenant.status`（切片 6 D3）：解析租户 id 集时按「org.tenantId ?? org.id」取
    //——1:1 骨架（tenantId 缺席）以 org.id 命中同键替身租户行，避免回落无租户态默认。
    const tenantIds = [...new Set(orgs.map((o) => o.tenantId ?? o.id))];
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
        status: TenantStatus;
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
          // 切片 6（D3）：`organization.status` 列已 DROP·准入态单一锥归位 `tenant.status`；1:1 骨架未盖租
          // （tenant 行缺席）回落 active（与 deny-list / canTransition 缺省同口径）。
          status: (tenant?.status ?? TENANT_STATUS.ACTIVE) as TenantStatus,
          organizations: [],
        };
        grouped.set(tenantId, entry);
      }
      entry.organizations.push({ organizationId: org.id, name: org.name, slug: org.slug });
    }
    return [...grouped.values()];
  }
}
