import { AsyncLocalStorage } from 'node:async_hooks';
import type { MikroORM } from '@mikro-orm/core';
import {
  type CleanedWhere,
  createAdapterFactory,
  type DBAdapterDebugLogOption,
} from 'better-auth/adapters';

/**
 * ORM 修宪案 B · 切片 1 —— **自持** Better Auth × MikroORM v7 adapter（官方 `createAdapterFactory` 规格内）。
 *
 * 依 plan §3 切片 1 与 §5.1 R4 实测契约钉点实现：8 必选（create/update/updateMany/delete/deleteMany/
 * findOne/findMany/count）+ `consumeOne`/`incrementOne`/`createSchema` + **`transaction`**（社区包三大缺失）。
 *
 * 关键契约（切片 0 §5.1 直查 @better-auth/core 1.7.7 坐实，逐条落此）：
 *  - **工厂形态**：本文件导出 `mikroAuthAdapter(orm)` 返回**工厂函数** `(options) => DBAdapter`；BA 的
 *    `database` 字段自定义 adapter **必须传函数形式**（`adapter-base` 判 `typeof options.database === 'function'`，
 *    传对象落 kysely 内建分支报 `Failed to initialize database adapter`）。
 *  - **契约钉点（factory 已代劳，本实现只吃消化后的输入）**：factory 在调本 CustomAdapter 前已跑
 *    `transformInput`（键=BA DB 字段名 camelCase·`supportsBooleans/JSON` 真·`supportsDates` 假故 Date↔ISO 串由
 *    factory 转换）与 `transformWhereClause`（`connector` 大写 AND/OR·值已规整）；调用后跑 `transformOutput`（读 camelCase 键）。
 *    故本 adapter 全程以 **camelCase 列名**（`EntityCaseNamingStrategy`）读写、返回**裸行对象**即可，无需 snake 往返。
 *    ⚠ 命名策略前提：消费者须以 camelCase 列名（`EntityCaseNamingStrategy`·属性名原样作列名）建 ORM·否则键名两侧对不齐。
 *  - **raw update 键**：`update`/`updateMany` 的改动值在参数键 `update`（非 `data`），且带 `modelKey`（factory 传入）。
 *  - **`consumeOne`/`incrementOne` 返「行快照 T|null」**（非 boolean）——`consumeVerificationValue` 读 `consumed.value`，
 *    早期误返 boolean 致 password-reset 恒 `Invalid token`。二者均以**单语句原子 SQL** 落地（DELETE…RETURNING /
 *    UPDATE…SET n=n+?…WHERE…RETURNING）。
 *  - **per-op fork + 事务原子性**：普通操作各自 `orm.em.fork()`（禁全局 `orm.em`·V4 串租户教训）；`transaction` 走
 *    `em.transactional` 并以 **AsyncLocalStorage** 把事务内 `em` 透传给回调触发的所有子操作（破坏性删除在该
 *    事务 em 上以原生 SQL 执行，不依赖 `removeAndFlush`）。
 *  - **`generateId:false` 必须不在 BA 配置里**（BA 自生成 nanoid）；session 字段是 `expiresAt` 非 `expiresAt`（1.7.7）。
 *
 * 本适配为 BA 数据面唯一出口（切片 4 已接入生产）；一致性验收见消费应用 `apps/api` 的
 * `database/ba/auth-adapter.consistency.spec.ts`（本包只出适配器·BA 实体/orm 初始化留 app·防双 SSOT）。
 */

/** 事务内透传当前 `em`（供子操作复用同一事务连接）。 */
const txContext = new AsyncLocalStorage<{ em: any }>();

