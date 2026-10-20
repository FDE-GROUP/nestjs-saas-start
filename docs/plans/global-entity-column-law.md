# 实体列定律：公共属性统一落在「语义 + 治理」层，不落「结构继承」层

> 适用范围: `全局(apps/api 实体列纪律 + docs/specs 宪法附录)` ← blast radius：新增定律 SSOT 文件 + 守卫测试 + `architecture.md(+zh)` 附录成文（**触宪法=高危**·须人签核）；**零 schema / 零 DDL / 零行为变更**（16 表列形一列不动）
> 关联: table-ownership.ts + table-ownership.guard.test.ts（治理=清单单源+grep 闸先例）· verify-type-escape-ratchet（豁免只减不增棘轮先例）· global-entity-context-placement（实体新家落位·本律守卫的 import 对象）· mikro-adapter 包（BA 契约面列寻址方）
> 性质: 治理成文型（把隐含惯例升格为显式可校验设计律·零迁移）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**背景**：用户问「有一些属性是每个实体都会有的，对吗」→ 对话中确认这不是省行/规模问题而是**设计统一问题**；但统一有三层（词汇语义 / 规则治理 / 结构继承），本仓实态下正解是前两层、拒绝第三层（跨上下文结构继承与垂直切片方向相反；BA 表面 8 表列形系外部契约非本仓设计权；全仓无多态消费，基类型无杠杆）。现状缺陷：语义统一**存在但隐式**——没写进宪法、没有闸，靠新表作者自觉。

**取证基线**（16 表·实跑 grep 坐实）：
- `createdAt`：16/16 全有（META 系 `defaultNow: true`；BA 表面裸 `p.datetime()`——BA 面由 adapter 契约钉死非本仓口径分歧）。
- 主键：15/16 为 `id`（`text` 或 `bigintAutoPk` 两词汇）；唯一例外 `user_status`（`userId` PK-FK）。
- `updatedAt`：**11/16**。缺 5 表、理由各成立——`event`/`tenant_role_grant`/`tenant_role_audit`（append-only 不可变语义·不伪造「最后修改」）；`member`/`invitation`（BA 上游 schema 实态·契约面不可改）。
- **真实内部不一致（本律要裁决的核心）**：有 `updatedAt` 的可变表并存两档可空口径——BA 表面 6 表与 `tenant_role` 为 `nullable()`（建后未改不伪造时间）；`workspace`/`user_status`/`tenant_subscription`/`post` 4 表为 NOT NULL（写路径显式盖章·insert 时 `updatedAt=createdAt`）。宪法未明文哪档是方向。

**目标**：实体公共列纪律成文、进闸、进宪法——达成「新表违律即 CI 红」而非「靠评审记性」。

**非目标**：零 schema/迁移（存量 4 表 NOT NULL 口径不 ALTER·以棘轮豁免登记）；不动 BA 表面任何列形；不建 BaseEntity/共享列 spread（结构统一明确拒绝·理由见 §3 R-5）；AGENTS.md 不改（包粒度指针·不复述细节，防双 SSOT）。

## 2. 方案（两片依赖序 A→B）

### 切片 A —— 定律 SSOT + 守卫测（代码·非高危）
- 新建 `apps/api/src/database/entity-column-law.ts`（清单单源）：
  - `IMMUTABLE_TABLES`：`event`/`tenant_role_grant`/`tenant_role_audit`（+理由注·append-only 语义）；
  - `BA_CONTRACT_TABLES`：BA 八表（+理由注·`mikro-auth-adapter` 契约寻址面·列集非本仓设计权）；
  - `UPDATED_AT_NULLABLE_EXEMPT`：`workspace`/`user_status`/`tenant_subscription`/`post`（现存 NOT NULL 盖章口径·**棘轮式只减不增**，沿 type-escape 先例；新增违例即闸红）。
- 设计律两条（文件头注成文）：**L1 存在性**——每张表必须 `createdAt`；可变表必须另 `updatedAt`；不可变/契约豁免须显式登记；**L2 口径**——新表 `updatedAt` 一律 `nullable()`（未改即 NULL·不伪造时间·沿 `tenant_role`/BA 面已申明的原则），存量 4 表入棘轮豁免不改。
- 新建守卫 `apps/api/src/database/entity-column-law.guard.test.ts`：**数据级核验**——值 import 各新家 `*_META` 常量（column-meta `TableMeta.columns` 纯数据）与 `Post` 实体 inspect 列名，逐条断言 L1/L2；BA 表面走 `MIKRO_ENTITIES` 表名清单恒等（新增/移除未登记即红），其列形不在本律覆盖面（契约豁免·如实声明局限沿 ownership 守卫先例文风）。豁免表 stale（列已改 nullable 仍挂账）亦红。
- 判据：`pnpm run ci` 全绿（守卫入既有 vitest 基线·基线数 +N）+ 违例自证（临时把某豁免键改名应红·验后撤）。

