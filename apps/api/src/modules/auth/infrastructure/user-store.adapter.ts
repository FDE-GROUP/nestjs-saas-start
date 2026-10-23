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
    // user 表主键 = `id`（自然人 PK·无 userId 列，userId 仅系 account/session/consent 的外键列名）。
    // 谓词必须落 `{ id: userId }`（与 updateStatus 同柱），否则 Mikro 报「Trying to query by not
    // existing property User.userId」——PIPL 硬删静默 500、右侧被遗忘权失效（曾长期潜伏：handler 测
    // 把本端口整 stub·无 gated e2e 跑真库，故未捕）。FK 级联（account/session cascade·consent set-null）
    // 由 schema 层约束实效·见 user-hard-delete.e2e.test.ts 真库锁。
    const em = await this.mikro.fork();
    await em.nativeDelete(User, { id: userId });
  }

  async updateStatus(userId: string, status: string, reason: string | null): Promise<void> {
    // 治理迁移即变更：直写 user.status/statusReason 真列并盖 updatedAt（nativeUpdate 不经 Identity Map/UnitOfWork）。
    // 本适配器居 `modules/auth/**` 写自身 owned `user` 表 → 写侧纪律天然合规（tenants 侧经 AUTH_USER_STORE 端口委托至此）。
    const em = await this.mikro.fork();
    await em.nativeUpdate(
      User,
      { id: userId },
      {
        status,
        statusReason: reason,
        updatedAt: new Date(),
      },
    );
  }
}
