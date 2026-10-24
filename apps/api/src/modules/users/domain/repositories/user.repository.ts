/** 用户仓储端口的 DI 注入 token（依赖倒置；具体 ORM 适配居 infrastructure 层）。 @public */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * 用户角色词表（架构精度修宪 S1：自 user.aggregate 上移至端口文件——聚合死管道删除后类型居此单源）。
 * @public
 */
export type UserRole = 'USER' | 'ADMIN';

/**
 * 用户行记录（架构精度修宪 S1 · P4 简单上下文合法终态）：users 无聚合——仓储返回不可变记录，
 * 与 posts/workspaces 同构（record + 端口）。
 *
 * @remarks
 * `passwordHash` 为存储列的忠实镜像；对外暴露面由 read-model 的 `userPublicColumns` 白名单治理（凭据不选出）。
 * @public
 */
export interface UserRecord {
  /** 用户 id。 */
  readonly id: string;
  /** 邮箱地址。 */
  readonly email: string;
  /** 名。 */
  readonly firstName: string | null;
  /** 姓。 */
  readonly lastName: string | null;
  /** 用户全局角色。 */
  readonly role: UserRole;
  /** 密码哈希。 */
  readonly passwordHash: string;
  /** 创建时间。 */
  readonly createdAt: Date;
  /** 更新时间。 */
  readonly updatedAt: Date;
}

/**
 * 用户读仓储端口（domain 定义 · 本模块纯读）。
 *
 * @remarks
 * S1：`save` 随聚合死管道删除；global-ba-entity-domain-placement 切片 A：`remove` 收编
 * `AUTH_USER_STORE`——user 表归 auth 域，跨域写经属主端口·本模块自此**纯读**。
 *
 * ⚠ 未来边界（评审留痕）：若出现应用内直接建号/改号用例（如平台侧手工建 user 行），须**扩 auth 域
 * 端口**（AUTH_USER_STORE 或新语义），禁绕过端口直捅 ORM entity——那正是 S3 修掉的违规模式。
 * @public
 */
export interface UserRepository {
  /**
   * 按 id 取用户行。
   * @param id - 用户 id。
   * @returns 用户记录；查无时为 `null`。
   */
  findById(id: string): Promise<UserRecord | null>;
  /**
   * 按邮箱取用户行。
   * @param email - 邮箱地址。
   * @returns 用户记录；查无时为 `null`。
   */
  findByEmail(email: string): Promise<UserRecord | null>;
}