/** 双引号限定标识符（列名 camelCase 含大小写·表名规避 `user` 等 PG 保留字）。 */
const q = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/** operator → SQL 谓词；值占位用 `?`（Mikro 为 PG 自动转 `$n`）。 */
function compileCondition(where: CleanedWhere): { sql: string; params: unknown[] } {
  const col = q(where.field);
  const { operator, value, mode } = where;
  const likeOp = mode === 'insensitive' ? 'ILIKE' : 'LIKE';
  const escapeLike = (s: string): string =>
    s.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
  switch (operator) {
    case 'eq':
      return value === null
        ? { sql: `${col} IS NULL`, params: [] }
        : { sql: `${col} = ?`, params: [value] };
    case 'ne':
      return value === null
        ? { sql: `${col} IS NOT NULL`, params: [] }
        : { sql: `${col} <> ?`, params: [value] };
    case 'lt':
      return { sql: `${col} < ?`, params: [value] };
    case 'lte':
      return { sql: `${col} <= ?`, params: [value] };
    case 'gt':
      return { sql: `${col} > ?`, params: [value] };
    case 'gte':
      return { sql: `${col} >= ?`, params: [value] };
    case 'in': {
      const arr = Array.isArray(value) ? value : [value];
      if (arr.length === 0) return { sql: '1 = 0', params: [] };
      return { sql: `${col} IN (${arr.map(() => '?').join(', ')})`, params: arr };
    }
    case 'not_in': {
      const arr = Array.isArray(value) ? value : [value];
      if (arr.length === 0) return { sql: '1 = 1', params: [] };
      return { sql: `${col} NOT IN (${arr.map(() => '?').join(', ')})`, params: arr };
    }
    case 'contains':
      return { sql: `${col} ${likeOp} ?`, params: [`%${escapeLike(String(value))}%`] };
    case 'starts_with':
      return { sql: `${col} ${likeOp} ?`, params: [`${escapeLike(String(value))}%`] };
    case 'ends_with':
      return { sql: `${col} ${likeOp} ?`, params: [`%${escapeLike(String(value))}`] };
    default:
      return { sql: `${col} = ?`, params: [value] };
  }
}

/**
 * CleanedWhere[] → SQL WHERE 片段 + 参数。connector 大写不敏感归 AND/OR；逐项加括号，
 * 首项无前缀连接词（factory 语义：connector 是相对前一项的连接）。空 where → 无约束。
 */
function compileWhere(where?: CleanedWhere[]): { sql: string; params: unknown[] } {
  if (!where || where.length === 0) return { sql: '', params: [] };
  const params: unknown[] = [];
  let sql = '';
  where.forEach((w, i) => {
    const c = compileCondition(w);
    params.push(...c.params);
    if (i === 0) sql = `(${c.sql})`;
    else sql += `${(w.connector ?? 'AND').toUpperCase() === 'OR' ? ' OR ' : ' AND '}(${c.sql})`;
  });
  return { sql, params };
}

/** 从 execute('run') 结果取受影响行数（兼容 Kysely/PG 驱动不同字段名）。 */
function affected(res: unknown): number {
  const r = res as { affectedRows?: number; rowCount?: number; numUpdatedRows?: bigint };
  const n =
    r?.affectedRows ?? r?.rowCount ?? (r?.numUpdatedRows != null ? Number(r.numUpdatedRows) : 0);
  return Number(n ?? 0);
}

export function mikroAuthAdapter(orm: MikroORM, options: MikroAuthAdapterOptions = {}) {
  // factory 在调用本 creator 前已算好 schema 并注入 transform* 助手；本 adapter 不直接用它们
  // （键名两侧已由 camelCase 列对齐），但保留 `model`（物理表名）寻址——BA 物理模型名即小写表名。
  const { adapter, config } = buildAdapterContract(orm, options);
  return createAdapterFactory({ adapter, config });
}

/**
 * 对齐官方 drizzle/mongo 适配器工厂第二参（透传 `createAdapterFactory` config 的用户可调项）。
 * 均可缺省：默认值与官方 factory 缺省逐位等价（单参调用零行为变更）。
 * `transaction` 有意**不开放关闭**——本仓 BA 破坏性写的事务原子性为数据一致性前提。
 */
export interface MikroAuthAdapterOptions {
  /** 逐方法调试日志（bool 或方法选择对象·官方 debugLogs·默认关）。 */
  debugLogs?: DBAdapterDebugLogOption;
  /** 表名是否复数（本仓 BA 表名单数·默认 false·对齐官方 usePlural）。 */
  usePlural?: boolean;
}

