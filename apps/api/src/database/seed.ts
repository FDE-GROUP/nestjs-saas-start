import * as dotenv from 'dotenv';

dotenv.config();

import { pathToFileURL } from 'node:url';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import type { EntityManager, MikroORM } from '@mikro-orm/core';
import { mikroAuthAdapter } from '@okee/mikro-adapter/mikro-auth-adapter';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { Post } from '../modules/posts/infrastructure/entities/post.entity';
import { Account, Member, Organization, Session, User, Verification } from './ba/entities';
import { MIKRO_APP_ENTITIES } from './mikro/app-entities';
import { initMikroOrm } from './mikro/orm';

/**
 * ORM 修宪案 B · 切片 4-α（S-d6）——seed 数据面由旧 ORM 换轨为 **MikroORM**（只换通道·不改行为）。
 *
 * 保真律（对齐 §5.20 · 真库对拍校正）：
 * - **`createdAt` 靠 DB 默认（`defaultNow()`）填充**：`em.insert` 不发该列——与旧实现 一致（真库实证
 *   `user.createdAt` 有 `DEFAULT now()`·插入省略即落库为当前时间）。
 * - **`updatedAt` 必须显式写**：真库 `user/post.updatedAt` 为 `NOT NULL` 且**无 DB 默认**（旧 ORM 的
 *   `$onUpdate` 是查询构建期行为、非 DB 触发器）·故 insert 显式盖 `new Date()`（还原旧轨落库产生有效
 *   updatedAt 的可观测结果·否则 23502 NOT NULL 违约）。
 * - **`role` 文本经 PG coerced 入 enum 列**（`roleEnum('role',['USER','ADMIN'])`·沿 §5.18 `role` default 实证）；
 *   直接写 `'ADMIN'`/`'USER'` 文本，不再 `import { Role } from './schema'`（去除对旧 ORM schema 的最后一处 seed 依赖）。
 * - **`SEED_CLEANUP` 逐字不变；弱口令兜底改形（人裁①·module-config-seed-fail-loud-and-contract-gate 切片 E）**：
 *   旧「`ADMIN_PASSWORD||admin123` 静默兜底」升为入口裁决单点 `enforceSeedPasswordPolicy`——
 *   `NODE_ENV=production` 缺 `ADMIN_PASSWORD`/`USER_PASSWORD` 即**拒跑**（先于建连·零弱口令上图）；
 *   非生产兜底值不变 + 点名 warn（与 OAuth social 面「非生产 warn/生产 fail-loud」同构·机制不特判）。
 * - **运行器＝`tsx`**（`db:seed`）：seed 现值导入整条 Mikro 轨（`./mikro/orm`→`./entities`/`./four-tables`…
 *   扩展名省略），Node 原生 type-stripping **不解析扩展名省略的相对 ESM 导入**（原 `node seed.ts` 亦不例外），
 *   故改用仓内既有 `tsx` 运行（不改行为·仅换装载器·SWC 编译链不受影响）。核心逻辑抽为 `runSeed(em, options)`
 *   （供镜测直调·fake em），`main()` 只负责 dotenv（顶部先行·R-η Node-ESM 时序）→ `initMikroOrm` 懒建 app-orm
 *   （`MIKRO_APP_ENTITIES` 涵盖 User/Organization/Post）→ fork em → `runSeed` → `orm.close()`。
 */

/**
 * 切片补记（module-db-seed-ba-loginable-accounts·待审计门 GO 后实施）：上方保真律（`em.insert(User)` 直插）
 * 自本切片起**仅适用于 `createPosts`**——用户创建改由 `ensureLoginableUser` 经 Better Auth `signUpEmail`
 * 产出（user + `account` credential + session），故运营者/演示用户现可密码登录；`role/name` 等于 signUp 后
 * 以 `nativeUpdate` 补写（BA 不管理这些 app 字段·`role` 落 DB 默认 'USER'）。id 采 BA 原生格式（非 uuidv7）。
 */
interface SeedOptions {
  includeTestData?: boolean;
  userCount?: number;
  postCount?: number;
}

interface PostData {
  title: string;
  content: string;
  published: boolean;
}

// Parse command line arguments
export function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    includeTestData: true,
    userCount: 2,
    postCount: 3,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--no-test-data':
        options.includeTestData = false;
        break;
      case '--users':
        if (args[i + 1]) {
          options.userCount = Number.parseInt(args[i + 1], 10);
          i++;
        }
        break;
      case '--posts':
        if (args[i + 1]) {
          options.postCount = Number.parseInt(args[i + 1], 10);
          i++;
        }
        break;
    }
  }

  return options;
}

