# Epic 05 · 租户内分区与业务资源

> 旅程: 租户内如何以 Workspace 做二级数据分区、业务资源如何按租户隔离读写 | 上下文: `workspaces`（分区 CRUD）+ `posts`（示例租户业务资源）
> Workspace = 租户内二级数据分区、授权的 *subject*（非第三道墙、无独立角色层）。业务资源的行隔离最终卡点在**仓储层**：port 不暴露 tenantId，adapter 从 ALS `requireActiveOrganizationId()` 强制注入谓词——handler/controller 永不点名租户 id（FR-5 单点）。`posts` 是模板给未来业务功能复制的参考切片。
> **两切片的守卫非对称（有意取舍）**：`workspaces` = `TenantIsolationGuard` + `TenantPermissionGuard` 双守卫 + 逐路由 `@Can`（RBAC 门·read 全成员/写 owner-admin）；`posts` = **仅** `TenantIsolationGuard`、**无 `@Can`**（任何 active 租户成员皆可读写·行隔离为唯一边界）——即「最小参考切片」有意不叠 RBAC，复制成真业务时若要职权门需自行加 `@Can` + `TenantPermissionGuard`（走 workspaces 形状）。
> 版本: 0.2.0（2026-10-20·逐条对照代码讨论后校正增补）

---

### 5.1 分页列出租户工作区
- **作为** 租户成员，**我想** 分页查看本租户的 workspace，**以便** 选用工作分区。
- **验收**：Given active 租户 + `read Workspace`（S3 人裁：全成员可读），When `GET /workspaces`（offset 分页），Then 返回本租户 workspace 页；Given 无租户/deny，Then 403。
- **溯源**：`GET /api/v1/workspaces` · `WorkspacesController.list` · `@Can('read','Workspace')` · 双守卫（`TenantIsolationGuard`+`TenantPermissionGuard`）为**类级/逐路由显式挂、非 `APP_GUARD` 全局**（高危#4 签核） · `ListWorkspacesQuery` → `Page<WorkspaceReadModel>` · 契约 `listPageQuerySchema`/`workspacePageSchema` · 关联 [`global-tenancy`](../plans/global-tenancy.md) S3 / [`module-common-pagination-contract`](../plans/module-common-pagination-contract.md)。

### 5.2 创建工作区
- **作为** owner/admin，**我想** 新建一个 workspace，**以便** 开辟新的数据分区。
- **验收**：Given `create Workspace`（member 被拒），When `POST /workspaces`（name+slug），Then 落 `workspace` 行、由 ALS 盖章活动租户（201）；Given member 角色，Then 403。
- **溯源**：`POST /api/v1/workspaces` · `WorkspacesController.create` · `@Can('create','Workspace')` · `CreateWorkspaceCommand`（ALS 盖章·禁 body 伪造）· 契约 `createWorkspaceSchema`。

### 5.3 更新工作区
- **作为** owner/admin，**我想** 改某 workspace 的名称/slug，**以便** 维护分区。
- **验收**：Given `update Workspace` + 目标在本租户内，When `PATCH /workspaces/:id`，Then 更新返回；Given 不在本租户/不存在，Then 404（`WORKSPACE_NOT_FOUND`·跨租不可达）。
- **溯源**：`PATCH /api/v1/workspaces/:id` · `WorkspacesController.update` · `@Can('update','Workspace')` · `UpdateWorkspaceCommand` · 契约 `updateWorkspaceSchema`。

### 5.4 删除工作区
- **作为** owner/admin，**我想** 删除某 workspace，**以便** 下线废弃分区。
- **验收**：Given `delete Workspace`，When `DELETE /workspaces/:id`，Then 删除（204）；不存在 Then 404。
- **溯源**：`DELETE /api/v1/workspaces/:id` · `WorkspacesController.remove` · `@Can('delete','Workspace')` · `DeleteWorkspaceCommand` · `(organizationId,slug)` 唯一 · 关联 [`module-workspace-owner-column`](../plans/module-workspace-owner-column.md)（`ownerId` 实例属主·支撑受限 grant 的实例条件）。

### 5.5 游标分页列出本租户业务资源（示例：post）
- **作为** 租户成员，**我想** 游标分页列出本租户的 posts，**以便** 查看业务数据。
- **验收**：Given active 租户，When `GET /posts`（cursor 分页），Then 仅返回本租户 posts（仓储层强制隔离）；Given 无 active 租户，Then 403；Given cursor 非法，Then 400。
- **溯源**：`GET /api/v1/posts` · `PostsController.list` · `@UseGuards(TenantIsolationGuard)` · `ListPostsQuery` → `CursorPage<PostReadModel>` · 契约 `listCursorQuerySchema`/`postCursorPageSchema` · 关联 [`global-tenancy`](../plans/global-tenancy.md) S2（FR-5 隔离参考切片）。

### 5.6 创建业务资源（示例：post·租户盖章）
- **作为** 租户成员，**我想** 新建一条 post，**以便** 写入业务数据（自动归属当前租户）。
- **验收**：Given active 租户，When `POST /posts`（title+content+published），Then 落库并盖活动租户 `organizationId`（201）；Given 无租户上下文，Then 403。**posts 无 RBAC 门**（仅 `TenantIsolationGuard`·无 `@Can`）⇒ 任何 active 租户成员皆可建，不按角色分权（与 5.2 workspace 需 `create Workspace` 对比）。
- **溯源**：`POST /api/v1/posts` · `PostsController.create` · `CreatePostCommand`（handler 不点名 tenant id·ALS 盖章）· 契约 `createPostSchema`/`postViewSchema`。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论：本 Epic 保真度高（6 条逐条对拍均命中·无事实错误）；仅增补——header 点破 workspaces（双守卫+`@Can`·RBAC 门）vs posts（仅 `TenantIsolationGuard`·无 `@Can`）的守卫非对称系「最小参考切片」有意取舍；5.6 显式标 posts 无 RBAC 门（防误读为按角色分权）；5.1 溯源点明双守卫为逐路由/类级显式挂、非 APP_GUARD 全局。
