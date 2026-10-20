import { EntityCaseNamingStrategy } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { MikroORM as PostgreSqlMikroORM } from '@mikro-orm/postgresql';
import { MIKRO_MIGRATION_ENTITIES } from './migration-entities';

/**
 * ORM 修宪案 B · 切片 3a —— **迁移专用** MikroORM 初始化（注册 `Migrator` + `migrations` 配置）。
 *
 * 与生产/切片 1 装配**完全解耦**：本工厂**不被 `mikro-orm.factory.ts` / `MikroOrmService` / `app.module` 导入**，
 * 只在离线迁移工具（`scripts/mikro-migrate.ts` 应用迁移 / `scripts/mikro-migration-create.ts` 生成迁移）里按需 init，
 * 连到目标库（`DATABASE_URL`）。
 * 故对运行中的应用、默认 CI、生产 schema **零影响**——`extensions:[Migrator]` 仅在此实例生效。
 *
 * 迁移工件目录：`apps/api/src/database/mikro/migration/migrations`（生成物·表 `mikro_migrations`）。
 * `snapshot: true` 让基线生成后落 snapshot，供未来增量 diff 有稳定参照；`generator.safe` 由调用侧控制。
 */
export async function initMigrationOrm(databaseUrl: string) {
  const u = new URL(databaseUrl);
  return PostgreSqlMikroORM.init({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    dbName: u.pathname.replace(/^\//, ''),
    entities: MIKRO_MIGRATION_ENTITIES as never,
    extensions: [Migrator],
    migrations: {
      path: new URL('./migrations', import.meta.url).pathname,
      tableName: 'mikro_migrations',
      snapshot: true,
      // 稳定 snapshot 名（默认随 dbName 派生·会把一次性 scratch 库名带进工件）。
      snapshotName: 'mikro-migrations',
    },
    namingStrategy: EntityCaseNamingStrategy,
    allowGlobalContext: true,
  });
}
