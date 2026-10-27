import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import {
  TENANT_MEMBERSHIP_MANAGER,
  type TenantMembershipManager,
} from '@app/modules/authorization/domain/ports/tenant-membership.port';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import { TENANT_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORG_VISIBILITY } from '@core/saas-kit/modules/organizations/visibility/org-visibility';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
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
 * P0 D3（ saga 孤儿补偿 + slug 竞）：我方两段写（Tenant 插 + org 盖章）现入**同一事务**（`em.transactional`），
 * 整段 try/catch——任一失败先回滚我方写、再 `remove(organizationId)` 回收 BA 建的无归属孤儿 org 后重抛；
 * slug 冲突经前置可用性预检（fail-fast 译 409）+ 并发 `tenant_slug_unique` 违例翻译 409（竞态终防线靠库 unique + 补偿）。
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
 *
 * X7 creator-join（global-role-membership-tenantization 切片 D·R1 锁死修复）：BA `createOrganization` 的
 * auto-join 只写 BA `member`（org 维），会话角色自切片 C 改读自有 `tenant_role_assignment`——若建租不补写
 * 租成员/角色，则新建租户创建者无角色→`@Can` 全 403（P0 锁死）。本链在租户事务落成正后、经 `TENANT_MEMBERSHIP_MANAGER`
 * published port（表属 authorization·organizations 不直写他属表·遵 domain-layout）委托 `ensureMembership(…,'owner')`
 * 补写 `(tenantId,userId)` 租成员 + owner 角色分配（roleKey 词汇与 expand 回填一致·系统键小写）；失败走下方 saga 补偿。
 */
@Injectable()
export class MikroOrganizationProvisioningRepository implements OrganizationProvisioningRepository {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    @Inject(TENANT_MEMBERSHIP_MANAGER) private readonly memberships: TenantMembershipManager,
  ) {}

  async submit(
    userId: string,
    name: string,
    slug: string,
  ): Promise<OrganizationProvisioningReceipt> {
    const auth = this.authInstance.get();
    if (!auth) throw new Error('Auth instance not initialized');
    // P0 D3·① slug 可用性预检（fail-fast）：`tenant_slug_unique` 全局唯一——自助建租撞 slug 提前译
    // 409 Conflict（无本体可孤儿），缩窄并发 TOCTOU 窗（终防线仍靠库 unique 违例翻译 + 下方孤儿补偿）。
    // 跨租 slug 检无活动租户上下文，显式 `scoped:false`（与 BA 同域·防在册 filter 误筛 Tenant 读）。
    const probe = await this.mikro.fork({ scoped: false });
    if (await probe.findOne(Tenant, { slug } as never)) {
      throw new ConflictException(`Tenant slug already taken: ${slug}`);
    }
    const created = await auth.api.createOrganization({
      body: { name, slug, userId },
    });
    const organizationId = created?.id ? String(created.id) : '';
    if (!organizationId) throw new Error('createOrganization returned no organization id');
    // 治理换轴归位（rehierarchy E-F）：租户准入态落 `tenant.status` = pending_approval（审批对象）；
    // 同流 ensure 专属租户行（1:1 骨架·id=orgId）并盖 organization.tenantId（缺此环则新 org 无主轴 403）。
    // 组织本体去审批化——BA 建后 status 保持默认 'active'，不再手覆 pending。
    // P0 D3·② 我方两段写（Tenant flush + org stamp）入**同一事务**：任一失败整体回滚，不遗留半提交租户行。
    const em = await this.mikro.fork({ scoped: false });
    try {
      await em.transactional(async (trx) => {
        if (!(await trx.findOne(Tenant, { id: organizationId } as never))) {
          trx.create(Tenant, {
            id: organizationId,
            name,
            slug,
            status: TENANT_STATUS.PENDING,
            // 新建专属租户骨架取缺省可见性策略 shared（零行为变更·租内跨组织互见·切片 3 D2）。
            orgVisibility: ORG_VISIBILITY.SHARED,
            // 席位物化计数初值 0：建租者 member 已随 BA auto-join 落行但 `organization.tenantId` 尚未盖章（NULL），
            // 下方 `nativeUpdate` 盖租时 `organization_tenant_relink_count_sync` 触发器按当前成员数 +N 补计（→ 1）。
            memberCount: 0,
            createdAt: new Date(),
            updatedAt: null,
          });
          await trx.flush();
        }
        await trx.nativeUpdate(Organization, { id: organizationId } as never, {
          tenantId: organizationId,
        });
      });
      // X7 creator-join（R1）：租户事务落成正后补写建租者租成员 + owner 角色分配（经 published port
      // 委托 authorization 属主写侧·自带 scoped:false 锚定·system 动作无活动租上下文中得）。与 BA auto-join
      //（仅写 org 维 member）互补：会话角色自此有 `tenant_role_assignment` 可解。失败交由下方 catch  saga 补偿。
      await this.memberships.ensureMembership(organizationId, userId, 'owner');
    } catch (err) {
      // P0 D3·③ 孤儿补偿：事务已回滚我方 Tenant 插行，但 BA 建的 org（tenantId NULL）仍在——
      // 必回收（nativeDelete org·FK cascade 清子表·幂等兼删可能的租户父行），防半途异常遗留无归属孤儿 org。
      await this.remove(organizationId).catch(() => undefined);
      // 同 slug 并发竞（双过 BA 预检后撞 `tenant_slug_unique`）→ 译 409 Conflict（去孤儿·竞态终防线）。
      if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
        throw new ConflictException(`Tenant slug already taken: ${slug}`);
      }
      throw err;
    }
    return { organizationId, status: TENANT_STATUS.PENDING };
  }

  async remove(organizationId: string): Promise<boolean> {
    // nativeDelete＝纯 SQL DELETE·FK cascade 由 DB 层清 member/invitation/workspace/post（R-B3 同律·旧 organization_subscription 表已随片二 K2 DROP·订阅锚上移 tenant）。
    // 治理换轴（rehierarchy E-F）：驳回 pending 申请 = 连专属租户行一并硬删（1:1 骨架·tenant.id=org.id）：
    // 先删组织（子表 FK 级联）再删租户父行，避免 organization.tenantId FK 悬挂。亦作 `submit` 失败时的**孤儿补偿**面（P0 D3）。
    const em = await this.mikro.fork({ scoped: false });
    const affected = await em.nativeDelete(Organization, { id: organizationId } as never);
    if (affected > 0) {
      await em.nativeDelete(Tenant, { id: organizationId } as never);
    }
    return affected > 0;
  }
}
