/**
 * 租级成员/角色分配管理端口的 DI 注入 token（global-role-membership-tenantization 切片 D）。
 * @public
 */
export const TENANT_MEMBERSHIP_MANAGER = Symbol('TENANT_MEMBERSHIP_MANAGER');

/**
 * 租级成员读模型：`tenant_membership` ⋈ `tenant_role_assignment` ⋈ `user` 的端口视形（不泄实体）。
 *
 * @remarks
 * 成员身份在租级以 `userId` 定位（`unique(tenantId,userId)`）·`roleKey` 取自本租角色分配行。
 * `email`/`name` 系跨上下文**纯读** join（user 表属 auth·读侧宽松·见 table-ownership 注）。
 * @public
 */
export interface TenantMemberView {
  /** 成员用户 id（租级成员定位键）。 */
  readonly userId: string;
  /** 用户邮箱（join user·只读展示）。 */
  readonly email: string;
  /** 用户名（join user·只读展示）。 */
  readonly name: string;
  /** 本租分配的角色 key（无分配行 → `member` 缺省）。 */
  readonly roleKey: string;
}

/** 更新成员角色结果（fail-closed 守卫·词汇与端点响应映射对齐）。 */
export type MemberRoleUpdateResult = 'ok' | 'notFound' | 'self' | 'lastOwner';
/** 移除成员结果（fail-closed 守卫）。 */
export type MemberRemoveResult = 'ok' | 'notFound' | 'self' | 'lastOwner';

/**
 * 租级成员/角色分配管理端口（切片 D·organizations 租级成员门面经本端口消费·写侧落 authorization 自有表）。
 *
 * @remarks
 * 属主纪律：`tenant_membership`/`tenant_role_assignment` 属 `authorization`（table-ownership），
 * 故写适配器居 authorization 基础设施，organizations 门面经本 published port 相遇（沿
 * {@link ROLE_ASSIGNABILITY_READER} 同构·上下文间只经端口相遇）。数据操作不再透传 BA org 维——
 * 直接读写自有租级 SSOT·last-owner / self-removal 原 BA 数据守卫在本侧**重建**（fail-closed）。
 * @public
 */
export interface TenantMembershipManager {
  /**
   * 列出指定租户的全部成员（全角色·读侧）。
   * @param tenantId - 活动租户 id（隔离主轴）。
   */
  listMembers(tenantId: string): Promise<TenantMemberView[]>;

  /**
   * 更新成员在本租的角色（改 `tenant_role_assignment.roleKey`·无分配行则按缺省补建）。
   * @param tenantId - 活动租户 id。
   * @param targetUserId - 目标成员用户 id。
   * @param roleKey - 新角色 key（可挂载性由门面先经 `RoleAssignabilityReader` 校·本侧不复核）。
   * @param actorId - 操作者用户 id（守卫判定·可为 null·系统动作）。
   */
  updateMemberRole(
    tenantId: string,
    targetUserId: string,
    roleKey: string,
    actorId: string | null,
  ): Promise<MemberRoleUpdateResult>;

  /**
   * 移除成员（删 `tenant_membership` + `tenant_role_assignment` 两行·同事务）。
   * @param tenantId - 活动租户 id。
   * @param targetUserId - 目标成员用户 id。
   * @param actorId - 操作者用户 id（自移除守卫判定）。
   */
  removeMember(
    tenantId: string,
    targetUserId: string,
    actorId: string | null,
  ): Promise<MemberRemoveResult>;

  /**
   * 幂等确保成员存在并挂角色（provisioning 建租者 auto-join + 邀请接受入租共用的写原语）：
   * 无 `tenant_membership` 行则建；`tenant_role_assignment` 按传入 `roleKey` 落（已存在则不覆盖·保既有角色）。
   * @param tenantId - 目标租户 id。
   * @param userId - 入租用户 id。
   * @param roleKey - 初始角色 key（建租者 = `owner`·受邀者 = 邀请角色）。
   */
  ensureMembership(tenantId: string, userId: string, roleKey: string): Promise<void>;
}
