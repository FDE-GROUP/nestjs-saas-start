import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthUserStore } from '../user-store.port';
import { User } from './entities/ba-identity.entities';

/**
 * `AUTH_USER_STORE` 的 MikroORM 适配（global-ba-entity-domain-placement 切片 A）。
 *
 * `user` 表属主 = auth 域（身份机器族·本案裁①）；PIPL 硬删经本端口落位属主目录，
 * users 模块对 user 表自此纯读（表所有权守卫台账 `user→auth` 全量一致）。
 * FK 级联灭 account/session（consent 为 set-null·schema 定义）——与旧 `MikroUserRepository.remove`
 * 逐字同语义，仅写面归位。经 `fork()`（ALS 感知：调用方包 `uow.run` 时自动同事务 em）。
 */
@Injectable()
export class MikroUserStoreAdapter implements AuthUserStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async hardDelete(userId: string): Promise<void> {
    const em = await this.mikro.fork();
    await em.nativeDelete(User, { userId } as never).then(() => undefined);
  }
}
