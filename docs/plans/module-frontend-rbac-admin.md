# 前端 F3 · RBAC 角色管理与授权面：apps/web 租户权限治理自助 UI（已审·实施稿）

> 适用范围: `模块(apps/web · 前端 RBAC 管理面)` | 受众: 人（审计/裁点）
> 关联: `global-frontend-adoption` §2.2-F2（已结项） · `module-frontend-tenant-console`（F2a/F2b·本片续接） · `specs/vision.md` §4 第 7 支柱「人的界面」 · `specs/tooling-standards.md` §4.12 · `specs/architecture.md`（apps/web 落位）
> 性质: 首版（总纲已批 F2→F3 串行落地稿·不改已批措辞）
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**起因·全量对拍拓出基线漂移（2026-10-18 代码取证）**：呈「后端 46 op vs 前端消费面」对拍时，以 plan §5 勾选框为「已消费」基线会**系统性低估**——`docs/plans/README.md` 记 tenant-console 为「F2a 已实施·F2b 待下环」，但 `git status` 坐实 **F2b + PIPL + register + invitations 系未提交 working-tree WIP**（`settings.account.tsx` 等 `??` 未跟踪 + 多文件 `M`），实际前端已消费 ≈24 op（20 Nest + 4 BA），非 17。铁律「以代码为准」→ 基线以 `grep apps/web/src` 坐实，非勾选框。

**RBAC 面勘察实据（代码实存）**：

- 后端 `AuthorizationAdminController`（`apps/api/src/modules/authorization/api/authorization-admin.controller.ts`）7 op：
  - `GET /tenants/roles` → `TenantRoleView[]`（id/key/name/isSystem）
  - `POST /tenants/roles`（`CreateRoleDto{key,name}`）· `POST roles/rename`（`{key,name}`）· `POST roles/delete`（`{key}`）
  - `GET /tenants/roles/grants?roleKey=X` → `TenantRoleGrantView[]`（subject/action/conditions）
  - `POST /tenants/roles/grants`（`GrantRolePermissionDto`）· `POST grants/revoke`（`RevokeRolePermissionDto`）
- 全 7 op 已在 `packages/api-client/src/schema.d.ts` typed（`openapi.yaml` L168-347）→ **后端零改动**。
- Subject 枚举 6 值：`Organization|Member|Invitation|Workspace|Role|RoleGrant`；Action 5 值：`create|read|update|delete|cancel`；矩阵 = 6×5 = **30 cell**。
- 可复用基建（F2 已趟通）：`lib/api.ts`（typed client 单例）・`lib/mutation.ts`（`useAction`·pending/error/success）・`lib/session.ts`（`requireSession` deny-by-default）・`lib/format.ts`（`describeApiError`/`errorCodeOf`）・`components/{forms,panels}.tsx`・raw Tailwind 无整库。

**目标**：租户管理员在 web 上**看见并操作**角色列表（增/改名/删自定义角色）与**权限矩阵**（授予/撤销 subject-action cell），全程经 `@saas/api-client` typed 消费，deny-by-default 与后端 CASL 同向。

**非目标**：不做平台运营面（D 面·`platform/tenants`・`platform/users` 治理·另片·见 §2.4 裁点⑥）；不做 storage/payment/posts/订阅变更/租户申请（各另片）；不改后端运行时/schema/迁移；不引整组件库；不做 instance-level `conditions` 编辑（裁点③）。

## 2. 方案

### 2.1 切片策略

单片全包（角色 CRUD + 权限矩阵一起·裁点①甲）：A1+A2 共享 roleKey 概念、UI 强耦合（列表行点进矩阵），体量 2 页 + 1 组件 ~420 行，一个审计窗口可吃完。

### 2.2 路由与页

| 路由 | 功能 | 消费 op | 形态 |
|---|---|---|---|
| `/settings/roles`（`settings.roles.tsx`） | 角色列表 + 新建/改名/删除 | GET/POST roles·rename·delete | 表格（key·name·isSystem 标记）+ 行内改名/删除 + 顶部创建 + 链至矩阵 |
| `/settings/roles/$roleKey`（`settings.roles.$roleKey.tsx`） | 权限矩阵授予/撤销 | GET/POST grants·grants/revoke | 6×5 grid checkbox·勾选=grant·取消=revoke |

- 两页 loader 首行 `requireSession()`（deny-by-default）；`$roleKey` loader 额外取 `GET roles` 校验 roleKey 存在（防 ghost → notFound 面板）。
- 系统角色（`isSystem`）改名按钮 disable + title 提示「系统角色受保护」（前端防御 + 后端 409 `TENANCY_ROLE_SYSTEM_PROTECTED` 兜底双保险）。

### 2.3 数据流（复用既有基建）

- 读侧：router loader → `api.GET('/api/v1/tenants/roles')`（typed array·取 `data?.data`）；矩阵页并行取 `grants?roleKey=X`。
- 写侧：`useAction.run` → thunk 调 `api.POST(...)` → 成功 `router.invalidate()` 重载矩阵 / 失败 `describeApiError` + `errorCode` 展示。
- 矩阵 toggle：勾→grant（`conditions` 省略·whole-subject）· 取消→revoke（`conditions` 省略→服务端 `?? null` 撤整 subject 行）；`pendingCell` 本地态灰格防连点竞态。
- 枚举 SSOT：`TenantSubject/TenantAction` 联合类型取自 `components['schemas']['GrantRolePermissionDto']`；运行时 `SUBJECTS/ACTIONS` 数组以 `readonly TenantSubject[]` 注解约束元素合法（后端枚举增值编译期拓红）。

