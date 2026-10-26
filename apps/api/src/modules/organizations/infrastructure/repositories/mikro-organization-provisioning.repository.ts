import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { Inject, Injectable } from '@nestjs/common';
import type {
  OrganizationProvisioningReceipt,
  OrganizationProvisioningRepository,
} from '../../domain/repositories/organization-provisioning.repository';

/**
 * ORM 修宪案 B · 切片 3d（S-d2）· global-governance-lifecycle-consolidation 切片 B 归列 ——
 * Provisioning gateway 的 **MikroORM 适配**（`ORGANIZATION_PROVISIONING_REPOSITORY` 绑定·MikroORM 为唯一实现）。
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
 * （表所有权单源），本类在 `modules/organizations/**` 内写自身 owned 表 → 写侧纪律天然合规，无需新增例外。
 *
 * 换轴写链（global-tenant-organization-rehierarchy 切片 E-F 治理换轴）：新建组织去审批化（BA 建的
 * org 行 `status` 落 DB 默认 'active'·不再手覆 pending），申请准入态**上移 `tenant.status`**——本链
 * 为新建**租户**盖 `pending_approval` 并盖 `organization.tenantId`（1:1 骨架沿回填同式·`tenant.id = org.id`）。
 * 缺租户盖章则新 org 无主轴归属·隔离 guard fail-closed 全量 403。
 */
@Injectable()
export class MikroOrganizationProvisioningRepository implements OrganizationProvisioningRepository {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
  ) {}

  async submit(
    userId: string,
    name: string,
    slug: string,
  ): Promise<OrganizationProvisioningReceipt> {
    const auth = this.authInstance.get();
    if (!auth) throw new Error('Auth instance not initialized');
    const created = await auth.api.createOrganization({
      body: { name, slug, userId },
    });
    const organizationId = created?.id ? String(created.id) : '';
    if (!organizationId) throw new Error('createOrganization returned no organization id');
    // 治理换轴归位（rehierarchy E-F）：租户准入态落 `tenant.status` = pending_approval（审批对象）；
    // 同流 ensure 专属租户行（1:1 骨架·id=orgId）并盖 organization.tenantId（缺此环则新 org 无主轴 403）。
    // 组织本体去审批化——BA 建后 status 保持默认 'active'，不再手覆 pending。
    const em = await this.mikro.fork();
    if (!(await em.findOne(Tenant, { id: organizationId }))) {
      em.create(Tenant, {
        id: organizationId,
        name,
        slug,
        status: ORGANIZATION_STATUS.PENDING,
        createdAt: new Date(),
        updatedAt: null,
      });
      await em.flush();
    }
    await em.nativeUpdate(Organization, { id: organizationId } as never, {
      tenantId: organizationId,
    });
    return { organizationId, status: ORGANIZATION_STATUS.PENDING };
  }

  async remove(organizationId: string): Promise<boolean> {
    // nativeDelete＝纯 SQL DELETE·FK cascade 由 DB 层清 member/invitation/workspace/post（R-B3 同律·旧 organization_subscription 表已随片二 K2 DROP·订阅锚上移 tenant）。
    // 治理换轴（rehierarchy E-F）：驳回 pending 申请 = 连专属租户行一并硬删（1:1 骨架·tenant.id=org.id）：
    // 先删组织（子表 FK 级联）再删租户父行，避免 organization.tenantId FK 悬挂。
    const em = await this.mikro.fork();
    const affected = await em.nativeDelete(Organization, { id: organizationId } as never);
    if (affected > 0) {
      await em.nativeDelete(Tenant, { id: organizationId } as never);
    }
    return affected > 0;
  }
}
