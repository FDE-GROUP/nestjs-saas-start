import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { SUBSCRIPTION_STATUS } from '@core/saas-kit/modules/subscriptions/quota/organization-plans';
import type {
  ActiveSubscriptionView,
  QuotaStore,
} from '@core/saas-kit/modules/subscriptions/quota/quota.store';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

/**
 * ORM 修宪案 B · 切片 3c-ii-A —— `QuotaStore` 的 **MikroORM 适配**（`QUOTA_STORE` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * 读 `tenant_subscription` 生效行、数 `member`（core 经端口消费、不感知具体表·§9.5.4①B）。`tenantId`
 * 由 `QuotaService`（tenancy 层唯一卡点·FR-7）传入·本 store 非 ALS 作用域（与 `MikroTenantStatusStore`
 * 同构·配额裁决/回落逻辑留在 core）。每次 `fork()` 取独立 em（禁共享全局 em）。
 *
 * global-tenant-organization-rehierarchy 切片 D（计费单位上移）：生效订阅从 `OrganizationSubscription`（organizationId）
 * 改读 `TenantSubscription`（tenantId）·member 计数按 `tenantId` 聚合（一租多组织下跨租内组织求总）。
 */
@Injectable()
export class MikroQuotaStore implements QuotaStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async currentActiveSubscription(tenantId: string): Promise<ActiveSubscriptionView | null> {
    const em = await this.mikro.fork();
    const rows = await em.find(
      TenantSubscription,
      { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE } as never,
      { orderBy: { periodStart: QueryOrder.DESC }, limit: 1 },
    );
    const row = rows[0];
    return row
      ? {
          plan: row.plan,
          seatsLimit: row.seatsLimit,
          providerCustomerId: row.providerCustomerId ?? null,
        }
      : null;
  }

  /**
   * 当前席位用量 = 读物化列 `tenant.memberCount`（O(1)·第三次复裁切片 5·D6/pt10）。
   *
   * @remarks
   * 本列由 `member` 表上的 AFTER INSERT/DELETE **库级触发器**增量维护（唯一能覆盖 BA 直写 member
   * 全路径·含建租者 auto-join 的物化器）——`countMembers` 不再两跳联表数行。缺租户行按 0 处理
   * （fail-safe·配额卡点自会据 seatsLimit 拒加席）。物化真相与联表实数的**恒等对拍**降级为
   * {@link reconcileMembers}（doctor 口径·不入热路径）。
   */
  async countMembers(tenantId: string): Promise<number> {
    const em = await this.mikro.fork();
    const tenant = (await em.findOne(Tenant, { id: tenantId } as never, {
      fields: ['memberCount'] as never,
    })) as { memberCount: number } | null;
    return tenant?.memberCount ?? 0;
  }

  /**
   * 联表实数（**对拍/doctor 原语**·非热路径计数）：席位按租户聚合 = 该租户下**全部组织**的成员求和。
   *
   * @remarks
   * 经 `organization.tenantId`（provisioning/seed 换轴写链已盖·运行时可靠）联表归属，**不依赖**
   * `member.tenantId`（BA 原生建员只写 organizationId·该列由 migration 回填存量·新运行态 BA 行不盖）。
   * 第三次复裁切片 5：读物化列已顶替本方法成为 `countMembers` 的实现；本方法保留作触发器物化与
   * 联表实数的**恒等校验**（doctor 脚本对拍两值·漂移即报警），不为本表真相来源。
   */
  async reconcileMembers(tenantId: string): Promise<number> {
    const em = await this.mikro.fork();
    const orgs = await em.find(Organization, { tenantId } as never, { fields: ['id'] });
    const orgIds = (orgs as { id: string }[]).map((o) => o.id);
    if (orgIds.length === 0) return 0;
    return em.count(Member, { organizationId: { $in: orgIds } } as never);
  }
}
