# Epic 07 · 平台治理

> 旅程: 平台经营者如何跨租户查看与治理租户/用户生命周期 | 上下文: `platform`（租户治理面 + 用户治理面）
> 平台级唯一权威（FR-11①/FR-13）：每路由 `@UseGuards(PlatformOperatorGuard)`——判据 = 会话用户 DB email 命中 `platform.operatorEmail`（seed 全局唯一 operator·不由他人任命），**与租户内任何角色无关**（租户 owner 不打平台端点照样 403）。治理面刻意**不绑租户作用域**（跨租·类级 `@TenantExempt`）；生命周期迁移全经 `OrganizationStatusService.transition` 单点 + 结构化审计行（FR-6）。
> 版本: 0.2.0（2026-10-20·逐条对照代码讨论后校正增补）

## 租户治理（`PlatformTenantsController`·`/platform/tenants`）

### 7.1 跨租户列出全部租户
- **作为** 平台经营者，**我想** 分页查看全平台租户及其生命周期状态，**以便** 总览治理。
- **验收**：Given operator 身份，When `GET /platform/tenants`（limit/offset/search），Then 返回带状态的租户页；Given 非 operator，Then 403。
- **溯源**：`GET /api/v1/platform/tenants` · `PlatformTenantsController.list` · `ListPlatformTenantsQuery` · 契约 `listPlatformTenantsQuerySchema`/`platformTenantPageSchema` · 关联 [`global-tenancy`](../plans/global-tenancy.md) S5。

### 7.2 查看单个租户详情
- **作为** 平台经营者，**我想** 查看某租户详情，**以便** 定位其状态与归属。
- **验收**：Given operator + 租户存在，When `GET /platform/tenants/:id`，Then 返回租户行；不存在 Then 404（`TENANCY_NOT_FOUND`）。
- **溯源**：`GET /api/v1/platform/tenants/:id` · `PlatformTenantsController.detail` · `GetPlatformTenantQuery` · 契约 `platformTenantRowSchema`。

### 7.3 查看租户诊断
- **作为** 平台经营者，**我想** 查看某租户的 member/invitation/workspace/post 计数，**以便** 评估其规模与健康。
- **验收**：Given operator + 租户存在，When `GET /platform/tenants/:id/diagnostics`，Then 返回诊断包；不存在 Then 404。
- **溯源**：`GET /api/v1/platform/tenants/:id/diagnostics` · `PlatformTenantsController.diagnostics` · `GetTenantDiagnosticsQuery` · 契约 `tenantDiagnosticsSchema`。

### 7.4 导出租户全量数据
- **作为** 平台经营者，**我想** 导出某租户六段自有数据（排除凭证），**以便** 迁移/取证（NFR-6）。
- **验收**：Given operator + 租户存在，When `GET /platform/tenants/:id/export`，Then 返回六段聚合 payload（credentials excluded）；不存在 Then 404。
- **溯源**：`GET /api/v1/platform/tenants/:id/export` · `PlatformTenantsController.exportData` · `ExportTenantDataQuery` · 关联 [`module-tenancy-data-export`](../plans/module-tenancy-data-export.md) / [`global-tenant-entity-reclamation`](../plans/global-tenant-entity-reclamation.md)（软删行保留供导出取证）。

### 7.5 暂停租户（active → suspended）
- **作为** 平台经营者，**我想** 暂停某活跃租户，**以便** 紧急失能其业务面（fail-closed）。
- **验收**：Given operator + 目标 `active`，When `PATCH /platform/tenants/:id/suspend`，Then `→ suspended`（deny-list 生效·成员业务路由失能）+ 审计行；非法迁移 Then 409；不存在 Then 404。
- **溯源**：`PATCH /api/v1/platform/tenants/:id/suspend` · `PlatformTenantsController.suspend` · `SuspendTenantCommand` → `OrganizationStatusService.transition` · `canTransition`（`organization-lifecycle.ts`）· 失能下游跨引 [Epic 02 §2.4](./epic-02-tenant-onboarding.md)（suspended→deny-list→业务路由 403）。

### 7.6 恢复租户（suspended → active）
- **作为** 平台经营者，**我想** 恢复被暂停的租户，**以便** 重新放行。
- **验收**：Given operator + 目标 `suspended`，When `PATCH /platform/tenants/:id/resume`，Then `→ active`；非法迁移 Then 409；不存在 Then 404。
- **溯源**：`PATCH /api/v1/platform/tenants/:id/resume` · `PlatformTenantsController.resume` · `ResumeTenantCommand`。

