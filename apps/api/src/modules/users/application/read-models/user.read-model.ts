/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
import type { UserRole } from '../../domain/repositories/user.repository';

/**
 * 用户公开读模型（query handler 返回形状 · CQRS 读面）。
 *
 * @remarks
 * Read-model projection returned by query handlers (CQRS read side).
 * Mirrors the pre-refactor public user payload exactly.
 * @public
 */
export interface UserReadModel {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 对外暴露列白名单（布尔 `columns` map·排除 password/凭据列·PIPL 面治理）。
 * @public
 */
export const userPublicColumns = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;