### 2.4 待裁点（本稿附推荐档·呈审时逐条裁·未裁不动）

- **① 范围切法**：甲 = 单片全包（推荐）；乙 = 分 F3a 角色 CRUD / F3b 矩阵两片串行。
- **② 矩阵展示形态**：甲 = 6×5 扁平 grid checkbox（推荐·一屏可见）；乙 = 按 subject 分 6 section。
- **③ conditions 深度**：甲 = 仅 whole-subject（conditions 省略/null·推荐）；乙 = 兼支持 instance-level（需 JSON 编辑器·体量膨胀）。
- **④ 枚举词汇来源**：甲 = 从 api-client schema 派生（推荐·单源）；乙 = 前端手抄常量。
- **⑤ 矩阵 toggle 模式**：甲 = toggle 即调 mutation·pending 灰格（推荐·对齐 useAction）；乙 = 编辑态 + 批量保存（需 diff tracking）。
- **⑥ 平台运营面归属**：甲 = 维持「另片·不入本片」（推荐·承 F2 已批非目标）；乙 = 纳入同片。

## 3. 影响面与风险

- **blast radius**：仅 `apps/web/src`——新增 `routes/settings.roles.tsx`・`routes/settings.roles.$roleKey.tsx`・`components/rbac-matrix.tsx`（+2 测文件）+ `routeTree.gen.ts`（插件自动重生）+ `__root.tsx` 导航加一行 Link。**不改**后端运行时/schema/迁移/Dockerfile/compose/husky/commitlint/docs/specs。
- **顺路卫生修正（非本片功能·登记）**：`settings.account.tsx` 系前序 WIP 未过 Biome 的既存格式违规（全仓 `check` 唯一红项），本片刻意仅做 **whitespace-only** Biome 格式修正以保 L1 门禁全绿，零语义改动。
- **命中高危清单**：无（前端模块面·非宪法/非门禁/非 schema）。
- **主要风险**：① 矩阵连点竞态——pendingCell 期禁用该格缓解；② conditions=null revoke 语义 = 撤整 subject 级行，若库存多 conditions 行会撤不净——裁点③甲已隔离（本片仅产 whole-subject 行·不触 instance-level）。
- **回滚**：全可逆——删 5 新文件 + 还原 `routeTree.gen.ts`/`__root.tsx` 即净；后端与 api-client 制品零触动。

## 4. 审计记录

> 无已审方案不写码。跨前后端消费面 → 人签核。

- 结论：**已审计·放行**——人经 CreatePlan 批准本方案（2026-10-18），即刻实施。待裁点①–⑥ **按方案内推荐档（甲）全采**；诚实标注：批准为整体「同意」，非 §2.4 逐条 AskUserQuestion 单独裁（若需逐条重裁，撤回本行按未裁处理）。
- 未决项：无（平台面 D 按裁⑥甲维持另片；instance-level conditions 按裁③甲排除本片外）。
- 审计人 / 日期：人 / 2026-10-18。

## 5. 完成判据（可核验 + 穷尽）

- [x] §2.4 待裁点按推荐档获人批准（CreatePlan 整体同意·2026-10-18）
- [x] `/settings/roles` typed 角色列表 + create/rename/delete 落地·系统角色改名/删除 disable
- [x] `/settings/roles/$roleKey` 6×5 矩阵 checkbox 渲染·toggle → grant/revoke·成功 invalidate 重载·失败 errorCode/message 反馈
- [x] 组件测覆盖：`settings.roles.test.tsx`（RolesView typed 渲染/空态/缺省·+3）+ `rbac-matrix.test.tsx`（30 cell/whole-subject 勾选/instance-level 不计/toggle 回调/pending 禁用·+6）= **+9 测**
- [x] `pnpm run ci` L1 全绿（Biome 433 文件净·**554 → 567 passed / 31 skip / 99+9 files** 基线只增不减·fallow 无越界）
- [x] 后端零改动（`git status` 无 `apps/api`·`libs/core`·`packages`·`openapi` 变更）·契约锁测仍绿
- [ ] dev 反代真跑端到端（起 DB+后端+登录态·**归人类验收执行**·非 DB-free 组件测所能覆盖·操作手册见 [docs/frontend-dev-proxy-runbook.md](../../frontend-dev-proxy-runbook.md)）
- [ ] 提交（高危归人·Agent 未自 commit·建议见交付说明）
- [ ] 人类验收

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-18 | 0.1.0 | 全量对拍拓出前端基线漂移（实际 ≈24 op 非 17）·RBAC 面零消费无已审 plan → 起草呈审 | 首版呈审：后端 7 op typed 实据 + 前端可复用基建勘察 + 路由/矩阵设计 + 六待裁点 |
| 2026-10-18 | 0.2.0 | 人 CreatePlan 批准（推荐档全采）→ 即刻实施 | 落 F3 全片：rbac-matrix.tsx + settings.roles.tsx + settings.roles.$roleKey.tsx + 2 测 + __root 导航 + routeTree 重生；L1 554→567 绿；§4 翻「已审计·放行」（诚实标注整体同意非逐条裁）；顺路 whitespace-only 修 settings.account.tsx Biome 既存违规（登 §3）。 |

---

<!-- 变更戳 -->
正文已于 2026-10-18 / v0.2.0 更新（**F3 已实施·待人类验收**——typed 接线+两页+矩阵组件+9 测落·L1 567/31 只增不减·后端/契约制品零触动；dev 反代真跑 + 提交 + 人类验收待下环）；发现登 §6 不入正文。
