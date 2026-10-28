/**
 * 租级邀请管理端口的 DI 注入 token（global-role-membership-tenantization 切片 D）。
 * @public
 */
export const TENANT_INVITATION_MANAGER = Symbol('TENANT_INVITATION_MANAGER');

/**
 * 租级邀请读模型（`tenant_invitation` 端口视形·不泄实体）。
 * @public
 */
export interface TenantInvitationView {
  /** 邀请行 id。 */
  readonly id: string;
  /** 所属租户 id（接受入租的定位轴·管理面隐式=活动租）。 */
  readonly tenantId: string;
  /** 受邀邮箱。 */
  readonly email: string;
  /** 授予角色 key。 */
  readonly roleKey: string;
  /** 邀请人用户 id（可空·系统动作）。 */
  readonly invitorId: string | null;
  /** 状态：pending / accepted / cancelled / expired。 */
  readonly status: string;
  /** 过期时刻（可空·不过期）。 */
  readonly expiresAt: Date | null;
  /** 创建时刻。 */
  readonly createdAt: Date;
}

/** 创建邀请结果：`duplicate` = 同 (tenant,email) 已有 pending 行（unique 去重闸）。 */
export type InvitationCreateResult = 'created' | 'duplicate';
/** 取消邀请结果：`notFound` = 无 pending 行可取消（已接受/已取消/不存在）。 */
export type InvitationCancelResult = 'cancelled' | 'notFound';
/** 接受邀请结果（消费 pending 行·席位卡点由门面在调用前裁决）。 */
export type InvitationAcceptResult = 'accepted' | 'notFound' | 'expired';

/**
 * 原子入租结果（切片 G·G3）：`admitAtomically` 单事务内完成「锁→重查 pending→live 数席→落成员/角色→消费邀请」。
 *  - `accepted`：入租成功（携目标租 + 授予角色）；
 *  - `overLimit`：锁内 live 计数超席（并发 TOCTOU 的终裁决）→ 门面译 402；
 *  - `notFound`：无 pending 行/已消费/过期/邮箱不符（兼防双消费）→ 门面译 404。
 */
export type InvitationAdmitResult =
  | { readonly status: 'accepted'; readonly tenantId: string; readonly roleKey: string }
  | { readonly status: 'overLimit' }
  | { readonly status: 'notFound' };

/**
 * 租级邀请管理端口（切片 D·organizations 租级邀请门面经本端口消费·写侧落 authorization 自有 `tenant_invitation`）。
 *
 * @remarks
 * 属主纪律：`tenant_invitation` 属 `authorization`（table-ownership），写适配器居 authorization 基础设施，
 * organizations 门面经本 published port 相遇（沿 {@link TENANT_MEMBERSHIP_MANAGER} 同构）。
 * 替代 BA org 维 invitation（`invite-member`/`accept-invitation`/`cancel-invitation` 内置面）·
 * 接受入租的**成员落行 + 席位卡点**由门面组合 {@link TENANT_MEMBERSHIP_MANAGER} 与配额服务完成
 * （本端口只管邀请行本身的状态迁移·不跨上下文数席位）。
 * @public
 */
export interface TenantInvitationManager {
  /**
   * 列出指定租户的待处理邀请（`status=pending` 且未过期）。
   * @param tenantId - 活动租户 id。
   */
  listPending(tenantId: string): Promise<TenantInvitationView[]>;

  /**
   * 发邀请（写 pending `tenant_invitation` 行·生成 token·同 (tenant,email) 已有 pending 则拒）。
   * @param tenantId - 目标租户 id。
   * @param email - 受邀邮箱。
   * @param roleKey - 授予角色 key（可挂载性由门面先校）。
   * @param invitorId - 邀请人用户 id（可空）。
   * @param ttlMs - 有效期毫秒（缺省不过期）。
   */
  create(
    tenantId: string,
    email: string,
    roleKey: string,
    invitorId: string | null,
    ttlMs?: number,
  ): Promise<InvitationCreateResult>;

  /**
   * 取消邀请（pending → cancelled）。
   * @param tenantId - 活动租户 id（跨租硬地板：仅本租邀请可取消）。
   * @param invitationId - 邀请行 id。
   */
  cancel(tenantId: string, invitationId: string): Promise<InvitationCancelResult>;

  /**
   * 按邀请行 id 取受邀角色（接受前门面据此定 `ensureMembership` 的 roleKey·并校验邮箱匹配）。
   * @param invitationId - 邀请行 id。
   * @returns pending 且未过期的邀请视图；无/已消费/过期 → `null`。
   */
  findPendingById(invitationId: string): Promise<TenantInvitationView | null>;

  /**
   * 标记邀请已接受（pending → accepted·消费一行）。
   * @param invitationId - 邀请行 id。
   */
  markAccepted(invitationId: string): Promise<InvitationAcceptResult>;

  /**
   * 原子入租（切片 G·G3·席位 TOCTOU 硬化）：单事务 + `pg_advisory_xact_lock(hashtext(tenantId))` 串行化同租并发 accept。
   * 事务内：重查 pending 邀请（兼防双消费）+ 校验受邀邮箱→`count(tenant_membership)` live→`used+1>seatsLimit` 则回滚 `overLimit`；
   * 否则落 `tenant_membership`+`tenant_role_assignment` + `markAccepted` 一并提交。三表均属 authorization（单事务合规）。
   * @param params - 邀请定位（id）+ 受邀主体（email 复校/userId）+ 席上限（门面预算 `checkSeats` 预飞取）。
   */
  admitAtomically(params: {
    readonly invitationId: string;
    readonly email: string;
    readonly userId: string;
    readonly seatsLimit: number;
  }): Promise<InvitationAdmitResult>;

  /**
   * 列出发送给某邮箱的待处理邀请（**跨租·个人通道 `mine` 可见面**·`scoped:false`）。
   * 入组前无 active 租户亦可达；email 系会话用户收敛的唯一可见性界定（防枚举他人邀请）。
   * @param email - 受邀邮箱。
   */
  listPendingByEmail(email: string): Promise<TenantInvitationView[]>;

  /**
   * 受邀者拒绝邀请（pending → cancelled·**限受邀邮箱匹配**·fail-closed 他人不可代拒）。
   * 与管理员 {@link cancel}（按 tenantId 锥定）正交：本面为无活动租的个人通道，按受邀邮箱而非租界定。
   * @param invitationId - 邀请行 id。
   * @param email - 当前认证用户邮箱（不匹配 → `notFound`·不泄露他邮箱邀请存在性）。
   */
  rejectForEmail(invitationId: string, email: string): Promise<InvitationCancelResult>;
}
