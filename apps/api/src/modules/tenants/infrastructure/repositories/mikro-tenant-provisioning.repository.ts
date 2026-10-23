import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { Organization } from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import type {
  TenantProvisioningReceipt,
  TenantProvisioningRepository,
} from '../../domain/repositories/tenant-provisioning.repository';

/**
 * ORM 修宪案 B · 切片 3d（S-d2）· global-governance-lifecycle-consolidation 切片 B 归列 ——
 * Provisioning gateway 的 **MikroORM 适配**（`TENANT_PROVISIONING_REPOSITORY` 绑定·MikroORM 为唯一实现）。
 *
 * `submit` 两段：① BA `createOrganization` 服务端系统动作（无 session + `body.userId` →
 * `isSystemAction`，源码坐实不受 HTTP 层 `allowUserToCreateOrganization:false` 封禁），
 * 申请人经 BA 原生成首名 owner member（FR-12）——BA 建的 org 行 `status` 落 DB 默认 'active'；
 * ② 同流紧接着 `nativeUpdate(Organization, {id}, {status: pending_approval})` 显式覆写——
 * 自助建租必经此单点盖 pending（堵 O1 fail-open）·不盖 `updatedAt`（刚 provision·未被治理，
 * 组生命周期列初态入册·沿 L2 建后未改即 NULL）。
 * ⚠ 两段非事务于 BA 写——存在毫秒级「本体已立、态未翻」窗口（此窗内 org 瞬时 'active'），
 * 而 submit 系受信系统动作、返回前必完两步，FR-1 闭环实质不变；态写失败即 loud fail、申请可重提。
 *
 * `remove` 采 `em.nativeDelete(Organization, {id})`（纯 SQL DELETE·五子表由 DB FK `onDelete:cascade`
 * 自动消灭·pending 期零业务数据）·`>0` 为实删——与切片 3c-ii-B 治理读面 `destroy`（R-B3）
 * 同形同律·绝不用 `em.remove` 以免 ORM 级联/身份图分歧。`organization` 属 `tenants` 上下文
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
    // 紧随覆写：显式置 pending_approval（堵 O1）·不盖 updatedAt（provision 非治理·建后未改）。
    const em = await this.mikro.fork();
    await em.nativeUpdate(Organization, { id: organizationId } as never, {
      status: ORGANIZATION_STATUS.PENDING,
    });
    return { organizationId, status: ORGANIZATION_STATUS.PENDING };
  }

  async remove(organizationId: string): Promise<boolean> {
    // nativeDelete＝纯 SQL DELETE·FK cascade 由 DB 层清 member/invitation/workspace/tenant_subscription/post（R-B3 同律）。
    const em = await this.mikro.fork();
    const affected = await em.nativeDelete(Organization, { id: organizationId } as never);
    return affected > 0;
  }
}
