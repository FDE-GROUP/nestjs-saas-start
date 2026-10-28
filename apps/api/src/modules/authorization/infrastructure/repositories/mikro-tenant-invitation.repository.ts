import { randomUUID } from 'node:crypto';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { BasePostgreSqlEntityManager as PgEntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import type {
  InvitationAcceptResult,
  InvitationAdmitResult,
  InvitationCancelResult,
  InvitationCreateResult,
  TenantInvitationManager,
  TenantInvitationView,
} from '../../domain/ports/tenant-invitation.port';
import {
  TenantInvitation,
  type TenantInvitationRow,
  TenantMembership,
  TenantRoleAssignment,
} from '../entities/rbac.entities';

/** 邀请状态词汇（与 `tenant_invitation.status` 文本列取值对齐）。 */
const PENDING = 'pending';
const ACCEPTED = 'accepted';
const CANCELLED = 'cancelled';

/**
 * `TenantInvitationManager` 的 **MikroORM 适配**（global-role-membership-tenantization 切片 D·
 * 租级邀请自有 SSOT 的读写通道·替代 BA org 维 invitation 内置面）。
 *
 * @remarks
 * 表属主：`tenant_invitation` 属 `authorization`（table-ownership）·本类在 owned 表内读写（写侧合规）。
 * 每操作 `fork({ scoped:false })` 独立 em（表已入全局 filter 在册集·X7 close-mech·本类跨租消费点——
 * 按 id/token 定位受邀行先于租上下文——显式绕筛 + `where{tenantId}` 锚界·同成员面同律）。
 * 谓词一律简单等值（无投影/无 `$in`/无 `$or` 边界 cast·过期判定在内存做·规模受邀请量约束）。
 * `unique(tenantId,email)` 为库级硬约束（expand 段建）：同邮箱重投（曾 cancelled/accepted）走**复位**
 * 而非新行，避免撞 unique；pending 期重复投 → `duplicate`。
 */
@Injectable()
export class MikroTenantInvitationManager implements TenantInvitationManager {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async listPending(tenantId: string): Promise<TenantInvitationView[]> {
    const em = await this.mikro.fork({ scoped: false });
    const rows = await em.find(TenantInvitation, { tenantId, status: PENDING });
    const now = Date.now();
    return rows.filter((r) => !isExpired(r, now)).map(toView);
  }

  async create(
    tenantId: string,
    email: string,
    roleKey: string,
    invitorId: string | null,
    ttlMs?: number,
  ): Promise<InvitationCreateResult> {
    const em = await this.mikro.fork({ scoped: false });
    const now = new Date();
    const expiresAt = typeof ttlMs === 'number' ? new Date(now.getTime() + ttlMs) : null;
    const existing = await em.findOne(TenantInvitation, { tenantId, email });
    if (existing) {
      if (existing.status === PENDING && !isExpired(existing, now.getTime())) return 'duplicate';
      // 曾消费（cancelled/accepted/过期）→ 复位为新 pending（守 unique(tenantId,email)·不新行）。
      em.assign(existing, {
        roleKey,
        invitorId,
        status: PENDING,
        token: randomUUID(),
        expiresAt,
        createdAt: now,
        updatedAt: null,
      });
      await em.flush();
      return 'created';
    }
    em.create(TenantInvitation, {
      id: randomUUID(),
      tenantId,
      email,
      roleKey,
      invitorId,
      status: PENDING,
      token: randomUUID(),
      expiresAt,
      createdAt: now,
      updatedAt: null,
    });
    await em.flush();
    return 'created';
  }

  async cancel(tenantId: string, invitationId: string): Promise<InvitationCancelResult> {
    const em = await this.mikro.fork({ scoped: false });
    const row = await em.findOne(TenantInvitation, { id: invitationId, tenantId });
    if (!row || row.status !== PENDING) return 'notFound';
    em.assign(row, { status: CANCELLED, updatedAt: new Date() });
    await em.flush();
    return 'cancelled';
  }

  async findPendingById(invitationId: string): Promise<TenantInvitationView | null> {
    const em = await this.mikro.fork({ scoped: false });
    const row = await em.findOne(TenantInvitation, { id: invitationId });
    if (!row || row.status !== PENDING || isExpired(row, Date.now())) return null;
    return toView(row);
  }

  async markAccepted(invitationId: string): Promise<InvitationAcceptResult> {
    const em = await this.mikro.fork({ scoped: false });
    const row = await em.findOne(TenantInvitation, { id: invitationId });
    if (!row) return 'notFound';
    if (row.status !== PENDING) return 'notFound';
    if (isExpired(row, Date.now())) return 'expired';
    em.assign(row, { status: ACCEPTED, updatedAt: new Date() });
    await em.flush();
    return 'accepted';
  }

  async admitAtomically(params: {
    invitationId: string;
    email: string;
    userId: string;
    seatsLimit: number;
  }): Promise<InvitationAdmitResult> {
    const em = (await this.mikro.fork({ scoped: false })) as unknown as PgEntityManager;
    return em.transactional(async (trx) => {
      // 锁内重查 pending 邀请（兼防双消费·事务外预检不可信）。
      const row = await trx.findOne(TenantInvitation, { id: params.invitationId });
      if (!row || row.status !== PENDING || isExpired(row, Date.now()))
        return { status: 'notFound' };
      if (row.email.toLowerCase() !== params.email.toLowerCase()) return { status: 'notFound' };
      const tenantId = row.tenantId;
      // 事务级 advisory 锁（按 tenantId 串行化并发 accept·提交自动释放）——消 checkSeats→write 的 TOCTOU 窗。
      await trx.execute('select pg_advisory_xact_lock(hashtext(?))', [tenantId], 'run');
      const used = await trx.count(TenantMembership, { tenantId });
      if (used + 1 > params.seatsLimit) return { status: 'overLimit' };
      const now = new Date();
      if (!(await trx.findOne(TenantMembership, { tenantId, userId: params.userId }))) {
        trx.create(TenantMembership, {
          id: randomUUID(),
          tenantId,
          userId: params.userId,
          createdAt: now,
          updatedAt: null,
        });
      }
      if (!(await trx.findOne(TenantRoleAssignment, { tenantId, userId: params.userId }))) {
        trx.create(TenantRoleAssignment, {
          id: randomUUID(),
          tenantId,
          userId: params.userId,
          roleKey: row.roleKey,
          createdAt: now,
          updatedAt: null,
        });
      }
      trx.assign(row, { status: ACCEPTED, updatedAt: now });
      await trx.flush();
      return { status: 'accepted', tenantId, roleKey: row.roleKey };
    });
  }

  async listPendingByEmail(email: string): Promise<TenantInvitationView[]> {
    const em = await this.mikro.fork({ scoped: false });
    const rows = await em.find(TenantInvitation, { email, status: PENDING });
    const now = Date.now();
    return rows.filter((r) => !isExpired(r, now)).map(toView);
  }

  async rejectForEmail(invitationId: string, email: string): Promise<InvitationCancelResult> {
    const em = await this.mikro.fork({ scoped: false });
    const row = await em.findOne(TenantInvitation, { id: invitationId });
    // fail-closed：非 pending / 受邀邮箱不匹配均回 notFound（不区分二者·不泄露他邮箱邀请存在性）。
    if (!row || row.status !== PENDING) return 'notFound';
    if (row.email.toLowerCase() !== email.toLowerCase()) return 'notFound';
    em.assign(row, { status: CANCELLED, updatedAt: new Date() });
    await em.flush();
    return 'cancelled';
  }
}

/** 实体行 → 端口视形映射（不泄实体·多处复用）。 */
function toView(row: TenantInvitationRow): TenantInvitationView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    roleKey: row.roleKey,
    invitorId: row.invitorId ?? null,
    status: row.status,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
  };
}

/** 邀请是否已过期（`expiresAt` 为空 = 不过期）。 */
function isExpired(row: TenantInvitationRow, nowMs: number): boolean {
  return row.expiresAt != null && row.expiresAt.getTime() <= nowMs;
}
