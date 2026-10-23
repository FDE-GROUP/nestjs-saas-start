# 租户领域概念图：租户、组织、用户、成员、角色、权限

> 定位: **讲解性指南（非规范）**——以**当前代码**为依据重述六概念的定性与关系（取证日 2026-10-20）| 规范性单源: [`docs/specs/architecture.md`](./specs/architecture.md) ±zh（结构）、[`docs/specs/glossary.md`](./specs/glossary.md)（术语）——与规范冲突时**以规范与代码为准**
> 缘起: 六概念关系的全景说明·与实态同步（2026-10-23 [`global-governance-lifecycle-consolidation`](./plans/global-governance-lifecycle-consolidation.md) 归列后：`tenant`/`user_status` 两 1:1 旁表已 DROP，治理态归 `organization.status` / `user.status` 真列）
> 受众: 人 + Agent | 版本: 0.4.0（2026-10-23）

---

## 0. 全景一图

```
                    ┌─────────────────────────────────────────────────┐
                    │                    user（自然人）                │
                    │  email 全局唯一为体 · 生命周期归 Better Auth      │
                    │  status/statusReason 治理列（切片C 归列·平台级暂停）│
                    └────────────────────┬──────────────────┬────────┘
                                         │ 1                │ N
                            ┌────────────┴───┐    ┌─────────┴──────┐
                            │ session        │    │ member         │
                            │ (活动租户指针)  │    │ (user×org      │
                            └────────────────┘    │  多对多联结)    │
                                                  └────────┬───────┘
                                                           │ N
              ┌────────────────────────────────────────────┴─────────┐
              │   organization（认证/成员容器 · BA 面 · 租户本体=租户） │
              │   name/slug/logo · metadata 零我方键 · 属主=tenants    │
              │   status 真列+DB CHECK · 生命周期态 SSOT（切片B 归列）  │
              └──────────┬───────────────────────────┬───────────────┘
                    1:N  │                           │  1:N
          ┌──────────────┴─────┐          ┌──────────┴────────────────┐
          │ workspace          │          │ tenant_role（角色行）      │
          │ (租户内二级数据分区  │          │ per-tenant · key 唯一      │
          │  ·授权 subject)     │          │ (org,key)                 │
          └────────────────────┘          └──────────┬────────────────┘
                                              1:N    │
                                            ┌────────┴────────────────┐
                                            │ tenant_role_grant       │
                                            │ (subject,action,        │
                                            │  conditions jsonb)      │
                                            │  = 授权事实 SSOT        │
                                            └─────────────────────────┘
```

一句话版本：**用户**是自然人，经**成员**关系进入**组织**；组织是其认证与成员数据的容器（Better Auth 面），亦即**租户本体**（租户身份 = organization·同主键 1:1）；**租户**是业务概念，其治理生命周期以 `organization` 行上的 `status` 真列为物理载体（原 1:1 旁表 `tenant` 已 DROP）；**角色**是 per-tenant 的授权聚合（`member.role` 字符串按 key 关联），**权限**是行式 grant——授权事实唯一在 DB。

---

## 1. 用户（User）

