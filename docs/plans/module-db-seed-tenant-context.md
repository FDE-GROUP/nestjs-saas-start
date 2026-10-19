# seed 预建活跃组织 + owner 成员（让 demo 号有租户可落）

> 适用范围: `模块(apps/api·database/seed)` — seed 编排新增「预建活跃 org + owner 成员」一段（+ `createLoginableAuth` 装 organization 插件）
> 关联: `module-frontend-tenant-bootstrap-activation`（A 片·配套前端引导落租户·本片是其产物前提）· `module-db-seed-ba-loginable-accounts`（同片 seed 面·承「改 seed 行为须签核」判例 `56b1ddc`）· `global-tenancy` S4（审批制·pending org 不绑上下文）· `tenant-isolation.e2e.test.ts`（建 org+owner 的真链路范式佐证 L130-148）· `AGENTS.md` §2（改 seed 行为须人签核）
> 性质: 重写型（首版起草）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

`module-frontend-tenant-bootstrap-activation`（A 片）要求「demo 号登录后有活跃租户可落」。但本会话勘察坐实：

- **激活是逐会话事实、seed 无法代劳**：better-auth 1.7.7 无「自动落默认组织」，`activeOrganizationId` 仅由浏览器会话上的 `setActiveOrganization` 写入（详见 A 片 §1 证据链）。
- **seed 当前零组织**：`createUsers` 只经 `signUpEmail` 建 user+credential（`seed.ts:182-220`），**不建 organization/member**；`createPosts` 更因「无 organization 直接跳过」（`seed.ts:229-235`）。⇒ 前端 `GET /tenants` 空 → A 片自动激活无从落 → 切换器 `return null` → demo 死锁。

**目标**：`db:seed` 顺手为 demo  persona **预建一个活跃组织 + 把该用户置为首名 `owner` 成员**，使 `GET /api/v1/tenants` 有货、A 片可自动激活、`createPosts` 也有 org 可归属。

**非目标**：**不**在 seed 里 `setActiveOrganization`（对浏览器新会话无效·见 §1 证据·纯属误导）；不动 schema/迁移（`organization`/`member` 表已存在）；不改后端业务链/契约/守卫；不建前端租户入口（A 片）；零真实凭证、零 PII。

## 2. 方案

### 切片 C-1 —— seed 装 organization 插件 + 暴露系统动作

1. `createLoginableAuth`（`seed.ts:136-142`）的 `betterAuth({...})` 追加 `plugins: [organization()]`（`import { organization } from 'better-auth/plugins'`）——令本实例具备 `auth.api.createOrganization`（与运行态 app BA 同插件·`auth.implement.ts:189`）。
2. `LoginableAuth` 接口（`seed.ts:111-117`）补 `createOrganization: (args:{ body:{ name:string; slug:string; userId:string } }) => Promise<unknown>`（结构型·免耦合 BA 泛型·镜 `signUpEmail` 现有写法）。

### 切片 C-2 —— `ensureTenantContext`（幂等 find-or-create）+ 编排接线

3. 新增导出 `ensureTenantContext(em, auth, { slug, name, ownerUserId }): Promise<'created' | 'exists'>`：
   - 按 `slug` 查 `Organization`（`em.findOne`）→ 命中则确保该 user 为 `owner` member（`em.findOne(Member,{organizationId,userId,role:'owner'})`·缺则经 BA 或直接补）并返回 `'exists'`；
   - 未命中 → `auth.api.createOrganization({ body:{ name, slug, userId: ownerUserId } })`（**服务端系统动作**：无 session + `body.userId` → `isSystemAction`·不受 `allowUserToCreateOrganization:false` 限·BA 原生把创建者置首名 `owner` member·FR-12·镜 `tenant-isolation.e2e.test.ts:131-147` 与 `mikro-tenant-provisioning.repository.ts:16-23`），返回 `'created'`。
   - **保持活跃**：seed 走 BA 原生 `createOrganization`（**不**经我方 `submit` 那段强制 `metadata.status=pending_approval` 的门面），落得 `metadata` 空 → `TenantMiddleware` 视为 legacy/seeded 放行（`tenant.middleware.ts:75-83`）。**禁止**误置 pending。
4. `runSeed` 编排（`seed.ts:311-319`）改 `cleanup → createUsers → ensureTenantContext → createPosts`；`ensureTenantContext` 拿 `createUsers` 产出的 owner `userId`（需从 `ensureLoginableUser` 回传/回查 user id·现返回 `'signed-up'|'updated'`·本片扩为可取得 `userId`·待裁 §4-③）。
5. `createPosts` 逻辑不变——org 既已在，自然归属（解 `seed.ts:232` 跳过）。

**完成判据**：见 §5。

## 3. 影响面与风险