/**
 * seed 口令裁决单点（切片 E·人裁「生产 fail-loud + 非生产 warn」）：入口调用一次，不逐处特判。
 * 两键皆已配置→静默通过；缺键且 `NODE_ENV=production`→throw 拒跑（调用点在 `initMikroOrm` **之前**·
 * 绝不触库）；缺键且非生产→不拦·只点名 warn（兜底值 `admin123`/`user123` 仍由 createUsers/createPosts
 * 现路径生效·与 warn 文案同形）。env 可注入供锁测直调（不篡改全局）。
 */
export function enforceSeedPasswordPolicy(env: NodeJS.ProcessEnv = process.env): void {
  const missing = ['ADMIN_PASSWORD', 'USER_PASSWORD'].filter((key) => !env[key]);
  if (missing.length === 0) return;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      `Refusing to seed: NODE_ENV=production 但未配置 ${missing.join(' / ')}。` +
        '平台经营者/演示账号口令不得静默使用内置弱口令（admin123/user123）上生产——' +
        '请在 .env 显式设置这两键后重跑（或改用非生产口径）。',
    );
  }
  console.warn(
    `⚠️ seed 弱口令兜底生效：缺 ${missing.join(' / ')}，将使用内置 admin123/user123（仅限开发/演示·生产必配）。`,
  );
}

/**
 * seed 直调 Better Auth 所需的最小 API 面（`signUpEmail` + `createOrganization`）·结构型而非导入 BA 具体类型——
 * 便于镜测桩注入且不耦合 BA 版本泛型。`createOrganization` 走**服务端系统动作**（无 session + `body.userId` →
 * `isSystemAction`·不受 `allowUserToCreateOrganization:false` 限·BA 原生把创建者置首名 `owner` member），
 * 供 `module-db-seed-tenant-context` 为 demo 号预建活跃组织（见 `tenant-isolation.e2e.test.ts:131-147` 同款范式）。
 */
interface LoginableAuth {
  api: {
    signUpEmail: (args: {
      body: { email: string; password: string; name: string };
    }) => Promise<unknown>;
    createOrganization: (args: {
      body: { name: string; slug: string; userId: string };
    }) => Promise<unknown>;
  };
}

/** 幂等 reconcile 单账号到「可登录」态所需的字段（运营者与演示共用）。 */
interface LoginableUserSpec {
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
}

/**
 * 以 seed 现持有的同一 `orm` 构造可登录账号产出器（切片 A·复用自持 `mikroAuthAdapter`·范式佐证
 * `auth-adapter.consistency.spec.ts:75-107`）。要点：
 * - `emailAndPassword.minPasswordLength: 1`——放行 dev 兜底 `admin123`(8)/`user123`(7)·登录只验哈希不验长度。
 * - `secret` 与 app 同源（`JWT_SECRET`·见 `auth.implement.ts:219`）；哈希走 BA 默认 scrypt·与运行态 app BA 互验。
 * - `plugins: [organization()]`：与运行态 app BA 同插件（`auth.implement.ts:189`）·令本实例具备 `createOrganization`（C 片建租）。
 * - 返回结构上收敛为 `LoginableAuth`（本模块只调 `signUpEmail`/`createOrganization`），避免耦合 BA 重载泛型。
 */
export function createLoginableAuth(orm: MikroORM): LoginableAuth {
  return betterAuth({
    database: mikroAuthAdapter(orm),
    emailAndPassword: { enabled: true, minPasswordLength: 1 },
    plugins: [organization()],
    secret: process.env.JWT_SECRET || 'your-secret-key',
  } as never) as unknown as LoginableAuth;
}

/**
 * 三分支：① 有 user 有 credential account → 仅 nativeUpdate 补 app 字段（幂等·不重签）；
 * ② 有 user 无 account（legacy 直插残留）→ 先删该身份 session/account/user 孤儿再 signUp；
 * ③ 无 user → 直接 signUp。signUp 后统一 nativeUpdate 补 `role/name/firstName/lastName`（`role` 非 BA
 * 字段·BA 建的 user 落 DB 默认 'USER'·见 entities.ts:41·故运营者须显式改 'ADMIN'）。返回供日志/测断言。
 */
export async function ensureLoginableUser(
  em: EntityManager,
  auth: LoginableAuth,
  spec: LoginableUserSpec,
): Promise<'signed-up' | 'updated'> {
  const appFields = {
    role: spec.role,
    name: spec.name,
    firstName: spec.firstName,
    lastName: spec.lastName,
    updatedAt: new Date(),
  };
  const existing = await em.findOne(User, { email: spec.email });
  if (existing) {
    const uid = (existing as { id: string }).id;
    const credential = await em.findOne(Account, { userId: uid, providerId: 'credential' });
    if (credential) {
      await em.nativeUpdate(User, { email: spec.email }, appFields);
      return 'updated';
    }
    // 孤儿（有 user 无 credential）：清该身份 BA 行 + user·再走 signUp 重建（接受 BA 原生 id·plan §4-②）。
    await em.nativeDelete(Session, { userId: uid });
    await em.nativeDelete(Account, { userId: uid });
    await em.nativeDelete(User, { id: uid });
  }
  await auth.api.signUpEmail({
    body: { email: spec.email, password: spec.password, name: spec.name },
  });
  await em.nativeUpdate(User, { email: spec.email }, appFields);
  return 'signed-up';
}

