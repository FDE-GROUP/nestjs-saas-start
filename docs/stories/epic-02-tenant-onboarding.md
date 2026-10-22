# Epic 02 · 租户准入（申请 · 审批 · 失能）

> 旅程: 一个用户如何申请开租户、平台如何审批放行/驳回、未放行前如何 fail-closed 失能 | 上下文: `tenants`（申请/审批切片 + 生命周期状态机）
> 审批制准入（S4·FR-1）：自助即时开通在 BA 层封死（`allowUserToCreateOrganization:false`），建租唯一通道 = 服务端系统动作。状态机 `pending_approval → active ⇄ suspended → deleted`（纯函数 `canTransition`·`tenant-lifecycle.ts`·迁移表 `TRANSITIONS`）。
> 版本: 0.2.1（2026-10-21·溯源去内联行号）

---

### 2.1 申请创建租户
- **作为** 已登录用户（申请人），**我想** 提交建租申请，**以便** 拥有一个待审批的新租户，我自动成为首名 owner。
- **验收**：
  - Given 有效会话，When `POST /tenants/applications`（name+slug），Then 经服务端系统动作建 `organization` + 户籍行 `tenant.status=pending_approval`，返回申请视图（201）。
  - Given 此刻无 active 租户，When 访问该端点，Then 可达（类级 `@TenantExempt`·鸡生蛋合法无租户）。
  - Given 申请人，When 建租成功，Then 经 BA 原生成首名 `owner`（FR-12 保底）。
  - **重提/幂等边界（as-built）**：幂等仅按 `organizationId`（`em.upsert`），而每次成功 `createOrganization` 生成**新** orgId ⇒ **无「每用户仅一 pending 申请」去重**，换 slug 即可再开一个 pending 租户。**相同 slug** 则被拦——BA `createOrganization` 应用层 `findOrganizationBySlug` 查重→抛 `ORGANIZATION_ALREADY_EXISTS`（400）；但**本仓 DDL 未给 `organization.slug` 建唯一约束**（migration 仅 `slug text not null`，对比 `workspace` 有 `(orgId,slug)` 复合唯一），去重纯赖运行时 find-then-insert、**非原子**（并发同 slug 双申请理论上可竞态重复·此面属推断/未穷证）。
- **溯源**：`POST /api/v1/tenants/applications` · `TenantsController.apply`（`tenants.controller.ts`·类级 `@TenantExempt`+`SessionGuard`+`@HttpCode(201)`）· `SubmitTenantApplicationCommand` → `MikroTenantProvisioningRepository.submit`（`auth.api.createOrganization` 服务端动作 + `em.upsert(Tenant,{status:PENDING})`）· BA 查重 `findOrganizationBySlug`（`better-auth/plugins/organization` `crud-org`）· 契约 `createTenantApplicationSchema`/`tenantApplicationViewSchema` · 关联 [`global-tenancy`](../plans/global-tenancy.md) S4 / [`global-tenant-entity-reclamation`](../plans/global-tenant-entity-reclamation.md)。

### 2.2 审批通过（激活）
- **作为** 平台经营者，**我想** 批准一个待审租户，**以便** 它转 `active` 并真正可用。
- **验收**：
  - Given operator 身份 + 目标为 `pending_approval`，When `POST /tenants/applications/:id/approve`，Then 状态迁移 `→ active`（`TenantStatusService.transition` 单点），租户业务路由随即放行；落结构化审计（`logTenantGovernance('approve', from, to)`·FR-6）。
  - Given 非 operator，When 调用，Then 403（`PlatformOperatorGuard`·跨租治理判据）。
  - Given 租户不存在，When 调用，Then 404（`TENANCY_APPLICATION_NOT_FOUND`）。
  - **非法迁移 409 的精确域**（迁移表实证·非推断）：`pending_approval→active`、`active→active`（幂等重批·设计保留）、`suspended→active`（复活）皆**合法**；**仅 `deleted` 终态**（`TRANSITIONS[DELETED]=[]`）触发 409 `TENANCY_ILLEGAL_TRANSITION`。
  - **成功码 as-built 注**：approve 路由**未设 `@HttpCode`** ⇒ Nest 对 POST 默认返回 **201**（语义存疑·宜 `@HttpCode(200)`；此处如实记录现状）。
- **溯源**：`POST /api/v1/tenants/applications/:id/approve` · `TenantsController.approve` · `ApproveTenantCommand` → `governedTenantTransition`（S4 修宪·approve/suspend/resume 三分支收敛共用用例）· `TRANSITIONS`（`tenant-lifecycle.ts`）· `@UseGuards(PlatformOperatorGuard)` · 关联 [`global-tenancy`](../plans/global-tenancy.md) S4/S5。

