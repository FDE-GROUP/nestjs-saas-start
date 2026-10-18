# 前端测试完备性：jsdom 覆盖补齐（A）+ 浏览器 e2e harness（B）

> 适用范围: `模块(apps/web)` — 切片 A 纯增测（可逆·零生产码改动）；切片 B 引入 Playwright 属**新工具链·触 tooling-standards 红线**（高危·归人）
> 关联: `global-frontend-adoption` · `module-frontend-platform`（F4a/F4b 已实施·待人类验收）· `module-frontend-tenant-console` §1（register/invitations/PIPL 缓账 WIP 登记）· `specs/tooling-standards.md` §3（工具红线）/§4.12（前端）· `AGENTS.md` §2 高危
> 性质: 重写型（首版起草）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

起因：seed 修复收尾后盘点「前端 e2e 是否完备」，实据（`apps/web/src/routes`+`vitest.config.ts`）如下——

- **无任何自动化端到端（e2e）**：`apps/web` 仅 `@testing-library/react` + `jsdom`，**无 Playwright/Cypress**；`vitest.config.ts` / `scripts/ci-fullstack.ts` 的 gated e2e **全部在 `apps/api`**（Testcontainers PG），web 层零登记。既有「端到端真跑」是**人工 dev 反代验收**（各前端 plan §完成判据反复写「dev 反代真跑归人」）。
- **现有 web 测试 = jsdom 组件/路由单测·`fetch` 全 mock**：测试文件显式声明边界「loader 的 api-client 取数（相对 URL fetch）…jsdom 不解析 document base → 端到端真跑归人工」。即**联调维度无自动化回归**——F4 平台治理面、本轮 seed 可登录修复的「后端契约 ↔ 前端消费」真实链路 CI 不锁，后续回归裸奔。

**缺口分两层（据实核，非一律漏测）**：

