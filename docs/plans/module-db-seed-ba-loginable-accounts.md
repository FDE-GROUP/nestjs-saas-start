# Seed 直接产出可登录运营者 + 演示用户（`db:seed` 内复用 Better Auth `signUpEmail` 建 `account` credential）

> 适用范围: `模块(database/seed + auth adapter 复用)` ← = blast radius：seed 行为变更（数据面脚本·零 DB schema 迁移）+ `seed.test.ts` 镜测增例 + runbook/`.env.example` 文案同步
> 关联: [module-config-seed-fail-loud-and-contract-gate](./module-config-seed-fail-loud-and-contract-gate.md)（同片 seed 面·已结项「弱口令 fail-loud」·本片承其「改 seed 行为须人签核」判例）· [module-frontend-platform](./module-frontend-platform.md)（F4a/F4b 平台治理面·验收期实机拓出本缺陷）· `specs/tooling-standards.md` §4.10（对拍口径）· `docs/frontend-dev-proxy-runbook.md` §7（现记为「设计·seed/BA 分离」）· `AGENTS.md` §2（高危归人）
> 性质: 缺陷收口（「seed 声明保障运营者行存在」但实现不建 BA `account` → 运营者密码登录必 401·声明与实现断裂）·机制单点修、不逐账号特判
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

`apps/api/src/database/seed.ts` 的 `createUsers` 仅走 MikroORM `em.insert` / `em.nativeUpdate` 建 `user` 行（`password` 写 bcrypt `$2b$`·id 用 uuidv7），**从不建 Better Auth 的 `account`（credential）行**。而运行态登录面（`auth.implement.ts`·自持 `mikroAuthAdapter`）校验的是 `account.password`（BA 默认 scrypt `salt:hash`），`user.password` 旧列不参与 BA 校验。故：

- 经 `db:seed` 产出的运营者 `admin@example.com`（缺省 `platform.operatorEmail`）**密码登录必 401**（`sign-in/email` 无对应 credential）。
- 本会话（F4a/F4b 平台治理面 dev 反代验收）实机坐实：dev 库 3 用户中**唯一 `account` credential 行挂在 `dev@example.com`**（别处注册/手动产生·非运营者），`admin@example.com` / `user1@example.com` 均 acct_rows=0。
- runbook §7 已把此形态记为「设计·seed/BA 分离」并给「注册兜底」，但兜底号默认**不是**运营者 → 平台治理面（F4a/F4b·`PlatformOperatorGuard` 靠 DB email === `platform.operatorEmail` 裁决）验收须额外以运行时 env 覆盖 `PLATFORM_OPERATOR_EMAIL` 到刚注册的号方能进面。

**目标**：`db:seed` 一次即产出**可密码登录**的运营者 + 演示用户（`account` credential 由 BA 亲自建·哈希与运行态 app BA 同算法可互验），使平台治理面验收「登录 seed 号即直入」，闭合「声明保障运营者、实现却不产出可登录账号」的断裂。

**非目标（明确不做）**：
- 不动生产 `emailAndPassword` 面（仍 `NODE_ENV!=='production'` 关·`auth.implement.ts:213-214`·D8 另案）。
- 不改前端 / 契约 / 守卫 / `openapi.yaml`。
- **零 schema 迁移**（`user` / `account` / `session` / `verification` 表均已存在·`entities.ts` 定名）。
- 不改 `enforceSeedPasswordPolicy` 裁决语义（生产缺 `ADMIN_PASSWORD`/`USER_PASSWORD` 仍先于建连拒跑）。

## 2. 方案（切片）

### 切片 A · seed 内直调 BA signUp（复用自持 adapter）

- **新增 `createLoginableAuth(orm)`**（seed.ts 内联或旁挂小工厂）：以现 `initMikroOrm(DATABASE_URL, MIKRO_APP_ENTITIES)` 产出的**同一 `orm`**构造一个最小独立 BA 实例：
  ```ts
  betterAuth({
    database: mikroAuthAdapter(orm),              // 复用 database/mikro/mikro-auth-adapter.ts（全站 BA 读写唯一出口·同 PG）
    emailAndPassword: { enabled: true, minPasswordLength: 1 }, // min=1 令 dev 兜底 admin123(8)/user123(7) 皆可 seed；登录只验哈希不验长度，运行态 app BA（默认 8）不受影响
    secret: process.env.JWT_SECRET || 'your-secret-key',       // 与 app 同源（auth.implement.ts:219 = config.getAuthConfig().jwt.secret）
  });
  ```
  哈希走 BA **默认**（scrypt `salt:hash`·与 `dev@example.com` 现存 account 同形）→ 与运行态 app BA 同算法可互验（此点由切片 B 真库登录 200 对拍坐实·不臆断）。范式佐证：`database/mikro/auth-adapter.consistency.spec.ts:75-107` 实证「standalone `betterAuth({database: mikroAuthAdapter(orm)})` + `auth.api.signUpEmail` → `user`/`account`/`session` 各 1 真行」。