- **定义**：在本平台注册的自然人账号；先成为 user，才可申请/关联租户。全局实体，**不带 `tenant_id`**（D3——一人可属多租户）。
- **物理承载**：`user` 表（BA 身份机器族·形状受 BA 接口契约约束，`apps/api/src/modules/auth/infrastructure/entities/ba-identity.entities.ts`·global-ba-entity-domain-placement 归域）：`id`、`name`、`email`（全局唯一之「体」）、`emailVerified`、`password`（可空，凭证本体在 `account` 表按渠道分行）、`handle`/`isOwner`（BA additionalFields）、`createdAt/updatedAt`。
- **生命周期归属**：User 是本仓唯一天然的「外部聚合」，其注册/凭证/会话生命周期**归 Better Auth**（宪法 P1 注记：聚合优先战术 DDD 不采用之缘由）；本仓仅在其旁挂自有面。
- **平台级失能**：治理态归位 `user` 行上的 `status`/`statusReason` 真列（切片 C·原 `user_status` 旁表 2026-10-23 已 DROP·`status` 值域 {active,suspended,deleted} CHECK）。写面经 `AUTH_USER_STORE.updateStatus` 端口落 auth 属主（`UserStatusService` 委托·消 tenants 越界写）；暂停（suspend）同时**硬删该用户全部 session 行**（即时失权）。BA `user` 表系**共享表**（BA 表共享条款），`status`/`statusReason` 为 additive 自撰域列·不触 BA 约定字段。
- **表/实体**：表 `user`（连带凭证面 `account`、会话面 `session`/`verification`）↔ 运行时实体 `User`/`Account`/`Session`/`Verification`（auth 域 `modules/auth/infrastructure/entities/ba-identity.entities.ts`·`defineEntity` 零装饰器·入 `MIKRO_ENTITIES`）；用户治理态即 `User` 实体的 `status`/`statusReason` 列（无独立 `UserStatus` 实体/`user_status` 表·随切片 C 归列）。
- **注意**：`user.role` 列（USER/ADMIN）仍存在于 BA 面，但**不承载任何当前裁决判据**——平台经营者判据早已收敛为身份命中（见 §5），勿将其读作权限源。

## 2. 组织（Organization）

- **定义**：Better Auth org 插件的容器概念——既是**租户的认证/成员面投影**、又承载**租户生命周期本体**（global-governance-lifecycle-consolidation 2026-10-23：租户身份塌缩回 organization·态存其 `status` 真列，见 [architecture-zh.md](./specs/architecture-zh.md) 术语纪律段）。
- **物理承载**：`organization` 表（BA 契约面·系共享表）：`id`、`name`、`slug`、`logo`、`metadata`（jsonb·**零我方寄居键**——治理态走 `status` 真列而非寄居 metadata）、`status`（自撰域列·切片 B 归列·见 §3）、`createdAt/updatedAt`。表属主台账记 `tenants` 上下文（`apps/api/src/database/table-ownership.ts`）。
- **表/实体**：表 `organization` ↔ 运行时实体 `Organization`（`ba-org.entities.ts`·入 `MIKRO_ENTITIES`·BA adapter 以「模型名→entity」逐表寻址）；迁移忠实变体 `Organization` 居 `migration-entities.ts`。
- **创建通道（唯一）**：服务端系统动作 `auth.api.createOrganization`（无 session + `body.userId`）；HTTP 自助开通被 `allowUserToCreateOrganization:false` + handler 入口封堵双闸封死（S4 审批制 + module-rbac-casl 甲裁）。合法入口只有 tenants 上下文的申请切片（`MikroTenantProvisioningRepository.submit`）。
- **消亡**：软删只是 `organization.status=deleted` 终态（行保留供导出取证）；硬删 `nativeDelete(Organization)` 触发 DB FK cascade——`member`/`invitation`/`workspace`/`tenant_subscription`/`post` 随灭，`user` 不连带（自然人永生）；治理动作另落 `audit_log`（`entityId` 裸值非 FK·本体灭后账行幸存）。
- **会话挂点**：`session.activeOrganizationId`（可空列）= 当前生效租户指针；cookie + 服务端 DB session 模型（D4 人裁终态），`set-active` 切换。本仓租户上下文的数据来源即此字段。

## 3. 租户（Tenant）