- **L1 零覆盖（任何层无测）**：`register.tsx`(91)、`invitations.tsx`(108)、`settings.invitations.tsx`(136)、`settings.account.tsx`(93，PIPL 导出/注销面）。
  - 诚实标注：其中 register/invitations/PIPL 系既往切片的**未提交 WIP 缓账**（`module-frontend-tenant-console` F3 §1 已登记「F2b+PIPL+register+invitations 系未提交 WIP」），本 plan 将其转为**在册欠账并补齐**，非新立范围。
- **L2 基元已测·路由编排/loader 分支未测**：`platform.tenants.$id.tsx`(239·治理写面）与 `settings.roles.$roleKey.tsx`(110）——其 `TenantActions`/`StatusBadge`/矩阵基元已由 `platform.tenants.test.tsx`/`rbac-matrix.test.tsx` 覆盖，缺 **loader 的 error/403(denied)/notFound 分支**与详情编排。

**目标**：A 把 L1/L2 补到既有「纯展示基元 + 动作矩阵 + memory-router + mock fetch/session」范式基线（**只在 Vitest 内**·零生产改动·零新工具）；B 立项真浏览器 e2e 黄金链路方案（**触修宪·需人单独签核后才实施**）。

**非目标**：不重构路由组件结构（除非某页无导出的纯展示基元可测且成本过高）；不改后端/契约制品；A 不引任何新测试框架；快照测试（snapshot）不采（脆弱·与仓内显式断言风格相左）。

## 2. 方案

### 切片 A —— jsdom 覆盖补齐（本 plan 审计 GO 后即可实施·可逆·Vitest-only）

范式对齐既有 `login.test.tsx`（memory-router + `vi.stubGlobal('fetch', …)`）与 `platform.users.test.tsx`（纯展示基元）。

1. **A-1 L1 表单页（register·settings.account）**：经真实 `routeTree` 的 memory router 渲染整页 + mock `fetch`/`requireSession`，锁：字段渲染、必填/`minLength` 拦截、`pending` 禁用、后端 error message 回显（register 走 `signUpEmail`·settings.account 走 data-export/DELETE 流）；settings.account 注销按钮 `confirmText!=='DELETE'` → 不触发 DELETE。完成判据：各 1 `.test.tsx`·断言不触网。
2. **A-2 L1 邀请页（invitations·settings.invitations）**：同上·锁列表渲染 + 空态 + 动作（接受/撤销）disable·`Feedback` 错误回显。若某页无导出的纯展示基元，**优先在原文件导出 View 基元**（additive·不改行为）而非重写；不可行者记 §4 未决项。
3. **A-3 L2 loader 分支（platform.tenants.$id·settings.roles.$roleKey）**：mock loader 三出口（正常行 / `error` 403→denied 面板 / notFound 面板）经 memory-router 断言渲染分支（复用 `panels.ErrorPanel`），补齐编排面回归。
   - **执行结论（本切片如实收口·两路归 B）**：
     - `platform.tenants.$id`——其**父列表路由** `platform.tenants` 的 loader 直读经 `validateSearch` 填充的 `ctx.search.offset`；jsdom 的 memory-history 挂载子路由时**父 loader 的 `ctx.search` 不可忠实注入**（试 `router.navigate{search}`·字符串 `initialEntries?offset=0`·结构化 entry 三法皆不或报 `reading 'offset'`·或不兼容 API）。monkeypatch loader `ctx` 可强行造绿但**属误导测试**（§7 禁止）→ **本切片不写**，归 **切片 B 真浏览器**（真实导航天然满足父 `validateSearch` + 嵌套 loader）。列表侧已由 `TenantsListView` 基元覆盖·非零回归。
     - `settings.roles.$roleKey`——父 `settings.roles` 的 `RolesPage` **未渲染 `<Outlet/>`**，文件式子路由在 router-mount 下不显（**实证确认为功能缺陷**：代码 grep `Outlet=0` + 实跑探针导航 `/settings/roles/admin` 仅渲染父页 h1 `[角色/新建自定义角色/操作]`·子页 h1「权限矩阵」不挂载；routeTree L101 确将 `$roleKey` 登记为 `SettingsRolesRoute` 之子·父列表又有 `<Link to=…$roleKey>`——即点「权限矩阵」/深链实回退到列表。**全仓唯此一处孤例**·对照 `platform.tenants` 已正确 `<Outlet/>` 委托·L54）；修复属行为改动（新激活一个先前不渲染的页面）·**需人签核·另案审计**。故本切片**不写会掩盖该缺陷的误导测试**·仅登记为发现项。
   - 附带机制发现（归人·非本切片修）：`platform.tenants.tsx:30` 父 loader 直读 `ctx.search` 对深链/裸挂敏感；且 **web 测试须经根 `vitest.config.ts` 运行**——`pnpm --filter web exec vitest` 会加载 `apps/web/vite.config.ts` 的 `tanstackRouter` 插件，把 `src/routes/*.test.tsx` 当作路由、**重生成 `routeTree.gen.ts` 并向测试文件注入 `createFileRoute('/…/test')` 脚手架**（致 route→组件映射漂移·跨文件串扰）。根配置仅 `swc.vite`·不触插件。
4. **A-4 恒等登记**：新测试文件纳入默认 `apps/**/*.test.tsx` 收集（无需登记 gated 清单·jsdom 不触库）；`pnpm run ci` 基线只增不减。

### 切片 B —— 浏览器 e2e harness（立项·实施前另需人签核，因触修宪）

5. **B-0 工具链裁决（前置·高危）**：引入 Playwright 触 `tooling-standards` §3 红线（现仅 Vitest），属**改宪法级**——须人签核并同步 `tooling-standards`。备选：以 MSW/`fetch` 桩把 A 延伸到「拟真 envelope 的 loader 集成测」，**留 Vitest 内、零修宪**（介于纯组件测与真浏览器 e2e 的中间档）。
6. **B-1 黄金链路**（B-0 放行后）：真栈起 `postgres-dev`+后端(:7009·前缀 /api/v1)+前端(:5173 反代)；覆盖 sign-in（seed 号可登录·承本轮修复）→ /platform/users offset 分页 → /platform/tenants 详情动作（suspend/resume）正反门控（运营者 200 / 非运营 403）。
7. **B-2 CI 归位**：默认跳过、env-gated 纳入（拟挂 `scripts/ci-fullstack.ts` 旁或独立 `ci:e2e`），与既有 gated e2e 隔离策略协调（互污·文件级串行锁判例参 `module-ci-gated-e2e-isolation`）。

## 3. 影响面与风险

- **blast radius / 可逆性**：A = 纯增量 `.test.tsx`（+ 可能的 additive 导出 View 基元），**可逆·零 schema·零后端·零门禁**，不命中高危清单（仅新增测试）。B-0 引 Playwright **命中高危**（改 `tooling-standards` 宪法 + 新依赖 + CI 编排）。
- **风险**：A 若强行为 monolithic 路由造可测基元可能诱发过度重构 → 约束为「能整页 memory-router 测就不拆」（login 已证整页可测）；memory-router 下 loader 需 stub `requireSession`/`fetch`，注意 TanStack Router `useLoaderData` 冲刷时序（既有 `vi.waitFor` 手法）。
- **回滚**：A 逐文件 revert 即可；B 独立分支/片，不与 A 混提。

## 4. 审计记录

> 无已审方案不写码。切片 A 局部可逆；切片 B 全局/触修宪 → 人签核。

- 结论：**切片 A 已审 GO·部分完成**（人令「1」）；A-1/A-2 四页已实现并过全量 `ci`（606/31·基线只增不减·Biome 净·`tsc --noEmit` 0 issue）；A-3 两路（platform.tenants.$id·settings.roles.$roleKey）经实测属 jsdom 不可忠实驱动·**如实归 B/归人**（见 §2-3）。切片 B **仅立项**，B-0 触修宪·实施前另需人签核。
- §4 未决项自裁（整体 GO 非逐条裁·诚实标注）：
  1. **中间档取舍** → 采 `vi.mock('../lib/api')`+`vi.mock('../lib/session')` 做拟真 envelope 的 loader 集成（留 Vitest 内·不引 MSW·零修宪）；联调真浏览器链路仍留 B。
  2. **monolithic 页导出基元** → 优先整页 memory-router；实测四页均可整页测·**未加 additive 导出**（零生产码改动）。唯 `platform.tenants.$id` 因父分页 loader 不可忠实驱动而归 B（非导出基元可补救其分支逻辑）。
  3. **e2e 工具** → 保持切片 B 立项·Playwright 待 B-0 签核，本阶段未引任何新工具。
- **发现项（待归人·本切片未修）**：① `settings.roles.$roleKey` **实证**缺 `<Outlet/>` 不渲染（孤例·行为改动·另案签核修复）；② `platform.tenants.tsx:30` 父 loader 直读 `ctx.search` 深链敏感；③ web 测试运行须用根 Vitest 配置（见 §2-3 附带发现）。
- 审计人 / 日期：用户（令「1」·GO 切片 A）/ 2026-10-19

## 5. 完成判据（可核验 + 穷尽）

- [x] A-1/A-2：四页（register·settings.account·invitations·settings.invitations）整页 memory-router + `vi.mock(api/session)` 断言渲染/loader 分支/错误回显/不可逆闸·全 mock 不触网·10 tests 全绿。
- [~] A-3：`platform.tenants.$id`（父分页 loader `ctx.search` jsdom 不可忠实注入）·`settings.roles.$roleKey`（父无 `<Outlet/>` 疑路由缺陷）→ **均不写误导测试·归 B/归人**（详见 §2-3）。
- [x] `pnpm run ci` 全绿·web 测试数**只增不减**（基线 596→**606**·+10·115 files）·Biome 净·`tsc --noEmit` 0 issue。
- [x] 后端/契约/`vitest.config.ts` include 无改动（新文件落 `apps/web/src/routes/**`）·`routeTree.gen.ts` 未被纳入测试路由（build 重生成干净·不含 `*.test`）；B-0 触及 `tooling-standards` 时再显式人签核留痕。
- [ ] B：仅当 B-0 放行才实施；未放行则本 plan 止于 A，B 保持立项待审。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：jsdom 覆盖补齐（A）+ e2e harness 立项（B）·两层缺口据实登记 |
| 2026-10-19 | 0.2.0 | 切片 A 执行收口 | A-1/A-2 四页落地（+10 tests·ci 606/31）；A-3 两路如实归 B/归人；登记三项发现（$roleKey 无 Outlet·父 loader ctx.search 敏感·web 测试须走根配置） |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.2.0 变更，以当前正文内容为准。
