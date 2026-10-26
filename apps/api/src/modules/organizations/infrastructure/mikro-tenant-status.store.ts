import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import type { TenancyStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { TenantStatusStore } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.store';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `TenantStatusStore` 的 **MikroORM 适配**（`TENANT_STATUS_STORE` 绑定·MikroORM 为唯一实现·
 * global-tenant-organization-rehierarchy 切片 E-F 治理换轴：治理准入态从 `organization.status`
 * 上移归位 `tenant.status` 真列——`tenant` 为组织之父行·表属主=organizations）。
 *
 * 三原语端口语义（锚定表为 tenant）：
 *  - `readStatus`：`tenant.status` NOT NULL 真列，本体存在即有值；本体行不存在 → `undefined`；
 *  - `tenantExists`：`tenant` 行存在性单查——`transition` 的 not-found(404) 判据；
 *  - `upsert`：治理迁移即变更——`nativeUpdate` 直写 `tenant.status` 并盖 `updatedAt`（不经 Identity Map）。
 * 每次 `fork()` 取独立 em。
 */
@Injectable()
export class MikroTenantStatusStore implements TenantStatusStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async readStatus(tenantId: string): Promise<TenancyStatus | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(Tenant, { id: tenantId } as never);
    return row ? (row.status as TenancyStatus) : undefined;
  }

  async tenantExists(tenantId: string): Promise<boolean> {
    const em = await this.mikro.fork();
    return (await em.findOne(Tenant, tenantId as never)) !== null;
  }

  async upsert(tenantId: string, status: TenancyStatus): Promise<void> {
    const em = await this.mikro.fork();
    // 迁移即变更：盖 updatedAt；`transition` 已先卡存本体，恒为 UPDATE。
    await em.nativeUpdate(Tenant, { id: tenantId } as never, {
      status,
      updatedAt: new Date(),
    });
  }
}
