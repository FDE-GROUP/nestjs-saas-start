import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';

/**
 * `user_status` 表列元数据单源 + 运行时扁平实体（global-entity-context-placement 切片 B 归位：
 * 原 `database/mikro/four-tables.ts`·判据=`table-ownership.ts` 表属主 `userStatus→tenants`）。
 * 同源双变体语义与相对导入约束见 `workspace.entity.ts` 头注。
 */

export const USER_STATUS_META: TableMeta = {
  name: 'UserStatus',
  tableName: 'user_status',
  columns: [
    // PK-FK：userId 即主键 + FK→user（旧 ORM 仅 `on delete cascade`·显式压回 updateRule no action 求逐字对齐）。
    [
      'userId',
      { k: 'fk', target: 'User', onDelete: 'cascade', onUpdate: 'no action', primary: true },
    ],
    ['status', { k: 'text' }],
    ['reason', { k: 'text', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime' }],
  ],
};

export interface UserStatus {
  userId: string;
  status: string;
  reason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const UserStatus: EntitySchema<UserStatus> = buildRuntimeEntity(
  USER_STATUS_META,
) as EntitySchema<UserStatus>;
