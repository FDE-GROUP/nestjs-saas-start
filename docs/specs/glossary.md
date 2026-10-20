# 术语表（Glossary）

> 状态: **起草 · 待审计**（新增 specs 文档，随 global-tenancy 审计门一并签核 · P7）| 版本: 0.2.0 | 日期: 2026-10-20
> 归属: `docs/specs/`（项目宪法层 · 人/团队平面）| 性质: **重写型**（正文整体重写 + 变更戳 + 演变单列，`workflow.md` §2.4）
> 关联: [vision.md](./vision.md) · [architecture.md](./architecture.md) · [global-tenancy.md](../plans/global-tenancy.md) §3 · [global-cn-adaptation.md](../plans/global-cn-adaptation.md) §3
> 受众: **人 + Agent**（`读者: Agent`——术语为跨 plan 共识基，宜注入 agent 上下文）

---

## 0. 定位

本表是**项目级术语 SSOT**（单一权威源）。各 plan 的「领域词汇」章**以本表为准**；新增 / 修订词条**先改本表**、再回写引用它的 plan，防双 SSOT 漂移（`workflow.md` 原则）。词条含义经人裁决后固化；冲突词在此当场锐化。

## 1. 多租户（Tenancy）

> 来源：[global-tenancy.md](../plans/global-tenancy.md) §3（依 D1–D6 裁决）

| 词 | 含义 |
|----|------|
| **Tenant（租户）** | 顶层隔离与归属单元（付费主体）；所有业务数据挂 `tenant_id`。物理实体 = 自有户籍表 `tenant`（`status` 真列 + DB CHECK·`id` = `organization.id` 同值代理 PK——[global-tenant-entity-reclamation](../plans/global-tenant-entity-reclamation.md) 2026-10-20 改判旧「Tenant = organization 不另建表」（global-tenancy §9.2））；**系存储实体非 DDD 聚合回归**：内核仍为 record(`TENANT_STATUS`)+port(`TenantStatusStore`)+function(`canTransition`) 三件套（P1 函数式内核）；`organization` 为其认证/成员面投影 |
| **Owner（租户所有者）** | 创建申请人经审批通过即成为首名 owner；最高租户级角色；须至少保留一名（FR-12） |
| **Workspace（工作区）** | 租户内二级**数据分组**（D2：两级 租户→工作区）；业务表挂 `workspace_id`，查询默认按 `(tenant_id, workspace_id)` 复合过滤（强数据边界，workspace 间默认互不可见）；**无独立角色/权限层** |
| **Member（成员）** | user × tenant 的**多对多关系**（落 org `member` 表），带该租户内角色；一个 user 可属多个租户、角色互不相干 |
| **Membership 生命周期** | 申请（待批）/ 受邀（待接受）→ 激活 → 分配角色 → 退出仅解除该 membership，user 仍是平台用户 |
| **Role / Permission** | 租户内 RBAC 角色与权限集（租户级，(user,tenant) 维度，FR-4/FR-11） |
| **权限层级（Permission Scope）** | 三层：**平台级**（经营者跨租户治理）· **租户级**（(user,tenant) 角色）· **用户级**（绑定用户身份、与租户无关）；各自 fail-closed、互不授予（FR-11） |
| **User（平台用户）** | 在本平台注册的账号；先成为 user 方可申请 / 关联租户；可被平台经营者暂停（暂停后全局失权）。`users` 表保持平台全局、**不加 `tenant_id`** |
| **Platform Operator（平台经营者）** | 全局唯一的系统管理身份，由开发者设定、seed 时创建，不可自助注册 / 不由他人任命；统一管理租户与用户（FR-13）；区别于租户内 admin |
| **activeOrganizationId** | Better Auth org 插件在 `session` 上的字段，表示当前生效租户；本仓租户上下文的数据来源（D4 session-cookie） |
| **Plan / Tier（套餐）** | 决定配额与特性开关的档位 |
| **Quota / Usage（配额/用量）** | 每租户资源计量（用户数、存储、API 调用…） |

## 2. 地域与合规（China Region & Compliance）

> 来源：[global-cn-adaptation.md](../plans/global-cn-adaptation.md) §3

| 词 | 含义 |
|----|------|
| **PaymentProvider（支付通道）** | 统一支付接口；实现 = `StripeProvider` / `WechatPayProvider` / `AlipayProvider`。与 storage provider 同构，落 infrastructure 层 |
| **AuthIdentityProvider（登录渠道）** | 社交 / 企业身份登录渠道；`Google/GitHub`（保留）+ `Wechat`(开放平台/公众号) / `Wecom`(企业微信) / `DingTalk`(钉钉) / `Feishu`(飞书)，经 Better Auth `genericOAuth` |
| **accountSubject** | 渠道侧用户唯一标识（unionid / corpid+userid / 钉钉 unionId / 飞书 open_id），落 `account.accountId` 关联到 email user |
| **周期扣款 / 委托代扣** | 支付宝「周期扣款协议」、微信「委托代扣」——签约后自动续费，需商户资质；对应订阅制 |
| **数据驻留（Data Residency）** | 个人/业务数据存于境内 region（部署 + DB/存储 region 选项，配置层强约束） |
| **PIPL** | 《个人信息保护法》：告知-同意、最小必要、按自然人 user 查阅/导出/删除 |
| **ICP 备案** | 境内域名 / 对外服务的行政前置，属部署范畴、非代码门禁 |

## 3. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-13 | 0.1.0 | 建项目级术语 SSOT，收拢两份 plan 的领域词汇（履行 global-tenancy §7「术语并入 specs」判据） | 新建：§1 多租户 · §2 地域与合规 · 定位与 SSOT 约定 |
| 2026-10-20 | 0.2.0 | 收权案翻账：Tenant 词条载旧裁「= organization 不另建表」已被签核改判，防术语 SSOT 漂移 | Tenant 词条重写（自有户籍表 `tenant`·同值代理 PK·存储实体非聚合回归·org 为认证/成员面投影），与 architecture ±zh 术语纪律段同源 |

---

<!-- 变更戳 -->
正文已于 2026-10-13 / v0.1.0 起草（新增 specs 文档，随 global-tenancy 审计门一并签核），并于 2026-10-20 / v0.2.0 随收权案翻正 Tenant 词条；词条含义以经人裁决的当前正文为准。
