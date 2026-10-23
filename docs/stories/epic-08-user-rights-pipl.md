# Epic 08 · 个人权益与 PIPL 合规

> 旅程: 自然人如何行使查阅/删除自己个人数据的权利 | 上下文: `users`（用户自助面）
> 暴露面收紧（人裁甲）：原 `POST /users`・`GET /users`・`GET /users/:id` 已删（`user` 表无租户列·三路由为跨租户 PII 冗余危险面且零消费方）；管理员查全用户走平台治理面（[Epic 7.9](./epic-07-platform-governance.md)），建号正道收口 better-auth sign-up。**此处仅存用户自助面**（本人导出/本人删除），各挂 `SessionGuard`·类级 `@TenantIsolationExempt`（用户级·不经租户仓储）。
> 版本: 0.2.0（2026-10-20·逐条对照代码讨论后校正增补）

---

### 8.1 导出本人个人数据（查阅权·right-to-access）
- **作为** 已登录用户，**我想** 导出我的个人数据聚合，**以便** 行使 PIPL 查阅权（C1·FR-7）。
- **验收**：Given 有效会话，When `GET /users/me/data-export`，Then 返回四段聚合（`profile` / `accounts` / `sessions` / `consents`）·**凭证永不外泄**；未登录 Then 401。
  - **剔除机制（比措辞更硬·fail-safe）**：四表读取全走 `em.find` 的 **`fields` 白名单投影**——凭据列（`user.password/isOwner`、`account.{password,accessToken,refreshToken,idToken}`、`session.{token,ipAddress,userAgent}`、`consent.evidence` IP/UA 审计料）**根本不进 SELECT**（R-B1 安全红线），而非“查出后过滤”。
- **溯源**：`GET /api/v1/users/me/data-export` · `UsersController.exportMe` · `@UseGuards(SessionGuard)` · `ExportUserDataQuery` → `UserDataExportReadModel` · 关联 [`global-tenancy`](../plans/global-tenancy.md)（PIPL C1）/ ORM 修宪案 3d（S-d4·Mikro 只读投影）。

### 8.2 注销本人账号（删除权·right-to-erase）
- **作为** 已登录用户，**我想** 硬删我的账号，**以便** 行使 PIPL 删除权（C1·FR-7）。
- **验收**：Given 有效会话，When `DELETE /users/me`，Then 硬删用户（204）·**三种灭失机制分工**（非笼统“全硬删”）：① account/session 经 FK cascade 随 user 行灭；② **consent 由 schema `set null` 匿名化保留**（脱钩已删用户·合法留痕不因删号丢失·PIPL）；③ 事件行经 **`eventStore.deleteByAggregate('user', userId)` 显式 purge**（PIPL 级联补删·ES 第二切片·**fail-loud** 不留残迹·与 [Epic 07 §7.8](./epic-07-platform-governance.md) 同律）；未登录 Then 401。
- **溯源**：`DELETE /api/v1/users/me` · `UsersController.deleteMe` · `DeleteUserCommand` · 关联 [`module-tenancy-hard-delete`](../plans/module-tenancy-hard-delete.md)（consent 置空留痕）/ PIPL 合规基线 C1。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论：2 条均无 overclaim；8.1 升精度——凭据剔除为 `fields` 白名单投影（不进 SELECT·R-B1 fail-safe）并具名四段；8.2 补漏——删号同时 `deleteByAggregate('user')` 清事件行（PIPL 级联补删·fail-loud），并将“硬删”拆为三机制分工（account/session cascade · consent set-null 匿名化 · event purge）。
