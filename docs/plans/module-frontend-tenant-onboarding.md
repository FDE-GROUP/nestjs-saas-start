> 用途: **已审方案·已实施** | 状态: v0.3.0 · 已实施·待人类浏览器验收 | 受众: 人（验收）+ Agent
> 定位: 承接「登录即落租户」主线（`module-frontend-tenant-bootstrap-activation` A 片 + `module-db-seed-tenant-context` C 片已上线）后，A 片 §4 明确登记的**发现项**——全新注册用户零组织的 onboarding 缺口——正式立项。
> 铁律: 触 `AGENTS.md` §2（前端行为 + 可能触公共契约/宪法的建租语义）→ **审计门强制·高危项须人签核**。

## 0. 一句话

新注册（无邀请、非 seed）用户登录后落入 A 片的「联系管理员为你分配一个租户」死胡同；本方案把**后端已在册、且合规（落 pending_approval 经审批）的自助建租通道** `POST /api/v1/tenants/applications` 与既有**邀请入组**通道，接进前端 onboarding 引导——**默认零后端改动、零违宪**。

## 1. 缺口取证（现状·代码 + 实跑双证）

- **自助建租后端通道在册且合规**：[`tenants.controller.ts:54`](../apps/api/src/modules/tenants/api/tenants.controller.ts) `@Post('applications') @UseGuards(SessionGuard)`（**无需活跃租户**）→ [`SubmitTenantApplicationCommandHandler`](../apps/api/src/modules/tenants/application/commands/handlers/submit-tenant-application.command-handler.ts) → provisioning `submit` → **强制盖 `metadata.status=pending_approval`**、申请人经 BA 系统动作成首名 owner（FR-1·FR-12），绕过 HTTP 层 `allowUserToCreateOrganization:false` 封禁。
- **前端未接线（实证）**：`grep apps/web/src → POST /tenants/applications 零命中`；仅平台治理侧（`platform-tenants.tsx`）有 `pending_approval→待审批` 徽标，属**审批者**视图，非**申请人**自助入口。
- **落地即死胡同（实跑·承 A 片）**：[`register.tsx:25-28`](../apps/web/src/routes/register.tsx) `signUpEmail` 成功 → `navigate('/')` → Dashboard loader 无 active + `tenants.length===0` → 渲 A 片的 `EmptyPanel`「你尚未加入任何组织，请联系管理员为你分配一个租户。」（[`index.tsx`](../apps/web/src/routes/index.tsx) 本次已上线）——**用户自助无路**。
- **邀请入组在册**：`accept-invitation` 为现网唯一真实 HTTP 入组通道（`auth.implement.ts:192` 注）；前端 `invitations`/`register` 页已存在（切片 A 已补测）。
- **结论定性**：缺口 = **前端 onboarding 引导缺失**，非架构无解。真正「注册即建活跃组织自助即时开通」在本仓属 **S4 审批制明文违宪**（`auth.implement.ts:186-191`·已裁新宪），故不默认纳入。

## 2. 方案（推荐档·前端接线为主）

新增/改造一个**零活跃租户且零成员组织**时的 onboarding 面板（替换 A 片纯文案 `EmptyPanel`），给两条合规出路：

1. **申请创建我的组织**：表单（name + slug）→ `api.POST('/api/v1/tenants/applications', { body })` → 成功回执 `{ organizationId, status: pending_approval }` → 就地显示「已提交，等待平台审批」（复用 `StatusBadge` 的 pending 语义）。
2. **通过邀请加入既有组织**：引导至既有 `invitations` 页（接受邀请即成 member·A 片下次登录自动落租）。

实现边界（推荐·保守）：
- **单文件/少数文件前端**：`index.tsx` 空态分支挂一个新组件 `TenantOnboardingPanel`（或独立路由 `/onboarding`）；typed via `@saas/api-client`（`POST /tenants/applications` 若已在 openapi 面则直接用，否则走防御形·同 `/tenants` 透传面手法）。
- **后端默认零改动**；**唯二**可能补的后端项（见 §4 待裁）：(a) 申请人查「我的申请状态」的读端点（若 `TenantApplicationReadModel` 无自助 GET）；(b) slug 冲突/重放的错误文案。均需实勘后定，不预先扩面。
- 前端测试：镜 A 片 `index.bootstrap.test.tsx` 手法，`vi.mock(api/session)` + memory router 打穿——断言「无 active 且零组织 → 呈现申请入口 + 提交打 `/tenants/applications` + 回执 pending」+「邀请加入引导可达 invitations」。

