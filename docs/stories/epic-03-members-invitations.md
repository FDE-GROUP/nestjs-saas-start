# Epic 03 · 成员与邀请

> 旅程: 一个人如何被拉进租户、切换/退出、管理员如何管成员与发邀请 | 上下文: `tenants`（self 个人面 + org-admin 管理面两个门面 controller）
> 数据操作均走 BA `auth.api.*` **服务端直调**（BA 内置 org HTTP 面已封堵·`isSealedOrgHttpPath`→404）；**授权在我、数据在 BA**：管理面经 `@Can` + CASL 裁决，个人面靠 BA membership 数据自校验。
> **错误码亦在 BA**：self/admin 全部 BA 直调路由的最终 400/403/402 等，是「BA 数据闸/hook 抛出 → `mapBaError` 翻译」的结果，非本层自定；controller 里的 `@ApiResponse` 只是**声明性提示、非权威码表**（个别处与实现有偏差，见 3.4）。
> 例外（我方前置逻辑）：管理面的角色存在性闸 `assertRoleAssignable`（3.8/3.11）在**直调 BA 之前**由我方执行，属「我方逻辑」而非 BA 透传。
> 版本: 0.2.0（2026-10-20·逐条对照代码讨论后校正增补）

## 个人通道（`OrganizationsSelfController`·类级 `@TenantExempt`·逐路由 `SessionGuard`）

> 这些操作合法可无 active 租户（入组前即发生），故旁路租户墙；CASL 不介入（非「租户内管理职权」），授权由 BA 数据面自裁（membership 归属、被邀请人=本人、last-owner 不可退）。

### 3.1 查看我所属的租户列表
- **作为** 用户，**我想** 列出我所属的全部租户，**以便** 选择当前工作空间。
- **验收**：Given 有效会话（可无 active 租户），When `GET /tenants`，Then 返回我的成员组织列表（BA `listOrganizations`）。
- **溯源**：`GET /api/v1/organizations` · `OrganizationsSelfController.listMyOrganizations` · `@UseGuards(SessionGuard)` · 关联 [`module-rbac-casl`](../plans/module-rbac-casl.md) §2.3.1（严格拆）。

### 3.2 切换活动租户
- **作为** 多租户成员，**我想** 切换当前生效租户，**以便** 后续操作作用于该租户。
- **验收**：Given 我是目标租户成员，When `POST /organizations/active`（organizationId），Then 更新 `session.activeOrganizationId`；Given 非成员，Then 403（BA 校验）。
- **溯源**：`POST /api/v1/organizations/active` · `OrganizationsSelfController.setActive` · 契约 `setActiveOrganizationSchema` · 关联 [`global-tenancy`](../plans/global-tenancy.md) D4。

### 3.3 退出租户（last-owner 保护）
- **作为** 成员，**我想** 主动退出某租户，**以便** 脱离该组织关系。
- **验收**：Given 我是成员且非唯一 owner，When `POST /organizations/members/leave`，Then 移除成员关系；Given 我是 sole owner，Then 400（BA 数据闸·FR-12 保底）。
- **溯源**：`POST /api/v1/organizations/members/leave` · `OrganizationsSelfController.leave` · 契约 `leaveOrganizationSchema`。

### 3.4 接受邀请（触发席位配额）
- **作为** 被邀请人，**我想** 接受发给我的邀请，**以便** 加入租户成为成员。
- **验收**：Given 邀请有效且我=被邀请 email，When `POST /organizations/invitations/accept`，Then 落 `member` 行入组；Given 席位超限，Then **402**（`seats-quota` before-hook·`QuotaService.checkSeats` 判别后由 hook 抛 `APIError(402)`·plan S7 gated e2e 断言席位满→402）；Given 邀请过期/非本人，Then 400。
  - **as-built 勘注**：席位超限实抛 **402**（hook 真相），但 controller 的 `@ApiResponse` 把 seat-cap 笼统并入 `apiError(400,…)` 声明——代码 swagger 少列 402（属标注与实现的小偏差·此处如实记录·不改码）。
- **溯源**：`POST /api/v1/organizations/invitations/accept` · `OrganizationsSelfController.acceptInvitation` · `createSeatsQuotaPlugin`（`seats-quota.hook.ts`·accept-invitation 现网唯一真实通道）· 关联 [`global-tenancy`](../plans/global-tenancy.md) S7 / [`module-tenancy-quota-member-wiring`](../plans/module-tenancy-quota-member-wiring.md)。

### 3.5 拒绝邀请
- **作为** 被邀请人，**我想** 拒绝邀请，**以便** 不加入该租户。
- **验收**：Given 我=被邀请人，When `POST /organizations/invitations/reject`，Then 邀请置拒绝；非法 Then 400。
- **溯源**：`POST /api/v1/organizations/invitations/reject` · `OrganizationsSelfController.rejectInvitation` · 契约 `invitationIdSchema`。

