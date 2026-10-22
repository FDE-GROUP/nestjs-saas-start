# global-userfacing-tenant-naming：用户面术语单源（组织/工作区）+ 术语 SSOT 聚合措辞对账

> 适用范围: `全局`（前端文案 + `docs/specs` 术语条款 + 术语 SSOT 对账·**零 schema、零路由 slug、零机制命名**）← blast radius 中等，但触 `docs/specs` 术语纪律=高危#5，随签
> 关联: `specs/architecture-zh.md` 术语纪律段 · `specs/glossary.md` §1 · [global-tenant-entity-reclamation](./global-tenant-entity-reclamation.md)（本案**不翻**其已裁定位）· [global-tenancy](./global-tenancy.md) 术语纪律
> 性质: 新起（候选稿·待审计门）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 0. 概览（TL;DR）

本案**只处理两件事**，且都以「正名已在、执行未齐」为前提：

- **议题①｜用户面术语单源**：确立「**用户可见面一律称『组织』（顶层）/『工作区』（二级），『租户 / Tenant』收敛为内部领域与机制词、禁止外泄到用户文案**」。取证显示宪法/领域层「租户=业务概念」**已定**，但**呈现层无任何译名规则**，且前端已出现**同屏混用**（同一 dashboard 组件既写「我的租户」又写「申请创建组织」）。
- **议题②｜术语 SSOT 措辞漂移对账**：`architecture-zh` 术语纪律段称 Tenant 为「`tenants` 核心域**聚合**」，而 `glossary` §1 明写其「**系存储实体·非 DDD 聚合回归**（record+port+function 三件套）」——两份同为准 SSOT 却在「是不是聚合」上**互斥**，须按收权案口径统一。

**明确不动（防被误读为又要翻 schema）**：`tenant` 户籍表维持、`organization` 作认证/成员面投影的定位维持、schema/迁移/路由 slug（`/api/v1/tenants/*`）/DI/`tenancy/` 机制命名/OpenAPI/api-client/错误码 `TENANCY_*` 一律不改。议题① 只做「内部领域名 ↔ 用户可见标签」的**单向呈现翻译**，非模型/存储变更。

## 1. 背景与目标

### 1.1 缘起（对话在案）
用户按「设计合理优先·过时/不合理条款须及时修正」原则推进，追问链：行级隔离 → 租户=组织 → 租户管理=组织管理 → BA 契约面纪律是否自定 → **多租户是开发者术语、用户只懂「组织」，在组织上再加「租户」致心智混乱**。复核宪章后确认：收权案切片 C + glossary 0.2.0 **已把「Tenant 拥有自有表·organization 为其投影」正名成文**（前几轮讨论所批的「主从说反」系收权案**之前**的旧叙事，非现文），故「留表 + 正名」是**现状**、不入本案。真正未裁的是**用户面译名**与**两处措辞漂移**。

### 1.2 目标
- G1：用户可见面（前端渲染文案、导航标签、面向终端用户的提示）术语单源 = 组织 / 工作区；「租户」退出用户面。
- G2：把「内部领域词 Tenant/租户 ↔ 用户面标签 组织」的映射确立为一条**呈现层译名纪律**写入 `docs/specs`（防后续新增 UI 再漂移）。
- G3：消除 `architecture-zh` ↔ `glossary` 在「Tenant 是否聚合」上的 SSOT 冲突，统一为收权案口径。

### 1.3 非目标（锁）
- 不改 HTTP 路由 slug、DTO、错误码、OpenAPI、`api-client`（用户基本不见 URL slug；改名 blast radius 大、用户收益小）。
- 不改后端领域/机制命名（`TenantScopeGuard`、`tenantId`、ALS、`tenancy/`、`tenant.status`）——「租户」作**内部领域语言**是精确且业界通用的，本案只禁其进**用户文案**。
- 不翻收权案已裁的结构与定位。

## 2. 方案（垂直切片·可独立验证）

