import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { TenantSubscription } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import {
  Invitation,
  Member,
  Organization,
} from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import {
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { createPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { type InferEntity, QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  ExportedTenantMember,
  PlatformTenantPage,
  PlatformTenantRow,
  TenantDataExport,
  TenantDiagnostics,
  TenantGovernanceRepository,
} from '../../domain/repositories/tenant-governance.repository';

/**
 * 兼容兼底（defense-in-depth）：`organization.status` 经列化后为 NOT NULL 真列（本体存在即有值），
 * 本兑底仅在极端读不到列值时生效——与 `canTransition` 缺省/middleware deny-list 同口径
 * （global-governance-lifecycle-consolidation 切片 B：态从 `tenant` 旁表归位 `organization.status` 真列）。
 */
function effectiveStatus(status: TenantStatus | undefined): TenantStatus {
  return status ?? TENANT_STATUS.ACTIVE;
}

/**
 * ORM 修宪案 B · 切片 3c-ii-B —— 平台租户治理读面 + 运营硬删的 **MikroORM 适配**（`TENANT_GOVERNANCE_REPOSITORY` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * 跨租户视图：刻意**不注入任何租户上下文**（requireTenantId 于此无关·平台级天然全量·FR-11①）——访问
 * 裁决完全由 controller 侧 `PlatformOperatorGuard` 前置把守（fail-closed）。
 *
 * 保真闸（详见 §5.13）：
 *  - **R-B1（安全红线）**：`exportTenantData` 成员名册的 user 侧走 `fields` 投影（`id/name/email/handle`）——
 *    探针实测该投影在**生成的 SQL SELECT 面**即不含 `password`（非取回后删）；缺省不投影时 QB `select .*`
 *    会取回，故投影必做。
 *  - **R-B2**：搜索采 `$ilike`（探针实测＝旧 ORM `ilike`＝PG 原生 ILIKE 逐字节一致·忠实 drop-in）。
 *  - **R-B3**：`destroy` 采 `nativeDelete`（纯 SQL DELETE·五子表由 DB FK `onDelete:cascade` 自动消灭·
 *    绝不用 `em.remove` 以免 ORM 级联/身份图分歧）·`>0` 为实删。
 *  - **R-B6**：`exportTenantData` 四段查询**不加 status 过滤**（deleted 终态亦可导·NFR-6 取证用途）。
 * LEFT JOIN（无关系对象）以「批量取 + 内存拼接」折叠·未知租户先 `findOne` 短路 null 不触他表。
 */
@Injectable()
export class MikroTenantGovernanceRepository implements TenantGovernanceRepository {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  // entities.ts 的 `defineEntity` 结果只有值、无 companion interface，实例类型经 `InferEntity` 提取。
  // 归列后 `organization` 行自带 `status` 真列，无需旁表 join。
  private toRow(entity: InferEntity<typeof Organization>): PlatformTenantRow {
    return {
      organizationId: entity.id,
      name: entity.name,
      slug: entity.slug,
      status: effectiveStatus(entity.status as TenantStatus),
      createdAt: entity.createdAt,
    };
  }

  async list(opts: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<PlatformTenantPage> {
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

  async findById(organizationId: string): Promise<PlatformTenantRow | null> {
    const em = await this.mikro.fork();
    const entity = await em.findOne(Organization, { id: organizationId } as never);
    if (!entity) return null;
    return this.toRow(entity);
  }

  async diagnostics(organizationId: string): Promise<TenantDiagnostics | null> {
    const tenant = await this.findById(organizationId);
    if (!tenant) return null;
    const em = await this.mikro.fork();
    const [memberCount, invitationCount, workspaceCount, postCount] = await Promise.all([
      em.count(Member, { organizationId } as never),
      em.count(Invitation, { organizationId } as never),
      em.count(Workspace, { organizationId } as never),
      em.count(PostEntity, { organizationId } as never),
    ]);
    return { tenant, memberCount, invitationCount, workspaceCount, postCount };
  }

  async exportTenantData(organizationId: string): Promise<TenantDataExport | null> {
    const em = await this.mikro.fork();
    // 租户本体（BA 面全列 + 归位后的 `status` 真列）；**不按 status 过滤**——
    // deleted 终态可导（S5 软删取证用途·NFR-6）。归列后生命周期态在 organization.status 真列。
    const org = await em.findOne(Organization, { id: organizationId } as never);
    if (!org) return null;
    const tenant: TenantDataExport['tenant'] = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      logo: org.logo ?? null,
      status: effectiveStatus(org.status as TenantStatus),
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
    const members: ExportedTenantMember[] = memberEntities.flatMap((m) => {
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

    const subscriptionEntities = await em.find(TenantSubscription, {
      tenantId: organizationId,
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

    return { tenant, members, invitations, workspaces, subscriptions, posts };
  }

  async destroy(organizationId: string): Promise<boolean> {
    // 仅删主行；member/invitation/workspace/tenant_subscription/post 由 FK onDelete: 'cascade' 在 DB 层
    // 自动消灭（单一卡点·零迁移）。nativeDelete＝纯 SQL DELETE（R-B3·非 em.remove 免 ORM 级联分歧）。
    const em = await this.mikro.fork();
    const affected = await em.nativeDelete(Organization, { id: organizationId } as never);
    return affected > 0;
  }
}
