import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { UserStatus } from '@app/modules/tenants/infrastructure/entities/user-status.entity';
import {
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { createPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  PlatformUserPage,
  PlatformUserRow,
  UserGovernanceRepository,
} from '../../domain/repositories/user-governance.repository';

/**
 * ORM 修宪案 B · 切片 3c-ii-B —— 平台用户治理读面的 **MikroORM 适配**（`USER_GOVERNANCE_REPOSITORY` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * 跨平台用户列表：`user` LEFT JOIN `user_status`——无状态记录行（未被动过暂停）视同 active，与租户
 * deny-list 同口径。刻意**不注入任何租户上下文**（平台级天然全量，FR-11①）——访问裁决完全由 controller
 * 侧 `PlatformOperatorGuard` 前置把守（fail-closed）。
 *
 * Mikro 侧无关系对象（扁平列），故 LEFT JOIN 以「`findAndCount(User)` 取本页用户 + `find(UserStatus,
 * { userId: { $in: 本页 id } })` 批量取状态 + 内存合并」折叠·**不逐用户 N+1**。搜索采 `$ilike`（探针
 * 实测与旧实现 `ilike`＝PG 原生 ILIKE 逐字节一致·忠实 drop-in·见 §5.13 R-B2）。`fields` 投影**只取
 * 读面所需列**（`id/name/email/createdAt`·既排除凭据列也规避实体上非物理列如 `dateField`）。
 */
@Injectable()
export class MikroUserGovernanceRepository implements UserGovernanceRepository {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async list(opts: { limit: number; offset: number; search?: string }): Promise<PlatformUserPage> {
    const em = await this.mikro.fork();
    const where = opts.search
      ? {
          $or: [
            { name: { $ilike: `%${opts.search}%` } },
            { email: { $ilike: `%${opts.search}%` } },
          ],
        }
      : {};
    // `as never` 仅系调用边界 cast（mikro-orm.factory.ts 以 `entities as never` 装配致 FilterQuery 宽化不匹配·不改运行时谓词）。
    const [users, total] = await em.findAndCount(User, where as never, {
      fields: ['id', 'name', 'email', 'createdAt'],
      orderBy: { createdAt: QueryOrder.DESC },
      limit: opts.limit,
      offset: opts.offset,
    });

    // 本页用户 id → user_status 状态（缺行视同 active）。
    const statusByUserId = new Map<string, string>();
    if (users.length > 0) {
      const statuses = await em.find(UserStatus, {
        userId: { $in: users.map((u) => u.id) },
      } as never);
      for (const s of statuses) statusByUserId.set(s.userId, s.status);
    }

    const items: PlatformUserRow[] = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      status: (statusByUserId.get(u.id) ?? TENANT_STATUS.ACTIVE) as TenantStatus,
      createdAt: u.createdAt,
    }));
    return createPage(items, total, opts);
  }
}
