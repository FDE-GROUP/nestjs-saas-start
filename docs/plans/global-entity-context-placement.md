# 实体与事件基建归位：database/ 垂直整理（eventing 分包 + 上下文专属实体归位 + 宪法翻账）

> 适用范围: `全局(apps/api 目录结构 + docs/specs 宪法目录图)` ← blast radius：触 `docs/specs/architecture.md(+zh)` 目录树与 `AGENTS.md` §5（**宪法=高危**·须人签核）+ 约 40+ import sweep + 迁移装配面路径订正；**零 schema / 零行为 / 零契约变更**
> 关联: `global-domain-context-refactor`（归位先例 A/B/D/C 片·表属主/弱耦合裁决）· `module-tenancy-lifecycle-quota-relocation`（纯搬迁 sweep 范式）· `module-mikro-adapter-package-extraction`（非目标锁「不搬 entities」指**抽包出仓**，本片为 app 内归位·不冲突）· `table-ownership.ts`（归属判据 SSOT）
> 性质: 重写型（纯结构归位·零逻辑变更）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**背景**：`apps/api/src/database`（34 文件·~4000 行）五职责块并存——G1 schema/实体 SSOT、G2 ORM 装配、G3 ES 基建适配、G4 数据运维（seed）、G5 治理门禁（table-ownership）。用户裁定推进此前评估的 B（实体按上下文归位）+ C（eventing 分组）两方向。

**取证基线**：
- 归属判据单源已存：`table-ownership.ts` L19–39（`user→users`、`account/session/verification/consent→auth`、`organization/member/invitation/userStatus→tenants`、`workspace→workspaces`、`post→posts`、`tenantSubscription→subscriptions`、`tenantRole*→authorization`、`event→database`）。
- 实体全为零装饰器（`defineEntity`/`EntitySchema` 数据构造），**非 DI 目标**→无 `import type` 擦除/DI 元数据风险；跨模型外键皆裸 string 列（无关系对象）→无 FK 发现序风险。
- `migration-entities.ts`（迁移 DDL 忠实快照）值 import `four-tables`/`rbac-tables` 的 METAs 与 `column-meta` 原语——搬迁即路径 sweep，元数据语义不变。
- BA 表面 `entities.ts` 含 `BY_MODEL`（BA 模型名→实体寻址映射·auth 数据面），跨 users/auth/tenants 三属主**不可切**。

**目标**：database/ 达成「装配根 + 共享基建 + BA 数据面」三职责纯化；上下文专属实体各归 `modules/<ctx>/infrastructure/entities/`；ES 基建收拢 `database/eventing/`；宪法目录图同步翻账。

**非目标**：零 schema/迁移内容变更（迁移链文件不动·仅 import 路径）；零行为/路由/契约变更；`table-ownership.ts` 语义不动（仅允许语境注）；BA 表面 `entities.ts` 不拆；seed 留 `database/`（跨上下文数据运维·唯一入口 `db:seed` 脚本）；不抽包出仓。

## 2. 方案（三片依赖序 A→B→C）

### 切片 A —— `database/eventing/` 分包（原 C 案·低风险先行）
- 移入（连测试）：`mikro-event-store / domain-event-publisher / outbox-relay / mikro-unit-of-work / event-type-registry / transaction-scope` + `*.test.ts`/`*.e2e.test.ts` 伴生（`event-store.mikro.e2e`、`outbox-relay.{test,e2e.test}` 等）。
- 路径订正：`database.module.ts` 装配 import；外部直消费仅 `posts-cursor-pagination.e2e.test.ts`（transaction-scope）与 e2e 内若干——全 sweep。
- 判据：`pnpm run ci` 全绿·基线测试数**不动**（纯搬迁）。

### 切片 B —— 上下文专属实体归位（原 B 案·依 table-ownership 判据）
| 现文件 | 归宿 | 内容 |
|---|---|---|
| `mikro/post.entity.ts` | `modules/posts/infrastructure/entities/post.entity.ts` | `Post`（`MIKRO_APP_ENTITIES` 聚合点上移，见下） |
| `mikro/rbac-tables.ts` | `modules/authorization/infrastructure/entities/rbac-tables.ts` | 三表 META+实体整 cohesion（单属主） |
| `mikro/four-tables.ts` **拆散** | `workspaces/…/entities/{workspace-meta,workspace}` · `tenants/…/entities/{user-status…}` · `subscriptions/…/entities/{tenant-subscription…}` · `database/eventing/entities/{event-meta,event}` | 四实体四属主，各带走自身 META |
- **留下不搬**：`mikro/entities.ts`（BA 表面+`BY_MODEL`·auth 数据面跨三属主不可切）、`mikro/column-meta.ts`（共享元数据原语）、`mikro/orm.ts`、`mikro/mikro-orm.{module,service}`（装配根）、`mikro/migration/**`（迁移 SSOT·文件零动仅 sweep import）、`seed.ts`、`table-ownership.ts`。
- **聚合点重接**：`MIKRO_APP_ENTITIES` 移居新 `mikro/app-entities.ts`（装配根性质），从各上下文 infrastructure 值 import 实体数组再聚合——**database→modules 方向合法化注记**：装配根聚合是 app.module 式 composition-root 惯例，非层序违反（domain 层禁令 architecture §121 不受影响，实体新家皆 infrastructure）。
- sweep 面（实数实施期核）：`entities(23)+four-tables(14)+rbac-tables(3)+orm(0)` 消费方 import 改新址；`migration-entities.ts` METAs import 改四新路径；一致性套件零改（仍读 `MIKRO_ENTITIES`/`initMikroOrm`）。
- 判据：`pnpm run ci` 全绿·基线不动 + **`migration:generate` 输出「无变更」**（dev 库快照 DDL 恒等·证明搬迁未改任何元数据语义；空 diff 不落文件）+ 表所有权守卫绿。

