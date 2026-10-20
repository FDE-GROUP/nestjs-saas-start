import { Migration } from '@mikro-orm/migrations';

/**
 * global-tenant-entity-reclamation 切片 A · **数据回填**（人签 2026-10-20·裁③一步直切·无存量生产）——
 * 把租户生命周期态从 BA `organization.metadata`（jsonb）迁入自有 `tenant` 表。
 *
 * 语义等价律（迁移前后租户态逐行核）：
 *  - metadata 携合法 status → 原值入列（`pending_approval` 等四态）；
 *  - 无行/非法/缺键（存量 seeded 口径）→ `active`——与旧 deny-list「无状态记录不拦」、
 *    `canTransition` 缺省视同 active、治理读面 `effectiveStatus` 兜底三处**逐字同论**；
 *  - `createdAt` 承 org 行创建时刻（户籍与本体同龄·无 org.createdAt 才落 now()）。
 * 回填后剥离 `metadata->'status'`（我方唯一寄居键·`appliedAt` 等其余键原样留 BA 面），
 * 剥离即终别：换轨后（切片 B）读写链不再回看 metadata，残键成死数据，不留双 SSOT 余烬。
 *
 * 值域清单与本链前一 schema 工件 `tenant_status_check` 一致——迁移工件系历史快照，
 * 刻意**固化字面量**（上游 `TENANT_STATUS` 若变，由后续新迁移负责演进，不回写旧工件）。
 */
export class Migration20261020075700_backfill_tenant_from_metadata extends Migration {
  override name = 'Migration20261020075700_backfill_tenant_from_metadata';

  override up(): void | Promise<void> {
    this.addSql(`
      insert into "tenant" ("id", "status", "createdAt")
      select o."id",
             case
               when o."metadata" ->> 'status' in ('pending_approval', 'active', 'suspended', 'deleted')
                 then o."metadata" ->> 'status'
               else 'active'
             end,
             coalesce(o."createdAt", now())
      from "organization" o
      left join "tenant" t on t."id" = o."id"
      where t."id" is null;
    `);
    this.addSql(
      `update "organization" set "metadata" = "metadata" - 'status' where "metadata" ? 'status';`,
    );
  }

  override down(): void | Promise<void> {
    // 回填行随前一 schema 工件的 down（drop table cascade）一并消灭；metadata 剥离不可逆
    // （status 键原值不双写·留档即违「不留双 SSOT」），故本工件 down 刻意无操作。
  }
}
