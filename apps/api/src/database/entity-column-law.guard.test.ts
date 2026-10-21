import {
  TENANT_ROLE_AUDIT_META,
  TENANT_ROLE_GRANT_META,
  TENANT_ROLE_META,
} from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import { PostEntity } from '@app/modules/posts/infrastructure/entities/post.entity';
import { TENANT_SUBSCRIPTION_META } from '@app/modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { TENANT_META } from '@app/modules/tenants/infrastructure/entities/tenant.entity';
import { USER_STATUS_META } from '@app/modules/tenants/infrastructure/entities/user-status.entity';
import { WORKSPACE_META } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import { describe, expect, it } from 'vitest';
import {
  BA_CONTRACT_TABLES,
  IMMUTABLE_TABLES,
  UPDATED_AT_NULLABLE_EXEMPT,
} from './entity-column-law';
import { EVENT_META } from './eventing/entities/event.entity';
import type { TableMeta } from './mikro/column-meta';
import { MIKRO_ENTITIES } from './mikro/sys-entities';

/**
 * 实体列定律守卫（global-entity-column-law 切片 A · 数据级核验·人裁③）。
 *
 * 律条（清单单源 `entity-column-law.ts`·语义成文 architecture.md 附录）：
 *  - L1 存在性：每张自撰表必须有 `createdAt`；可变表必须另有 `updatedAt`；
 *    不可变/契约豁免须显式登记。
 *  - L2 口径：新表 `updatedAt` 必须 `nullable()`；存量 NOT NULL 表凭棘轮豁免挂账（只减不增）。
 *
 * 覆盖面与已知局限（如实声明，沿 ownership 守卫文风）：自撰表经 `*_META` 纯值 inspect
 * （列名+可空性直读），`Post` 为手写 `defineEntity` 走 `.properties` 键面 inspect 存在性
 * ——其 `updatedAt` 可空性不直读（该表在棘轮豁免账上，L2 对其本就豁免；若将来迁移翻
 * nullable，须人工同步删豁免键，棘轮长度上限闸兜住不加键通道）。BA 契约面只裁**表名恒等**，
 * 列形不在覆盖面（外部契约）。
 */

/** 自撰表事实（数据级派生：META 七表 + Post）。 */
interface SelfTableFacts {
  table: string;
  hasCreatedAt: boolean;
  hasUpdatedAt: boolean;
  /** 仅 META 表可直读；Post 为 null（见头注局限）。 */
  updatedAtNullable: boolean | null;
}

function metaFacts(meta: TableMeta): SelfTableFacts {
  const created = meta.columns.find(([n]) => n === 'createdAt');
  const updated = meta.columns.find(([n]) => n === 'updatedAt');
  return {
    table: meta.tableName,
    hasCreatedAt: created !== undefined,
    hasUpdatedAt: updated !== undefined,
    updatedAtNullable: updated ? ((updated[1] as { nullable?: true }).nullable ?? false) : null,
  };
}

const postAny = PostEntity as unknown as { tableName: string; properties: Record<string, unknown> };
const POST_FACTS: SelfTableFacts = {
  table: postAny.tableName,
  hasCreatedAt: 'createdAt' in postAny.properties,
  hasUpdatedAt: 'updatedAt' in postAny.properties,
  updatedAtNullable: null,
};

const SELF_TABLES: SelfTableFacts[] = [
  metaFacts(WORKSPACE_META),
  metaFacts(USER_STATUS_META),
  metaFacts(TENANT_META),
  metaFacts(TENANT_SUBSCRIPTION_META),
  metaFacts(EVENT_META),
  metaFacts(TENANT_ROLE_META),
  metaFacts(TENANT_ROLE_GRANT_META),
  metaFacts(TENANT_ROLE_AUDIT_META),
  POST_FACTS,
];

const baTableNames = MIKRO_ENTITIES.map((e) => (e as unknown as { tableName: string }).tableName);

describe('实体列定律 L1：存在性', () => {
  it('每张自撰表都有 createdAt', () => {
    for (const f of SELF_TABLES) expect(f.hasCreatedAt, `${f.table} 缺 createdAt`).toBe(true);
  });

  it('无 updatedAt 的自撰表必须显式登记在 IMMUTABLE_TABLES（隐式缺失即红）', () => {
    for (const f of SELF_TABLES) {
      if (!f.hasUpdatedAt)
        expect(IMMUTABLE_TABLES, `${f.table} 缺 updatedAt 且未登记不可变`).toContain(f.table);
    }
  });

  it('IMMUTABLE_TABLES 防腐烂：登记项确为无 updatedAt 的自撰表', () => {
    for (const t of IMMUTABLE_TABLES) {
      const f = SELF_TABLES.find((x) => x.table === t);
      expect(f, `不可变清单表 ${t} 不在自撰面`).toBeDefined();
      expect(f?.hasUpdatedAt, `表 ${t} 已非 append-only（有 updatedAt）应删豁免`).toBe(false);
    }
  });
});

describe('实体列定律 L2：updatedAt 可空口径（人裁 (a)·nullable 为方向）', () => {
  it('非豁免的可变自撰表 updatedAt 必须 nullable', () => {
    for (const f of SELF_TABLES) {
      if (!f.hasUpdatedAt || UPDATED_AT_NULLABLE_EXEMPT.includes(f.table)) continue;
      expect(f.updatedAtNullable, `${f.table} 新表违 L2：updatedAt 须 nullable`).toBe(true);
    }
  });

  it('棘轮只减不增：豁免清单长度不得超过当前挂账数 4', () => {
    expect(UPDATED_AT_NULLABLE_EXEMPT.length).toBeLessThanOrEqual(4);
  });

  it('豁免防腐烂：挂账表须实为「有 updatedAt 且非 nullable」的自撰表', () => {
    for (const t of UPDATED_AT_NULLABLE_EXEMPT) {
      const f = SELF_TABLES.find((x) => x.table === t);
      expect(f, `豁免表 ${t} 不在自撰面`).toBeDefined();
      expect(f?.hasUpdatedAt, `豁免表 ${t} 已无 updatedAt，删账`).toBe(true);
      if (f?.updatedAtNullable !== null) {
        expect(f?.updatedAtNullable, `表 ${t} 已翻 nullable，删账`).toBe(false);
      }
    }
  });
});

describe('全表登记恒等（17 表·新增/移除未登记即红）', () => {
  it('BA 契约面表名与清单恒等', () => {
    expect([...baTableNames].sort()).toEqual([...BA_CONTRACT_TABLES].sort());
  });

  it('自撰 ∪ BA = 17 表无漏重；自撰按 L1/L2 三分（不可变/豁免/合规 nullable）全覆盖', () => {
    const all = [...SELF_TABLES.map((f) => f.table), ...baTableNames];
    expect(all).toHaveLength(17);
    expect(new Set(all).size, '表名出现重复归属').toBe(17);
    // 自撰 9 表逐一有归宿：immutable 登记 ∪ 豁免登记 ∪（有 updatedAt 且非豁免=合规）
    for (const f of SELF_TABLES) {
      const classified =
        IMMUTABLE_TABLES.includes(f.table) ||
        UPDATED_AT_NULLABLE_EXEMPT.includes(f.table) ||
        (f.hasUpdatedAt && f.updatedAtNullable === true);
      expect(classified, `自撰表 ${f.table} 未落入定律任何清单`).toBe(true);
    }
    // 8 + 3 + 4 + 2 = 17 实数对拍（global-tenant-entity-reclamation 入账后）：合规 nullable 面 = 9−3−4 = 2（tenant_role、tenant）
    expect(SELF_TABLES.length).toBe(9);
  });
});