### 7.7 软删除租户（→ deleted 终态）
- **作为** 平台经营者，**我想** 软删某租户，**以便** 标记删除但保留行供导出。
- **验收**：Given operator，When `DELETE /platform/tenants/:id`，Then `→ deleted`（终态·行保留）；Given 已 deleted，Then 409（非法迁移）；不存在 Then 404。
- **溯源**：`DELETE /api/v1/platform/tenants/:id` · `PlatformTenantsController.remove` · `DeleteTenantCommand`（软删·`deleted` 拒任何后续迁移）。

### 7.8 硬删除租户（不可逆·FK 级联 + 事件清理）
- **作为** 平台经营者，**我想** 对已软删的租户执行硬删，**以便** 彻底清除数据（NFR-6·PIPL 补删）。
- **验收**：Given operator + 目标处于 `deleted` 终态，When `DELETE /platform/tenants/:id/permanent`，Then **两段式硬删**——① 先 `eventStore.deleteByAggregate('tenant', orgId)` 清事件得 `purgedEvents`；② 后 `nativeDelete(Organization)` 触发 FK cascade；返回 `{organizationId, purgedEvents}` 供审计核对；Given 非 `deleted` 终态，Then 409（须先软删）；不存在/已删 Then 404（幂等）。
  - **为何先清事件后删主行（防孤儿设计·handler 明文）**：补删失败时 org 仍在、可整请求重试；若反序则 org 已灭→后续 404 挡死、事件成**不可重试孤儿**。另有并发窗口：状态检查后被他人删→事件已清、主行已没→幂等回 404；失败的硬删尝试（not_deleted_terminal）也落审计行。
  - **级联表以实际 FK 为准（防枚举过时）**：真实级联集 = 所有 `FK→Organization` 行（已知含 member/invitation/workspace/tenant_subscription/post/tenant 户籍，**以及 Epic 04 的 `tenant_role`/`tenant_role_grant`/`tenant_role_audit`**）；handler 注释笼统称「五张子表」与逐项枚举有出入，**以 FK 定义为准、不锁个数**。
- **溯源**：`DELETE /api/v1/platform/tenants/:id/permanent` · `PlatformTenantsController.permanentRemove` · `DeleteTenantPermanentlyCommand` · 契约 `tenantHardDeleteResultSchema` · 关联 [`module-tenancy-hard-delete`](../plans/module-tenancy-hard-delete.md)。

## 用户治理（`PlatformUsersController`·`/platform/users`）

### 7.9 列出全平台用户及状态
- **作为** 平台经营者，**我想** 分页查看全平台用户及其生命周期状态，**以便** 治理账号。
- **验收**：Given operator，When `GET /platform/users`（limit/offset/search），Then 返回带暂停态的用户页；非 operator Then 403。
- **溯源**：`GET /api/v1/platform/users` · `PlatformUsersController.list` · `ListPlatformUsersQuery` · 契约 `listPlatformUsersQuerySchema`/`platformUserPageSchema` · 关联 [`global-tenancy`](../plans/global-tenancy.md) S6。

### 7.10 暂停平台用户（跨租户即时失能）
- **作为** 平台经营者，**我想** 暂停某用户，**以便** 撤销其在**所有**租户与平台层的访问（FR-10/FR-11）。
- **验收**：Given operator + 目标 `active`，When `PATCH /platform/users/:id/suspend`（reason 可选），Then `user_status→suspended` + **硬失效其全部 session**（D4·即时失权·会话墙 401）+ 审计行；非法迁移 Then 409；不存在 Then 404。
- **溯源**：`PATCH /api/v1/platform/users/:id/suspend` · `PlatformUsersController.suspend` · `SuspendUserCommand` → `UserStatusService`（读写单点）· `AUTH_SESSION_STORE` 受控删会话 · 契约 `suspendUserSchema`/`userGovernanceResultSchema`。

### 7.11 恢复平台用户
- **作为** 平台经营者，**我想** 恢复被暂停的用户，**以便** 解除其 deny-list。
- **验收**：Given operator + 目标 `suspended`，When `PATCH /platform/users/:id/resume`，Then `→ active`（lift deny-list）；非法迁移 Then 409；不存在 Then 404。
- **溯源**：`PATCH /api/v1/platform/users/:id/resume` · `PlatformUsersController.resume` · `ResumeUserCommand` · 契约 `userGovernanceResultSchema`。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论：11 条逐条对拍均命中（无 overclaim）；仅精修 7.8——补两段式硬删的顺序与防孤儿 rationale（先清事件后删主行）、并发窗口幂等 404、失败尝试亦审计，并将级联表枚举改为「以实际 FK→Organization 为准」（含 Epic 04 的 rbac 三表·防枚举过时）；7.5 补失能下游跨引 Epic 02 §2.4。
