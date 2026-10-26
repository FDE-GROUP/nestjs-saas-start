import { describe, expect, it } from 'vitest';
import {
  findRegistryViolations,
  findTableBlocks,
  hasTenantColumn,
  type TableBlock,
  TENANT_SCOPED_EXEMPT_TABLES,
  TENANT_SCOPED_TABLES,
} from './verify-tenant-scoped-registry';

// 租户实体登记恒等闸纯核自测（module-tenant-scoped-entity-registry-gate · 镜像
// verify-overturned-rulings.test.ts 三向对拍蓝本）。
// 覆盖：块抽取（define 形/工厂形/多表同文件）/ 列证据两 pattern / uniques 纯引用防假阳 /
// 三向判据各红 / 现树全绿（清单 ↔ 实存恒等实扫）。

const block = (table: string, body: string, file = 'x.ts'): TableBlock => ({ table, file, body });

describe('findTableBlocks — 实体块抽取与定界', () => {
  it('defineEntity 形：块体含 properties 全域（多表同文件逐块独立）', () => {
    const src = `export const Member = defineEntity({
  name: 'Member',
  tableName: 'member',
  properties: {
    id: p.string().primary(),
    organizationId: p.string(),
  },
});

export const Invitation = defineEntity({
  name: 'Invitation',
  tableName: 'invitation',
  properties: {
    id: p.string().primary(),
    status: p.string(),
  },
});
`;
    const blocks = findTableBlocks('ba-org.entities.ts', src);
    expect(blocks.map((b) => b.table)).toEqual(['member', 'invitation']);
    expect(hasTenantColumn(blocks[0] as TableBlock)).toBe(true);
    expect(hasTenantColumn(blocks[1] as TableBlock)).toBe(false);
  });

  it('TableMeta 工厂形：FK 元组列命中，uniques/indexes 纯字符串引用不命中（防假阳）', () => {
    const src = `export const WORKSPACE_META: TableMeta = {
  name: 'Workspace',
  tableName: 'workspace',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['organizationId', { k: 'fk', target: 'Organization', onDelete: 'cascade' }],
  ],
  uniques: [{ name: 'workspace_org_slug_idx', properties: ['organizationId', 'slug'] }],
};
`;
    const blocks = findTableBlocks('workspace.entity.ts', src);
    expect(blocks).toHaveLength(1);
    expect(hasTenantColumn(blocks[0] as TableBlock)).toBe(true);
    // 仅 uniques 引用（无列定义）→ 不构成列证据。
    const onlyIdx = block(
      't',
      `{\n columns: [['id', { k: 'text' }]],\n indexes: [{ properties: ['organizationId', 'createdAt'] }],\n}`,
    );
    expect(hasTenantColumn(onlyIdx)).toBe(false);
  });

  it('主轴证据（rehierarchy C 换轴）：tenantId 属性形/FK 元组形均命中，uniques 纯引用不命中', () => {
    // define 形主轴属性列。
    expect(hasTenantColumn(block('t', '{ tenantId: p.string() }'))).toBe(true);
    // TableMeta FK 元组形主轴列。
    const src = `export const TENANT_SUBSCRIPTION_META: TableMeta = {
  name: 'TenantSubscription',
  tableName: 'tenant_subscription',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade', nullable: true }],
  ],
  indexes: [{ name: 'x', properties: ['tenantId', 'createdAt'] }],
};
`;
    const blocks = findTableBlocks('tenant-subscription.entity.ts', src);
    expect(blocks).toHaveLength(1);
    expect(hasTenantColumn(blocks[0] as TableBlock)).toBe(true);
    // 仅 indexes 纯字符串引用（无列定义）→ 不构成列证据。
    const onlyIdx = block(
      't',
      `{\n columns: [['id', { k: 'text' }]],\n indexes: [{ properties: ['tenantId', 'createdAt'] }],\n}`,
    );
    expect(hasTenantColumn(onlyIdx)).toBe(false);
  });

  it('字符串内花括号/引号转义不破坏配对定界', () => {
    const src = `export const X = defineEntity({
  tableName: 'x',
  properties: { name: p.string().default('a{b}'), },
});
export const Y = defineEntity({
  tableName: 'y',
  properties: { organizationId: p.string(), },
});
`;
    const blocks = findTableBlocks('x.ts', src);
    expect(blocks.map((b) => b.table)).toEqual(['x', 'y']);
  });
});

