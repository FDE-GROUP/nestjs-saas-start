import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { AUTH_USER_STORE, type AuthUserStore } from '@app/modules/auth/user-store.port';
import type { UserStatusStore } from '@core/saas-kit/modules/tenants/lifecycle/user-status.store';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `UserStatusStore` 的 **MikroORM 适配**（`USER_STATUS_STORE` 绑定·MikroORM 为唯一实现·
 * global-governance-lifecycle-consolidation 切片 C：态从自有 `user_status` 旁表归位 `user.status`
 * 真列（BA 表共享·additive 自撰域列）·旁表随本案 DROP）。
 *
 * 读侧宽松（跨上下文 select 允许）：`readStatus`/`userExists` 直读 auth 属主的 `user` 行；
 * 写侧严格（跨上下文写须经属主端口）：`upsert` 不直搬 `user` 表·而委托 `AUTH_USER_STORE.updateStatus`
 * 落 auth 属主目录（沿 PIPL 硬删同型·消写侧越界）。
 *  - `readStatus`：`user.status` 为 NOT NULL 真列，本体存在即有值（缺席态消失）；本体行不存在 → `undefined`；
 *  - `userExists`：本体存在性单查（`transition` 的 not-found(404) 判据）。
 * 每次 `fork()` 取独立 em。S9 教训：非 controller provider 必须显式 `@Inject` token + 值导入。
 */
@Injectable()
export class MikroUserStatusStore implements UserStatusStore {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(AUTH_USER_STORE) private readonly authUsers: AuthUserStore,
  ) {}

  async readStatus(userId: string): Promise<string | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(User, userId);
    return row ? row.status : undefined;
  }

  async userExists(userId: string): Promise<boolean> {
    const em = await this.mikro.fork();
    const row = await em.findOne(User, userId);
    return row !== null;
  }

  async upsert(userId: string, status: string, reason: string | null): Promise<void> {
    // 治理写经 auth 属主端口（本类居 `modules/tenants/**`、直写 auth `user` 表即越界 → 委托消解）。
    await this.authUsers.updateStatus(userId, status, reason);
  }
}
