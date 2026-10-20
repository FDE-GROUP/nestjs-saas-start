import { User } from '@app/database/ba/entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { PlatformIdentityLookup } from '@core/saas-kit/platform/platform-identity.port';
import { Inject, Injectable } from '@nestjs/common';

/**
 * ORM 修宪案 B · 切片 3c-i —— `PlatformIdentityLookup` 的 **MikroORM 适配**（`PLATFORM_IDENTITY_LOOKUP` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * 据实读 Better Auth 的 `user.email`（非 session 回传字段·FR-13 唯一经营者判定）。读走 `user`
 * **BA 实体**（切片 1 `entities.ts` 已含 `email` 列·无需补实体）·每次 `fork()` 取独立 em
 * （禁共享全局 em·V4 串租户教训）。此查询按主键 `userId` 直达·非租户作用域（core 经端口消费·不感知实现）。
 */
@Injectable()
export class MikroPlatformIdentityLookup implements PlatformIdentityLookup {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async emailOf(userId: string): Promise<string | undefined> {
    const em = await this.mikro.fork();
    const row = await em.findOne(User, userId);
    return row?.email;
  }
}