- **定义**：**顶层隔离与归属单元（付费主体）**——业务概念一等公民，有生命周期、不变量与语言；「多租户（multi-tenancy）」才是隔离机制，住在 `apps/api/src/tenancy/`（横切层·无聚合），两者不可混住（宪法术语纪律）。
- **物理承载**：`organization` 行上的 `status` 治理列（`apps/api/src/modules/tenants/infrastructure/entities/ba-org.entities.ts`·`Organization` 实体·tenants 上下文属主·系加于 BA 共享表 `organization` 上的自撰域列）：
  - `id`：**即 organization 主键**（租户身份 = organization·同主键 1:1）——下游一切 `tenantId` 锚（ALS 上下文、`workspace`/`post` 的 `organizationId`、`tenant_subscription.tenantId`）因此**零改指**；
  - `status`：text 真列 + DB CHECK（`organization_status_check`·`NOT NULL DEFAULT 'active'`·值域由 `TENANT_STATUS` 枚举单源生成进迁移，枚举漂移会被下次 `migration:generate` 非空 diff 捕获）；
  - 旧 1:1 自有户籍表 `tenant`（含 `tenant.entity.ts`/`TENANT_META`）已由 global-governance-lifecycle-consolidation 2026-10-23 反悔并 DROP。
- **表/实体**：租户生命周期态直接落 `Organization` 实体（`ba-org.entities.ts`·`defineEntity` 携 `status` 属性 + `organization_status_check`）——无独立 `Tenant` 运行时实体、无 `TENANT_META`（随旁表退役）。
- **状态机**（`libs/core/src/modules/tenants/lifecycle/tenant-lifecycle.ts`·纯函数 `canTransition`）：

  ```
  pending_approval ──审批──▶ active ◀──恢复/审批── suspended
        │                    │ ╲                    │
        └─────驳回(硬删)─────┴───暂停──▶ deleted ◀───┘（软删·终态·硬删另走运维）
  ```

  **归真列后「缺席态 fail-open」消失**（O1 闭合）：`status` 列恒有值（`NOT NULL DEFAULT 'active'`），provisioning 显式置 `pending_approval`（BA 建 org 落 DB 默认 active 后即时翻）；`deleted` 为终态不接受任何迁移。
- **读写唯一卡点**：`TenantStatusService`（core）——transition 序 = 本体存在性（`organizationExists`·not-found 判据）→ `readStatus` → `canTransition` → `upsert` → 发布 `tenant.status.transitioned` 事件；经 `TenantStatusStore` 端口（三原语）落到 app 侧 MikroORM 适配器（读写落 `organization.status`）。治理动作落 `audit_log` 耐久账本（切片 E）。审批/暂停/恢复/删除写面全部经 CQRS 命令 handler 收敛于此，禁散点。
- **失能语义（deny-list）**：`TenantMiddleware` 解析会话时，`pending_approval/suspended/deleted` 态租户**不绑定** `tenantId` → 该租户业务路由经全局租户墙 fail-closed 403；`isBlocked`（租户态 + 用户态统一失能判据）供三层守卫消费。

## 4. 成员（Member）与邀请（Invitation）

- **定义**：`member` = user × organization 的**多对多联结实体**（同一用户在不同租户角色互不相干）；角色**挂成员而非全局用户**。
- **物理承载**：`member` 表（BA 契约面·属主 tenants）：`id`、`organizationId`、`userId`、`role`（**单字符串 key**·schema 零改动桥接 per-tenant 角色行，见 §5）、`createdAt`。
- **Owner 保底（FR-12）**：申请人经 BA 原生成首名 `owner`；系统须至少保留一名 owner（转移/退出规则在治理面）。
- **邀请（Invitation）**：`invitation` 表按 **email 为锚**（`status: pending/…`、`expiresAt`、`inviterId`）；接受通道 `accept-invitation` 上挂**席位配额 hook**（超限 402·商业闭环，裁决本体在 subscriptions 上下文）。
- **对外门面**：BA 内置 org/member/invitation HTTP 端点已封堵，成员/邀请管理端点由本仓门面经服务端直调（@Can 裁决后代理）。
- **会话预注入**：每请求会话解析点（`session-resolver.ts` 单源）从 BA 数据面取当前活跃租户的 `member.role`，注入 ALS `TenantContext.role`——这是租户级 RBAC 裁决的**角色输入**，fail-closed 缺省 undefined。
- **表/实体**：表 `member`/`invitation` ↔ 运行时实体 `Member`/`Invitation`（`ba-org.entities.ts`·入 `MIKRO_ENTITIES`）；忠实变体同居 `migration-entities.ts`。

