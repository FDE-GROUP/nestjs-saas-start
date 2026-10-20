import { Organization } from '@app/database/ba/entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { TenantStatusStore } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.store';
import { Inject, Injectable } from '@nestjs/common';

/**
 * ORM 修宪案 B · 切片 3c-i —— `TenantStatusStore` 的 **MikroORM 适配**（`TENANT_STATUS_STORE` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * 直接落 Better Auth 的 `organization.metadata`（jsonb）·不另建表/列 → 无迁移（与旧实现 版同律·
 * 租户状态读写唯一卡点 `TenantStatusService` 经端口消费·不感知 ORM）。走 `organization` **BA 实体**
 * （切片 1 `entities.ts` 已含 `metadata`(json) + `updatedAt`·无需补实体）。`load` 行不存在 →
 * `undefined`（fail-closed·与「存在但 metadata 为 null」区分）；`save` 走 `nativeUpdate` 直发 UPDATE
 * （携 `updatedAt`）·不经 Identity Map/UnitOfWork·无状态 store 语义最贴。每次 `fork()` 取独立 em。
 */
@Injectable()
export class MikroTenantStatusStore implements TenantStatusStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async load(organizationId: string): Promise<{ metadata: unknown } | undefined> {
    const em = await this.mikro.fork();
    const org = await em.findOne(Organization, organizationId);
    return org ? { metadata: org.metadata } : undefined;
  }

  async save(organizationId: string, metadata: Record<string, unknown>): Promise<void> {
    const em = await this.mikro.fork();
    await em.nativeUpdate(Organization, organizationId, { metadata, updatedAt: new Date() });
  }
}
