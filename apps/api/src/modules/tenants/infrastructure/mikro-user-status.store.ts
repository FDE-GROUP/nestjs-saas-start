import { User } from '@app/database/mikro/entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { UserStatus } from '@app/modules/tenants/infrastructure/entities/user-status.entity';
import type { UserStatusStore } from '@core/saas-kit/modules/tenants/lifecycle/user-status.store';
import { Inject, Injectable } from '@nestjs/common';

/**
 * ORM 修宪案 B · 切片 3c-ii-A —— `UserStatusStore` 的 **MikroORM 适配**（`USER_STATUS_STORE` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * 落独立表 `user_status`（不动 Better Auth 的 `user` 表·FK 级联删除·core 经端口消费、不感知实现·
 * §9.5.4①B）。`userId` 由 `UserStatusService`（tenancy 层唯一卡点·FR-10 deny-list）传入·本 store 非 ALS
 * 作用域（与 3c-i `MikroTenantStatusStore` 同构）。每次 `fork()` 取独立 em。
 *
 * `upsert` 严格复刻旧 ORM `onConflictDoUpdate`：**冲突只改 status/reason/updatedAt·不回盖 createdAt**——
 * 故先 `findOne` 探主键行、命中走 `nativeUpdate`（不含 createdAt）、未命中走 `create`+`persist`（含 createdAt）。
 * 更新面走 `nativeX` 直发 SQL·不经 Identity Map（无状态 store 语义最贴）。`UserStatus` 主键为 `userId`
 * （非 `id`），`Primary<T>` 推断失效→一律以 `{ userId }` 过滤对象寻址（`as never` 仅系调用边界 cast）。
 */
@Injectable()
export class MikroUserStatusStore implements UserStatusStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async readStatus(userId: string): Promise<string | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(UserStatus, { userId } as never);
    return row?.status;
  }

  async userExists(userId: string): Promise<boolean> {
    const em = await this.mikro.fork();
    const row = await em.findOne(User, userId);
    return row !== null;
  }

  async upsert(userId: string, status: string, reason: string | null): Promise<void> {
    const now = new Date();
    const em = await this.mikro.fork();
    const existing = await em.findOne(UserStatus, { userId } as never);
    if (existing) {
      await em.nativeUpdate(UserStatus, { userId } as never, { status, reason, updatedAt: now });
    } else {
      const entity = em.create(UserStatus, {
        userId,
        status,
        reason,
        createdAt: now,
        updatedAt: now,
      });
      await em.persist(entity).flush();
    }
  }
}
