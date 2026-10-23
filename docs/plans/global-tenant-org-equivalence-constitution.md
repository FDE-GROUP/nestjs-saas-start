# 租户≡组织四命题宣示入宪 + BA 契约红线扩展至表关系

> 用途: **已审方案 = 开发依据（人令 2026-10-23 直接签发·高危#5 宪法写入）**| 受众: 人 + Agent | 语言: 中文优先
> 定位: 纯文档·零代码·零 schema——`docs/specs/architecture.md` ±zh 成文。

## 1. 人裁原文（签核 = 用户指令本身）

> 本框架租户即组织，多租户（multi-tenancy）是一种数据隔离的技术和机制，BA 相关的表不作为 BA 专用表，与其他业务共享，但是，修改这些表时应优先考虑 BA 的契约，不能修改 BA 契约相关的字段、数据类型以及表关系。以上内容写入宪法。

## 2. 现状取证

- 命题 1–3 **散在已存、无集中宣示**：§呈现层命名纪律（tenant 内部术语/organization 用户面·一一对应）、§机制层 vs 业务域（tenancy/=机制非业务域）、附录 BA Table Sharing（共享表·additive 增列）——但无一条自上而下的四命题正典条。
- 命题 4 含**红线扩展**：现文（EN L328 tech-stack + 附录 L408-410 / ZH L287 + L336-337）红线均为「不得删减/修改 BA 约定字段及其数据类型」——**未含表关系**。本案将红线扩至「字段、数据类型、表关系」三位一体。

## 3. 方案（三处 × EN/ZH 镜像 = 六处成文）

- **新增 `### Tenant ≡ Organization · Multi-tenancy is the isolation mechanism (human declaration, 2026-10-23)`**：插于 §Bounded Context Map 首（EN L213 后）/ZH §限界上下文地图与多租户机制层首（L201 后）——四条正典命题（①租户≡组织·两词汇一一对应·禁第三单元概念；②多租户=数据隔离技术与机制·tenancy/ 不关心租户「是什么」；③BA 表非专用·与业务共享·可 additive 扩列；④改表 BA 契约优先·字段/数据类型/**表关系**皆不可动·红线由本案扩展），各条带指针至既有权威段（防双 SSOT）。
- **tech-stack Authentication 条**红线短语两处镜像扩展：EN L328 `fields or their data types` → `fields, their data types, or their table relations`；ZH L287 「字段及其数据类型」→「字段、其数据类型及其表关系」。
- **附录 BA Table Sharing 条**两处镜像扩展：EN L408-410 / ZH L336-337 同加「表关系」并注 per 本案宣示。

## 4. 非目标
- 不改任何代码/schema/实体/迁移（红线扩展是**约束声明**，非结构改动）。
- 不动 glossary/vision（architecture 为结构宪法主载体；glossary 既有一一对应叙述不变）。
- 不重启 tenant_role→org_role 更名讨论（四命题 ① 反证内部词汇 tenant 合法沿用）。

## 5. 完成判据
1. EN/ZH 各新增四命题宣示小节·位于 §Bounded Context Map/§限界上下文地图首。
2. 红线短语四处（EN×2 + ZH×2）皆含「表关系/table relations」·与宣示条互指。
3. `pnpm run check` 绿·pre-push ci PASSED·提交推送 HEAD==origin。

## 6. 演变记录
| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-10-23 | 0.1.0 | 立方案（人令直接签发·四命题宣示入宪 + 红线扩展至表关系·六处成文） |
| 2026-10-23 | 0.2.0 | 六处 EN/ZH 镜像成文·断言全达标（宣示小节×2·红线含关系×3/文件·旧二元措辞清零）·check 绿·已提交推送 `faafbc5`（pre-push ci Local CI PASSED）·待人类验收 |
