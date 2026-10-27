import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { TenantMembership } from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import {
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
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
   * 当前席位用量 = live `count(tenant_membership)`（X7 R2 换锚·global-role-membership-tenantization 切片 D）。
   *
   * @remarks
   * 席位计量锚从 BA `member` 轴的物化计数（库级 `member` 触发器维护）**上收至自有租级成员 SSOT
   * `tenant_membership`**——否则经 `tenant_invitation`/admin 流入的新租级成员不写 BA member、不被物化
   * 触发器计数 → 席位少算 → **超卖（X8 在新轴重开·R2 计费 fail-open）**。`tenant_membership` 不入全局
   * filter 注册集·显式 `where{tenantId}` 锚定 + `scoped:false` 绕环境 ALS 筛（跨租计量面免误筛）。缺租
   * 成员行→ 0（fail-safe·配额卡点自会据 seatsLimit 拒加席）。物化列 `tenant.memberCount` 与 BA 触发器降为
   * 过渡观测事实·其最终存废随 **X8 契约段**（落库·须人签）一并裁定（口径取 plan L50「live count 免触发器迁移」）。
   */
  async countMembers(tenantId: string): Promise<number> {
    const em = await this.mikro.fork({ scoped: false });
    return em.count(TenantMembership, { tenantId });
  }

  /**
   * 联表实数（**BA 轴过渡观测原语**·非热路径计数·非席位真相）：该租户下**全部组织**的成员求和。
   *
   * @remarks
   * X7 换锚后席位真相已归 {@link countMembers}（live `tenant_membership`）；本方法保留作 BA member 轴
   * **过渡诊断**（与新 SSOT 对拍·供 member-count-doctor 观测遗留脏写/漏路径存量），其命运与
   * `tenant.memberCount` 物化列一并随 **X8 契约段**（落库·须人签）裁定。经 `organization.tenantId` 联表
   * 归属，**不依赖** `member.tenantId`（BA 原生建员只写 organizationId·该列新运行态不盖）。
   */
  async reconcileMembers(tenantId: string): Promise<number> {
    const em = await this.mikro.fork();
    const orgs = await em.find(Organization, { tenantId } as never, { fields: ['id'] });
    const orgIds = (orgs as { id: string }[]).map((o) => o.id);
    if (orgIds.length === 0) return 0;
    return em.count(Member, { organizationId: { $in: orgIds } } as never);
  }
}