export async function createUsers(
  em: EntityManager,
  options: SeedOptions,
  auth: LoginableAuth,
): Promise<void> {
  console.log('👥 Ensuring loginable users (via Better Auth signUp)…');

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  // FR-13 / S5: the Platform Operator is the GLOBAL-UNIQUE cross-tenant identity, resolved by
  // the guard via DB email === platform.operatorEmail. Seed MUST guarantee a **loginable** row
  // (user + BA account credential), else a non-default operator email would fail closed.
  const operatorEmail = process.env.PLATFORM_OPERATOR_EMAIL || 'admin@example.com';
  await ensureLoginableUser(em, auth, {
    email: operatorEmail,
    password: adminPassword,
    name: 'Admin User',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
  });
  console.log(`✅ Seeded loginable platform operator: ${operatorEmail}`);

  const userCount = options.userCount || 2;
  if (options.includeTestData && userCount > 1) {
    const userPassword = process.env.USER_PASSWORD || 'user123';
    for (let i = 1; i < userCount; i++) {
      await ensureLoginableUser(em, auth, {
        email: `user${i}@example.com`,
        password: userPassword,
        name: `User ${i}`,
        firstName: 'User',
        lastName: `${i}`,
        role: 'USER',
      });
    }
    console.log(`✅ Ensured ${userCount - 1} loginable demo user(s)`);
  }
}

/**
 * 为某个 persona 幂等预建一个**活跃组织** + 把其置为首名 `owner` 成员（module-db-seed-tenant-context C-2）。
 * - 走 BA `createOrganization` 系统动作（无 session + `body.userId` → `isSystemAction`·不受
 *   `allowUserToCreateOrganization:false` 限·BA 原生把创建者置首名 `owner` member·FR-12），
 *   **不经**我方 `submit` 那段强制 `metadata.status=pending_approval` 的门面 → 落得 `metadata` 空、
 *   `TenantMiddleware` 视为 legacy/seeded 放行（活跃·非 pending）。
 * - 幂等：按 `slug` find；命中则确保该 user 为 owner member（按 (org,userId) find·缺则直插），返 `'exists'`；
 *   未命中则 `createOrganization`（BA 自带 owner member），返 `'created'`。
 * - **不**在此 `setActiveOrganization`（逐会话事实、对浏览器新会话无效·见 plan 证据链）。
 */
export async function ensureTenantContext(
  em: EntityManager,
  auth: LoginableAuth,
  spec: { slug: string; name: string; ownerUserId: string },
): Promise<'created' | 'exists'> {
  const orgs = await em.find(Organization, { slug: spec.slug } as never);
  const org = (orgs as { id: string }[])[0];
  if (org) {
    const member = await em.findOne(Member, {
      organizationId: org.id,
      userId: spec.ownerUserId,
    } as never);
    if (!member) {
      await em.insert(Member, {
        id: uuidv7(),
        organizationId: org.id,
        userId: spec.ownerUserId,
        role: 'owner',
        createdAt: new Date(),
      } as never);
    }
    return 'exists';
  }
  await auth.api.createOrganization({
    body: { name: spec.name, slug: spec.slug, userId: spec.ownerUserId },
  });
  return 'created';
}

/** 按 email 回查 user id（供 `createOrganization.body.userId`·零改 `ensureLoginableUser` 返回契约）。 */
async function resolveUserId(em: EntityManager, email: string): Promise<string | undefined> {
  const user = await em.findOne(User, { email } as never);
  return user ? (user as { id: string }).id : undefined;
}

/**
 * 为实际存在的 seed persona（运营者 + 演示用户）各预建一个专属活跃组织（owner 各自）。
 * persona 邮箱与 `createUsers` 严格同构（运营者 `PLATFORM_OPERATOR_EMAIL||admin@example.com`·演示
 * `user{i}@example.com` for i in 1..userCount-1 仅 `includeTestData`），保证**任一** seed 号登录后恰有
 * 唯一成员组织（A 片自动落租无歧义）。user 行不存在（如零号 demo）→ 回查失败→跳过（warn）。
 */
