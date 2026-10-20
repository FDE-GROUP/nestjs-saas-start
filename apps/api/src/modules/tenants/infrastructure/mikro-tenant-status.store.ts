import { Organization } from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Tenant } from '@app/modules/tenants/infrastructure/entities/tenant.entity';
import type { TenantStatus } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import type { TenantStatusStore } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.store';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `TenantStatusStore` 的 **MikroORM 适配**（`TENANT_STATUS_STORE` 绑定·MikroORM 为唯一实现·
 * global-tenant-entity-reclamation 切片 B 换轨：状态读写落自有 `tenant` 户籍表，
 * `organization.metadata` 词汇从本链路退场——BA 缩回宪法「纯认证与成员数据源」定位）。
 *
 * 三原语对拍端口语义：
 *  - `readStatus`：`tenant` 行缺失 → `undefined`（存量/seeded 无户籍 = 「无状态记录」·
 *    deny-list 不拦、迁移表视同 active，与旧 metadata 缺键态逐字等价）；
 *  - `organizationExists`：本体存在性单查——`transition` 的 not-found(404) 判据，与户籍行无关；
 *  - `upsert`：`em.upsert` 单语句「有则改、无则建」（不经 Identity Map/UnitOfWork·无状态 store
 *    语义最贴）：无论更新还是首次入册（存量无户籍 org 被治理）均显式盖 `updatedAt`——迁移
 *    即变更，与旧链 `save` 必盖戳口径逐字等价；插入段 `createdAt` 走 DDL `DEFAULT now()`。
 * 每次 `fork()` 取独立 em；`load`/`save` 旧形已随端口翻正删除（不留双通道）。
 */
@Injectable()
export class MikroTenantStatusStore implements TenantStatusStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async readStatus(organizationId: string): Promise<TenantStatus | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(Tenant, { id: organizationId } as never);
    return row?.status;
  }

  async organizationExists(organizationId: string): Promise<boolean> {
    const em = await this.mikro.fork();
    return (await em.findOne(Organization, organizationId)) !== null;
  }

  async upsert(organizationId: string, status: TenantStatus): Promise<void> {
    const em = await this.mikro.fork();
    // 迁移即变更：两段均盖 updatedAt（旧链 save 亦必盖·口径等价）；createdAt 缺省走 DB 默认。
    await em.upsert(Tenant, { id: organizationId, status, updatedAt: new Date() } as never);
  }
}
