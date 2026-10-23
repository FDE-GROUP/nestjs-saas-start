# Epic 04 · 角色与授权

> 旅程: 租户管理员如何自建角色、给角色配授权格，实现差异化授权策略 | 上下文: `authorization`（动态角色三表 `tenant_role`/`tenant_role_grant`/`tenant_role_audit`）
> 新宪（丙《全 DB 化删代码表》·2026-10-17）：**DB 是授权事实 SSOT**（角色/权限=表行·热改生效）· **代码词汇表是语言 SSOT**（`tenant-rules.ts` subject/action 编译期域）· **CASL rules 是运行时投影**。系统三角色（owner/admin/member）lazy-ensure 落行、不可改删；自定义角色由此门面 CRUD。
> 全部经 `@UseGuards(TenantIsolationGuard, TenantPermissionGuard)` + `@Can(<动作>, 'Role'|'RoleGrant')`；owner/admin 持 Role/RoleGrant 职权，member 无 → 非管理员 403（fail-closed）。
> **审计贯穿五写**：create/rename/delete/grant/revoke 每次变更均同事务追加 `tenant_role_audit`（before/after JSON 规范化快照·只插不改不删·甲裁可查证）。
> 版本: 0.2.0（2026-10-20·逐条对照代码讨论后校正增补）

---

### 4.1 列出租户角色
- **作为** owner/admin，**我想** 查看本租户全部角色（系统 + 自定义），**以便** 了解现有授权结构。
- **验收**：Given `read Role`，When `GET /tenants/roles`，Then 返回角色视图列表（含 `isSystem` 标记）；deny Then 403。
- **溯源**：`GET /api/v1/organizations/roles` · `AuthorizationAdminController.listRoles` · `@Can('read','Role')` · `OrganizationRbacAdminService.listRoles` · 契约 `organizationRoleViewSchema` · 关联 [`module-rbac-dynamic-roles`](../plans/module-rbac-dynamic-roles.md) §2.5。

### 4.2 创建自定义角色
- **作为** owner/admin，**我想** 新建一个自定义角色，**以便** 定义超出系统三档的职权组合。
- **验收**：Given `create Role` + key 合法且未占用，When `POST /organizations/roles`（key+name），Then 落 `tenant_role` 行（`isSystem=false`）；Given key 保留/非法，Then 400；Given key 已存在，Then 409。
- **溯源**：`POST /api/v1/organizations/roles` · `AuthorizationAdminController.createRole` · `@Can('create','Role')` · `rbac.createRole`（写侧过 domain 策略闸 + 审计行 + 失效投影缓存）· 契约 `createRoleSchema`。

### 4.3 重命名角色（系统角色保护）
- **作为** owner/admin，**我想** 改自定义角色的显示名，**以便** 更贴合团队语义。
- **验收**：Given `update Role` + 目标为自定义角色，When `POST /organizations/roles/rename`，Then 改名；Given 角色不存在，Then 404；Given 目标是系统角色，Then 409（protected）。
- **溯源**：`POST /api/v1/organizations/roles/rename` · `AuthorizationAdminController.renameRole` · `@Can('update','Role')` · 契约 `renameRoleSchema`。

### 4.4 删除自定义角色（授权级联回收）
- **作为** owner/admin，**我想** 删除一个自定义角色，**以便** 下线不再需要的职权集。
- **验收**：Given `delete Role` + 自定义角色，When `POST /organizations/roles/delete`，Then 删角色行 + `tenant_role_grant` 级联回收（`roleId` cascade FK）；Given 系统角色，Then 409；不存在 Then 404。
  - **级联全貌（as-built）**：`tenant_role`/`tenant_role_audit` 各 `organizationId → Organization` 为 `onDelete:cascade`（删租户连带清角色与审计）；而审计 `actorId → User` 为 `onDelete:set null`——**操作者被硬删后审计行保留、仅 actor 置空**（PIPL 硬删链不失联）。
- **溯源**：`POST /api/v1/organizations/roles/delete` · `AuthorizationAdminController.deleteRole` · `@Can('delete','Role')` · `rbac.deleteRole` · 契约 `deleteRoleSchema`。

### 4.5 查看角色的授权格
- **作为** owner/admin，**我想** 列出某角色已授予的权限格，**以便** 核对当前授权状态。
- **验收**：Given `read RoleGrant` + 提供 `roleKey`，When `GET /tenants/roles/grants?roleKey=...`，Then 返回 grant 视图（subject/action/conditions·回显勾选态）；缺 roleKey Then 400；角色不存在 Then 404。
- **溯源**：`GET /api/v1/organizations/roles/grants` · `AuthorizationAdminController.listGrants` · `@Can('read','RoleGrant')` · 契约 `tenantRoleGrantViewSchema`。

### 4.6 授予权限格（多条件 OR 并集）
- **作为** owner/admin，**我想** 给角色授予某「资源×动作」权限（可附实例条件），**以便** 精确刻画其能力边界。
- **验收**：Given `create RoleGrant` + 角色存在，When `POST /organizations/roles/grants`（subject+action+可选 conditions），Then 落一行 grant（一权限格一行）；同 `(subject,action)` 多行=OR 并集（同格多条件正当）；Given conditions 非法，Then 400（白名单）；Given 完全重复 grant，Then 409（应用层去重）。
  - **判重粒度**：`duplicate` = 同 `(subject,action)` 的现有行里，**`conditions` 经规范化（`canonicalConditions`）后等值**才算重——键序不同但语义相等仍判重。
  - **并发边界（诚实·与 2.1 slug 同律）**：DB **不建 `unique(role,subject,action)`**（仅非唯一索引 `(roleId,subject)`），去重纯走应用层 find-then-insert ⇒ 并发同格双授理论上可竞态重复（此面属推断/窄）。
- **溯源**：`POST /api/v1/organizations/roles/grants` · `AuthorizationAdminController.grant` · `@Can('create','RoleGrant')` · `rbac.grant`（`conditions` CASL mongo 形·`{{userId}}` 模板按请求解析·S4 实例级）· 契约 `grantRolePermissionSchema` · 关联 [`module-rbac-dynamic-roles`](../plans/module-rbac-dynamic-roles.md) §2.2（行式 grant·DB 不建三元唯一）。

### 4.7 回收权限格
- **作为** owner/admin，**我想** 撤销角色的某授权格，**以便** 收窄其能力。
- **验收**：Given `delete RoleGrant`，When `POST /organizations/roles/grants/revoke`（roleKey+subject+action+可选 conditions），Then 删匹配行（`conditions=null` 撤整 subject 级行；给对象撤精确行）；角色或匹配 grant 不存在 Then 404。
- **溯源**：`POST /api/v1/organizations/roles/grants/revoke` · `AuthorizationAdminController.revoke` · `@Can('delete','RoleGrant')` · `rbac.revoke` · 契约 `revokeRolePermissionSchema` · 变更留痕 `tenant_role_audit`（只插不改不删）。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论：本 Epic 保真度高（7 条逐条对拍均命中·无事实错误）；仅增补——header 统一「审计贯穿五写（create/rename/delete/grant/revoke 同事务落 `tenant_role_audit`·只插不改不删）」；4.4 补级联全貌（organization cascade ·审计 actorId set null）；4.6 补判重粒度（conditions 规范化等值）与并发诚实边界（DB 无三元唯一·应用层 find-then-insert·与 2.1 slug 同律）。