describe('findRegistryViolations — 三向恒等判据', () => {
  const scoped = ['post', 'organization'];
  const exempt = [{ table: 'tenant_container', reason: '容器根' }];

  it('① 有列须在册：未登记表带列 → unregistered 红（余向恒等不干扰）', () => {
    const blocks = [
      block('post', '{ organizationId: p.string() }'),
      block('organization', '{ organizationId: p.string() }'),
      block('rogue', '{ organizationId: p.string() }'),
    ];
    const v = findRegistryViolations(blocks, scoped, []);
    expect(v).toEqual([{ kind: 'unregistered', table: 'rogue', file: 'x.ts' }]);
  });

  it('豁免表带列不触①', () => {
    const blocks = [block('tenant_container', '{ organizationId: p.string() }')];
    expect(findRegistryViolations(blocks, ['post'], exempt)).toEqual([
      { kind: 'stale-registry', table: 'post' },
    ]);
  });

  it('② 在册须实存：在册表检不出列 → stale-registry 红', () => {
    const blocks = [block('post', '{ name: p.string() }')];
    const v = findRegistryViolations(blocks, scoped, []);
    expect(v).toContainEqual({ kind: 'stale-registry', table: 'post' });
    expect(v).toContainEqual({ kind: 'stale-registry', table: 'organization' });
  });

  it('③ 豁免防腐：块实存但列已删 → 红；表无任何块（容器根无租户列常态）→ 不判矛盾零假红', () => {
    const v1 = findRegistryViolations(
      [block('tenant_container', '{ name: p.string() }')],
      ['post'],
      exempt,
    );
    expect(v1).toContainEqual({ kind: 'exempt-stale', table: 'tenant_container' });
    const v2 = findRegistryViolations(
      [block('post', '{ organizationId: p.string() }')],
      ['post'],
      exempt,
    );
    expect(v2).toEqual([]);
  });

  it('三向全恒等 → 零违规', () => {
    const blocks = [
      block('post', '{ organizationId: p.string() }'),
      block('organization', '{ organizationId: p.string() }'),
      block('tenant_container', '{ organizationId: p.string() }'),
    ];
    expect(findRegistryViolations(blocks, scoped, exempt)).toEqual([]);
  });
});

describe('现树恒等（真实源码实扫·SSOT ↔ 代码）', () => {
  it('当前工作树三向全绿（在册 7 · 豁免面空=当前真相 ↔ 实体块实存）', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join, resolve } = await import('node:path');
    const root = resolve(import.meta.dirname, '..');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        if (statSync(abs).isDirectory()) {
          if (!['node_modules', 'dist', 'migration'].includes(name)) walk(abs);
        } else if (
          name.endsWith('.ts') &&
          !name.includes('.test.') &&
          !name.endsWith('.snapshot')
        ) {
          files.push(abs);
        }
      }
    };
    walk(join(root, 'apps/api/src'));
    walk(join(root, 'libs/core/src'));
    const blocks = files.flatMap((f) =>
      findTableBlocks(f.slice(root.length + 1), readFileSync(f, 'utf8')),
    );
    // 自检锚：SSOT 清单非空且判据在现树恒等（漏登/僵尸/豁免腐烂零项）。
    // rehierarchy C 换轴重登后在册 ≥ 9（含 organization 本体 + tenant_subscription）。
    expect(TENANT_SCOPED_TABLES.length).toBeGreaterThanOrEqual(9);
    // 豁免面现为空是初始实扫真相（无租户列的容器根不得误入豁免·organization 初稿误分类教训）。
    expect(TENANT_SCOPED_EXEMPT_TABLES).toEqual([]);
    expect(findRegistryViolations(blocks)).toEqual([]);
    // 在册表确实全部由真实块实存支撑（防 walk 口径漂移致「零块也绿」假阴）。
    const realTables = new Set(blocks.filter(hasTenantColumn).map((b) => b.table));
    for (const t of TENANT_SCOPED_TABLES) expect(realTables.has(t)).toBe(true);
  });
});
