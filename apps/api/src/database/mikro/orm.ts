import { EntityCaseNamingStrategy } from '@mikro-orm/core';
import { MikroORM as PostgreSqlMikroORM } from '@mikro-orm/postgresql';
import { MIKRO_ENTITIES } from '../ba/entities';

/**
 * ORM 修宪案 B · 切片 1 —— MikroORM v7 初始化（PostgreSqlDriver）。
 *
 * `allowGlobalContext: true`：adapter 侧以 `orm.em.fork()` 做 **per-request / per-operation fork**
 * （V4 串租户教训：绝不共享全局 `orm.em`），无需 ALS RequestContext 亦可用。schema 生命周期走 v7
 * 的 `orm.schema.update()/.create()/.clear()`（无 v6 的 `createSchema/clearDatabase`）。
 *
 * `EntityCaseNamingStrategy`：属性名**原样**作列名（camelCase 列）。这让 BA 侧 DB 字段名（camelCase）
 * 与物理列名直接对齐——自持 adapter 以手写 SQL（`em.execute`）寻址时，输入/输出两侧键名一致，无需
 * snake↔camel 往返（见 entities.ts 头注）。列名一律带引号，规避 PG 保留字（`user` 等）。
 *
 * `entities` 形参（切片 2 加）：默认 BA 表面实体集 `MIKRO_ENTITIES`（一致性套件据此·保持零改）；
 * app 侧（`MikroOrmService`）传 `MIKRO_APP_ENTITIES`（本切片仅 `Post`），令 app-Mikro 与 BA-Mikro 实体集各自独立。
 */
export async function initMikroOrm(databaseUrl: string, entities: readonly any[] = MIKRO_ENTITIES) {
  const u = new URL(databaseUrl);
  return PostgreSqlMikroORM.init({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    dbName: u.pathname.replace(/^\//, ''),
    entities: entities as never,
    namingStrategy: EntityCaseNamingStrategy,
    allowGlobalContext: true,
  });
}
