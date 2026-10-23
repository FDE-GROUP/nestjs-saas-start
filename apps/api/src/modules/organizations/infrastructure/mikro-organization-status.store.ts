import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import type { OrganizationStatus } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import type { OrganizationStatusStore } from '@core/saas-kit/modules/organizations/lifecycle/organization-status.store';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `OrganizationStatusStore` 的 **MikroORM 适配**（`ORGANIZATION_STATUS_STORE` 绑定·MikroORM 为唯一实现·
 * global-governance-lifecycle-consolidation 切片 B：态从自有 `tenant` 旁表归位 `organization.status`
 * 真列（BA 表共享·additive 自撰域列）·旁表随本案 DROP）。
 *
 * 三原语对拍端口语义：
 *  - `readStatus`：`organization.status` 为 NOT NULL 真列，本体存在即有值（缺席态消失·O1 已堵）；
 *    本体行不存在 → `undefined`（供 `organizationExists` 以外的读兼底）；
 *  - `organizationExists`：本体存在性单查——`transition` 的 not-found(404) 判据；
 *  - `upsert`：治理迁移即变更——`nativeUpdate` 直写 `organization.status` 并盖 `updatedAt`（不经 Identity Map/UnitOfWork。
 *    `transition` 已先 `organizationExists` 卡存本体，此处恒为 UPDATE·不存在则不建行）。
 * 每次 `fork()` 取独立 em。
 */
@Injectable()
export class MikroOrganizationStatusStore implements OrganizationStatusStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async readStatus(organizationId: string): Promise<OrganizationStatus | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(Organization, { id: organizationId } as never);
    return row ? (row.status as OrganizationStatus) : undefined;
  }

  async organizationExists(organizationId: string): Promise<boolean> {
    const em = await this.mikro.fork();
    return (await em.findOne(Organization, organizationId)) !== null;
  }

  async upsert(organizationId: string, status: OrganizationStatus): Promise<void> {
    const em = await this.mikro.fork();
    // 迁移即变更：盖 updatedAt（沿旧链口径）；`transition` 已卡组本体存在，恒为 UPDATE。
    await em.nativeUpdate(Organization, { id: organizationId } as never, {
      status,
      updatedAt: new Date(),
    });
  }
}
