# 前端 F4 · 平台运营治理面：apps/web PlatformOperator 跨租户治理 UI（已审·实施稿·F4a 租户面 + F4b 用户面）

> 适用范围: `模块(apps/web · 前端平台运营面)` | 受众: 人（审计/裁点）
> 关联: `global-frontend-adoption` §2.2 · `module-frontend-tenant-console`（F2） · `module-frontend-rbac-admin`（F3） · `module-frontend-posts`（B1） · `specs/vision.md` §4 第 7 支柱「人的界面」 · `specs/architecture.md`（platform 跨租治理·FR-6/FR-11①/FR-13） · `specs/tooling-standards.md` §4.12
> 性质: 首版（续 B1 择下一片·不改已批措辞）
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**起因·续 B1 择片**：tenant 自助面（RBAC + posts）吃完后，剩余面经取证逐个证伪其体量（A4 订阅 1 op·provider 503 脆；B2/B3 provider-gated；A3 涉平台审批）。最大且自洽的成片段 = **平台运营面（F4）**——`PlatformOperator` 跨租户治理，独立受众·独立布局·后端 op 全 typed。

**平台面勘察实据（代码实存·据实修正先前口径）**：

- 后端两控制器·全 `@UseGuards(PlatformOperatorGuard)`（唯一运营者·DB email 匹配 `platform.operatorEmail`·**fail-closed 403**）+ 类级 `@TenantExempt()`（跨租·故意不绑 TenantScopeGuard）：
  - `PlatformTenantsController`（`apps/api/src/modules/platform/api/platform-tenants.controller.ts`）**8 op**：
    - `GET /platform/tenants`（`ListPlatformTenantsDto{limit=20,offset=0,search?}`·**offset 分页**）→ `PlatformTenantPage`
    - `GET /platform/tenants/{id}` → `PlatformTenantRow`（404 兜底）
    - `GET /platform/tenants/{id}/diagnostics` → `TenantDiagnostics`（成员/邀请/工作区/帖子计数）
    - `GET /platform/tenants/{id}/export` → `TenantDataExport`（六段聚合·credentials excluded·**`apiOkPassthrough` 非 envelope·诚实降档类型**·NFR-6）
    - `PATCH /platform/tenants/{id}/suspend`（active→suspended·409 非法转移）→ `TenantApplicationResponse`
    - `PATCH /platform/tenants/{id}/resume`（suspended→active）→ `TenantApplicationResponse`
    - `DELETE /platform/tenants/{id}`（软删 → deleted 终态·行留供 export·409 已删）→ `TenantApplicationResponse`
    - `DELETE /platform/tenants/{id}/permanent`（**不可逆硬删**·FK 级联 + 事件清除·**需先 deleted 否则 409**）→ `TenantHardDeleteResult{organizationId,purgedEvents}`
  - `PlatformUsersController` **3 op**：`GET /platform/users`（offset+search·`PlatformUserPage`）·`PATCH /platform/users/{id}/suspend`（`SuspendUserDto{reason?}`·失效会话）·`PATCH /platform/users/{id}/resume`。
- **生命周期状态机**（`libs/core/.../tenant-lifecycle.ts`·纯函数 SSOT）：状态 4 值 `pending_approval|active|suspended|deleted`；转移表 `TRANSITIONS`：active→suspended/deleted·suspended→active/deleted·deleted=终态（无出边）。**suspend 仅 active 合法·resume 仅 suspended·permanent 仅 deleted**。
- **全 11 op 已在 `packages/api-client/src/schema.d.ts` typed**（paths L111-265·响应 L944-1023·status 枚举内联 4 值字面量联合）→ **后端零改动**。
- 可复用基建（F2/F3/B1 已趟通）：`lib/{api,mutation,session,format,log}.ts`・`components/{forms,panels}.tsx`・raw Tailwind・无 react-query・offset 分页前端此前未落控件（本片首用）。

**⚠ 明确不在此面（防臆测越界）**：平台面**无 `subscription-events`、无 `impersonation`**（先前对拍口径 composition 有误·本 plan 据 openapi 实存坐实为 tenants8+users3）；**无 approve/reject**（`pending_approval→active` 审批属 A3 申请面·非本 11 op）。

**目标**：运营者在 web 上跨租户**查看并治理**——列租户（搜索+分页）→ 进详情看诊断 → 按生命周期状态**执行合法转移**（suspend/resume/软删）+ **不可逆硬删**（强确认）+ 导出租户数据。全程经 `@saas/api-client` typed 消费·deny-by-default（未登录弹登录·非运营者 403 面板）。

