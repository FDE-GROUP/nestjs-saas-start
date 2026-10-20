import { EntityCaseNamingStrategy } from '@mikro-orm/core';
import { MikroORM as PostgreSqlMikroORM } from '@mikro-orm/postgresql';

/**
 * ORM 修宪案 B · 切片 1 —— MikroORM v7 初始化工厂（PostgreSqlDriver）。
 * 名实案 module-mikro-orm-factory-rename：旧名 `orm.ts`（大名词占位）正名为角色后缀；
 * 本文件是**无状态工厂**（非 ORM 实例/配置枢纽——实例持有者：app 侧 `mikro-orm.service.ts`、
 * spec/seed 一次性用完即弃），同案去掉旧 BA 默认实体参（源于修宪切片 2），工厂彻底中性化。
 *
 * `allowGlobalContext: true`：adapter 侧以 `orm.em.fork()` 做 **per-request / per-operation fork**
 * （V4 串租户教训：绝不共享全局 `orm.em`），无需 ALS RequestContext 亦可用。schema 生命周期走 v7
 * 的 `orm.schema.update()/.create()/.clear()`（无 v6 的 `createSchema/clearDatabase`）。
 *
 * `EntityCaseNamingStrategy`：属性名**原样**作列名（camelCase 列）。这让 BA 侧 DB 字段名（camelCase）
 * 与物理列名直接对齐——自持 adapter 以手写 SQL（`em.execute`）寻址时，输入/输出两侧键名一致，无需
 * snake↔camel 往返（见 entities.ts 头注）。列名一律带引号，规避 PG 保留字（`user` 等）。
 *
 * `entities` 形参（必填·名实案中性化）：调用方各自显式传实体集——BA 一致性套件传
 * `MIKRO_ENTITIES`（`ba/entities.ts`）、app 侧（`MikroOrmService`/seed）传 `MIKRO_APP_ENTITIES`，
 * 两套实体集边界在调用点自证，工厂不再特化偏向任何一方。
 */
export async function initMikroOrm(databaseUrl: string, entities: readonly any[]) {
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