- **`createUsers(em, options, auth)` 改按 email 幂等 reconcile**（运营者 + 演示 `user1..N` 全量·人裁范围·机制不逐账号特判）：
  1. **resolve password**：仍先调 `enforceSeedPasswordPolicy()`（入口·先于建连·逻辑不变）；取 `ADMIN_PASSWORD || 'admin123'` / `USER_PASSWORD || 'user123'`（运营者与演示各自口令）。
  2. **按 email 查状态**（`em.findOne(User,{email})` + `em.findOne(Account,{ userId, providerId:'credential' })`）三分支：
     - 有 `user` 且有 credential `account` → **不重签**，仅 `em.nativeUpdate(User,{email},{ role, name, firstName, lastName, updatedAt })`（幂等·保「重复 seed 不报错」）。
     - 有 `user` 无 `account`（legacy 直插残留态）→ 先按该 `userId` 删孤儿（`Session → Account → User` 该 id 行·避免 FK/邮箱占用），再 `await auth.api.signUpEmail({ body: { email, password, name } })`。
     - 无 `user` → 直接 `await auth.api.signUpEmail({ body: { email, password, name } })`。
  3. **signUp 后补 app 字段**：`em.nativeUpdate(User, { email }, { role, name, firstName, lastName, updatedAt: new Date() })`——运营者 `role='ADMIN'`、演示 `role='USER'`。`role` 非 BA 管理字段（BA 仅 `entities.ts` 声明的 `isOwner`/`handle`·见 `auth.implement.ts:220-232`），虽有 DB 默认 `'USER'`（`entities.ts:41`）仍**显式写**求清晰；`user.password` 旧列本切片不再手写（BA credential 落 `account.password`·`user.password` nullable·`entities.ts:34`）。
- **`cleanup(em)`（`SEED_CLEANUP=true` 分支）删序扩展**：由现 `post → user` 扩为 **`session → account → verification → post → user`**（BA 表随 `user` 一并清·避免重跑 signUp 撞残留 credential/邮箱占用）。
- **`runSeed` / `main` 装配**：`main()` 内 `initMikroOrm` 得 `orm` 后 `const auth = createLoginableAuth(orm)`，注入 `runSeed(orm.em.fork(), options, auth)` → `createUsers(em, options, auth)`；`enforceSeedPasswordPolicy()` 仍先于建连单点调用。

### 切片 B · 测试 + 真库对拍 + 文档同步

- **`seed.test.ts` 镜测**（fake `em` + 桩 `auth.api.signUpEmail`·不触库）新增例（既有 `enforceSeedPasswordPolicy` 例逐字不动）：
  1. 无 `user` → `signUpEmail` 调**恰一次** + `nativeUpdate` 补 `role='ADMIN'`；
  2. 有 `user` 有 credential `account` → **不** signUp（幂等·仅 update）；
  3. 有 `user` 无 `account` → 先删孤儿（session/account/user 该 id）再 signUp；
  4. 演示 `user1..N` 同 reconcile（各自 role='USER'）；
  5. `cleanup`（`SEED_CLEANUP=true`）删序含 `account`/`session`（断言 `nativeDelete` 调用序列）。
- **真库对拍**（人执行·遵 config 片纪律「取证不真写开发机库·以 scratch/env 复现」）：`db:setup` → `sign-in/email` 以**运营者**邮箱登录 **200** → `GET /api/v1/platform/users` **200**（不再需 env 覆盖/手动注册绕行）；`user1@example.com` 登录 **200**；**重跑 `db:seed`（无 `SEED_CLEANUP`）幂等不报错**（account 已存则跳过·不撞唯一键）。
- **文档同步**：`docs/frontend-dev-proxy-runbook.md` §0（seed 兜底账号行）+ §7（现文「不建 account·必 401·注册兜底」）据实订正为「seed 号现可密码登录·运营者即 admin@example.com」；`.env.example` Seed 段补一句（键集合不变·不写真实凭证）。