### 3.6 查看发给我的待处理邀请
- **作为** 用户，**我想** 列出发给我的 pending 邀请，**以便** 决定接受/拒绝。
- **验收**：Given 有效会话，When `GET /tenants/invitations/mine`，Then 以会话用户 email 收敛可见面（server-side-only query）。
- **溯源**：`GET /api/v1/organizations/invitations/mine` · `OrganizationsSelfController.listMyInvitations`（`query.email = user.email`）· `CurrentUser`。

## 管理通道（`OrganizationsOrgAdminController`·`@UseGuards(TenantScopeGuard, TenantPermissionGuard)`·逐路由 `@Can`）

> 需 active 租户（不豁免全局墙）；每端点 CASL 裁决，通过后服务端直调 BA；角色挂载前过 `assertRoleAssignable` 存在性闸。

### 3.7 列出租户成员
- **作为** 成员（含 member 角色），**我想** 查看本租户全部成员，**以便** 了解组织构成。
- **验收**：Given 有 active 租户 + `read Member` 授权，When `GET /tenants/members`，Then 返回成员列表（全角色可读·对拍 BA 现状）；Given 无上下文/deny，Then 403。
- **溯源**：`GET /api/v1/organizations/members` · `OrganizationsOrgAdminController.listMembers` · `@Can('read','Member')` · 关联 [`module-rbac-casl`](../plans/module-rbac-casl.md)（Member read 扩项）。

### 3.8 修改成员角色
- **作为** owner/admin，**我想** 调整某成员的角色，**以便** 变更其职权。
- **验收**：Given `update Member` + 目标角色 ∈（系统三 key ∪ 本租在库自定义角色），When `POST /organizations/members/role`，Then BA 更新角色；Given 角色词汇外，Then 400（`TENANCY_ROLE_NOT_FOUND`·严格在库 fail-closed）；Given last-owner，Then 403（BA）。
- **溯源**：`POST /api/v1/organizations/members/role` · `OrganizationsOrgAdminController.updateMemberRole` · `@Can('update','Member')` · **先过我方 `assertRoleAssignable`（`RoleAssignabilityReader`·fail-closed 在库存在性闸）再直调 BA** · 契约 `updateMemberRoleSchema` · 关联 [`module-rbac-dynamic-roles`](../plans/module-rbac-dynamic-roles.md) S3 §2.5。

### 3.9 移除成员
- **作为** owner/admin，**我想** 移除某成员，**以便** 撤销其访问。
- **验收**：Given `delete Member`，When `POST /organizations/members/remove`，Then 移除；Given 自删/无授权，Then 403（BA/守卫）。
- **溯源**：`POST /api/v1/organizations/members/remove` · `OrganizationsOrgAdminController.removeMember` · `@Can('delete','Member')` · 契约 `removeMemberSchema`。

### 3.10 列出租户待处理邀请
- **作为** 成员，**我想** 查看本租户已发出的 pending 邀请，**以便** 跟踪入组进度。
- **验收**：Given `read Invitation`，When `GET /tenants/invitations`，Then 返回邀请列表；deny Then 403。
- **溯源**：`GET /api/v1/organizations/invitations` · `OrganizationsOrgAdminController.listInvitations` · `@Can('read','Invitation')`。

### 3.11 发出邀请
- **作为** owner/admin，**我想** 邀请某人加入本租户并指定角色，**以便** 扩充成员。
- **验收**：Given `create Invitation` + 角色可挂载，When `POST /organizations/invitations`（email+role），Then 建 `invitation` 行（email 为锚·仅发邀请不落 member 行）；Given 角色词汇外，Then 400；Given 无授权，Then 403。
- **溯源**：`POST /api/v1/organizations/invitations` · `OrganizationsOrgAdminController.createInvitation` · `@Can('create','Invitation')` · **先过我方 `assertRoleAssignable` 再直调 BA** · 契约 `createInvitationSchema` · 席位在 accept 时点卡（见 3.4）。

### 3.12 取消邀请
- **作为** owner/admin，**我想** 撤销一张已发邀请，**以便** 终止其入组。
- **验收**：Given `cancel Invitation`，When `POST /organizations/invitations/cancel`（invitationId），Then 取消；不可取消 Then 400/403。
- **溯源**：`POST /api/v1/organizations/invitations/cancel` · `OrganizationsOrgAdminController.cancelInvitation` · `@Can('cancel','Invitation')` · 契约 `invitationIdSchema`。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论：本 Epic 保真度高（12 条逐条对拍均命中）；仅增补三处精度——头部补「错误码亦在 BA（经 `mapBaError` 翻译·`@ApiResponse` 非权威码表）」与 `assertRoleAssignable` 我方前置闸例外；3.4 如实标注 hook 实抛 402 而 controller swagger 少列（代码标注偏差·不改码）；3.8/3.11 溯源显式点出角色存在性闸先于 BA 直调。