- **切片 A｜宪法增条（呈现层译名纪律）**：在 `architecture-zh`（及 EN 镜像）术语纪律段追加一条——「**租户/Tenant 为内部领域与机制词；用户可见面（UI 文案/导航/终端用户提示）统一用『组织』（顶层单元）、『工作区』（二级分组）**；二者一一对应，翻译只发生在呈现层」。**纯文档·高危#5 随签**。完成判据：±zh 两版成文且互指同一 SSOT、不与既有「租户=业务概念」条冲突（后者是**领域内部命名**，前者是**呈现层标签**，两回事）。
- **切片 B｜前端用户面文案统一**：把 `apps/web` 受守卫路由里**渲染给用户的**「租户」字面量改为「组织」，并消除同屏混用。取证泄漏点（初查·**实施前须全量 grep 前端 `.tsx` 字面量**，注意本仓 i18n 仅覆盖邮件+校验、UI 文案为硬编码中文）：
  - `routes/index.tsx`：SectionHeading「我的租户」→「我的组织」；按钮「切换到此租户」→「切换到此组织」；`EmptyPanel`「尚无活跃租户，请在『我的租户』切换到一个组织」→「尚无活跃组织，请在『我的组织』中选择一个」；`SubscriptionView`「当前租户尚无生效订阅」→「当前组织尚无生效订阅」。（`TenantOnboardingPanel` 已用「组织」·作正例保留。）
  - `routes/index.test.tsx`：断言文案随上同步（「当前租户…」→「当前组织…」）。
  - **导航标签**（`routes/__root.tsx`）：`Workspaces`（英文·与全中 UI 不一致）→「工作区」；确认无其它「租户」字面泄漏（平台运营入口标签现为「平台运营」·不含租户·OK）。
  - 完成判据：`grep -rn "租户" apps/web/src` 在**渲染文本**层面为 0（注释/类型名允许保留「租户/TenantOrg」等内部命名·见 D1 裁点）。
- **切片 C｜措辞对账（议题②）**：把 `architecture-zh` 术语纪律段「`tenants` 核心域**聚合**」对齐 `glossary` §1 / 收权案的「**存储实体·非 DDD 聚合回归**（内核=record `TENANT_STATUS`+port `TenantStatusStore`+function `canTransition`）」。取**修订 architecture 侧措辞**（因收权案与 P1「减聚合」一致·聚合口径为旧残留），加演变注不改史。完成判据：两份 SSOT 对 Tenant 的聚合性表述一致。

## 3. 影响面与风险

- **blast radius / 可逆性**：全为**呈现层文案 + 文档条款**，可逆；**无 schema 迁移、无路由/API 变更、无 DI**。命中高危清单仅 **#5（改 `docs/specs` 公共契约/术语条款）** → 人签后行。
- **R1（前端文案 ≠ 后端契约）**：只改 `.tsx` 渲染字符串与对应组件测试断言，**不碰** API path/`organizationId` body 字段/错误码——须显式核对不误改请求体键名（如 `body: { organizationId }` 是 wire 契约、禁改）。
- **R2（闸缺失→再漂移）**：无机制防「新增 UI 又写租户」。缓解见 D2（可选加 grep 恒等闸）。
- **回滚**：文案与文档改动 revert 即可，无数据/接口影响。

## 4. 归人裁点（审计门输入·不代裁）

- **D1**：切片 B 收敛范围——(甲) 仅改**渲染文案**、保留 `TenantOrg`/`tenant` 等**内部标识符与注释**（建议·改动最小·不触类型/API）；(乙) 连前端类型/变量名一并 `tenant→organization` 重命名（blast radius 更大·收益仍仅内部一致性）。
- **D2**：是否新建 **grep 恒等闸**（如 `verify-userfacing-naming.ts`·扫 `apps/web` 渲染文本禁「租户」·入 `ci`）长期防漂移（建议：本案先立**软约定**+评审面把关，闸留待触及再另立小 plan·避免本案夹带改门禁=高危#另签）。
- **D3**：平台运营后台（面向 operator·路由 `/platform/tenants`·现入口标签「平台运营」）其列表页内部若现「租户」文案，是否也统一「组织」——(甲) operator 面同样统一（建议·全用户面单源）；(乙) operator 面保留「租户」（视 operator 为半技术受众）。
- **D4**：议题② 以哪份为准——(甲) 采 `glossary`/收权案「存储实体·非聚合」·修 architecture 措辞（建议）；(乙) 反向。

## 5. 审计记录

> 无已审方案不写码。本案触 `docs/specs` 术语条款=高危#5 → 人签核。

