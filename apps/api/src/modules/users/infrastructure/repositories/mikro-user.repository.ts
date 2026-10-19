import { User as UserEntity } from '@app/database/mikro/entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { InferEntity } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type { UserRecord, UserRepository } from '../../domain/repositories/user.repository';

/**
 * 运行时 Mikro `User` 实体 → `UserRecord`（架构精度修宪 S1：原 `entityToState` 逐字段镜像——
 * 可空列 `?? null`、`password`→`passwordHash`（缺省 ''）、`role` 兜底 'USER'、
 * `updatedAt` 兜底 `createdAt`（真实列 NOT NULL·Mikro 侧仅类型层可空·运行期不触发兜底））。
 */
function entityToRecord(entity: InferEntity<typeof UserEntity>): UserRecord {
  return {
    id: entity.id,
    email: entity.email,
    firstName: entity.firstName ?? null,
    lastName: entity.lastName ?? null,
    role: (entity.role ?? 'USER') as UserRecord['role'],
    passwordHash: entity.password ?? '',
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt ?? entity.createdAt,
  };
}

/**
 * `UserRepository` 端口的 MikroORM 适配（ORM 修宪案 B · 切片 3d + 架构精度修宪 S1）。
 *
 * S1 起聚合死管道删除：`save/isNew/attachPersistenceMetadata/markExisting` 全部退役，
 * 本类收敛为**只读 + PIPL 硬删**（用户创建走 Better Auth，无应用层 save 用例）。
 * 每次 `fork()` 取独立 em（禁共享全局 em·V4 串租户教训）。`user` 属 `users` 上下文
 * （表所有权单源）·写自身 owned 表 → 写侧纪律天然合规。
 */
@Injectable()
export class MikroUserRepository implements UserRepository {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async findById(id: string): Promise<UserRecord | null> {
    const em = await this.mikro.fork();
    const entity = await em.findOne(UserEntity, { id } as never);
    return entity ? entityToRecord(entity) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const em = await this.mikro.fork();
    const entity = await em.findOne(UserEntity, { email } as never);
    return entity ? entityToRecord(entity) : null;
  }

  async remove(id: string): Promise<void> {
    const em = await this.mikro.fork();
    await em.nativeDelete(UserEntity, { id } as never);
  }
}