- **blast radius / 可逆性**：仅 seed 运行器 + 其镜测·可逆（`SEED_CLEANUP` + 重跑）·零 schema 迁移·零后端运行时装配·零契约·零门禁。**但属 seed 行为变更**（新写 org/member 行）→ 命中 `AGENTS.md` §2 + 判例 `56b1ddc` → **审计门强制·不自行实施**。
- **风险**：
  - **id/cascade**：`createOrganization` 产 BA 原生 id（非 uuidv7·与 A 片 `GET /tenants` 消费同形·无碍）；`member.userId` FK→user，`cleanup` 现删 user 不删 org/member（`seed.ts:295-301`）→ 重跑时 org 留存、成员指向可能被删重建的 user（**孤儿风险**·见 §4-①）。
  - **插件副作用**：给 seed 的 BA 实例加 organization 插件会改变其内部行为（会话字段等）；因 seed 只调 `createOrganization`/`signUpEmail`，面很窄，但**须实跑确认不破坏既有 signUp 产号**（回归 `seed.test.ts` 断言）。
  - **persona 归属**：谁 owns 演示组织——运营者（`admin`·跨租平台身份·给它的租户语义存疑）vs 演示用户（`user1`·天然租户 persona）vs 两者各一。见 §4-②。
- **回滚**：seed.ts revert 即停建 org/member；已建行经 `SEED_CLEANUP` 或手工删（dev）。

## 4. 审计记录

> 无已审方案不写码。seed 行为改动 → 人签核。

- 结论：**已审 GO·已实施（真库 `db:seed` 对拍毕）**（人令「你定」= 审计门放行 + 未决项授权 Agent 按推荐档自裁·2026-10-19·问责归人·承「人令你定→Agent 裁」判例）。四条未决项均采推荐档。
- 未决项（已裁）：
  1. ~~幂等与孤儿治理~~ → **取 (b)** 保留 org + find-or-create by slug（owner 成员也按 (org,userId) find-or-create·不扩 `cleanup` 删 org 避 cascade）。
  2. ~~演示组织归属~~ → **admin + user1 各建一个专属活跃 org 并各自为 owner**（任一 seed 号登录恰有唯一成员组织·A 片自动落租无歧义）。
  3. ~~owner userId 取得~~ → **调用方 `em.findOne(User,{email})` 回查**（零改 `ensureLoginableUser` 返回契约）。
  4. ~~是否顺带建 `tenant_subscription` 行~~ → **缓**（本片只求「有活跃租户·面 200」）。
- 实施回执（C 落地·2026-10-19）：`seed.ts` 装 `plugins:[organization()]` + `LoginableAuth` 暴露 `createOrganization` + 新增 `ensureTenantContext`（按 slug find·无则 BA 系统动作建、有则按 (org,userId) 补 owner member）+ `ensureSeedTenants`（persona 与 `createUsers` 同构·admin+user1 各一专属 org）+ `runSeed` 四段编排。**真库 `db:seed` 实跑**：日志 `🏢 Seeded active tenant (created): seed-acme · owner=admin@example.com` + `seed-tenant-1 · owner=user1@example.com`；直查 PG——`organization` 两行 `metadata=null`（**非 pending_approval**·活跃）、`member` 两行 `role='owner'` 分指向两 seed user；`createPosts` 现能归 org 播种（3 posts·不再「无 org 跳过」）。镜测 `seed.test.ts` +3（`ensureTenantContext` 三分支）+ 编排测新段·`pnpm run ci` 全绿 **615 passed/31 skipped**（基线 608→+7 只增不减）。
- 审计人 / 日期：用户（令「你定」·GO + 授权自裁）/ 2026-10-19

## 5. 完成判据（可核验 + 穷尽）

- [x] `createLoginableAuth` 装 organization 插件；`LoginableAuth` 暴露 `createOrganization`；既有 `signUpEmail` 产号路径回归不破（`seed.test.ts` 全绿）。
- [x] `ensureTenantContext`：BA 系统动作建 org（metadata 空/活跃·非 pending·实查 `metadata=null`）+ owner 成员；幂等（按 slug find + 按 (org,userId) 补 member·镜测三分支钉）。
- [x] `runSeed` 编排 `cleanup → createUsers → ensureSeedTenants → createPosts`；`createPosts` 归到已存在 org（实跑 3 posts·不再「无 org 跳过」）。
- [x] 镜测（fake em/auth·承 `seed.test.ts` 范式）：断言 `createOrganization` 以正确 `body{name,slug,userId}` 调用、org 非 pending、`runSeed` 编排次序含新段；基线只增不减（+3）。
- [x] **实机对拍**（真库 `db:seed`）：跑毕直查 PG——`organization` 有 seed 行且 `metadata` **为 `null`（非 `pending_approval`）**、`member` 有 `role='owner'` 行指向 seed user；A 片激活与 posts 播种前提达成。
- [x] `pnpm run ci` 全绿（含既有 seed 锁测 + 新段）·**615/31**。
- [x] 后端运行时装配 / 契约制品 / schema 迁移零触动（仅动 `seed.ts`·BA 原生 org/member 表已既存）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：seed 预建活跃 org+owner 成员——承接 A 片「登录即落租户」产物前提·走 BA 系统动作非 pending·幂等 find-or-create·待审计 |
| 2026-10-19 | 0.2.0 | 审计 GO | 人令「你定」= 放行 + 未决项授权自裁；四条均采推荐档（find-or-create by slug / admin+user1 各一 org / 回查 userId / 缓 subscription）·开工实施 C |
| 2026-10-19 | 0.3.0 | C 实施 | seed.ts 装 org 插件 + `LoginableAuth` 暴露 `createOrganization` + `ensureTenantContext`/`ensureSeedTenants` + 四段编排；镜测 +3；真库 `db:seed` 实跑直查 PG（两 org `metadata=null`·两 owner member）；ci 615/31 |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.1.0 变更，以当前正文内容为准。