### 切片 C —— 宪法与入口翻账（高危·人签核后执行）
- `docs/specs/architecture.md(+zh)`：database/ 行描述改「MikroORM client + BA surface entities + assembly + migrations + seed + eventing」；目录树补各 `modules/<ctx>/infrastructure/entities` 条目；补一小节「实体落位判据 = `table-ownership.ts` 表属主；BA 表面整体留 database（BY_MODEL 不可切）」（中英双份对拍）。
- `AGENTS.md` §5 目录地图同步（指针措辞·不复述细节）。
- 判据：文档树↔实存目录对拍一致（沿 domain-context-refactor C 片先例手法）。

## 3. 影响面与风险

- **blast radius**：中大。约 40–60 import 触点 sweep + 宪法两文件（±zh 计四）+ AGENTS §5；零逻辑/零 schema/零契约变更。
- **可逆性**：可逆（git revert）。
- **风险登记**：
  - R-1 四片先例复用：归位改 `@Global`/装配可见性教训（lifecycle-quota 案执行期订正）——本片实体非 provider、装配经 import 数组，无 DI 可见性面；但 `database.module` 移动路径后 `EVENT_STORE` 装配须实跑 di-context 冒烟锁。
  - R-2 DDL 恒等：唯一硬闸为 `migration:generate` 空 diff——若实跑出 diff 即元数据搬迁有误，**停下修片不硬压**。
  - R-3 `four-tables` 拆散致 META 四处：迁移忠实性依赖 `migration-entities` 同源 import——sweep 后任何漏改即 build 红（fail-loud·不静默）。
  - R-4 已抽包件零触：`@okee/mikro-adapter` 不 import 任何实体（零耦合基线），本片不动它。

## 4. 审计记录

> 无已审方案不写码。切片 C 触 `docs/specs` 宪法 = **高危·人签核**；A/B 为 app 内搬迁（非高危），但整案一并过审计门。

- **归人裁点（开工前须定）→ 已人裁（2026-10-20·用户令「GO，2、3、4 按建议」）**：
  - **① 整案**：**GO**（用户直签）。
  - **② BA 表面 `entities.ts`**：按建议 = **不拆留 database**（BY_MODEL 跨三属主不可切）。
  - **③ Event 实体归宿**：按建议 = `database/eventing/entities/`（属主 database 不变）。
  - **④ 提交策略**：按建议 = **三片分笔提交**（每片独立绿）。
- 结论：**已实施·三片落码，待人类验收与推送**
- 未决项：无。
- 审计人 / 日期：人（GO 直签·②③④采建议档）/ 2026-10-20

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 A：`ci` 全绿·基线测试数不动（实跑 PASSED 672/31skip·提交「收拢事件基建至 database/eventing/」）
- [x] 切片 B：`ci` 全绿 + `migration:generate` 空 diff（实跑 `✅ no schema diff — nothing to generate (0 migration created)`）+ 表所有权守卫绿（含于 672）+ 全仓旧路径 grep 零残留（仅剩注释留痕「原…」）
- [x] 切片 B：`ci:db`（Testcontainers gated e2e + BA 一致性链）全绿——实体搬家后真库装配实证
- [x] 切片 B：一致性套件 9/9（ci:db 内真库段实跑）·`verify:prod-boot` `/health` 200
- [x] 切片 C：architecture.md(+zh) 目录图 database/ 行翻账（BA 表面/eventing/实体新家入注）；**AGENTS §5 核验无漂移不改**（该节为包粒度指针·不复述子目录细节，改即双 SSOT 漂移——方案原文「同步」改判为「核验」）
- [x] README 索引状态单源同步

**实施期落位注**（与§2计列的微差，均为等价实现）：每上下文 META+实体合居单文件（`workspace.entity.ts`/`user-status.entity.ts`/`tenant-subscription.entity.ts`/`event.entity.ts`/`rbac.entities.ts`/`post.entity.ts`）而非 meta/实体两文件；零消费的 `MIKRO_FOUR_TABLE_ENTITIES`/`*_METAS` 聚合数组保留导出、居 `mikro/app-entities.ts`（防「删码」越界）；**tsx 链硬约束**：`migration-entities.ts`/`seed.ts`/`app-entities.ts` 等新家文件一律相对导入（tsx 不解析 `@app` 别名·实跑坐实）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.2.0 | 人签核 GO（「GO，2、3、4 按建议」）后三片实施 | 切片 A：12 件 git mv `database/eventing/`+sweep+GATED_E2E_FILES 两径订正（ci PASSED）；切片 B：六实体文件归位四上下文+`eventing/entities/`，聚合点装配根化 `mikro/app-entities.ts`，migration-entities/seed 改指新家（全相对导入），BA 表面不拆（人裁②），硬闸全绿（空 diff+ci+ci:db+prod-boot）；切片 C：architecture ±zh 目录图翻账·AGENTS §5 核验无漂移不改 |
| 2026-10-20 | 0.1.0 | 用户问「database 是否可进一步拆分」→ Agent 三向评估（抽包不可/垂直归位修宪级/目录整理口味级）→ 用户令「现在就可以考虑 B、C」→ 依「无已审方案不写码」起草 | 首版（**零代码·只提议**）：三片 A eventing 分包 / B 上下文专属实体归位（判据=table-ownership SSOT·BA 表面不拆·聚合点装配根化）/ C 宪法翻账；取证坐实零装饰器无 DI 风险、无关系对象无 FK 序风险、migration-entities 同源 import 面；四归人裁点留审计 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.2.0 变更，以当前正文内容为准。
