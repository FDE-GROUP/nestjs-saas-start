# ES/EDA 文档对账：README 技术栈补齐 + 宪法「tenants R1 回放真相」陈旧措辞订正

> 用途: **已审方案 = 开发依据**（`docs/specs/workflow.md` §2）| 受众: 人 + Agent | 语言: 中文优先（AGENTS §6）
> 定位: **文档对账**（零代码·零 schema·零行为）——消除 README/宪法与最新人裁（global-governance-lifecycle-consolidation 切片 D·2026-10-23）之间的双源漂移。

## 1. 背景与取证（事实·非推断）

人问：README「架构范式」行（`README.md:57`）「…CQRS 按需…领域事件用于跨上下文集成与审计」是否完整？ES 是否也按需引入、是否具备该能力？

取证结论：

- **不完整**：该行漏了 **ES/EDA 支柱**。宪法四支柱 canonical 表述（`architecture-zh.md:9` / `architecture.md:11` / `vision.md:63`）为「**CQRS/ES/EDA 按需但备能**」；README 技术栈行只字未提 ES/EDA，且把领域事件窄化成「集成与审计」，读不出「可逐模块翻为『回放即真相』真相源」这层能力。
- **ES 确为按需**（本仓既定教律，无需新增）：`architecture-zh.md:27`「Event Sourcing（能力基线·逐模块按需·分期递进）」；`architecture-zh.md:23` 显式「能力基线必含、实施逐模块裁（ES/EDA 同此规则）」。
- **能力已备能（码中实核）**：`EventStore` 端口（`append(+乐观锁)`/`load`＝回放读入口/`deleteByAggregate`）+ `event` 表 + 三态发布器 `EVENT_PUBLISH_MODE: inproc|shadow|outbox`（缺省 inproc）+ `OutboxRelay`（SKIP LOCKED·at-least-once）+ `publishDurable`（真相源写切换）+ `ES_TRUTH_SOURCE_SUBSCRIPTIONS` 逐上下文旋钮 + 首个真实幂等消费者（治理事件→订阅终态收敛）。**当前唯一活的「回放即真相」真相源示范是 `subscriptions` 生命周期**（`mikro-subscription.lifecycle.ts`：事件流为真相·status 降为可重建投影）。诚实边界：无快照/upcaster/完整投影重建/跨进程 broker/DLQ（roadmap「当前明确不做」·以真实回放/审计需求为门）。
- **发现相邻漂移（本案要订正的核心）**：`architecture.md:29`（EN ES 条末句）与 `architecture-zh.md:27`（ZH 对位）仍称「**Replay-as-truth is being proven pilot-first (tenants governance state machine, R1)** / 回放即真相以试点先行实证（tenants 治理状态机·R1）」；`architecture.md:119` / `architecture-zh.md:115` users 示范段亦称 tenants 治理「the R1 replay-as-truth pilot / 即 R1 回放即真相首试点」。**但** `libs/core/src/shared-kernel/domain/es-truth-source.port.ts:4-6`（人裁 2026-10-23）已明载「租户生命周期**不再作为 ES R1 试点**·`ES_TRUTH_SOURCE_TENANTS` 旋钮随治理面 ES 覆盖层一并退役（仅保留 EDA 事件发布）」；`grep ES_TRUTH_SOURCE_TENANTS apps libs --include=*.ts` 码中仅剩注释、无实体旋钮。即宪法正文这句与最新人裁自相矛盾，是**待对账的双源漂移**。

## 2. 方案（两切片·纯文档）

### 切片 A — README 技术栈行补齐（低风险·非宪法）
`README.md:57`「架构范式」条：把「CQRS 按需…领域事件用于跨上下文集成与审计」升为与四支柱 #4 对齐的「**CQRS/ES/EDA 皆按需引入·能力基线完备备能**」口径，补注「被事件化聚合可选『回放即真相』·简单 CRUD 依法可永不事件化」。

### 切片 B — 宪法 ES 条 + users 示范段陈旧「tenants R1」措辞订正（触 `docs/specs` 宪法·高危#5·已获人「同意」签核）
- `architecture.md:29` 末句 + `architecture-zh.md:27` 末句：「回放即真相以试点先行实证（tenants 治理状态机·R1）」→ 改为「**逐模块实证**：订阅生命周期为当前唯一真相源翻面示范；租户/用户治理面已降为仅审计/集成事件（`ES_TRUTH_SOURCE_TENANTS` 旋钮随 2026-10-23 治理生命周期收束案退役）」，并指向 global-governance-lifecycle-consolidation。
- `architecture.md:119` + `architecture-zh.md:115` users 示范段引子：删「R1 回放即真相试点」冠称，改为「CQRS handler spine + 审计/集成事件发布·非回放真相源」。
- EN/ZH 句对句镜像，不改其余条文、不改代码块内伪码。

## 3. 非目标 / 边界
- **不动代码**（本案零 `.ts` 变更·零门禁变更·零 DI/schema）。
- **不改 ES 路线图演变记录**（roadmap 历史切片行系在案史，按 workflow「演变行不改写」保留；roadmap 正文「按需」句本已自洽，无同款陈旧 active-pilot 断言）。
- **不改四支柱本身**（其表述已正确，本案是让 README/细则条向其对齐 + 消除细则内部矛盾）。
- **不重开 ES 试点选型**（治理面退役真相源、订阅面为示范均系既成人裁，本案仅如实落文对账）。

## 4. 审计记录
- 触发：人问「这段描述完整吗？ES 也是按需引入的，是否具备这个能力」→ Agent 取证答复，指出 README 缺 ES/EDA + 宪法「tenants R1」措辞与 2026-10-23 人裁漂移，提议两笔修正并建议先立 plan。
- 签核：人「同意」（2026-10-23）＝整案 GO，含切片 B 触宪法高危#5 的措辞订正（改动内容已在提议中逐句列明）。问责归签核人（P2）。

## 5. 完成判据
1. README:57 行含 ES/EDA 按需备能口径，与四支柱 #4 一致。
2. architecture.md ±architecture-zh.md：ES 条末句与 users 示范段不再宣称 tenants 为「回放即真相（R1）试点」；改为订阅面为真相源示范、治理面降审计/集成事件；EN/ZH 镜像。
3. 全仓对「tenants…R1 回放…试点」的 active-pilot 断言清零（演变记录/历史行除外）；与 `es-truth-source.port.ts` 注释口径一致。
4. `pnpm run check`（Biome·含 md 格式）绿；`pnpm run ci` 绿（文档变更不应扰动任何门禁——恒等/棘轮/测试全不动，纯对账）。
5. 单源对账：README 行 / 四支柱 / ES 细则条 / users 示范段四处口径一致、无残留矛盾。

## 6. 演变记录
| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-10-23 | 0.1.0 | 立方案（切片 A README 补齐 + 切片 B 宪法 tenants-R1 陈旧措辞订正·触高危#5 已随人「同意」签核） |
