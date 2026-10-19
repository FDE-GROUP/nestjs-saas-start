# 前端登录后引导落租户（无活跃租户时自动激活唯一成员组织）

> 适用范围: `模块(apps/web)` — 单文件（`routes/index.tsx`）行为改动：dashboard loader 新增「自动激活唯一成员组织」编排 + 把订阅取数 gate 在「有活跃租户」之后
> 关联: `module-db-seed-tenant-context`（C 片·配套 seed 预建 org/成员·本片依赖其产物）· `module-frontend-tenant-console`（§2.1 api 单例·既有 `TenantSwitchSection` 手动切换）· `global-tenancy`（FR-2/FR-5 活跃租户语义）· `specs/tooling-standards.md` §4.12（前端）· `AGENTS.md` §2（改前端行为须人签核）
> 性质: 重写型（首版起草）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

验收期实跑（浏览器 dashboard）拓出：seed 号登录后，`GET /api/v1/subscriptions/current` 恒 **403 `TENANCY:NO_ACTIVE_CONTEXT`**。经代码 + better-auth 依赖双证定位（本会话勘察）：

- **活跃租户是逐会话事实**：`tenantId` 只来自会话行的 `activeOrganizationId`（`libs/core/src/tenancy/tenant.middleware.ts:41`·`apps/api/src/database/mikro/entities.ts:79` Session 列）。`TenantScopeGuard` 在该列空时按 FR-5 fail-closed 抛 403（`libs/core/src/tenancy/tenant-scope.guard.ts:44`）。
- **better-auth 1.7.7 无「自动落默认组织」**：全 `dist` 搜 `activeOrganizationId` 唯一写入点是 `setActiveOrganization → updateSession`（`plugins/organization/adapter.mjs:397-398`），无任何 signIn 回填；我方 `organization({ allowUserToCreateOrganization:false })`（`auth.implement.ts:189-191`）也未开此类开关。**⇒「激活」必须发生在浏览器那条会话上**（seed 无法代劳·见 C 片同源勘察）。
- **前端其实已有手动切换器**：`routes/index.tsx` L107-148 `TenantSwitchSection` 已列 `GET /api/v1/tenants` 成员、`POST /api/v1/tenants/active` 切换。当前卡死的真相是 seed 号**无任何组织成员**（C 片补）→ 切换器空 → 无从激活；且 dashboard loader 在**尚无活跃租户**时就冷调订阅面（L33），触发这条「未选租户」的 403 噪声。

**目标**：authenticated 落地时，若会话无 `activeOrganizationId` 但用户恰有**唯一一个**成员组织 → 自动 `POST /tenants/active` 落进去；把订阅取数 **gate 在「已有活跃租户」之后**，无活跃租户时渲染引导而非误导性的 403 错误。让「登录即落租户」对单组织 demo 号零点击成立。

**非目标**：不改后端/契约/守卫（既有 typed op 够用）；不为「多组织」擅自选一个（仍走既有手动切换器）；不建「自助申请/创建租户」前端入口（`allowUserToCreateOrganization:false` + S4 审批制·全新注册用户零组织的 onboarding 缺口另案·见 §4 发现项）；不引新工具。

## 2. 方案

### 切片 A —— dashboard loader 引导激活（单文件 `routes/index.tsx`）

1. `Route.loader`（现 L31-44）重排为「先取成员、必要时激活、再按需取订阅」：
   ```
   const session = await requireSession();
   let activeOrgId = session.session.activeOrganizationId ?? null;
   // 列成员组织（透传面·已有 extractTenants 兜形）
   let tenants = extractTenants((await api.GET('/api/v1/tenants'))?.data?.data ?? null); // 记 error→[]
   // 无活跃租户且恰有一个成员组织 → 自动激活（多/零不猜·交手动切换器/引导）
   if (!activeOrgId && tenants.length === 1 && tenants[0]?.id) {
     const r = await api.POST('/api/v1/tenants/active', { body: { organizationId: tenants[0].id } });
     if (!r.error) activeOrgId = tenants[0].id;
   }
   // 仅在已有活跃租户时取订阅；否则不冷调（消 403 噪声）·置 note 引导
   const sub = activeOrgId ? await api.GET('/api/v1/subscriptions/current') : null;
   return { user, activeOrgId, subscription, note, tenants };
   ```
2. 渲染层：`TenantSwitchSection` 保持（多组织仍可切）；订阅段在 `activeOrgId==null` 时渲染 `EmptyPanel`「尚未选择活跃租户」引导（替代原 `ErrorPanel` 的 403 文案）。

**完成判据**：见 §5。

## 3. 影响面与风险

