import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Member } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
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
 * 由 `QuotaService`（tenancy 层唯一卡点·FR-7）传入·本 store 非 ALS 作用域（与 3c-i `MikroOrganizationStatusStore`
 * 同构·配额裁决/回落逻辑留在 core）。每次 `fork()` 取独立 em（禁共享全局 em）。
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

  async countMembers(tenantId: string): Promise<number> {
    const em = await this.mikro.fork();
    return em.count(Member, { organizationId: tenantId } as never);
  }
}
