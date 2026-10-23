# 用户故事（As-Built）——从现有代码逆向整理

> 定位: **讲解性指南（非规范）**——本目录以**当前代码**为依据逆向沉淀已实现能力的用户故事（取证日 2026-10-20）| 规范性单源: [`docs/specs/`](./specs/)（宪法/术语）与代码本身——**这些故事是对现状的描述，不是待建需求**；与代码/specs 冲突时以代码与规范为准
> 缘起: 收权案与领域概念图（[`domain-concepts.md`](./domain-concepts.md)）结项后，需要一份「按用户/角色视角」的现能力清单，供模板使用者理解这套多租户 SaaS 框架**已经能做什么**
> 受众: 人 + Agent | 版本: 0.2.0（2026-10-20·深挖横切代码能力补齐 Epic 10 支撑面 14 条）

---

## 怎么读这些故事

每条故事三段式：**叙述**（作为/想要/以便）+ **验收**（Given/When/Then，正向与关键负向）+ **溯源**（路由动词路径 · controller 方法 · 守卫/`@Can` · 契约 schema · 关联 plan）。溯源只指文件与方法名（不引行号，防漂移）。

**角色口径**（详见 [`domain-concepts.md`](./domain-concepts.md)）：
- **访客/用户**：注册自然人（`user`，email 为体，平台全局）；
- **申请人**：发起建租的用户；**审批者/平台经营者**（operator）：跨租户治理唯一权威（DB email 命中 `platform.operatorEmail`）；
- **成员**（`member`）：进入某租户的用户，角色挂成员；租户内 **owner / admin / member**（系统三角色 + per-tenant 自定义角色）；
- **本人**：PIPL 个人权益语境下的当前登录用户。

**守卫模型**（各故事「Given」的公共前置·`app.module`/`auth.module`/`tenant-isolation.module` 的 `APP_GUARD` 序）：

```
限流墙(Throttler) → 会话墙(SessionGuard·deny-by-default·@Public 旁路)
  → CSRF 墙(CsrfOriginGuard·401 先于 403) → 租户墙(TenantIsolationGuard·deny-by-default·@TenantIsolationExempt/@Public 旁路)
  →〔逐路由叠加〕PlatformOperatorGuard（平台层）｜ AuthorizationGuard + @Can（租户/实例层）
```

`TenantIsolationMiddleware` 依 `session.activeOrganizationId` 绑定 ALS 租户上下文；deny-list 态（`pending_approval/suspended/deleted`）租户**不绑定** → 其租户业务路由 fail-closed 403。

---

## Epic 索引（按用户旅程）

| Epic | 旅程 | 覆盖上下文 | 故事数 | 文件 |
|---|---|---|---|---|
| 01 | 认证与会话 | auth（BA 原生面 + 全局守卫） | 9 | [epic-01-authentication.md](./epic-01-authentication.md) |
| 02 | 租户准入（申请·审批·失能） | tenants（申请/审批切片 + 状态机） | 4 | [epic-02-tenant-onboarding.md](./epic-02-tenant-onboarding.md) |
| 03 | 成员与邀请 | tenants（self + org-admin 门面） | 12 | [epic-03-members-invitations.md](./epic-03-members-invitations.md) |
| 04 | 角色与授权 | authorization（动态角色三表） | 7 | [epic-04-roles-permissions.md](./epic-04-roles-permissions.md) |
| 05 | 租户内分区与业务资源 | workspaces + posts（示例） | 6 | [epic-05-workspaces-business-data.md](./epic-05-workspaces-business-data.md) |
| 06 | 订阅·配额·支付 | subscriptions + payment | 9 | [epic-06-billing-subscriptions-payment.md](./epic-06-billing-subscriptions-payment.md) |
| 07 | 平台治理 | platform（租户/用户治理） | 11 | [epic-07-platform-governance.md](./epic-07-platform-governance.md) |
| 08 | 个人权益与 PIPL 合规 | users（导出/删除 + 同意台账） | 2 | [epic-08-user-rights-pipl.md](./epic-08-user-rights-pipl.md) |
| 09 | 支撑面：对象存储与存活探针 | storage + health | 4 | [epic-09-storage-and-health.md](./epic-09-storage-and-health.md) |
| 10 | 横切支撑面：响应契约·可观测·合规基线·事件集成 | common/logger/mailer/i18n/config/eventing + @saas/contracts | 14 | [epic-10-cross-cutting-support.md](./epic-10-cross-cutting-support.md) |

合计 **78 条** as-built 故事：Epic 01–09（64 条）覆盖 13 controller / ~53 路由 + BA 原生认证面 + 状态机/配额/PIPL 跨面语义；Epic 10（14 条）深挖此前未承载的**横切支撑能力**（错误/成功信封契约·校验渲染+白名单序列化·requestId 关联链·结构化日志·PIPL 数据驻留守卫 C2·CORS 白名单·邮件本地化·事件发布三模+影子追加+Outbox 投递·版本化/OpenAPI）。

---

## 单源指针（本目录只述不裁）

- 概念↔表↔实体全景：[`domain-concepts.md`](./domain-concepts.md)
- 结构宪法：[`specs/architecture.md`](./specs/architecture.md) ±zh · 术语：[`specs/glossary.md`](./specs/glossary.md)
- HTTP 契约单源：`libs/contracts/src`（`@saas/contracts` zod schema）+ OpenAPI `openapi/openapi.yaml`
- 能力沿革：[`plans/README.md`](./plans/README.md)（状态单源）——各故事溯源列出的 `module-*`/`global-*` plan 为其审方案出处

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.0 依当前代码逐路由取证成文（Epic 01–09 · 64 条）；v0.2.0（2026-10-20）按「深挖代码能力、补齐剩余用户故事」增 **Epic 10 横切支撑面 14 条**（响应契约/可观测/合规基线/事件集成·均据 `common`/`config`/`logger`/`mailer`/`i18n`/`database/eventing`/`@saas/contracts` 实存代码取证），合计数 64→78。
