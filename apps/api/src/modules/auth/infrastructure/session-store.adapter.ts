import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Session } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthSessionStore } from '../domain/ports/session-store.port';

/**
 * `AUTH_SESSION_STORE` 的 MikroORM 适配（架构精度修宪 S3）。
 *
 * 经 `MikroOrmService.fork()` 取 em——**ALS 感知**（`mikro-orm.service.ts` fork：活跃
 * UoW 事务内返回事务 em）：调用方（如 suspend-user handler）包 `uow.run` 时，本删除与
 * 域状态写**同事务**；事务外独立短操作。`session` 表属 auth 上下文（Better Auth 所有），
 * 本适配器是治理面对它的唯一受控写入口（表所有权纪律：跨上下文写须经属主端口）。
 */
@Injectable()
export class MikroSessionStoreAdapter implements AuthSessionStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async deleteAllForUser(userId: string): Promise<number> {
    const em = await this.mikro.fork();
    return em.nativeDelete(Session, { userId } as never);
  }
}
