import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { User } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  ORGANIZATION_STATUS,
  type OrganizationStatus,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { createPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  PlatformUserPage,
  PlatformUserRow,
  UserGovernanceRepository,
} from '../../domain/repositories/user-governance.repository';

/**
 * 平台用户治理读面的 **MikroORM 适配**（`USER_GOVERNANCE_REPOSITORY` 绑定·MikroORM 为唯一实现·
 * global-governance-lifecycle-consolidation 切片 C：态从 `user_status` 旁表 JOIN 归位为直读 `user.status` 真列）。
 *
 * 跨平台用户列表：单查 `user`·`status` 即行上真列（旁表 JOIN/内存合并随本案消解·无状态记录行视同
 * active 的兑底已转列默认 'active'）。刻意**不注入任何租户上下文**（平台级天然全量，FR-11①）——
 * 访问裁决完全由 controller 侧 `PlatformOperatorGuard` 前置把守（fail-closed）。
 * 搜索采 `$ilike`（探针实测与旧实现 `ilike`＝PG 原生 ILIKE 逐字节一致·见 §5.13 R-B2）。`fields` 投影
 * **只取读面所需列**（`id/name/email/status/createdAt`·既排除凭据列也规避实体上非物理列如 `dateField`）。
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
      fields: ['id', 'name', 'email', 'status', 'createdAt'],
      orderBy: { createdAt: QueryOrder.DESC },
      limit: opts.limit,
      offset: opts.offset,
    });

    const items: PlatformUserRow[] = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      // `user.status` 为 NOT NULL 真列（列默认 'active'·旧旁表无行兑底已物化入列）。
      status: (u.status ?? ORGANIZATION_STATUS.ACTIVE) as OrganizationStatus,
      createdAt: u.createdAt,
    }));
    return createPage(items, total, opts);
  }
}