## 3. 实施次序（审计 GO 后）

O-1 前端 onboarding 面板接线（申请 + 邀请双出路）→ O-2 前端镜测（只增不减）→ O-3 实机对拍（注册新号→无租引导→提交申请→pending 回执→平台侧可见·`pnpm run ci` 全绿）。**后端补项仅在 O-1 实勘发现自助读回不可达时才立项，不夹带**。

## 4. 审计记录

> 无已审方案不写码。前端行为改动 → 人签核；若纳入 §4-① 违宪项则触宪法、须明确签核。

- 结论：**已审计 GO**（人令选 GO 未决项「按推荐档你定」·Agent 自裁·问责归人）。
- 未决项（已裁·均采推荐档）：
  1. **[高危] 是否放开「注册即自动建活跃组织」** → **拒绝**（保持 S4 FR-1 审批制）：本实现仅走 `POST /tenants/applications` 落 `pending_approval`·无自动活跃建租路径，`allowUserToCreateOrganization:false` 仍在册。
  2. **引导呈现位置** → 内嵌 Dashboard 空态（`index.tsx` 订阅段 `!hasActiveTenant && tenants.length===0` 分支渲 `TenantOnboardingPanel`·替 A 片纯文案死胡同）。
  3. **申请回执强度** → 静态 pending 提示（MVP）：`useAction.run` successMessage「已提交，等待平台审批。」经 `Feedback` role=status 呈现；**未**新增后端读端点（零后端改动·推荐保守）。
  4. **邀请出路** → 纯文案 `Link to="/invitations"` 引导至既有页（零新页·不接线动作）。
- 实施回执（O-1）：`index.tsx` 新 `TenantOnboardingPanel`（复用基元 `Field`/`FormWrap`/`SubmitButton`/`Feedback`·非重造 input）·loader 未改（零租户仍不打订阅）。typed：`POST /api/v1/tenants/applications` 已在 `@saas/api-client` 在册（`CreateTenantApplicationDto{name,slug}` → `TenantApplicationResponse{organizationId,status}`）。
- 镜测回执（O-2）：`index.bootstrap.test.tsx` 第 4 测改写为「零组织→onboarding 面板（申请按钮 + 邀请链接）」+新增第 5 测「提交申请→POST 打 /tenants/applications·body name+slug·role=status 显 pending」·4→5 tests·**ci 615→616/31（只增不减）**·web tsc EXIT=0·Biome 净。
- 审计人 / 日期：人令 GO（2026-10-19）·Agent 自裁推荐档

## 5. 完成判据（可核验 + 穷尽）

- [x] 无 active 且零成员组织的新注册号 → Dashboard 呈现 onboarding 面板（申请入口 + 邀请引导），替 A 片纯文案死胡同（`index.tsx` `TenantOnboardingPanel`）。
- [ ] 提交申请 → `POST /api/v1/tenants/applications` 201 → 就地显 `pending_approval` 回执；平台侧 `platform.tenants` 出现该 pending 行（对拍）。
- [x] 邀请出路引导至既有 `invitations` 页可达（`<Link to="/invitations">`·接受后成 member·下次登录 A 片自动落租）。
- [x] 前端镜测（`vi.mock` + memory router）钉上述分支；基线只增不减；`pnpm run ci` 全绿（616/31）·web `tsc --noEmit` 净·Biome 净。
- [x] **S4 审批制未被绕过**（无「注册即活跃 org」路径·`allowUserToCreateOrganization:false` 仍在册）；schema 迁移/契约制品**零触动**（前端单文件 + 测·无后端改动）。
- [ ] 实机浏览器对拍（若归人验收同前端切片范式，诚实标注）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：零组织新注册 onboarding 缺口——取证坐实「合规自助建租后端通道在册·前端未接线」（非违宪改造）·前端接线为主方案 + 4 条未决项（含高危违宪项建议拒绝）·待审计 |
| 2026-10-19 | 0.2.0 | 审计门 | 人令 GO·未决项采推荐档：①拒绝自动建活跃 org（保 S4）②内嵌空态③静态 pending④纯文案邀请引导 |
| 2026-10-19 | 0.3.0 | 实施 | O-1 前端接线（`TenantOnboardingPanel`·复用 forms 基元）+ O-2 镜测 4→5（ci 615→616/31·web tsc EXIT=0·Biome 净）；O-3 实机浏览器全链对拍归人验收 |

结论：**已实施·待人类浏览器验收**（单测 + L1 全绿 616/31；实机全链对拍同前端切片范式归人）。