## 2. 方案

### 2.1 切片策略（裁点①）

**拆两片串行**（推荐甲）：
- **F4a · 租户治理面（本 plan·8 op）**：建 `/platform` 段 + PlatformShell（内部导航 + 403 门控）+ 租户列表 + 租户详情（诊断/转移动作/硬删/导出）。体量 ~5 页/组件 + 测 ~600 行，一个审计窗口吃完·且把**不可逆硬删面单独聚焦审**。
- **F4b · 用户治理面（配对下一片·3 op）**：`/platform/users` 列表 + suspend/resume·复用 F4a 的 PlatformShell/门控/状态徽标/分页控件。

（乙 = 一片全包 11 op·审计窗口过大且不可逆面被稀释·不推荐。）

### 2.2 路由与页（F4a）

| 路由 | 文件 | 功能 | 消费 op |
|---|---|---|---|
| `/platform` | `platform.tsx` | PlatformShell 布局（Outlet + 内部导航「租户/用户」）| — |
| `/platform/tenants` | `platform.tenants.tsx` | 租户列表（search + offset 分页 + 状态徽标）| GET /platform/tenants |
| `/platform/tenants/$id` | `platform.tenants.$id.tsx` | 详情 + 诊断 + 生命周期动作 + 硬删 + 导出 | GET {id}·GET diagnostics·PATCH suspend·PATCH resume·DELETE {id}·DELETE permanent·GET export |

- 各 loader 首行 `requireSession()`（deny-by-default）→ 取数；**任一带 403 的 GET → 渲染 `AccessDeniedPanel`**（前端无从知 `operatorEmail`·诚实以服务端 `PlatformOperatorGuard` 为裁判·裁点②甲）。
- F4b 预留 `/platform/users`（本片不建·下一片）。

### 2.3 数据流与状态机联动

- 列表：`api.GET('/api/v1/platform/tenants',{params:{query:{limit:20,offset,search}}})` → 取 `data.data`（`{items,total,limit,offset}`）；offset「上一页/下一页」+ `total` 计数（裁点⑥甲）；search 经 route search param 驱动 loader 重载。
- 详情 loader 并行 `GET {id}` + `GET {id}/diagnostics`（存在性校验 + 计数）·不存在 → notFound 面板。
- 动作转移（裁点④甲·镜像 TRANSITIONS）：按钮 enable/disable **按 `status`**——
  - suspend `enabled = status==='active'`·resume `enabled = status==='suspended'`·软删 `enabled = status!=='deleted'`·硬删 `enabled = status==='deleted'`；其余 disable + title 提示「当前状态不允许」。后端 409 为最终裁判（双保险·对齐 F3 系统角色模式）。
- 写侧：`useAction.run` → thunk `api.PATCH/DELETE('/api/v1/platform/tenants/{id}/...')` → 成功 `router.invalidate()` 重载详情/列表·失败 `describeApiError`（409 非法转移友好回显）。
- **硬删不可逆（裁点③甲）**：软删二次确认弹窗；硬删需**键入租户 slug 文本**匹配才解禁确认按钮（防手滑·对齐 workflow §3 高危人机签核精神）。
- **导出（裁点⑤甲）**：`GET {id}/export` 非 envelope passthrough → 本地 `useState` 触 `fetch`-style `api.GET` → 拿原始 JSON → `Blob` + `URL.createObjectURL` 下载；类型标 `unknown`（诚实降档·不假称 typed 六段字段）。

### 2.4 待裁点（本稿附推荐档·呈审时逐条裁·未裁不动）

- **① 切片**：甲 = 拆 F4a 租户 / F4b 用户两片串行（推荐·聚焦不可逆面）；乙 = 全包 11 op。
- **② 运营者门控可见性**：甲 = 「平台运营」链接常显 + 进页 403 → AccessDeniedPanel（前端无从知 operatorEmail·诚实·推荐）；乙 = 引 `VITE_PLATFORM_OPERATOR_EMAIL` 前端预筛（造配置漂移/泄运营者邮箱面·不推荐）。
- **③ 破坏性确认**：甲 = 软删二次确认 + 硬删键入 slug 文本确认（推荐）；乙 = 单击即删（不推荐）。
- **④ 生命周期转移呈现**：甲 = 按 status 镜像 TRANSITIONS disable 非法动作 + 后端 409 兜底（推荐）；乙 = 全开靠后端 409（体验差）。
- **⑤ export 消费**：甲 = 详情页「导出数据」→ fetch→JSON blob 下载·类型 unknown（推荐）；乙 = 本片缓做 export。
- **⑥ 分页控件**：甲 = offset「上一页/下一页」+ total（复用后端 offset 契约·前端首落此控件·推荐）；乙 = 仅首屏不翻页。
- **⑦ 布局归属**：甲 = apps/web 新增 `/platform/*` 段 + 独立 PlatformShell（受众边界清晰·推荐）；乙 = 塞进 `/settings`。