function buildAdapterContract(orm: MikroORM, options: MikroAuthAdapterOptions) {
  /** 取当前应使用的 em：事务内取 ALS 透传的 fork，否则每次 per-op fork。
   *  （返回 `any`：`execute` 定义在 SqlEntityManager 上，core `EntityManager` 类型未暴露。） */
  const emFor = () => (txContext.getStore()?.em ?? orm.em.fork()) as any;

  const adapter = () => ({
    async create({ data, model }: { data: Record<string, any>; model: string }) {
      const cols = Object.keys(data);
      const em = emFor();
      if (cols.length === 0) {
        const rows = await em.execute(`SELECT * FROM ${q(model)} LIMIT 0`, [], 'all');
        return rows[0] ?? data;
      }
      const sql = `INSERT INTO ${q(model)} (${cols.map(q).join(', ')}) VALUES (${cols
        .map(() => '?')
        .join(', ')}) RETURNING *`;
      const rows = (await em.execute(
        sql,
        cols.map((c) => data[c]),
        'all',
      )) as Record<string, any>[];
      return rows[0] ?? data;
    },

    async update({
      model,
      where,
      update,
    }: {
      model: string;
      modelKey?: string;
      where: CleanedWhere[];
      update: Record<string, any>;
    }) {
      const sets = Object.keys(update);
      const cond = compileWhere(where);
      if (!cond.sql) return null;
      const em = emFor();
      const sql = `UPDATE ${q(model)} SET ${sets.map((f) => `${q(f)} = ?`).join(', ')} WHERE ${cond.sql} RETURNING *`;
      const rows = (await em.execute(
        sql,
        [...sets.map((f) => update[f]), ...cond.params],
        'all',
      )) as Record<string, any>[];
      return rows[0] ?? null;
    },

    async updateMany({
      model,
      where,
      update,
    }: {
      model: string;
      modelKey?: string;
      where: CleanedWhere[];
      update: Record<string, any>;
    }) {
      const sets = Object.keys(update);
      const cond = compileWhere(where);
      if (sets.length === 0 || !cond.sql) return 0;
      const em = emFor();
      const sql = `UPDATE ${q(model)} SET ${sets.map((f) => `${q(f)} = ?`).join(', ')} WHERE ${cond.sql}`;
      const res = await em.execute(sql, [...sets.map((f) => update[f]), ...cond.params], 'run');
      return affected(res);
    },

    async findOne<T = any>({
      model,
      where,
      join,
    }: {
      model: string;
      modelKey?: string;
      where: CleanedWhere[];
      select?: string[];
      join?: unknown;
    }) {
      if (join && Object.keys(join).length > 0) {
        // 本仓 BA schema 为扁平标量列，无 ORM 级 join；factory 会在 `advanced.database.joins` 关闭时
        // 走 fallback（拆成多次 findOne/findMany），故此处忽略 join 装配，仅取基行。
      }
      const cond = compileWhere(where);
      const em = emFor();
      const sql = `SELECT * FROM ${q(model)}${cond.sql ? ` WHERE ${cond.sql}` : ''} LIMIT 1`;
      const rows = (await em.execute(sql, cond.params, 'all')) as T[];
      return rows[0] ?? null;
    },

    async findMany<T = any>({
      model,
      where,
      limit,
      sortBy,
      offset,
    }: {
      model: string;
      modelKey?: string;
      where?: CleanedWhere[];
      limit?: number;
      select?: string[];
      sortBy?: { field: string; direction: 'asc' | 'desc' };
      offset?: number;
      join?: unknown;
    }) {
      const cond = compileWhere(where);
      const em = emFor();
      let sql = `SELECT * FROM ${q(model)}${cond.sql ? ` WHERE ${cond.sql}` : ''}`;
      const params = [...cond.params];
      if (sortBy)
        sql += ` ORDER BY ${q(sortBy.field)} ${sortBy.direction === 'desc' ? 'DESC' : 'ASC'}`;
      if (typeof limit === 'number') sql += ` LIMIT ${Number(limit)}`;
      if (typeof offset === 'number' && offset > 0) sql += ` OFFSET ${Number(offset)}`;
      return (await em.execute(sql, params, 'all')) as T[];
    },

    async count({ model, where }: { model: string; modelKey?: string; where?: CleanedWhere[] }) {
      const cond = compileWhere(where);
      const em = emFor();
      const sql = `SELECT COUNT(*)::int AS count FROM ${q(model)}${cond.sql ? ` WHERE ${cond.sql}` : ''}`;
      const rows = (await em.execute(sql, cond.params, 'all')) as { count: number | string }[];
      return Number(rows[0]?.count ?? 0);
    },

    async delete({ model, where }: { model: string; modelKey?: string; where: CleanedWhere[] }) {
      const cond = compileWhere(where);
      if (!cond.sql) return;
      const em = emFor();
      await em.execute(`DELETE FROM ${q(model)} WHERE ${cond.sql}`, cond.params, 'run');
    },

    async deleteMany({
      model,
      where,
    }: {
      model: string;
      modelKey?: string;
      where: CleanedWhere[];
    }) {
      const cond = compileWhere(where);
      const em = emFor();
      const sql = `DELETE FROM ${q(model)}${cond.sql ? ` WHERE ${cond.sql}` : ''}`;
      const res = await em.execute(sql, cond.params, 'run');
      return affected(res);
    },

    // 单语句原子消费：至多删一行（id IN (子查询 LIMIT 1)）并 RETURNING 行快照 T|null。
    async consumeOne<T = any>({
      model,
      where,
    }: {
      model: string;
      modelKey?: string;
      where: CleanedWhere[];
    }) {
      const cond = compileWhere(where);
      if (!cond.sql) return null;
      const em = emFor();
      const sql = `DELETE FROM ${q(model)} WHERE "id" IN (SELECT "id" FROM ${q(model)} WHERE ${cond.sql} LIMIT 1) RETURNING *`;
      const rows = (await em.execute(sql, cond.params, 'all')) as T[];
      return rows[0] ?? null;
    },

    // 单语句原子 guarded 增量：SET f=f+? (+ SET 绝对值) WHERE 条件（selector 兼 guard）RETURNING 行快照 T|null。
    async incrementOne<T = any>({
      model,
      where,
      increment,
      set,
    }: {
      model: string;
      modelKey?: string;
      where: CleanedWhere[];
      increment: Record<string, number>;
      set?: Record<string, unknown>;
    }) {
      const cond = compileWhere(where);
      if (!cond.sql) return null;
      const setFrags: string[] = [];
      const params: unknown[] = [];
      for (const [f, d] of Object.entries(increment ?? {})) {
        setFrags.push(`${q(f)} = ${q(f)} + ?`);
        params.push(Number(d));
      }
      for (const [f, v] of Object.entries(set ?? {})) {
        setFrags.push(`${q(f)} = ?`);
        params.push(v);
      }
      if (setFrags.length === 0) return null;
      const em = emFor();
      const sql = `UPDATE ${q(model)} SET ${setFrags.join(', ')} WHERE ${cond.sql} RETURNING *`;
      const rows = (await em.execute(sql, [...params, ...cond.params], 'all')) as T[];
      return rows[0] ?? null;
    },

    async createSchema({ file }: { file?: string; tables: unknown }) {
      const sqlScript = await orm.schema.getCreateSchemaSQL({ wrap: false });
      return {
        code: typeof sqlScript === 'string' ? sqlScript : String(sqlScript),
        path: file ?? 'mikro-init-schema.sql',
        overwrite: true,
      };
    },
  });

  const config = {
    adapterId: 'mikro-orm',
    adapterName: 'mikro-orm',
    // 用户可调项（对齐官方工厂第二参透传）：?? false 与 factory 缺省逐位等价，保单向后兼容。
    usePlural: options.usePlural ?? false,
    debugLogs: options.debugLogs ?? false,
    // 本 adapter 以 raw SQL（em.execute）寻址，v7 Kysely 层把 timestamptz 列回传为**字符串**
    // （如 "2026-10-16 02:29:25.791+00"）而非 Date。故 `supportsDates:false` 让 factory 代劳两侧转换：
    // 入 Date→ISO 串（写库）、出 串→Date（new Date 解析），使 BA 收到的仍是 Date（跨时区/additionalFields 用例因此绿）。
    // 切片 0 §5.1 pinpoint③「supportsDates 置真」是针对 entity-manager 回真实 Date 的形态；raw 形态下取反为 false。
    supportsDates: false,
    supportsBooleans: true,
    supportsJSON: true,
    supportsNumericIds: false,
    supportsUUIDs: false,
    supportsArrays: false,
    transaction: async <R>(cb: (trx: any) => Promise<R>): Promise<R> => {
      const em = orm.em.fork();
      return em.transactional((emTx) =>
        txContext.run({ em: emTx }, () => cb(undefined as never)),
      ) as Promise<R>;
    },
  };

  return { adapter: adapter as any, config };
}
