/**
 * ORM 修宪案 B · 切片 4（contract）——**MikroORM 迁移生成器**（旧 ORM 退场后 `migration:generate` 的正解）。
 *
 * 连 `DATABASE_URL`，比对「实体元数据 ↔ 当前库 schema」差异，在
 * `apps/api/src/database/mikro/migration/migrations` 下生成一条**增量**迁移工件（+ 更新 snapshot）。
 * 由 `mikro-migration.config.ts` 的迁移专用装配驱动（与 app boot / `mikro-orm.factory.ts` 完全解耦）。
 *
 * 纪律（tooling §4「generate+migrate」）：本脚本**只生成** SQL/TS 工件，**不落库**；生成的工件须
 * 人工审阅后提交，运行侧由 `mikro-migrate.ts`（`db:setup`/`db:reset`）执行。dev 才用 `--safe=false`
 * 直接采纳破坏性语句；默认 `safe` 模式对 drop/truncate 会写入注释占位、归人决断。
 *
 * 用法：`mikro-orm` CLI 未随包安装（无 bin），故走 `tsx`（沿 `db:seed` 先例·本脚本值导入 `.ts`
 * 后缀的迁移装配·Node 原生 type-stripping 不解析省略扩展名的相对 ESM 导入·见 seed.ts 头注 R-η）。
 *   pnpm run migration:generate                     # 增量生成（默认名·safe）
 *   pnpm run migration:generate -- add_user_avatar  # 指定迁移名
 */
// 先载 .env（与 main.ts / seed.ts 同源单例 load-env）：裸终端跑 migration:generate 时 DATABASE_URL 由此注入。
import '../apps/api/src/load-env.ts';
import { initMigrationOrm } from '../apps/api/src/database/mikro/migration/mikro-migration.config.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const dbName = new URL(url).pathname.replace(/^\//, '');
const name = process.argv[2];
const orm = await initMigrationOrm(url);

try {
  console.log(`[mikro-migration-create] db=${dbName}${name ? ` name=${name}` : ''}`);
  // create(path?, blank?, initial?, name?)：path/blank/initial 取默认，仅透传可选 name。
  // 返 MigrationResult{ fileName, code, diff }；无差异时 fileName 为空。
  const result = await orm.migrator.create(undefined, false, false, name);
  if (!result.fileName) {
    console.log('✅ no schema diff — nothing to generate (0 migration created)');
  } else {
    console.log(`✅ generated: ${result.fileName}`);
  }
} finally {
  await orm.close();
}