## 5. 角色（Role）与权限（Permission）

授权上下文（`apps/api/src/modules/authorization/`）的**三源新宪**（人裁 2026-10-17·丙《全 DB 化删代码表》）：

| 源 | 载体 | 职责 |
|---|---|---|
| **授权事实 SSOT** | `tenant_role` / `tenant_role_grant` 表行 | 谁是什么角色、角色有哪些权限格，全在 DB；热改即生效 |
| **语言 SSOT** | `libs/core/src/authorization/tenant-rules.ts` 词汇表 | 仅编译期类型域：subject（Organization/Member/Invitation/Workspace/Role/RoleGrant）× action（create/read/update/delete/cancel）；新资源随代码发布入表 |
| **运行时投影** | CASL ability（checker 按租户从 grant 行懒投影 + 进程内版本缓存） | 裁决执行引擎；代码里不再存在权限矩阵 |

- **角色（tenant_role）**：**per-tenant**（`(organizationId, key)` 唯一），`isSystem=true` 的三个系统角色（owner/admin/member）由静态 seed（`system-role-seed.ts`·数据非规则）在租户首次解析授权时 **lazy-ensure** 落行、不可改删；自定义角色由管理门面 CRUD（职权仅 owner/admin——`Role`/`RoleGrant` 两 subject 即此意）。`member.role` 字符串按 `key` 关联本表。
- **权限（tenant_role_grant）**：**行式**——一权限格一行（`roleId` cascade FK、`subject`、`action`），`conditions` jsonb 可空承载 CASL mongo 形实例条件（`{ ownerId: '{{userId}}' }` 模板按请求解析）；同 `(subject, action)` 多行 = **OR 并集**（同格多条件是正当形态，DB 层刻意不建三元唯一约束，去重在仓储卡点）。变更全部留痕 `tenant_role_audit`（只插不改不删·actor 消亡 set null 不丢行）。
- **声明与裁决**：端点以 `@Can(action, subject)` 声明；`TenantPermissionGuard` 用 ALS 预注入的 `role` 交 checker 裁决（无散点特判）。实例级授权 = check 级附 `resource`；query 级列表过滤是其同源延伸（`listPredicate` 把受限 grant 下推为列表面谓词）。
- **Workspace 的角色**：租户内**二级数据分区**、授权的 *subject*（非第三道墙、无独立角色层）；`ownerId` 列（可空·ALS 盖章禁 body 伪造）支撑实例属主条件——NULL 行对受限 grant fail-closed 不可见。
- **表/实体**：表 `tenant_role`/`tenant_role_grant`/`tenant_role_audit` ↔ 运行时实体 `TenantRole`/`TenantRoleGrant`/`TenantRoleAudit`（`authorization/infrastructure/entities/rbac.entities.ts`·三份 `TableMeta` 列单源·`MIKRO_RBAC_TABLE_ENTITIES` 汇入 app 运行时）；表 `workspace` ↔ 实体 `Workspace`（`workspaces/infrastructure/entities/workspace.entity.ts`·`WORKSPACE_META`）。

## 6. 三层裁决链（谁在什么时候说话）

请求自上而下三道守卫，**各自 fail-closed、互不授予**（FR-11）：

```
请求 ──▶ SessionGuard（认证：DB session 有效 · user.status 未 blocked）
      ──▶ TenantScopeGuard（全局租户墙：ALS 须有 tenantId——由 TenantMiddleware
          按 session.activeOrganizationId 绑定，且 deny-list 态租户不绑即 403）
      ──▶ PlatformOperatorGuard（平台层·逐路由）｜ TenantPermissionGuard + @Can（租户/实例层·逐路由）
```