## 3. 影响面与风险

- **blast radius**：仅 `apps/web/src`——新增 `routes/platform.tsx`・`platform.tenants.tsx`・`platform.tenants.$id.tsx`（+ 测）+ `routeTree.gen.ts`（插件重生）+ `__root.tsx` 加「平台运营」Link。**不改**后端运行时/schema/迁移/Dockerfile/compose/husky/commitlint/docs/specs。
- **命中高危清单**：**否**——本片仅**新增前端消费面**·调用的是应用自身已 guard 的既有端点·非 Agent 自执行迁移/删码/改门禁。**但**硬删端点本身不可逆：UI 采裁③甲强确认·实际删除由人类运营者 deliberate 触发（归人问责·P2）。
- **主要风险**：① 状态机前端镜像与后端 TRANSITIONS 漂移 → 以 `status` 字面量联合驱动 + 后端 409 兜底·非硬编码乐观；② export passthrough 无 typed 契约 → 明确降档 unknown·只下载不解析字段；③ 非运营者误入 → loader 403 面板·无数据泄露；④ 硬删不可逆 → 键入 slug 确认 + 后端要求先软删（双闸）。
- **回滚**：全可逆——删新增文件 + 还原 `routeTree.gen.ts`/`__root.tsx` 即净；后端与 api-client 制品零触动。

## 4. 审计记录

> 无已审方案不写码。跨前后端消费面 + 含不可逆删除入口 → 人签核。

- 结论：**已审计并放行实施**——人 CreatePlan 批准本 plan（2026-10-18）·§2.4 待裁点①–⑦按推荐档甲全采（整体「同意」非逐条裁·**尤①拆片 / ③硬删强确认已随批准背书**）·F4a 租户面已按此实施落地（详见 §5 勾选）。
- 实施期两处据实纠偏（不改裁点·纯落地细节）：① 文件式路由 `platform.tenants.$id` 自动成为列表路由的**子路由**（routeTree `getParentRoute`）→ 父级命中子路由时经 `useMatchRoute` 委托 `<Outlet/>`（否则详情不渲染·`settings.roles` 面存同结构隐患·已登记复用坑）；② 列表页 `useState` 上移至早退之前守 rules-of-hooks。本仓首个 `validateSearch` 面：loader 上下文 `ctx.search` 未被插件登记进类型·运行时形取·编译期诚实降级。
- 未决项：approve/reject（A3·审批申请）不在平台面·另立项。
- 审计人 / 日期：人（CreatePlan 批准 + 「同意」放行）/ 2026-10-18。

### 4b. F4b · 用户治理面（配对片·已审计并放行实施）

- 结论：**已审计并放行实施**——续 F4a 后用户择片①（F4b）→ 呈新 plan（`F4b_platform_users_governance`）·人 CreatePlan 批准 + 「同意」放行（2026-10-18）·待裁点按推荐档甲全采。消费 `PlatformUsersController` **3 op**（GET list + PATCH suspend + PATCH resume）·**后端零改动**。
- 落地要事：`/platform/users` 子段（PlatformShell 加「用户治理」导航）·列表复用 offset 分页/search·行内 suspend（toggle 输入 reason·裁①甲）/resume（单击）·`UsersListView` `renderActions` 插槽使纯展示可测·`StatusBadge` 直接复用 F4a（`UserStatus = TenantStatus` 结构同型·裁②甲）。
- **据实边界**：后端无 `GET /users/{id}`/无删除端点 → **不做详情页·无不可逆硬删面**（suspend 可逆）→ 本面不命中高危清单。
- 完成判据见 §5b。

## 5. 完成判据（可核验 + 穷尽）