### 切片 B —— 宪法成文（高危·人签核后执行）
- `docs/specs/architecture.md(+zh)` 附录（Table Ownership Discipline 旁挂新条 Entity Column Law）：定律两句 + 三层统一取舍的一句话立场（结构继承被拒）+ 清单指针（单源在 `entity-column-law.ts`·**宪法不复述清单**，防漂移手法沿现附录「never copy the list here」）。
- 判据：±zh 双语对拍一致；文档树↔实存对拍。

## 3. 影响面与风险

- **blast radius**：小。两新文件 + 宪法两文件（±zh）；零 import sweep、零行为、零 DDL。
- **可逆性**：可逆（revert 即回到纯惯例状态）。
- **风险登记**：
  - R-1 L2 方向若裁反（nullable vs 盖章）将固化错口径——归人裁点②，Agent 只举证据不代裁语义偏好。
  - R-2 `Post` 实体为手写 `defineEntity`（非 META 工厂），守卫 inspect 路径与 META 不同——实施期先验证 `defineEntity` 产物可枚举属性面，不可则退化为对该文件 grep 级核验（fail-loud 不静默漏检）。
  - R-3 棘轮豁免「只减不增」需防将来误扩——闸内断言豁免表新增即红（键数硬上限）。
  - R-4 `member`/`invitation` 缺 updatedAt 是 BA 上游实态非豁免发明，登记理由必须写「契约面不在覆盖面」而非「合法缺失」。
  - R-5 结构性统一的诱惑（base spread）已被本案论证拒绝；若未来出现多态消费点（如泛型审计读写器）再立项重议，本律文件头注留此触发器。

## 4. 审计记录

> 无已审方案不写码。切片 B 触 `docs/specs` 宪法 = **高危·人签核**；整案一并过审计门。

- **归人裁点（开工前须定）→ 已人裁（2026-10-20·用户令「GO，2 取 (a)，3、4 按建议」）**：
  - **① 整案**：**GO**（用户直签）。
  - **② L2 口径**：取 **(a)** = nullable 为新表方向·存量 4 表（workspace/user_status/tenant_subscription/post）棘轮豁免不迁移。
  - **③ 守卫形态**：按建议 = 数据级 inspect（META 纯值 import）+ BA 面表名恒等。
  - **④ 提交策略**：按建议 = 两片分笔提交。
- 结论：**已结项**（两片实施·人验收 2026-10-20·提交 `572b9d1`/`66dc74b` 推送远端）
- 未决项：无。
- 审计人 / 日期：人（GO 直签·②取 (a)·③④采建议档）/ 2026-10-20

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 A：`ci` 全绿·守卫进基线（672→680·+8 测）·违例自证红（豁免键改名 → 3 断言红）后撤净复绿
- [x] 切片 A：三清单与 16 表实数对拍恒等（BA 8 + immutable 3 + 豁免 4 + 合规 nullable 1（tenant_role）=16·守卫内置恒等测持续看锁）
- [x] 切片 B：architecture.md(+zh) 附录新条双语成文（±zh 句层对拍）·清单未复述（仅指针+类别名）
- [x] README 索引状态单源同步；AGENTS.md 核验未动（包粒度指针·零漂移·留痕于 §6）

**实施期取证注**（R-2 已结）：`defineEntity` 产物实探针坐可枚举 `.tableName` + `.properties` 键面（探针用后即删），数据级 inspect 无需退化 grep；`Post` 可空性不直读（豁免账内·局限如实登守卫头注）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.3.0 | 人验收同意·状态翻正 | README 索引行翻正「已完成·两片分笔提交并推送」；本文件 §4 结论→已结项 |
| 2026-10-20 | 0.2.0 | 人签核 GO（「GO，2 取 (a)，3、4 按建议」）后两片实施 | 切片 A：`entity-column-law.ts` 三清单单源 + 数据级守卫 8 测进 CI（L1 存在性/L2 nullable 方向/豁免只减不增棘轮≤4/16 表恒等）·违例自证红后撤净；切片 B：architecture ±zh 文末附录新条成文（±zh 对拍·清单未复述）；R-2 探针坐实 defineEntity 可枚举面 |
| 2026-10-20 | 0.1.0 | 用户由「公共属性」问引出设计统一之辨，裁「需要」立方案 | 首版（**零代码·只提议**）：两片 A 定律 SSOT+数据级守卫 / B 宪法附录成文；取证 16 表列实数（updatedAt 11/16·缺 5 理由各成立·可空口径双档并存为待裁核心）；三层统一取舍论证（收语义+规则、拒结构继承）；四归人裁点留审计 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.3.0 变更，以当前正文内容为准。
