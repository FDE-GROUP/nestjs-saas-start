import { defineEntity, type EntitySchema, p } from '@mikro-orm/core';

/**
 * ORM 修宪案 B · 切片 3c-ii（γ 抽列元数据单一源）—— 四表（`workspace`/`user_status`/
 * `tenant_subscription`/`event`）**列定义的唯一真相源** + 两变体工厂。
 *
 * 立意（人裁 γ·2026-10-16）：「迁移忠实实体」与「运行时实体」**从同一份列元数据派生**，消双描述——
 *  - `buildMigrationEntity(meta, targets)`：FK 走 `p.manyToOne(T).mapToPk().deleteRule()`，**逐字节复刻**
 *    原 `migration-entities.ts` 手写的四表定义（DDL 恒等已固化进基线迁移工件 `Migration20261016055354`·与 snapshot 一同供增量比对）；
 *    迁移实体从不被 app 实例化，类型宽松无碍，**DDL 保真是其唯一职责**（高危清单 1）。
 *  - `buildRuntimeEntity(meta)`：FK 走**扁平 `p.string()` 列**（与 `entities.ts`/`post.entity.ts` 同构·
 *    对齐 `EntityCaseNamingStrategy` camelCase 物理列）；实例形状由同名 companion `interface` 提供。
 *
 * **BA 七表与 Post 不在本文件**（爆炸半径隔离）：它们沿用各自现有定义，本文件只统辖新入运行时的四表。
 * `targets`（迁移变体的 FK 目标实体对象）由调用侧（`migration-entities.ts`）注入，避免本模块反向依赖。
 *
 * builder 局部采 `any`：Mikro v7 `p.*` 链式类型随调用序坍缩，动态按种类重建链在静态类型面无法精确承载；
 * 迁移实体不被实例化、运行时实体形状由 companion interface 兜——故链式宽松（`any`）不损运行时正确性，
 * DDL 保真由恒等闸（非类型系统）背书。
 */

/** 标量列种类（映射链与原手写严格一致·顺序无关，DDL 由 getUpdateSchemaSQL 逐语句比对守护）。 */
export type ColKind =
  | { k: 'text'; primary?: true; nullable?: true; default?: string }
  | { k: 'integer'; nullable?: true; default?: number }
  | { k: 'boolean'; nullable?: true; default?: boolean }
  | { k: 'datetime'; nullable?: true; defaultNow?: true }
  | { k: 'json'; nullable?: true }
  | { k: 'bigintAutoPk' }
  | {
      k: 'fk';
      target: string;
      onDelete: 'cascade' | 'set null' | 'restrict' | 'no action';
      onUpdate?: 'no action' | 'cascade' | 'restrict' | 'set null';
      primary?: true;
      nullable?: true;
    };

export interface TableMeta {
  name: string;
  tableName: string;
  columns: ReadonlyArray<readonly [string, ColKind]>;
  indexes?: { name: string; properties: string[] }[];
  uniques?: { name: string; properties: string[] }[];
  /**
   * 表级 CHECK 约束（global-tenant-entity-reclamation 首用·`tenant.status` 值域 DB 防线）：
   * `expression` 须用**物理列名**（EntityCaseNamingStrategy 下 camelCase 多为原形）；
   * 入元数据则迁移生成器双向往返可见（增/删均进空 diff 恒等闸），表达式值域应自上游单源
   * 生成（如 `ORGANIZATION_STATUS`），枚举漂移由下次 `migration:generate` 非空 diff 捕获。
   */
  checks?: { name: string; expression: string }[];
}

type Cols = TableMeta['columns'];

/** 时间列压回无 tz（旧 ORM 缺省 `timestamp`），`defaultNow` 复刻 `.defaultRaw('now()')`。 */
function datetime(c: Extract<ColKind, { k: 'datetime' }>): any {
  let b: any = p.datetime().columnType('timestamp');
  if (c.defaultNow) b = b.defaultRaw('now()');
  if (c.nullable) b = b.nullable();
  return b;
}

/** 标量列共链（text/integer/boolean/json/bigintAutoPk/datetime·按种类映射到 `p.*` 链）。 */
function scalarBuilder(c: Exclude<ColKind, { k: 'fk' }>, flatText: boolean): any {
  if (c.k === 'bigintAutoPk') return p.bigint('number').primary().autoincrement();
  if (c.k === 'datetime') return datetime(c);
  let b: any =
    c.k === 'integer'
      ? p.integer()
      : c.k === 'boolean'
        ? p.boolean()
        : c.k === 'json'
          ? p.json<Record<string, any>>()
          : flatText
            ? p.string()
            : p.text();
  if ('primary' in c && c.primary) b = b.primary();
  if ('default' in c && c.default !== undefined) b = b.default(c.default);
  if ('nullable' in c && c.nullable) b = b.nullable();
  return b;
}

/** 迁移变体属性表：FK → `manyToOne(target).mapToPk()`（含 primary/updateRule/deleteRule）；余按种类复刻。 */
function migrationProps(columns: Cols, targets: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [name, c] of columns) {
    if (c.k === 'fk') {
      let rel: any = p.manyToOne(targets[c.target]).mapToPk();
      if (c.primary) rel = rel.primary();
      if (c.onUpdate) rel = rel.updateRule(c.onUpdate);
      rel = rel.deleteRule(c.onDelete);
      if (c.nullable) rel = rel.nullable();
      out[name] = rel;
    } else {
      out[name] = scalarBuilder(c, false);
    }
  }
  return out;
}

/** 运行时变体属性表：FK/文本一律扁平 `p.string()` 列（与 BA/Post 同构·承 FK 裸值）。 */
function runtimeProps(columns: Cols): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [name, c] of columns) {
    if (c.k === 'fk') {
      let b: any = p.string();
      if (c.primary) b = b.primary();
      if (c.nullable) b = b.nullable();
      out[name] = b;
    } else {
      out[name] = scalarBuilder(c, true);
    }
  }
  return out;
}

function tableLevel(meta: TableMeta) {
  return {
    ...(meta.indexes ? { indexes: meta.indexes } : {}),
    ...(meta.uniques ? { uniques: meta.uniques } : {}),
    ...(meta.checks ? { checks: meta.checks } : {}),
  };
}

/** 从元数据构造迁移忠实实体（FK 关系·受恒等闸守护）。 */
export function buildMigrationEntity(meta: TableMeta, targets: Record<string, any>): EntitySchema {
  return defineEntity({
    name: meta.name,
    tableName: meta.tableName,
    properties: migrationProps(meta.columns, targets),
    ...tableLevel(meta),
  } as any) as any as EntitySchema;
}

/** 从元数据构造运行时扁平实体（实例形状由 companion interface 提供）。 */
export function buildRuntimeEntity(meta: TableMeta): EntitySchema {
  return defineEntity({
    name: meta.name,
    tableName: meta.tableName,
    properties: runtimeProps(meta.columns),
    ...tableLevel(meta),
  } as any) as any as EntitySchema;
}
