import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantMembership } from '@app/modules/authorization/infrastructure/entities/rbac.entities';
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
 * X7 R3 换锚（global-role-membership-tenantization 切片 D）：顶层**可切换租集**改以自有 `tenant_membership`
 * 租成员为 SSOT（不再仅凭 BA `member` org 轴）——否则经新 `tenant_invitation` 入租者只有租成员行、无 BA
 * member 行 → 目录不含该租 → `setActiveTenant` 成员闸（复用本读面）切他租恒 403 → 新轴上 **X1 锁死复发**。
 * 取**并集**而非替换：租集 = `tenant_membership` ∪ BA member 派生租（`org.tenantId ?? org.id`）——后者保留
 * expand 段未盖章增量（`tenantId` 缺席回落自身 id 作 1:1 租户替身）的可见性，回填收敛后自然为前者子集。
 * 二级 `organizations` 仍按 BA member org 归组（org 降为数据分组事实·与授权轴正交；纯租级成员无 org 行则子集为空）。
 * `as never` 仅系调用边界 cast（`mikro-orm.factory.ts` 以 `entities as never` 装配致 `FilterQuery`/`fields`
 * 宽化不匹配·不改运行时谓词）；`tenant_membership` 简单等值无投影→零 cast。
 *
 * **P0 修复 X1（锁死链）· scoped:false 必守**：本读面是**按 `userId` 收敛的天然跨租名册**（非租户自服务面），
 * 须 `fork({ scoped: false })` 绕 tenantId 全局 filter——否则带会话打 `/tenants` 时 ALS 已绑活动租 → `Organization`
 * 被过滤到本租 → 多租用户目录丢他租 org → 成员闸切他租恒 403 → 锁死。安全不降级：可见集仍由 `userId`
 * 命中 `tenant_membership`/`member` 行界定，无跨用户泄露。
 */
@Injectable()
export class MikroTenantDirectoryRepository implements TenantDirectoryRepository {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async listForUser(userId: string): Promise<TenantDirectoryEntry[]> {
    // P0 修复 X1 + R3 换锚：跨租名册须 scoped:false 绕 tenantId 全局 filter（详见类注）。
    const em = await this.mikro.fork({ scoped: false });

    // ① 租成员 SSOT：`tenant_membership` 定可切换顶层租集（修 R3——经新邀请入租者自此可见可切）。
    const memberships = await em.find(TenantMembership, { userId });
    const ssoTenantIds = [...new Set(memberships.map((m) => m.tenantId))];

    // ② org 分组事实（BA member org 轴·数据可见非授权·过渡期未盖章 org 亦经此路径保可见·回填后收敛为①子集）。
    const members = await em.find(Member, { userId } as never, {
      fields: ['organizationId'] as never,
    });
    const orgIds = [
      ...new Set(members.map((m) => (m as { organizationId: string }).organizationId)),
    ];
    const orgs = orgIds.length
      ? ((await em.find(Organization, { id: { $in: orgIds } } as never, {
          fields: ['id', 'name', 'slug', 'tenantId'] as never,
        })) as { id: string; name: string; slug: string; tenantId: string | null }[])
      : [];

    // ③ 顶层租集并集：SSOT 租 ∪ org 派生租（`org.tenantId ?? org.id`·1:1 骨架替身）。
    const derivedFromOrg = orgs.map((o) => o.tenantId ?? o.id);
    const tenantIdSet = [...new Set([...ssoTenantIds, ...derivedFromOrg])];
    if (tenantIdSet.length === 0) return [];

    // 准入态/命名（切片 6 D3）：按并集租 id 批量取 `tenant`（`status` 单一锥归位 tenant.status）。
    const tenantRows = (await em.find(Tenant, { id: { $in: tenantIdSet } } as never, {
      fields: ['id', 'name', 'slug', 'status'] as never,
    })) as { id: string; name: string; slug: string; status: string }[];
    const tenantById = new Map(tenantRows.map((t) => [t.id, t]));

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
    const ensureEntry = (
      tenantId: string,
      fallbackOrg?: { name: string; slug: string },
    ): NonNullable<ReturnType<typeof grouped.get>> => {
      let entry = grouped.get(tenantId);
      if (!entry) {
        const tenant = tenantById.get(tenantId);
        entry = {
          tenantId,
          // 名/slug：优先租户行（FK 保证存在），回落 org 替身（1:1 骨架）；纯租级成员（无 org）取租户行。
          name: tenant?.name ?? fallbackOrg?.name ?? '',
          slug: tenant?.slug ?? fallbackOrg?.slug ?? '',
          // 切片 6（D3）：`organization.status` 列已 DROP·准入态单一锥归位 `tenant.status`；租户行缺席回落 active。
          status: (tenant?.status ?? TENANT_STATUS.ACTIVE) as TenantStatus,
          organizations: [],
        };
        grouped.set(tenantId, entry);
      }
      return entry;
    };

    // 先建 SSOT 租条目（即便无 org 行·租成员即可见可切换·修 R3 锁死）。
    for (const tenantId of ssoTenantIds) ensureEntry(tenantId);
    // 再按 org 派生租归组（附 org 子集·未盖章骨架亦入·派生租若新于 SSOT 则补建）。
    for (const org of orgs) {
      const derived = org.tenantId ?? org.id;
      ensureEntry(derived, org).organizations.push({
        organizationId: org.id,
        name: org.name,
        slug: org.slug,
      });
    }
    return [...grouped.values()];
  }
}
