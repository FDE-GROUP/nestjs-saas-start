import { Organization } from '@app/database/ba/entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  readTenantStatus,
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import type {
  TenantProvisioningReceipt,
  TenantProvisioningRepository,
} from '../../domain/repositories/tenant-provisioning.repository';

/**
 * ORM 修宪案 B · 切片 3d（S-d2）—— Provisioning gateway 的 **MikroORM 适配**（`TENANT_PROVISIONING_REPOSITORY` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * `submit` **不触任何 ORM 写**——沿用 Better Auth `createOrganization` 服务端系统动作（无 session +
 * `body.userId` → `isSystemAction`，源码坐实不受 HTTP 层 `allowUserToCreateOrganization:false` 封禁），
 * 强制盖 `metadata.status = pending_approval`，申请人经 BA 原生成首名 owner member（FR-12）。故本片的
 * Mikro 迁移仅落在 `remove` 一处。
 *
 * `remove` 采 `em.nativeDelete(Organization, {id})`（纯 SQL DELETE·五子表由 DB FK `onDelete:cascade`
 * 自动消灭·pending 期零业务数据）·`>0` 为实删——与切片 3c-ii-B 治理读面 `destroy`（R-B3）同形同律·
 * 绝不用 `em.remove` 以免 ORM 级联/身份图分歧。`organization` 属 `tenants` 上下文（表所有权单源），
 * 本类在 `modules/tenants/**` 内写自身 owned 表 → 写侧纪律天然合规，无需新增例外。
 */
@Injectable()
export class MikroTenantProvisioningRepository implements TenantProvisioningRepository {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
  ) {}

  async submit(userId: string, name: string, slug: string): Promise<TenantProvisioningReceipt> {
    const auth = this.authInstance.get();
    if (!auth) throw new Error('Auth instance not initialized');
    const created = await auth.api.createOrganization({
      body: {
        name,
        slug,
        userId,
        metadata: { status: TENANT_STATUS.PENDING, appliedAt: new Date().toISOString() },
      },
    });
    const status: TenantStatus = readTenantStatus(created?.metadata) ?? TENANT_STATUS.PENDING;
    return { organizationId: String(created?.id), status };
  }

  async remove(organizationId: string): Promise<boolean> {
    // nativeDelete＝纯 SQL DELETE·FK cascade 由 DB 层清 member/invitation/workspace/tenant_subscription/post（R-B3 同律）。
    const em = await this.mikro.fork();
    const affected = await em.nativeDelete(Organization, { id: organizationId } as never);
    return affected > 0;
  }
}
