import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Inject, Injectable } from '@nestjs/common';
import type { BaMemberDirectoryWriter } from '../../domain/repositories/ba-member-writer.repository';
import { Member, Organization } from '../entities/ba-org.entities';

/**
 * `BaMemberDirectoryWriter` 的 **MikroORM 适配**（切片 G·G1·BA 遗留 `member` 轴属主侧清理）。
 *
 * @remarks
 * `member`/`organization` 均属 `organizations` 上下文（`table-ownership.ts`）→ 本类在自身 owned 表内
 * `nativeDelete(Member)` 写侧合规（authorization 撤销租级两表后经本口连带清 BA 行·双轴同步闭 P3 失同步）。
 * 跨租无活动上下文，显式 `fork({ scoped:false })` 绕 ALS 派生 filter（沿同目录 provisioning/reader 纪律）；
 * 先按 `tenantId` 取该租全部 org（1:1 常态·多 org 循环），逐 org 删该 user 的 member 行（简单等值·无 `$in` 边界）。
 * FK 触发器（`tenant_member_count_on_member` DELETE 支）随删自然 −N `tenant.memberCount` 观测值——无需手工。
 */
@Injectable()
export class MikroBaMemberDirectoryWriter implements BaMemberDirectoryWriter {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async removeAcrossTenant(tenantId: string, userId: string): Promise<number> {
    const em = await this.mikro.fork({ scoped: false });
    const orgs = await em.find(Organization, { tenantId });
    let removed = 0;
    for (const org of orgs) {
      removed += await em.nativeDelete(Member, { organizationId: org.id, userId });
    }
    return removed;
  }
}
