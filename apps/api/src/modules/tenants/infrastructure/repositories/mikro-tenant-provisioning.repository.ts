import { Organization } from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import type {
  TenantProvisioningReceipt,
  TenantProvisioningRepository,
} from '../../domain/repositories/tenant-provisioning.repository';
import { Tenant } from '../entities/tenant.entity';

/**
 * ORM 修宪案 B · 切片 3d（S-d2）· global-tenant-entity-reclamation 切片 B 换轨 ——
 * Provisioning gateway 的 **MikroORM 适配**（`TENANT_PROVISIONING_REPOSITORY` 绑定·MikroORM 为唯一实现）。
 *
 * `submit` 两段：① BA `createOrganization` 服务端系统动作（无 session + `body.userId` →
 * `isSystemAction`，源码坐实不受 HTTP 层 `allowUserToCreateOrganization:false` 封禁），
 * 申请人经 BA 原生成首名 owner member（FR-12）——**BA 面不再携任何我方寄居键**（旧
 * `metadata.status`/`appliedAt` 均随收权案退场，申请时刻由户籍行 `createdAt` 承担）；
 * ② 同流紧接着 `tenant` 户籍行 upsert（`pending_approval`·新行不携 `updatedAt`=建后未改·L2）。
 * ⚠ 建行非事务于 BA 写——存在毫秒级「本体已立、户籍未入」窗口（无户籍=deny-list 不拦），
 * 而 submit 系受信系统动作、返回前必完两步，FR-1 闭环实质不变；户籍写失败即 loud fail、
 * 申请可重提（upsert 幂等）。
 *
 * `remove` 采 `em.nativeDelete(Organization, {id})`（纯 SQL DELETE·六子表由 DB FK `onDelete:cascade`
 * 自动消灭含 `tenant`·pending 期零业务数据）·`>0` 为实删——与切片 3c-ii-B 治理读面 `destroy`（R-B3）
 * 同形同律·绝不用 `em.remove` 以免 ORM 级联/身份图分歧。`organization`/`tenant` 属 `tenants` 上下文
 * （表所有权单源），本类在 `modules/tenants/**` 内写自身 owned 表 → 写侧纪律天然合规，无需新增例外。
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
      body: { name, slug, userId },
    });
    const organizationId = created?.id ? String(created.id) : '';
    if (!organizationId) throw new Error('createOrganization returned no organization id');
    // 户籍行紧随：新行 upsert 不携 updatedAt（建后未改即 NULL·L2）·createdAt 走 DB 默认。
    const em = await this.mikro.fork();
    await em.upsert(Tenant, { id: organizationId, status: TENANT_STATUS.PENDING } as never);
    return { organizationId, status: TENANT_STATUS.PENDING };
  }

  async remove(organizationId: string): Promise<boolean> {
    // nativeDelete＝纯 SQL DELETE·FK cascade 由 DB 层清 member/invitation/workspace/tenant_subscription/post/tenant（R-B3 同律）。
    const em = await this.mikro.fork();
    const affected = await em.nativeDelete(Organization, { id: organizationId } as never);
    return affected > 0;
  }
}