## 3. 影响面与风险

- **blast radius / 高危触达**：改 seed 数据面行为（引入 BA signUp 编排 + cleanup 删序扩表）→ **本 plan 须人签核后方可实施**（`AGENTS.md` §2·承 `module-config-seed-fail-loud` 同款「改 seed 行为须签核」判例）。**零 schema 迁移**（表均现存）→ 不触高危#1。`.env.example` 仅文案（键集合不变）。
- **可逆性**：切片 A / B 各自独立成 commit·可逐片 revert；回滚即恢复旧 `createUsers` 直插语义（account 仍不建·退回 runbook §7 兜底口径）。
- **风险**：
  - **id 格式变更**：`signUpEmail` 建的 `user.id` 走 BA 原生格式（非 uuidv7·如 `dev@example.com` 的 24 字符 id）→ 运营者/演示用户 id 形制改变。本 seed 不建 organization/membership 关联·风险局限于账号自身；登记为真库对拍核验点（确认无下游按 uuidv7 形状的隐式假设）。
  - **BA 装配漂移静默失效**：`secret` / `minPasswordLength` / `baseURL` 组装须实测登录 200 坐实（防「配置漂移静默失效」既知模式·config 片教训）。缺 `baseURL` 是否影响 signUp 会话语义以真跑为准。
  - **同库既有非 seed 账号**：`cleanup` 扩删 BA 表仅在 `SEED_CLEANUP=true` 显式触发·默认 `db:setup` 走「reconcile 跳过」不删非本次目标账号。
  - 锁测新增例数归人裁（默认只增不减）。

## 4. 审计记录

> 无已审方案不写码。本切片命中数据面行为变更（高危面）→ 须人签核。以下为立项自陈·待审计门裁。

- **结论**：待审计。方向（seed 内直调 BA signUp·范围运营者+演示）系本会话 dev 反代验收期由人经 AskUserQuestion 双问拍板（机制选「seed 内直调 BA signUp」·范围选「运营者 + 演示用户」）。
- **未决项（请审计裁）**：① 锁测增例档位（默认 +5）；② `signUpEmail` id 由 uuidv7 转 BA 原生形是否可接受（若须保 uuidv7 则要传 id·但 BA signUp 不接自定义 id·可能需 account/session 手工对齐——建议接受 BA 原生 id）；③ 演示用户是否一并给 `includeTestData=false` 时跳过 signUp（保持只运营者可登录的窄档）。
- **审计人 / 日期**：__（待签）__

## 5. 完成判据（可核验 + 穷尽）

- [ ] 切片 A：`createLoginableAuth` + `createUsers` reconcile 三分支 + `cleanup` 扩删序落地·机制单点不逐账号特判。
- [ ] 切片 B：`seed.test.ts` 新例全绿（既有 `enforceSeedPasswordPolicy` 例不动）·`pnpm run ci` 基线只增不减·Biome 净。
- [ ] 真库对拍：`db:setup` → 运营者 `sign-in/email` 200 → `GET /platform/users` 200；演示 `user1@example.com` 登录 200；重跑无 `SEED_CLEANUP` 幂等不报错。
- [ ] 文档同步：runbook §0/§7 订正 + `.env.example` Seed 段补句（键集合不变·diff 坐实）。
- [ ] README 索引行状态翻转（候选·待审计 → 已审计·放行实施 → …→ 已验收·结项）+ 本 plan §6 演变对账·人验收后结项。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-18 | 0.1.0 | F4a/F4b 平台治理面 dev 反代验收实机拓出「seed 运营者不可密码登录」缺陷 → 人经 AskUserQuestion 拍板机制（seed 内直调 BA signUp）与范围（运营者+演示用户）后·依「无已审方案不写码」起草 | 首版（**零代码·只提议**）：切片 A（`createLoginableAuth` 复用 `mikroAuthAdapter` + `createUsers` 按 email 幂等 reconcile 三分支 + `cleanup` 删序扩 `session→account→verification→post→user`）·切片 B（镜测 +5 + 真库登录 200 对拍 + runbook/`.env.example` 文案同步）·三条未决项留审计裁·id 格式变更/BA 装配漂移/同库非 seed 账号三风险显式登记 |

---

<!-- 变更戳 -->
正文已于 2026-10-18 / v0.1.0 首版起草（候选·零代码·纯提议），以当前正文内容为准；实施与状态翻账待审计门签核后另记。
