import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import type {
  SubscriptionDraft,
  SubscriptionRecord,
  SubscriptionRepository,
} from '@core/saas-kit/modules/subscriptions/domain/repositories/subscription.repository';
import { SUBSCRIPTION_STATUS } from '@core/saas-kit/modules/subscriptions/quota/tenant-plans';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

/**
 * ORM 修宪案 B · 切片 3c-ii-A —— subscriptions 上下文的 **MikroORM 仓储适配**（`SUBSCRIPTION_REPOSITORY` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * **隔离唯一卡点不变**（global-tenancy S7 · FR-5/7/8）：port 不暴露 tenant 参数·所属租户从可信 ALS 经
 * `requireTenantId()` fail-closed 解析（无租户→403·且在取 em **之前**抛出→绝不查库）；`create` 盖章租户
 * 追加一条 `active` 行（1:N 历史·不改旧行），`history` 按 `tenantId` 过滤、`periodStart` 倒序。配额裁决/
 * 限额读取留在 `QuotaService`（tenancy 层单点），本类只管订阅行的写与历史读。去掉任一 `tenantId` 谓词
 * 即令回归红（与旧实现 版同律）。
 *
 * 每次 `fork()` 取独立 em。`updatedAt`/`createdAt` 无 DB 默认（旧 ORM 侧靠 app 盖）·写路径显式赋 `now`；
 * `periodStart` 亦显式赋 `now`（旧 ORM 靠 DB `defaultRaw now()` + `returning` 回读·此处显式赋同值求确定）。
 */
@Injectable()
export class MikroSubscriptionRepository implements SubscriptionRepository {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  private toRecord(entity: TenantSubscription): SubscriptionRecord {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      plan: entity.plan,
      status: entity.status as SubscriptionRecord['status'],
      seatsLimit: entity.seatsLimit,
      storageQuota: entity.storageQuota ?? null,
      apiQuota: entity.apiQuota ?? null,
      periodStart: entity.periodStart,
      periodEnd: entity.periodEnd ?? null,
      provider: entity.provider ?? null,
      providerCustomerId: entity.providerCustomerId ?? null,
      providerSubscriptionId: entity.providerSubscriptionId ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async create(draft: SubscriptionDraft): Promise<SubscriptionRecord> {
    const tenantId = this.tenant.requireTenantId();
    const now = new Date();
    const em = await this.mikro.fork();
    const entity = em.create(TenantSubscription, {
      id: uuidv7(),
      tenantId,
      plan: draft.plan,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      seatsLimit: draft.seatsLimit,
      storageQuota: draft.storageQuota ?? null,
      apiQuota: draft.apiQuota ?? null,
      periodStart: now,
      periodEnd: draft.periodEnd ?? null,
      provider: draft.provider ?? null,
      providerCustomerId: draft.providerCustomerId ?? null,
      providerSubscriptionId: draft.providerSubscriptionId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await em.persist(entity).flush();
    return this.toRecord(entity);
  }

  async history(): Promise<SubscriptionRecord[]> {
    const tenantId = this.tenant.requireTenantId();
    const em = await this.mikro.fork();
    const entities = await em.find(TenantSubscription, { tenantId } as never, {
      orderBy: { periodStart: QueryOrder.DESC },
    });
    return entities.map((entity) => this.toRecord(entity));
  }
}
