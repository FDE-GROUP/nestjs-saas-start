/**
 * Injection token for the User repository port (dependency inversion).
 * The concrete ORM-backed implementation lives in the infrastructure layer.
 */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * 用户角色词表（架构精度修宪 S1：自 user.aggregate 上移至端口文件——聚合死管道删除后类型居此单源）。
 */
export type UserRole = 'USER' | 'ADMIN';

/**
 * 用户行记录（架构精度修宪 S1 · P4 简单上下文合法终态）：users 无聚合——仓储返回不可变记录，
 * 与 posts/workspaces 同构（record + 端口）。`passwordHash` 为存储列的忠实镜像；
 * 对外暴露面由 read-model 的 `userPublicColumns` 白名单治理（凭据不选出）。
 */
export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly role: UserRole;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Repository port defined by the domain（S1：`save` 随聚合死管道删除——用户创建走 Better Auth，
 * 生产无应用层 save 用例；端口收敛为读 + PIPL 硬删）。
 *
 * ⚠ 未来边界（评审留痕）：若出现应用内直接建号/改号用例（如平台侧手工建 user 行），须**扩本
 * 端口**（如新增 create/update 语义），禁绕过端口直捅 ORM entity——那正是 S3 修掉的违规模式。
 */
export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  /** PIPL 硬删（FK 级联 account/session；event 表行由应用层显式补删）。 */
  remove(id: string): Promise<void>;
}
