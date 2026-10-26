import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  Invitation,
  Member,
  Organization,
} from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { OrganizationSubscription } from '@app/modules/subscriptions/infrastructure/entities/organization-subscription.entity';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import {
  ORGANIZATION_STATUS,
  type OrganizationStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import {
  ORGANIZATION_ODOO_BINDING_STATUS,
  type OrganizationOdooBindingStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import type { OrganizationOdooBindingRow } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import type {
  OrganizationOdooBindingWriter,
  OrganizationOdooReadyPatch,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-writer';
import { createPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { type InferEntity, QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  BindOdooCompanyOutcome,
  ExportedOrganizationMember,
  OrganizationDataExport,
  OrganizationDiagnostics,
  OrganizationGovernanceRepository,
  OrganizationOdooBindingRecord,
  PlatformOrganizationPage,
  PlatformOrganizationRow,
} from '../../domain/repositories/organization-governance.repository';

/**
 * 兼容兼底（defense-in-depth）：`organization.status` 经列化后为 NOT NULL 真列（本体存在即有值），
 * 本兑底仅在极端读不到列值时生效——与 `canTransition` 缺省/middleware deny-list 同口径
 * （global-governance-lifecycle-consolidation 切片 B：态从 `tenant` 旁表归位 `organization.status` 真列）。
 */
function effectiveStatus(status: OrganizationStatus | undefined): OrganizationStatus {
  return status ?? ORGANIZATION_STATUS.ACTIVE;
}

/**
 * ORM 修宪案 B · 切片 3c-ii-B —— 平台租户治理读面 + 运营硬删的 **MikroORM 适配**（`ORGANIZATION_GOVERNANCE_REPOSITORY` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * 跨租户视图：刻意**不注入任何租户上下文**（requireActiveOrganizationId 于此无关·平台级天然全量·FR-11①）——访问
 * 裁决完全由 controller 侧 `PlatformOperatorGuard` 前置把守（fail-closed）。
 *
 * 保真闸（详见 §5.13）：
 *  - **R-B1（安全红线）**：`exportOrganizationData` 成员名册的 user 侧走 `fields` 投影（`id/name/email/handle`）——
 *    探针实测该投影在**生成的 SQL SELECT 面**即不含 `password`（非取回后删）；缺省不投影时 QB `select .*`
 *    会取回，故投影必做。
 *  - **R-B2**：搜索采 `$ilike`（探针实测＝旧 ORM `ilike`＝PG 原生 ILIKE 逐字节一致·忠实 drop-in）。
 *  - **R-B3**：`destroy` 采 `nativeDelete`（纯 SQL DELETE·五子表由 DB FK `onDelete:cascade` 自动消灭·
 *    绝不用 `em.remove` 以免 ORM 级联/身份图分歧）·`>0` 为实删。
 *  - **R-B6**：`exportOrganizationData` 四段查询**不加 status 过滤**（deleted 终态亦可导·NFR-6 取证用途）。
 * LEFT JOIN（无关系对象）以「批量取 + 内存拼接」折叠·未知租户先 `findOne` 短路 null 不触他表。
 */
@Injectable()
export class MikroOrganizationGovernanceRepository
  implements OrganizationGovernanceRepository, OrganizationOdooBindingWriter
{
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  // entities.ts 的 `defineEntity` 结果只有值、无 companion interface，实例类型经 `InferEntity` 提取。
  // 归列后 `organization` 行自带 `status` 真列，无需旁表 join。
  private toRow(entity: InferEntity<typeof Organization>): PlatformOrganizationRow {
    return {
      organizationId: entity.id,
      name: entity.name,
      slug: entity.slug,
      status: effectiveStatus(entity.status as OrganizationStatus),
      createdAt: entity.createdAt,
    };
  }

  async list(opts: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<PlatformOrganizationPage> {
    const em = await this.mikro.fork();
    const where = opts.search
      ? {
          $or: [{ name: { $ilike: `%${opts.search}%` } }, { slug: { $ilike: `%${opts.search}%` } }],
        }
      : {};
    // `as never` 仅系调用边界 cast（mikro-orm.factory.ts 以 `entities as never` 装配致 FilterQuery 宽化不匹配·不改运行时谓词）。
    const [entities, total] = await em.findAndCount(Organization, where as never, {
      orderBy: { createdAt: QueryOrder.DESC },
      limit: opts.limit,
      offset: opts.offset,
    });
    return createPage(
      entities.map((entity) => this.toRow(entity)),
      total,
      opts,
    );
  }

  async findById(organizationId: string): Promise<PlatformOrganizationRow | null> {
    const em = await this.mikro.fork();
    const entity = await em.findOne(Organization, { id: organizationId } as never);
    if (!entity) return null;
    return this.toRow(entity);
  }

  async diagnostics(organizationId: string): Promise<OrganizationDiagnostics | null> {
    const organization = await this.findById(organizationId);
    if (!organization) return null;
    const em = await this.mikro.fork();
    const [memberCount, invitationCount, workspaceCount, postCount] = await Promise.all([
      em.count(Member, { organizationId } as never),
      em.count(Invitation, { organizationId } as never),
      em.count(Workspace, { organizationId } as never),
      em.count(PostEntity, { organizationId } as never),
    ]);
    return { organization, memberCount, invitationCount, workspaceCount, postCount };
  }

  async exportOrganizationData(organizationId: string): Promise<OrganizationDataExport | null> {
    const em = await this.mikro.fork();
    // 租户本体（BA 面全列 + 归位后的 `status` 真列）；**不按 status 过滤**——
    // deleted 终态可导（S5 软删取证用途·NFR-6）。归列后生命周期态在 organization.status 真列。
    const org = await em.findOne(Organization, { id: organizationId } as never);
    if (!org) return null;
    const organization: OrganizationDataExport['organization'] = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo ?? null,
      status: effectiveStatus(org.status as OrganizationStatus),
      metadata: org.metadata,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt ?? null,
    };

    // 成员名册：user 侧走 fields 投影（**R-B1 安全红线**·凭据列在 SQL 面即排除·非取回后删）。
    // 与旧实现 `innerJoin(user)` 同语义——user 行缺失的成员被丢弃（FK→user cascade 使孤儿结构上
    // 不存在，此处仍显式过滤以严格对齐读面行为）。`handle` 在旧 ORM schema 为 `NOT NULL DEFAULT ''`
    // （Mikro 侧仅为 BA authFlow 测试面把列声明可空·真实列非空），故 `?? ''` 是类型层兜底、运行期不触发。
    const memberEntities = await em.find(Member, { organizationId } as never);
    let usersById = new Map<string, { name: string; email: string; handle: string | null }>();
    if (memberEntities.length > 0) {
      const users = await em.find(
        User,
        { id: { $in: memberEntities.map((m) => m.userId) } } as never,
        { fields: ['id', 'name', 'email', 'handle'] },
      );
      usersById = new Map(
        users.map((u) => [u.id, { name: u.name, email: u.email, handle: u.handle ?? null }]),
      );
    }
    const members: ExportedOrganizationMember[] = memberEntities.flatMap((m) => {
      const u = usersById.get(m.userId);
      if (!u) return []; // innerJoin 语义：user 行缺失 → 丢弃该成员
      return [
        {
          id: m.id,
          role: m.role,
          createdAt: m.createdAt,
          user: { id: m.userId, name: u.name, email: u.email, handle: u.handle ?? '' },
        },
      ];
    });

    const invitationEntities = await em.find(Invitation, { organizationId } as never);
    const invitations = invitationEntities.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      inviterId: inv.inviterId,
      createdAt: inv.createdAt,
    }));

    const workspaceEntities = await em.find(Workspace, { organizationId } as never);
    const workspaces = workspaceEntities.map((w) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));

    const subscriptionEntities = await em.find(OrganizationSubscription, {
      organizationId,
    } as never);
    const subscriptions = subscriptionEntities.map((s) => ({
      id: s.id,
      plan: s.plan,
      status: s.status,
      seatsLimit: s.seatsLimit,
      storageQuota: s.storageQuota ?? null,
      apiQuota: s.apiQuota ?? null,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd ?? null,
      provider: s.provider ?? null,
      providerCustomerId: s.providerCustomerId ?? null,
      providerSubscriptionId: s.providerSubscriptionId ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    const postEntities = await em.find(PostEntity, { organizationId } as never);
    const posts = postEntities.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content ?? null,
      published: p.published,
      workspaceId: p.workspaceId ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return { organization, members, invitations, workspaces, subscriptions, posts };
  }

  async destroy(organizationId: string): Promise<boolean> {
    // 仅删主行；member/invitation/workspace/organization_subscription/post 由 FK onDelete: 'cascade' 在 DB 层
    // 自动消灭（单一卡点·零迁移）。nativeDelete＝纯 SQL DELETE（R-B3·非 em.remove 免 ORM 级联分歧）。
    const em = await this.mikro.fork();
    const affected = await em.nativeDelete(Organization, { id: organizationId } as never);
    return affected > 0;
  }

  async bindOdooCompany(
    organizationId: string,
    input: { odooCompanyId: number; odooCompanyName: string },
  ): Promise<BindOdooCompanyOutcome> {
    const em = await this.mikro.fork();
    const org = await em.findOne(Organization, { id: organizationId } as never);
    if (!org) return { kind: 'not-found' };
    // 占用预检查（友好冲突前置）：公司已被**其它**租户占用 → conflict；同租户重复绑定同公司
    // 走覆盖快照（幂等）。本 port 不验公司在 Odoo 侧存在性（跨库弱引用·正向核验归 doctor·切片 C）。
    const occupier = await em.findOne(Organization, {
      odooCompanyId: input.odooCompanyId,
      id: { $ne: organizationId },
    } as never);
    if (occupier) return { kind: 'conflict' };
    try {
      await em.nativeUpdate(
        Organization,
        { id: organizationId } as never,
        {
          odooCompanyId: input.odooCompanyId,
          // bind-existing 系人工确认动作：直落 ready，无 provisioning 中间态（切片 A 口径）。
          odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.READY,
          odooCompanyName: input.odooCompanyName,
          odooBoundAt: new Date(),
          odooFailureReason: null,
        } as never,
      );
    } catch (err) {
      // 并发竞争终防线：`odooCompanyId` unique 违例折叠为 conflict（应用层预检查存在 TOCTOU 窗）。
      if (err instanceof Error && /unique|duplicate/i.test(err.message))
        return { kind: 'conflict' };
      throw err;
    }
    // nativeUpdate 绕开 ORM 写面，先前 findOne 的行仍驻身份图——clear 后回读才是终态（否则拿旧像 NULL）。
    em.clear();
    const bound = await em.findOne(Organization, { id: organizationId } as never);
    if (!bound) return { kind: 'not-found' };
    const binding: OrganizationOdooBindingRecord = {
      organizationId: bound.id,
      odooCompanyId: bound.odooCompanyId as number,
      odooBindingStatus:
        bound.odooBindingStatus as OrganizationOdooBindingRecord['odooBindingStatus'],
      odooCompanyName: bound.odooCompanyName ?? null,
      odooBoundAt: bound.odooBoundAt ? new Date(bound.odooBoundAt) : null,
    };
    return { kind: 'bound', binding };
  }

  /**
   * 绑定读取面（module-org-odoo-company-mapping 切片 B·`ORGANIZATION_ODOO_BINDING_READER` 实现）：
   * 单行读携治理态，裁决语义零加工（归 `canUseOdoo` 单源）。
   */
  async read(organizationId: string): Promise<OrganizationOdooBindingRow | null> {
    const em = await this.mikro.fork();
    const org = await em.findOne(Organization, { id: organizationId } as never);
    if (!org) return null;
    return {
      organizationId: org.id,
      odooCompanyId: org.odooCompanyId ?? null,
      odooBindingStatus: (org.odooBindingStatus ?? null) as OrganizationOdooBindingStatus | null,
      odooCompanyName: org.odooCompanyName ?? null,
      odooBoundAt: org.odooBoundAt ? new Date(org.odooBoundAt) : null,
      organizationStatus: org.status as OrganizationStatus,
    };
  }

  // —— 绑定状态推进写面（module-org-odoo-company-mapping 切片 C·`ORGANIZATION_ODOO_BINDING_WRITER` 实现）：
  // saga 专用·每步 nativeUpdate 各自耐久（`odooCompanyId` 列由 bind/markReady 写·此处不校 Odoo 侧存在性）。
  // 失败原因截断上限（列长兜底·防异常消息过长按库报错）。
  private static readonly FAILURE_REASON_MAX = 500;

  /**
   * 落「建司意图」：绑定态置 `provisioning`（幂等于目标态·nativeUpdate 绕身份图直落真列）。
   */
  async beginProvisioning(organizationId: string): Promise<void> {
    const em = await this.mikro.fork();
    await em.nativeUpdate(
      Organization,
      { id: organizationId } as never,
      { odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.PROVISIONING } as never,
    );
  }

  /**
   * 回写就绪：绑定态置 `ready` + 公司 id/名快照 + `boundAt=now`，清失败原因。
   */
  async markReady(organizationId: string, patch: OrganizationOdooReadyPatch): Promise<void> {
    const em = await this.mikro.fork();
    await em.nativeUpdate(
      Organization,
      { id: organizationId } as never,
      {
        odooCompanyId: patch.odooCompanyId,
        odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.READY,
        odooCompanyName: patch.odooCompanyName,
        odooBoundAt: new Date(),
        odooFailureReason: null,
      } as never,
    );
  }

  /**
   * 置失败：绑定态置 `failed` + 携截断后的失败原因（保留既有公司 id·供 doctor/重试 定位）。
   */
  async markFailed(organizationId: string, reason: string): Promise<void> {
    const em = await this.mikro.fork();
    await em.nativeUpdate(
      Organization,
      { id: organizationId } as never,
      {
        odooBindingStatus: ORGANIZATION_ODOO_BINDING_STATUS.FAILED,
        odooFailureReason: reason.slice(
          0,
          MikroOrganizationGovernanceRepository.FAILURE_REASON_MAX,
        ),
      } as never,
    );
  }
}
