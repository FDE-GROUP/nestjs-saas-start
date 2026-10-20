import { authFlowTestSuite, testAdapter } from '@better-auth/test-utils/adapter';
import { mikroAuthAdapter } from '@okee/mikro-adapter/mikro-auth-adapter';
import { betterAuth } from 'better-auth';
import { describe, expect, it } from 'vitest';
import { initMikroOrm } from '../mikro/orm';

/**
 * ORM 修宪案 B · 切片 1 强制验收判据 —— `@better-auth/test-utils` **authFlow 一致性套件**（EXIT=0）。
 *
 * 依 plan §3 切片 1 完成判据 + §5.1 R4 实测契约：以自持 v7 adapter 跑官方 authFlow 一致性用例（sign up /
 * sign in / **reset password（单用 token）** / get session / invalid email / timestamps-across-timezones /
 * additional fields）。normal 套件因跑本仓无的合成模型（testModel/joins/arrays/json）**不作本仓验收判据**，
 * 故此处只挂 authFlow。
 *
 * **env-gated**：需真 PG。仅当 `BA_MIKRO_CONSISTENCY=1` 时才建 ORM 连库并注册用例；否则整块 `describe.skip`
 * （回调不执行 → 零连接、零副作用），保持默认 `pnpm test` / `ci` 基线不动。本文件命名 `*.spec.ts`，默认
 * vitest `include`（仅 `*.test.ts`）根本不收集它，须经 `vitest.consistency.config.ts` 显式驱动
 * （`pnpm run test:auth-consistency`）。
 *
 * 状态隔离：`runMigrations` 每次对 scratch 库 drop+create（全表重建）；harness 内部逐用例 cleanup。
 * adapter **动态重建**（pinpoint ⑥）：`adapter: () => mikroAuthAdapter(orm)` 返回工厂函数，harness 每调
 * `adapter()` 以当前 options 重算 schema（工厂 `transformInput` 依 adapter 自身 schema 过滤 additionalFields，
 * 静态基 adapter 会剥离 `dateField`）。
 */
const enabled = process.env.BA_MIKRO_CONSISTENCY === '1';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/mikro_ba_consistency';

// 门禁安全前置（人签核路线 A）：DROP/CREATE 仅允许作用于约定的 scratch 库名，否则抛错拒绝——
// 杜绝 DATABASE_URL 误指主 dev 库时每次跑 `ci:db` 门禁 DROP 真实库。换名需经 MIKRO_CONSISTENCY_DB 显式许可。
const scratchDb = process.env.MIKRO_CONSISTENCY_DB ?? 'mikro_ba_consistency';
function assertScratchDb(url: string): void {
  const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (dbName !== scratchDb) {
    throw new Error(
      `[auth-consistency] 拒绝在非 scratch 库上 DROP：库名 "${dbName}"≠"${scratchDb}"` +
        '（如需换名请设 MIKRO_CONSISTENCY_DB）。',
    );
  }
}

const suite = enabled ? describe : describe.skip;

suite('mikro-orm v7 × better-auth authFlow consistency', async () => {
  // ORM 懒建：仅当本 describe 回调被执行（enabled）才连库；disabled 时回调整体跳过，零副作用。
  const ormPromise = initMikroOrm(databaseUrl);
  let ormRef: Awaited<ReturnType<typeof initMikroOrm>> | undefined;

  // 全表重建（一致性 + 存照共用）：先过 scratch 库名断言（安全前置）再 drop。
  const resetScratchSchema = async (orm: Awaited<ReturnType<typeof initMikroOrm>>) => {
    assertScratchDb(databaseUrl);
    await orm.schema.ensureDatabase();
    await orm.schema.drop();
    await orm.schema.create();
  };

  const runMigrations = async () => {
    const orm = await ormPromise;
    ormRef = orm;
    await resetScratchSchema(orm);
  };

  // testAdapter 内部自行注册 describe/beforeAll/afterAll/test（官方 harness）——须在 describe 层调用，
  // 不可嵌于 it 内。onFinish 在其 afterAll 中关闭 ORM。
  const harness = await testAdapter({
    adapter: async () => mikroAuthAdapter(await ormPromise),
    runMigrations,
    tests: [authFlowTestSuite()],
    onFinish: async () => {
      await ormRef?.close();
    },
  });
  harness.execute();

  // 实机存照（plan §3 完成判据）：真实 BA signUp 经自持 adapter 落 **user / account / session 各 1 行**（非 mock）。
  it('evidence: real BA sign-up → user/account/session 各 1 真行', async () => {
    const orm = await ormPromise;
    ormRef = orm;
    await resetScratchSchema(orm);
    const auth = betterAuth({
      emailAndPassword: {
        enabled: true,
        password: {
          hash: async (password: string) => password,
          verify: async (data: { hash: string; password: string }) => data.hash === data.password,
        },
      },
      // 自持工厂返回 (options) => DBAdapter；BA `database` 函数形式接之（整 options 向参型转换，避开工厂泛型与重载的 never 级联）。
      database: mikroAuthAdapter(orm),
    } as unknown as Parameters<typeof betterAuth>[0]);
    const email = `evidence-${Date.now()}@mikro.test`;
    const res = await auth.api.signUpEmail({
      body: { email, name: 'evidence', password: 'pw-12345678' },
    });
    expect((res as { user?: { email?: string } })?.user?.email).toBe(email);
    const count = async (table: string): Promise<number> => {
      const rows = (await orm.em
        .fork()
        .execute(`SELECT COUNT(*)::int AS c FROM "${table}"`, [], 'all')) as {
        c: number | string;
      }[];
      return Number(rows[0]?.c ?? 0);
    };
    expect(await count('user')).toBe(1);
    expect(await count('account')).toBe(1);
    expect(await count('session')).toBe(1);
  });
});