### 2.3 驳回申请（硬删）
- **作为** 平台经营者，**我想** 驳回不合格的申请，**以便** 清理掉不该存在的 pending 租户。
- **验收**：
  - Given operator + 目标**恰为 `pending_approval`**，When `POST /tenants/applications/:id/reject`，Then **物理硬删** `organization` 行（FK `onDelete:cascade` 级联清 `member`/`invitation`·pending 期零业务数据），返回 204（无返回体）。
  - **硬删 ≠ 置 `deleted` 态**：reject 是不可逆物理移除，审计记 `to:DELETED` 仅是「移除」标签，该租户从不进入 `deleted` 生命周期态。
  - Given 目标为**非 pending 的已知名**（active/suspended/deleted），When 调用，Then **409 `TENANCY_NOT_PENDING`**（S5 收紧：生效租的暂停/删除走平台治理端点，见 [Epic 07](./epic-07-platform-governance.md)·reject 只管未通过的申请）。
  - Given 非 operator，When 调用，Then 403；租户不存在 Then 404。
  - **硬删成功产 `tenant.rejected` 耐久事件**（同事务 `uow.run`）：org 行物理消失后，这是「存在过并被驳回」的唯一可追溯痕迹（not-found/409 零发）。
  - **诚实观察（边角·未穷证）**：`read` 对「不存在」与「无 `tenant.status` 行的存量」都返 undefined、无法区分 ⇒ undefined **绕过 409 检查**交 `remove` 谓词——若 org 行实存（历史/seeded 无 status 行）则被删成 204（与中间件「无行视同 active」方向相反）。收权案回填 status 后理论罕见。
- **溯源**：`POST /api/v1/tenants/applications/:id/reject` · `TenantsController.reject`（`@HttpCode(204)`）· `RejectTenantCommand` → `RejectTenantCommandHandler`（S5 收紧 + `provisioning.remove` + `TenantRejectedEvent` 同事务）· `mikro-tenant-governance.repository`/provisioning `remove`（`nativeDelete`·FK 级联）· 关联 [`global-tenancy`](../plans/global-tenancy.md) S4/S5（驳回语义）。

### 2.4 待审/失能租户的业务路由 fail-closed
- **作为** 平台，**我想** 未通过审批（或被暂停/删除）的租户其业务路由一律不可用，**以便** 审批制与失能语义闭环（deny-list）。
- **验收**：
  - Given 租户处于 `pending_approval/suspended/deleted`（`isTenantBlocked` deny-list），When 其成员访问需 active 租户的业务路由，Then `TenantMiddleware` **不绑定**该租户上下文 → 全局 `TenantScopeGuard` 无 tenantId → 403（`TENANCY_NO_ACTIVE_CONTEXT`·wire 值 `TENANCY:NO_ACTIVE_CONTEXT`·401 先于 403）。
  - **双层失能汇于同码 403**：中间件先查**用户层** `userStatus.isBlocked`（暂停用户 → 不绑任何身份/租户）再查**租户层** `tenantStatus.isBlocked`（deny-list 态）；任一层命中都塌成「无 tenantId → 403」。（落点区别于 [Epic 01 §1.7](./epic-01-authentication.md)：会话墙出 401/403，此处是租户墙 403。）
  - **态读取异常亦 fail-closed**：`TenantMiddleware` 对读态 `.catch(() => bind(undefined))`——租户状态不可解析（如 DB 抖动）时按失能处理（宁误拦不漏放）。
  - Given 无户籍行（存量/seeded），When 解析，Then 视同 `active` 不拦（deny-list 缺省）。**fail-open 依据**：`organization` 本体无行则下游租户解析早已 fail，故「无状态记录 → 不拦」仅在「有 org 无 status 行」的窄边界生效（收权案 `tenant.status` 回填后基本抹平），与 fail-closed 隔离不矛盾。
- **溯源**：`TenantMiddleware`（`libs/core/src/tenancy`·双层 isBlocked + catch fail-closed）· `TenantScopeGuard`（`!tenantId → 403`）· `isTenantBlocked`（deny-list {pending,suspended,deleted}）/ `isActive`（allow-list·仅 active）双谓词并存（`tenant-lifecycle.ts`）· `UserStatusService.isBlocked` / `TenantStatusService.isBlocked` 单源 · 关联 [`global-tenant-entity-reclamation`](../plans/global-tenant-entity-reclamation.md)（`tenant.status` 真列）/ [`module-rbac-casl`](../plans/module-rbac-casl.md)。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论后校正：2.1 补重提/幂等边界（无每用户去重·换 slug 可再申请·相同 slug 靠 BA 应用层拦而 DDL 无唯一约束·并发非原子属推断）；2.2 依迁移表更正 409 精确域（仅 deleted 终态·active→active 幂等重批合法·suspended→active 复活合法）+ 补 approve 结构化审计 + 如实标注成功返 201；2.3 补 S5 收紧（仅 pending 可驳·非 pending→409 TENANCY_NOT_PENDING）+ 物理硬删 FK 级联（硬删≠置 deleted 态）+ `tenant.rejected` 事件 + 「无 status 行可被删成 204」诚实观察；2.4 补双层失能汇于同码 403 + 态读取异常 fail-closed + deny/allow 双谓词与 fail-open 依据。v0.2.1（2026-10-21）：2.4 溯源去除内联行号（原 `L69`/`L84`）——符号 `userStatus.isBlocked`/`tenantStatus.isBlocked` 已足以锚定，行号属易漂移引用（承「溯源只用文件名/方法名」纪律）。
