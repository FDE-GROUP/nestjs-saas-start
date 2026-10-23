# 术语表（Glossary）

> 状态: **起草 · 待审计**（新增 specs 文档，随 global-tenancy 审计门一并签核 · P7）| 版本: 0.3.0 | 日期: 2026-10-23
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
| **Organization（组织）** | 顶层隔离与归属单元（付费主体）·**业务实体全栈唯一词汇**（[global-organization-vocabulary-pivot](../plans/global-organization-vocabulary-pivot.md) 2026-10-23 人裁推翻旧双词汇纪律·原「Tenant（租户）」词条废止；`tenant` 仅存隔离机器内部命名与业界术语 multi-tenancy）；所有业务数据挂 `organizationId`。物理实体 = **`organization` 行上的 `status` 治理列**（真列 + DB CHECK·`id` = `organization.id` 同主键 1:1·系加于 BA **共享**表 `organization` 上的自撰域列，遵 architecture ±zh「BA 表共享」条）；旧 1:1 自有户籍表 `tenant`（[global-tenant-entity-reclamation](../plans/global-tenant-entity-reclamation.md) 2026-10-20 首立·改判旧「Tenant = organization 不另建表」）已被 [global-governance-lifecycle-consolidation](../plans/global-governance-lifecycle-consolidation.md) 2026-10-23 反悔并 DROP——组织身份即 `organization` 自身、态归其 `status` 列；**系存储实体非 DDD 聚合回归**：内核仍为 record(`ORGANIZATION_STATUS`)+port(`OrganizationStatusStore`)+function(`canTransition`) 三件套（P1 函数式内核）；`organization` 一身兼认证/成员面投影与组织生命周期载体 |
| **Owner（组织所有者）** | 创建申请人经审批通过即成为首名 owner；最高组织级角色；须至少保留一名（FR-12） |
| **Workspace（工作区）** | 组织内二级**数据分组**（D2：两级 组织→工作区）；业务表挂 `workspace_id`，查询默认按 `(organization_id, workspace_id)` 复合过滤（强数据边界，workspace 间默认互不可见）；**无独立角色/权限层** |
| **Member（成员）** | user × organization 的**多对多关系**（落 org `member` 表），带该组织内角色；一个 user 可属多个组织、角色互不相干 |
| **Membership 生命周期** | 申请（待批）/ 受邀（待接受）→ 激活 → 分配角色 → 退出仅解除该 membership，user 仍是平台用户 |
| **Role / Permission** | 组织内 RBAC 角色与权限集（组织级，(user, organization) 维度，FR-4/FR-11；裁决键词表 `TenantSubject/TenantAction` 系机制层保留名） |
| **权限层级（Permission Scope）** | 三层：**平台级**（经营者跨组织治理）· **组织级**（(user, organization) 角色）· **用户级**（绑定用户身份、与组织无关）；各自 fail-closed、互不授予（FR-11） |
| **User（平台用户）** | 在本平台注册的账号；先成为 user 方可申请 / 关联组织；可被平台经营者暂停（暂停后全局失权）。平台级失能态归 `user` 行上的 `status`/`statusReason` 治理列（[global-governance-lifecycle-consolidation](../plans/global-governance-lifecycle-consolidation.md) 切片 C·原 `user_status` 旁表已 DROP·`status` 为 additive 自撰域列）。`user` 表保持平台全局、**不加 `organization_id`** |
| **Platform Operator（平台经营者）** | 全局唯一的系统管理身份，由开发者设定、seed 时创建，不可自助注册 / 不由他人任命；统一管理组织与用户（FR-13）；区别于组织内 admin |
| **activeOrganizationId** | Better Auth org 插件在 `session` 上的字段，表示当前生效组织；本仓隔离机制（tenancy/ALS）租户上下文的数据来源（D4 session-cookie） |
| **Plan / Tier（套餐）** | 决定配额与特性开关的档位 |
| **Quota / Usage（配额/用量）** | 每组织资源计量（用户数、存储、API 调用…） |

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
| 2026-10-23 | 0.3.0 | [global-governance-lifecycle-consolidation](../plans/global-governance-lifecycle-consolidation.md) 归列翻案：`tenant`/`user_status` 两 1:1 旁表 DROP、治理态归 `organization.status` / `user.status` 真列（BA 表共享条款下的 additive 自撰域列） | Tenant 词条撤「自有户籍表 `tenant`」→「`organization` 行上 `status` 治理列·原表已随本案 DROP」；User 词条补 `status`/`statusReason` 治理列，与 architecture ±zh 术语纪律段同源 |
| 2026-10-23 | 0.4.0 | [global-organization-vocabulary-pivot](../plans/global-organization-vocabulary-pivot.md) 翻账：人裁推翻双词汇纪律（「这条纪律应该推翻，过时了」），业务实体全栈统一 organization | §1 词条 Tenant（租户）→ **Organization（组织）**（旧词条废止·`tenant` 仅存隔离机器内部命名与业界术语）；Owner/Workspace/Member/Role/权限层级/User/Operator/Quota 诸词条业务词同步换形 organization；内核件符号名更新为 `ORGANIZATION_STATUS`/`OrganizationStatusStore`；与 architecture ±zh 四命题①新措辞同源 |

---

<!-- 变更戳 -->
正文已于 2026-10-13 / v0.1.0 起草（新增 specs 文档，随 global-tenancy 审计门一并签核），于 2026-10-20 / v0.2.0 随收权案翻正 Tenant 词条，于 2026-10-23 / v0.3.0 随 global-governance-lifecycle-consolidation 归列翻案 Tenant/User 两词条（旁表 DROP·治理态归 organization.status / user.status），并于 2026-10-23 / v0.4.0 随 global-organization-vocabulary-pivot 将 Tenant 词条废止、统一为 Organization（双词汇纪律推翻·业务实体全栈 organization 化）；词条含义以经人裁决的当前正文为准。