- **blast radius / 可逆性**：单文件 loader + 渲染分支·可逆·零 schema·零后端·零契约·零门禁。**但属前端行为改动**（新增一次会话写操作 + 改数据/错误流）→ 命中 `AGENTS.md` §2 → **审计门强制·不自行实施**。
- **风险**：
  - 依赖 `getSession()` 返回体确实带 `session.activeOrganizationId`（BA 会话 additionalField·`auth.ts:16` 已 typed·**须实机对拍**，见 §5）。
  - 自动激活是**会话写副作用**（每次无活跃租户的落地至多一次）；对 BA 而言 `setActiveOrganization` 更新既有 session 行、不改 cookie，故同 loader 内后续订阅 GET 即带活跃租户（无需重取 cookie）。
  - 多组织用户**绝不自动猜**（保持手动切换·防误落他租）。
  - 本片**价值前提是 C 片**（seed 号得有成员组织）；无 C 则 `tenants.length===0`→走引导分支（正确但 demo 仍空）。故实施次序 **C 先 / A 后**（或 A 独立实施、联调验收待 C）。
- **回滚**：单文件 revert 即恢复「冷调订阅 + 仅手动切换」现状。

## 4. 审计记录

> 无已审方案不写码。行为改动 → 人签核。

- 结论：**已审 GO·已实施·待人类浏览器验收**（人令「你定」= 审计门放行 + 未决项授权 Agent 按推荐档自裁·2026-10-19·问责归人）。三条未决项均采推荐档。
- 未决项（已裁）：
  1. ~~自动激活触发阈值~~ → **仅「恰一个成员组织」自动落**（防误落他租·多组织交手动切换器）。
  2. ~~无活跃租户时订阅段呈现~~ → **`EmptyPanel` 引导**（替 ErrorPanel 403 文案）。
  3. ~~是否顺带 gate 其它租户面~~ → **不在本片泛化**（只治 dashboard 这条实测拓出路径）。
- 发现项（归人·非本片范围）：**全新注册用户零组织**→既无自动落处、前端又无自助建/申请租户入口（S4 审批制端点 `POST /tenants/applications` 后端在册但前端未接线）。真正的「首登 onboarding」缺口，待独立评估。
- 实施回执（A 落地·2026-10-19）：`routes/index.tsx` loader 重排——先 `GET /tenants`，无 `activeOrganizationId` 且成员组织数 `===1` 时自动 `POST /tenants/active`（`===0`/`≥2` 不猜），订阅 GET gate 在「有活跃租户」后，无活跃租户渲 `EmptyPanel` 双文案（有组织→切换引导 / 零组织→联系管理员）；`loaderData` 新增 `hasActiveTenant`。新增 `index.bootstrap.test.tsx` （memory router 打穿 loader）**+4 tests**（唯一成员自动激活 / 已有 active 不重发 / 多组织不自动择 / 零组织不激活）。`pnpm run ci` 全绿 **615/31**（基线 608→+7·web 测只增不减）·web `tsc --noEmit` EXIT=0·Biome 净。**实机浏览器全链对拍（dev:web 登录→自动落租→`/subscriptions/current` 200）本轮未跑**→归人类验收（同既往前端切片 F-范式）；逻辑已由单测钉 + C 真库产物前提已验（seed 号现各属一活跃 org）。
- 审计人 / 日期：用户（令「你定」·GO + 授权自裁）/ 2026-10-19

## 5. 完成判据（可核验 + 穷尽）

- [x] `routes/index.tsx` loader：会话无 `activeOrganizationId` 且成员组织数 `===1` 时自动 `POST /tenants/active`；`===0`/`≥2` 不猜。
- [x] 订阅 GET 仅在 `activeOrgId` 存在时发起；无活跃租户渲染 `EmptyPanel` 引导（不再出现冷 403）。
- [x] 单测（jsdom·`vi.mock api/session`·承既有范式）：① 唯一成员 + 无活跃 → 断言 `POST /tenants/active` 被调 + 订阅 GET 被调；② 零成员 → 未调 active 且订阅 GET 未发（渲染引导）；③ 多成员 → 未自动调 active（交手动）；④ 已有 active → 不重发。
- [~] **实机对拍**（真跑链）：`dev:web` + 后端起 → seed 号（C 片产物）登录 → dashboard 自动落租户 → `/api/v1/subscriptions/current` **200**；**本轮未跑浏览器全链→归人类验收**（逻辑单测已钉 + C 真库前提已验）。
- [x] `pnpm run ci` 全绿·web 测试数只增不减（+4）·Biome 净·web `tsc --noEmit` EXIT=0。
- [x] 后端 / 契约制品 / `routeTree.gen.ts` 零卷入（仅改 loader 体 + 渲染分支）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：前端登录后引导落租户——逐会话 activeOrganizationId 代码+依赖双证勘察·单文件 loader 自动激活唯一成员组织 + 订阅取数 gate·待审计 |
| 2026-10-19 | 0.2.0 | 审计 GO | 人令「你定」= 放行 + 未决项授权自裁；三条均采推荐档（仅恰一个自动落 / EmptyPanel 引导 / 不泛化）·待 C 后实施 A |
| 2026-10-19 | 0.3.0 | A 实施 | loader 重排（先 /tenants→唯一成员自动激活→订阅 gate）+ EmptyPanel 双文案引导 + `index.bootstrap.test.tsx` +4；ci 615/31·web tsc 净·Biome 净；实机浏览器全链对拍归人验收 |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.1.0 变更，以当前正文内容为准。