- 结论：**GO·已签核**（人 2026-10-23 令「同意」= 整案 GO + D1–D4 全采建议档：D1 甲·仅改渲染文案保留内部标识符 / D2 本案先软约定不加 grep 闸 / D3 甲·operator 面亦统一「组织」 / D4 甲·采 glossary「非聚合」为准修 architecture。切片 A 触 `docs/specs` 术语条款=高危#5 随此「同意」亲签。）
- 未决项：无（D1–D4 已裁）。高危问责归签核人。
- 审计人 / 日期：人（同意·整案 GO·四裁点全采建议档·高危#5 亲签）/ 2026-10-23

## 6. 完成判据（实施后回写·带取证）

- [x] 切片 A：`architecture-zh` + EN 镜像呈现层译名条成文、两版一致、不与「租户=业务概念」条冲突（中文「用户面译名纪律」条 + EN `presentation-layer naming` 条互指同一 SSOT·后者明标领域内部命名 vs 呈现层标签为两回事）。
- [x] 切片 B：`grep 租户 apps/web/src` 残留 13 处**全部为 jsdoc/行内注释、类型/函数标识符（`TenantRowLink`/`TenantSwitchSection`）、路由 slug（`/tenants`）、`describe/it` 测试标题**——**渲染文本层泄漏 = 0**（D1 甲：内部标识符/注释按纪律保留）。泄漏点较 §2 初查更多，已全量收敛：`index.tsx`、`workspaces.tsx`（含所属租户→所属组织、英文 `Workspace→工作区`）、`posts.tsx`、`settings.members.tsx`、`settings.roles.tsx`、`settings.billing.tsx`（无活跃租户上下文→组织）、`__root.tsx`、`platform.tsx`（导航「租户治理→组织治理」）、`platform.tenants.tsx`/`.tsx.$id`（operator 面 D3 甲：治理/空态/不存在/驳回确认/软删确认/返回列表/组织 ID）、`tenant-context-guide.tsx`、`billing-panels.tsx`、`platform-tenants.tsx`、`rbac-matrix.tsx`（`Organization` 标签 `'租户'→'组织'`）。对应组件测断言全部同步（`index.test`/`index.bootstrap.test`/`workspaces.test`/`posts.test`/`settings.members.test`/`settings.roles.test`/`platform.tenants.test`/`tenant-admin-guide.test`·含 L16/L20 与 guide 测正则解耦同步）。**误改检查**：请求体 `organizationId` 等 wire 键与 API path（`/api/v1/tenants/*`）零改动。
- [x] 切片 C：`architecture-zh` 与 `glossary` 对 Tenant 聚合性表述一致（两份均落「存储实体·非 DDD 聚合回归·record+port+function 三件套」·architecture 侧措辞按 D4 甲修订并加演变注）。
- [x] `pnpm run ci` 全绿：check(Biome) → build → **Vitest 885 passed | 52 skipped**（含 web 组件测 32 文件 / 160 tests）→ type-escape / openapi 对拍 → fallow `no boundary violations` → `Local CI PASSED`。零 schema 变更·未触 migrate。

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-23 | 0.1.0 | 用户循「行级隔离→租户=组织→契约纪律→用户面心智」追问，复核宪章确认「正名已由收权案成文」、真正缺口=用户面译名单源 + 措辞漂移 | 起草候选：议题① 用户面术语单源（切片 A 宪法增条 / B 前端文案 / 导航）+ 议题② 聚合措辞对账（切片 C）；四归人裁点 D1–D4；明确排除 schema/路由 slug/机制命名/翻收权案 |
| 2026-10-23 | 0.2.0 | 人令「同意」= 整案 GO + D1–D4 全采建议档（高危#5 亲签）·进入实施 | 三切片落地：A ±zh 呈现层译名条成文；C architecture 聚合措辞对齐 glossary 非聚合；B 全量收敛前端渲染文案「租户→组织」/英文 Workspace→工作区（含 operator 面 D3 甲·泄漏点较初查更多·逐项同步组件测断言）。§6 完成判据回写带取证·`pnpm run ci` 全绿（885 passed）。README 行状态翻正 |

---

<!-- 变更戳 -->
正文已于 2026-10-23 / v0.2.0 实施完成（三切片落地·§6 判据全绿·`pnpm run ci` PASSED）。
