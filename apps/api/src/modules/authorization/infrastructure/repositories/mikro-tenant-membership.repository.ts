import { randomUUID } from 'node:crypto';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { Inject, Injectable } from '@nestjs/common';
import type {
  MemberRemoveResult,
  MemberRoleUpdateResult,
  TenantMembershipManager,
  TenantMemberView,
} from '../../domain/ports/tenant-membership.port';
import { TenantMembership, TenantRoleAssignment } from '../entities/rbac.entities';

/**
 * `TenantMembershipManager` 的 **MikroORM 适配**（global-role-membership-tenantization 切片 D·
 * 成员/角色分配自有租级 SSOT 的读写通道）。
 *
 * @remarks
 * 表属主纪律：`tenant_membership`/`tenant_role_assignment` 属 `authorization`（table-ownership），
 * 本类在自身 owned 表内读写（写侧合规）。每操作 `fork()` 独立 em（V4 串租户教训·沿 RBAC 仓储同律）。
 * 此二表携 `tenantId` 主轴且**已入全局 `tenantIsolation` filter 在册集**（X7 close-mech·见 rbac.entities
 * 注），本类跨租/无上下文面仍统一以 `fork({ scoped:false })` 绕 ALS 派生 filter、经显式 `where{tenantId}`
 * 锚定隔离边界（机制地板 + 手写锚定双保险并存·沿 X1 教训：名册/计量/消费点本就跨租，不可依赖
 * 「无上下文天然不筛」的巧合）。谓词一律简单等值（沿 `MikroTenantRbacRepository`
 * 同律·无投影/无 `$in` 边界 cast）。
 *
 * `email`/`name` 展示走**跨上下文纯读**（user 表属 auth·读侧宽松·table-ownership 注）：成员数受席位
 * 上限约束·逐 id `findOne` 取回（无 `$in` 边界 cast·规模有界不构成 N+1 隐患）。
 *
 * 守卫重建（原 BA 数据守卫上收租级·fail-closed）：
 *  - **last-owner**：`owner` 是本租存续的不可清空角色——降级/移除**唯一** owner 即拒（防锁死）；
 *  - **self-removal**：管理员移除面拒自移（与 BA `members/remove` 语义对齐·退租另走自助通道）。
 */
@Injectable()
export class MikroTenantMembershipManager implements TenantMembershipManager {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async listMembers(tenantId: string): Promise<TenantMemberView[]> {
    const em = await this.mikro.fork({ scoped: false });
    const memberships = await em.find(TenantMembership, { tenantId });
    if (memberships.length === 0) return [];
    const userIds = memberships.map((m) => m.userId);

    const assignments = await em.find(TenantRoleAssignment, { tenantId });
    const roleByUser = new Map(assignments.map((a) => [a.userId, a.roleKey]));

    const out: TenantMemberView[] = [];
    for (const userId of userIds) {
      const u = await em.findOne(User, { id: userId });
      out.push({
        userId,
        email: u?.email ?? '',
        name: u?.name ?? '',
        roleKey: roleByUser.get(userId) ?? 'member',
      });
    }
    return out;
  }

  async updateMemberRole(
    tenantId: string,
    targetUserId: string,
    roleKey: string,
    _actorId: string | null,
  ): Promise<MemberRoleUpdateResult> {
    const em = await this.mikro.fork({ scoped: false });
    if (!(await em.findOne(TenantMembership, { tenantId, userId: targetUserId }))) {
      return 'notFound';
    }
    const current = await em.findOne(TenantRoleAssignment, { tenantId, userId: targetUserId });
    const wasOwner = current?.roleKey === 'owner';
    // last-owner 闸：由 owner 降级为非 owner 且本租仅一名 owner → 拒（防清空唯一属主）。
    if (wasOwner && roleKey !== 'owner' && (await this.countOwners(em, tenantId)) <= 1) {
      return 'lastOwner';
    }
    const now = new Date();
    if (current) {
      em.assign(current, { roleKey, updatedAt: now });
    } else {
      em.create(TenantRoleAssignment, {
        id: randomUUID(),
        tenantId,
        userId: targetUserId,
        roleKey,
        createdAt: now,
        updatedAt: null,
      });
    }
    await em.flush();
    return 'ok';
  }

  async removeMember(
    tenantId: string,
    targetUserId: string,
    actorId: string | null,
  ): Promise<MemberRemoveResult> {
    // self-removal 闸：管理员移除面拒自移（退租走自助 leave·非本门面职权）。
    if (actorId && actorId === targetUserId) return 'self';
    const em = await this.mikro.fork({ scoped: false });
    if (!(await em.findOne(TenantMembership, { tenantId, userId: targetUserId }))) {
      return 'notFound';
    }
    const current = await em.findOne(TenantRoleAssignment, { tenantId, userId: targetUserId });
    if (current?.roleKey === 'owner' && (await this.countOwners(em, tenantId)) <= 1) {
      return 'lastOwner';
    }
    // 删两行：nativeDelete 纯 SQL·此二表无子表外键指向（cascade 无涉）。
    await em.nativeDelete(TenantRoleAssignment, { tenantId, userId: targetUserId });
    await em.nativeDelete(TenantMembership, { tenantId, userId: targetUserId });
    await em.flush();
    return 'ok';
  }

  async ensureMembership(tenantId: string, userId: string, roleKey: string): Promise<void> {
    const em = await this.mikro.fork({ scoped: false });
    const now = new Date();
    if (!(await em.findOne(TenantMembership, { tenantId, userId }))) {
      em.create(TenantMembership, {
        id: randomUUID(),
        tenantId,
        userId,
        createdAt: now,
        updatedAt: null,
      });
    }
    // 角色分配：已存在则不覆盖（保既有角色·幂等重入安全）；缺席方按传入初值落。
    if (!(await em.findOne(TenantRoleAssignment, { tenantId, userId }))) {
      em.create(TenantRoleAssignment, {
        id: randomUUID(),
        tenantId,
        userId,
        roleKey,
        createdAt: now,
        updatedAt: null,
      });
    }
    await em.flush();
  }

  /** 本租 owner 计数（last-owner 闸·读 `tenant_role_assignment`）。 */
  private async countOwners(
    em: Awaited<ReturnType<MikroOrmService['fork']>>,
    tenantId: string,
  ): Promise<number> {
    return em.count(TenantRoleAssignment, { tenantId, roleKey: 'owner' });
  }
}