- [x] §2.4 待裁点（尤①③）经人签核放行（CreatePlan 批准 + 「同意」放行·甲档全采）
- [x] `/platform` 段 + PlatformShell + `/platform/tenants` 列表（search + offset 分页 + 状态徽标）typed 落地
- [x] `/platform/tenants/$id` 详情 + 诊断计数 + suspend/resume/软删 按状态机 disable + 后端 409 兜底
- [x] 硬删：键入 slug 确认 + 后端「需先软删」双闸·成功回显 `purgedEvents`
- [x] export：详情页「导出数据」fetch→JSON blob 下载（类型 unknown·诚实降档）
- [x] 403 非运营者 → AccessDeniedPanel·未登录 → 弹登录（deny-by-default）
- [x] 组件测：`platform.tenants.test.tsx`（列表 typed 渲染/空态/状态徽标 + 动作 enable/disable 矩阵·11 测）·纯展示对齐既有 View 模式
- [x] `pnpm run ci` L1 全绿（基线 571→**582 passed / 31 skipped·110 files** 只增不减·fallow 无越界·后端零改动 git status 坐实）
- [x] 前端消费 op 29 → 37（+8·F4a）
- [ ] dev 反代真跑端到端（运营者登录态→列租户→进详情→转移→软删→硬删→导出·**归人类验收执行**）
- [ ] 提交 + 人类验收（归人）

### 5b. F4b 完成判据

- [x] 待裁点①②（行内 toggle reason / StatusBadge 复用）经人签核放行（CreatePlan 批准 + 「同意」·甲档全采）
- [x] `/platform/users` 列表（search + offset 分页 + 状态徽标）typed 落地·PlatformShell 加「用户治理」导航
- [x] 行内 suspend（toggle 输入 reason）/ resume（单击）· useAction 成功 invalidate 重跑 loader·409/404 describeApiError 回显
- [x] 403 非运营者 → ErrorPanel·未登录 → 弹登录（deny-by-default·承 F4a）
- [x] 组件测：`platform.users.test.tsx`（typed 渲染/空态/徽标 + `userActionEnabled` 矩阵 + `UserRowActions` disable·9 测）
- [x] `pnpm run ci` L1 全绿（基线 582→**591 passed / 31 skipped·111 files** 只增不减·fallow 无越界·后端零改动 git status 坐实）
- [x] 前端消费 op 37 → 40（+3·**平台治理 11 op 全消费·F4 平台线收口**）
- [ ] dev 反代真跑端到端（运营者登录→列用户→suspend 带 reason→resume·**归人类验收执行**）
- [ ] 提交 + 人类验收（归人）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-18 | 0.1.0 | 续 B1 择下一片：剩余 tenant 面经取证偏薄/provider-gated → 最大自洽片 = F4 平台治理面；取证坐实为 tenants8+users3（据实修正先前「含 events/impersonation/approve」误口径）→ 起草呈审（拆片·聚焦不可逆硬删） | 首版呈审：11 op typed 实据 + 状态机 TRANSITIONS 联动设计 + offset 分页首落 + 硬删强确认 + export passthrough 降档 + 七待裁点·§4 标「待审计」 |
| 2026-10-18 | 0.2.0 | 人 CreatePlan 批准 + 「同意」放行·F4a 实施落地 | §4 转「已审计并放行实施」·§5 实施项勾选（CI 571→582·op 29→37）·登记落地两纠偏（嵌套子路由 Outlet 委托 + rules-of-hooks + validateSearch loader search 类型降级）·F4b 待下片 |
| 2026-10-18 | 0.3.0 | 人择片①（F4b 用户面）+ CreatePlan 批准 + 「同意」放行·F4b 实施落地 | 新增 §4b/§5b：消费 PlatformUsersController 3 op·`/platform/users` 行内 suspend(toggle reason)/resume·无详情/硬删面（不命高危）·复用 StatusBadge/offset 分页·CI 582→591·op 37→40·**F4 平台线（tenants8+users3=11 op）收口** |

---

<!-- 变更戳 -->
正文已于 2026-10-18 / v0.3.0 实施落地（**F4a 租户面 + F4b 用户面均已实施·待人类验收**——平台治理面 11 op（tenants8+users3）typed 全消费·`/platform` 段 + PlatformShell（租户/用户双导航）·F4a：列表 offset 分页/search/徽标 + 详情诊断/状态机联动动作/软删二次确认/硬删键入 slug 强确认/export；F4b：用户列表 + 行内 suspend（toggle reason）/resume·无详情/硬删面·后端零改动 git status 坐实·L1 571→582→591/31 只增不减；op 29→37→40·F4 平台线收口；dev 反代真跑端到端 + 提交 + 人类验收归人）。