- **平台级**（跨租户治理）：判据 = 会话用户 DB email 命中 `platform.operatorEmail` 配置（seed 全局唯一 operator·FR-13·不由他人任命）；与租户内任何角色无关——租户 owner 不打平台端点照样 403。
- **租户级**（(user, tenant) 维度）：`@Can` + `@UseGuards(TenantScopeGuard, TenantPermissionGuard)` 逐路由接线；数据面最终卡点在**仓储层**（port 不暴露 tenantId，adapter 从 ALS `requireTenantId()` 强制注入谓词）——漏挂 where 即红有守卫测锁死。
- **用户级**（与租户无关的个人资源）：绑定 userId 判定（如 PIPL 导出/同意面）。
- **配额层**（正交于 RBAC）：席位超限 402 在成员增量通道 hook 裁决，属 subscriptions 上下文。

## 7. 速查：六概念一句话 + 物理锚

| 概念 | 一句话 | 物理锚（当前代码） |
|---|---|---|
| 用户 | 自然人账号，email 为体，平台全局 | `user`/`account`/`session` 表（BA 面）+ `user.status`/`statusReason` 治理列（切片C 归列） |
| 组织 | 租户的认证/成员容器，BA 契约面投影 | `organization` 表（BA 面·属主 tenants） |
| 租户 | 顶层隔离与归属单元，一等**存储实体**（非 DDD 聚合——内核仍是 record+port+function 三件套） | `organization` 行上的 `status` 治理列（tenants 属主·同主键 1:1·真列+CHECK） |
| 成员 | user×组织联结 + 「他在该租户里是什么」的载体 | `member.role` 字符串列 |
| 角色 | per-tenant 的权限聚合（系统三 key + 自定义） | `tenant_role` 表行（授权事实 SSOT） |
| 权限 | 角色对资源动作的授权格（可附实例条件） | `tenant_role_grant` 表行；词汇域锁在 `tenant-rules.ts` |

---

## 8. 表 ↔ 实体 总览映射

本仓实体走**双轨制**（ORM 修宪案 B 遗产·列定律守卫）：

- **运行时实体**（app 仓储读写面）：BA 契约面八表用 `defineEntity` 零装饰器扁平标量列（归域两文件：auth `ba-identity.entities.ts` + tenants `ba-org.entities`·global-ba-entity-domain-placement·入 `MIKRO_ENTITIES`）；自有表用 `TableMeta` 列单源 + `buildRuntimeEntity` 派生 `EntitySchema`（各上下文 `infrastructure/entities/`·汇入 `MIKRO_APP_ENTITIES`，装配于 `database/mikro/mikro-orm.service.ts`）。
- **迁移忠实实体**（仅 `migration:generate` 消费·产 DDL/FK）：`apps/api/src/database/mikro/migration/migration-entities.ts`（`buildMigrationEntity` 挂真实关系·入 `MIKRO_MIGRATION_ENTITIES`）。