export async function ensureSeedTenants(
  em: EntityManager,
  auth: LoginableAuth,
  options: SeedOptions,
): Promise<void> {
  const operatorEmail = process.env.PLATFORM_OPERATOR_EMAIL || 'admin@example.com';
  const personas: { email: string; slug: string; name: string }[] = [
    { email: operatorEmail, slug: 'seed-acme', name: 'Acme (Seed)' },
  ];
  const userCount = options.userCount || 2;
  if (options.includeTestData && userCount > 1) {
    for (let i = 1; i < userCount; i++) {
      personas.push({
        email: `user${i}@example.com`,
        slug: `seed-tenant-${i}`,
        name: `Tenant ${i} (Seed)`,
      });
    }
  }
  for (const p of personas) {
    const ownerUserId = await resolveUserId(em, p.email);
    if (!ownerUserId) {
      console.warn(`⚠  跳过预建组织 ${p.slug}：owner ${p.email} 尚无 user 行`);
      continue;
    }
    const result = await ensureTenantContext(em, auth, {
      slug: p.slug,
      name: p.name,
      ownerUserId,
    });
    console.log(`🏢 Seeded active tenant (${result}): ${p.slug} · owner=${p.email}`);
  }
}

export async function createPosts(em: EntityManager, options: SeedOptions): Promise<void> {
  if (!options.includeTestData) {
    console.log('⚙  Skipping posts creation (test data disabled)');
    return;
  }

  // NOT NULL tightened: every post must belong to a tenant.
  // Find an existing organization to own the seeded posts; skip if none.
  const orgs = await em.find(Organization, {}, { limit: 1 });
  const org = orgs[0];
  if (!org) {
    console.log('⚠  No organization found – skipping post seeding (create an org first)');
    return;
  }

  console.log(`📝 Creating sample posts (org=${org.id})...`);

  const orgId = org.id;

  const samplePosts: PostData[] = [
    {
      title: 'Welcome to Our Platform',
      content: 'This is the first post in our system.',
      published: true,
    },
    {
      title: 'Getting Started with NestJS',
      content: 'NestJS is a progressive Node.js framework.',
      published: true,
    },
    {
      title: 'Introduction to MikroORM',
      content: 'MikroORM is a TypeScript ORM for SQL.',
      published: false,
    },
    {
      title: 'PostgreSQL Best Practices',
      content: 'Learn how to effectively use PostgreSQL.',
      published: true,
    },
    {
      title: 'API Security Guidelines',
      content: 'Essential security practices for building secure APIs.',
      published: false,
    },
  ];

  const postsToCreate = samplePosts.slice(0, options.postCount || 3);

  if (postsToCreate.length > 0) {
    try {
      await em.insert(
        Post,
        postsToCreate.map((p) => ({
          id: uuidv7(),
          organizationId: orgId,
          updatedAt: new Date(),
          ...p,
        })) as never,
      );
      console.log(`✅ Created ${postsToCreate.length} posts`);
      for (const p of postsToCreate) console.log(`   - ${p.title}`);
    } catch (error) {
      console.error('❌ Error creating posts:', error);
      throw error;
    }
  }
}

export async function cleanup(em: EntityManager): Promise<void> {
  if (process.env.SEED_CLEANUP === 'true') {
    console.log('🧹 Cleaning up existing data...');
    try {
      // 删序 session→account→verification→post→user（BA 行 + post 均引用 user·先删子表·再删 user）。
      // 扩删 account/session/verification 系本切片 signUp 编排所需：避免重跑 seed 撞残留 credential/邮箱占用。
      await em.nativeDelete(Session, {});
      await em.nativeDelete(Account, {});
      await em.nativeDelete(Verification, {});
      await em.nativeDelete(Post, {});
      await em.nativeDelete(User, {});
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      throw error;
    }
  }
}

/** seed 四段编排（可注入 em/auth·供镜测直调）：cleanup → createUsers → ensureSeedTenants → createPosts。 */
export async function runSeed(
  em: EntityManager,
  options: SeedOptions,
  auth: LoginableAuth,
): Promise<void> {
  await cleanup(em);
  await createUsers(em, options, auth);
  await ensureSeedTenants(em, auth, options);
  await createPosts(em, options);
}

async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  // 裁决单点先于一切 DB 访问（生产缺键→throw→main catch 退码 1·零建连）。
  enforceSeedPasswordPolicy();

  console.log('🌱 Starting database seeding...');
  console.log('📋 Seed options:', options);

  const orm = await initMikroOrm(process.env.DATABASE_URL as string, MIKRO_APP_ENTITIES);
  const auth = createLoginableAuth(orm);
  try {
    await runSeed(orm.em.fork(), options, auth);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Database seeding completed successfully in ${duration}s!`);
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'Unknown error');
    throw error;
  } finally {
    await orm.close();
  }
}

// 入口守卫：仅当被 `node .../seed.ts`（`db:seed`）直接执行时才跑 main；被单测 import 时不触发 DB 连接。
const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  });
}