| 概念 | 数据表 | 运行时实体（文件 · 导出） | 属主上下文 |
|---|---|---|---|
| 用户 | `user` | auth `ba-identity.entities` · `User` | auth（台账随归位案裁①翻·users 模块纯读经端口） |
| 用户（凭证） | `account` | 同文件 · `Account` | auth |
| 用户（会话） | `session` / `verification` | 同文件 · `Session` / `Verification` | auth |
| 用户（治理态列） | `user.status`/`statusReason` | auth `ba-identity.entities` · `User`（切片C 归列·原 `user_status` 旁表已 DROP） | auth（写经 AUTH_USER_STORE.updateStatus） |
| 组织 | `organization` | tenants `ba-org.entities` · `Organization` | tenants |
| 成员 | `member` | 同文件 · `Member` | tenants |
| 邀请 | `invitation` | 同文件 · `Invitation` | tenants |
| 租户（治理态列） | `organization.status` | tenants `ba-org.entities` · `Organization`（切片B 归列·原 `tenant` 旁表已 DROP） | tenants |
| 角色 | `tenant_role` | `modules/authorization/infrastructure/entities/rbac.entities.ts` · `TenantRole`（`TENANT_ROLE_META`） | authorization |
| 权限 | `tenant_role_grant` | 同文件 · `TenantRoleGrant`（`TENANT_ROLE_GRANT_META`） | authorization |
| 权限（审计） | `tenant_role_audit` | 同文件 · `TenantRoleAudit`（`TENANT_ROLE_AUDIT_META`） | authorization |
| 分区（授权 subject） | `workspace` | `modules/workspaces/infrastructure/entities/workspace.entity.ts` · `Workspace`（`WORKSPACE_META`） | workspaces |
| 示例业务表 | `post` | `modules/posts/infrastructure/entities/post.entity.ts` · `Post`（`defineEntity`·跨模型 FK 当普通 string 列，物理 FK cascade 仍由 DB 强制） | posts |
| 订阅 | `tenant_subscription` | `modules/subscriptions/infrastructure/entities/tenant-subscription.entity.ts` · `TenantSubscription`（`TENANT_SUBSCRIPTION_META`） | subscriptions |
| 治理审计账本 | `audit_log` | tenants `modules/tenants/infrastructure/entities/audit-log.entity.ts` · `AuditLog`（`AUDIT_LOG_META`·切片 E·append-only 不可变） | tenants |
| 同意台账 | `consent` | auth `ba-identity.entities` · `Consent`（PIPL·只读投影消费·归位案裁②） | auth |

> 一致性纪律：同一张表的列定义由单一 `TableMeta` 同源派生双变体（运行时/忠实），`database/entity-column-law.ts` 守卫「表 16 张恒等 + 列对齐」——新增表不同步登记即红。

### 投影镜射（domain entity ↔ data entity ↔ table）

有持久化的上下文里，**领域实体**（`domain/entities/`·不可变数据载体 + 纯迁移函数）与其**数据实体**（`infrastructure/entities/`·映射物理表的 MikroORM `defineEntity`）不是朴素 1:1 全等，而是投影一致性 `领域态 ⊆ (数据实体 ≡ 表)`，由三件套强制——迁移 diff + 列律 / 纯全函数 `fromRow` 唯一映射缝 / `PostState↔PostEntity` 编译期结构锁（落 `infrastructure/`）。参考实现 `posts`，其余持久化上下文经已审方案跟进。规范单源见 [specs/architecture.md](./specs/architecture.md) 的 **Entity Doctrine** 与 **Projection-Mapping Doctrine**——本节只述不裁。

---

## 附：单源指针（本文只述不裁）

- 结构宪法：[`specs/architecture.md`](./specs/architecture.md) ±zh（限界上下文地图 · 术语纪律 · 三层权限链）
- 术语 SSOT：[`specs/glossary.md`](./specs/glossary.md) §1
- 方案沿革：[`plans/global-tenancy.md`](./plans/global-tenancy.md)（S0–S10）· [`plans/global-tenant-entity-reclamation.md`](./plans/global-tenant-entity-reclamation.md)（户籍表改判·已被 [`plans/global-governance-lifecycle-consolidation.md`](./plans/global-governance-lifecycle-consolidation.md) 反悔并 DROP 旁表）· [`plans/module-rbac-dynamic-roles.md`](./plans/module-rbac-dynamic-roles.md)（三源新宪）· [`plans/module-rbac-casl.md`](./plans/module-rbac-casl.md)（CASL 唯一裁决）
- 表属主台账：`apps/api/src/database/table-ownership.ts` · 实体列定律：`apps/api/src/database/entity-column-law.ts`

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.0 依当前代码取证成文（收权案结项后全景重述）；2026-10-20 / v0.2.0 增补各概念「表/实体」对应与 §8 双轨制总览映射表；2026-10-21 / v0.3.0 §8 增「投影镜射」节（回指 architecture 实体教义·只述不裁）；2026-10-23 / v0.4.0 随 global-governance-lifecycle-consolidation 翻案：`tenant`/`user_status` 两旁表 DROP、治理态归 `organization.status`/`user.status` 真列——§0 全景图、§1/§2/§3、§7/§8 映射表同步翻正。
