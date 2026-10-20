# ES 真相源修宪案：「回放即真相」的教科书 Event Sourcing（人定向 2026-10-20 · 待审计 · 零实现）

> 适用范围: `docs/specs 宪法（architecture ±zh · vision）· event-sourcing-roadmap · database/eventing 全域 · 试点上下文写读路径 · PIPL 删除链` ← blast radius **极大**（存储范式换轨）；审计深度 = 人签核（高危#1 多轮 + 修宪）
> 关联: [event-sourcing-roadmap](./event-sourcing-roadmap.md)（本案 supersede 其「终态缺省=审计日志」口径）· 母案 [module-p0-async-boundary-correctness](./module-p0-async-boundary-correctness.md)（C 片 best-effort 语义在此升级为端到端问题）· [module-es-outbox-transactional](./module-es-outbox-transactional.md)（claim 语义缺口在真相源下升格为数据丢失）· global-tenancy（租户状态机）· PIPL 基线（C1+C2）
> 性质: **方向裁决落地案**（人明示定向·零实现·待审计门·通过后分片逐片再签）
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标（人定向）

**裁决史（如实留痕）**：2026-10-14 人澄清 ES/EDA 为确定架构目标（分期）；2026-10-20 架构精度修宪把 Phase C 降为「触发判据驱动的可选演进」、终态缺省 = 审计日志 + 集成事件（CRUD 保持唯一真相源）。**2026-10-20 人再定向（本案动因）**：「我需要的是"回放即真相"的教科书 ES」——event store 成为被事件化聚合的**唯一真相源**，读表降为可重建投影。本裁决 **supersede** 上述「Phase C 可选/降级」口径（归人裁·本案即其留痕载体）。

**目标**：把教科书 ES 定为目标终态，并给出**决策完备**的落地路线：① 六项硬问题的归人裁选项；② 首试点上下文选项；③ 分期（每片独立过审计门 + 高危逐次亲签）。

**非目标**：本 plan 不做实现；不承诺"所有上下文都事件化"（简单 CRUD 数据可依法保持 CRUD——见裁⑥）；不动微服务/broker 线。

## 2. 现状取证（实跑·本轮复核）

- `event` 表已建（append-only·`(aggregateType, aggregateId, version)` unique·payload jsonb·metadata jsonb·eventVersion 列备 upcast），shadow-append 四面覆盖：注册流（`user.registered`）+ 租户 approve/suspend/resume/delete/reject + 用户 suspend/resume（roadmap 四切片·均结项）。
- 三态发布旋钮 `EVENT_PUBLISH_MODE: inproc|shadow|outbox` 缺省 inproc；outbox 同事务化 + relay（`FOR UPDATE SKIP LOCKED`）已落地（P0′ C 片改提交后投递·best-effort）。
- **聚合管道不存在**：`AggregateRoot`/`recordEvent`/`pullDomainEvents` 全仓零命中（S1 精度修宪删除·现事件由 handler/service 构造——`reject-tenant.command-handler.ts:66` `publishAll`、`delete-user/delete-tenant` 经 `EVENT_STORE` append）。
- **回放侧全缺**：无 rehydrate/`load(aggregateId)`、无投影构建、无快照、无 upcaster；`EventStore` 端口现仅 append/查询/`deleteByAggregate`（PIPL 补删）。
- 真相源现为 CRUD：如租户态「读写链迁 tenant 户籍表真列」（module-tenancy-hard-delete 换轨片）；`QueryHandler` 直读业务表。

## 3. 硬问题清单（教科书 ES 的六道必答题 → 归人裁）

| # | 硬问题 | 选项 | 推荐档（代裁待批） |
|---|--------|------|-------------------|
| 裁① | **聚合模型重建**：无聚合管道 ⇒ 回放需要什么形态的聚合 | 甲：恢复 `AggregateRoot`+recordEvent（部分回滚 S1·事件由聚合产出）/ 乙：轻量事件溯源聚合（仅试点上下文建 `fromEvents()/apply()`·不全域恢复管道）/ 丙：无聚合纯 fold（`fold(events)→state`·最薄但业务规则回放进写路径弱） | **乙**（范围锁试点·不回 S1 全域管道·避免再修宪震荡） |
| 裁② | **既有 CRUD 数据迁移**：存量行如何成流 | 甲：bootstrap 事件（每行造 `*.bootstrapped` 快照事件·version 从 1）/ 乙：从现存治理事件流续写、缺口行拒绝回放（要求增量数据）/ 丙：双写收敛窗（先双写→切读→断 CRUD 写） | **甲+丙组合**（bootstrap 事件为流起点·切换窗以 outbox 机制同事务保证） |
| 裁③ | **写路径切换与并发**：`append(expectedVersion)` 乐观锁取代 repo.save | 甲：试点上下文 handler 改 `eventStore.append` 为唯一写·投影异步构建 / 乙：同步写投影（写模型即读模型·无异步窗） | 首片 **乙**（同事务 append+投影更新·读己之写不变·gated e2e 不碎）；异步投影留裁⑤期 |
| 裁④ | **PIPL 擦除 vs append-only**（死结·必须先裁）：教科书 ES 事件不可变 vs 被忘权 | 甲：**crypto-shredding**（每聚合数据密钥加密事件 payload·擦除=毁钥·事件行留而不可解·GDPR/PIPL 通说可接受）/ 乙：事件载荷匿名化改写+墓碑（破坏 append-only·审计留改写事实）/ 丙：试点对象选**无 PII 聚合**（治理状态类·PII 留 CRUD 侧） | **丙起步 → 甲为终态机制**（首试点避开 PII 流；crypto-shredding 单独成片过审） |
| 裁⑤ | **读侧与一致性**：CRUD 表地位 | 甲：CRUD 表降格为投影（同表·由 projector 重建·语义翻转·表名/契约零动）/ 乙：新建独立读表·旧表过渡期后退役 / 丙：直查事件流 fold（仅小流·先不做） | **甲**（`tenant` 户籍表即首个投影·对拍面/契约最稳·「可重建」写入列律豁免注记） |
| 裁⑥ | **事件 schema 演化**：payload 契约落点 | 甲：payload zod schema 入 `@saas/contracts`·`eventVersion`+upcaster 链 / 乙：仅常量事件名 + json 裸存（现状） | **甲**（zod 单源工具红线一致·upcaster 首个真实用例推迟到有 v2 事件时） |

**首试点上下文（归人裁）**：
- **A · tenants 治理状态机（推荐）**——治理事件面已收口（approve/suspend/resume/delete/reject 五事件在同流）、`tenant` 户籍表 PII 极薄（name/slug）、裁④丙档天然适配、读写链近期已换真列（投影化路径清晰）。
- B · 全新绿地小上下文（零存量包袱·但演示价值低、与主线脱节）。
- C users 聚合流（**否决**：PII 重·裁④甲机制未落地前事件化违反 PIPL 边界）。

## 4. 分期方案（每片独立 plan/过审计门·高危逐次亲签）

- **R0 修宪先行**（doc-only）：architecture ±zh §ES 条、roadmap（「终态缺省=审计日志」改「目标终态=回放即真相·分期」）、vision §7 补阶段挂注、README；本 plan 过审后执行。
- **R1 回放核心（首试点 A）**：溯源聚合（裁①乙）+ bootstrap 迁移脚本（裁②甲·dev 库先行）+ handler 写切换（裁③乙）+ `eventStore.load()` 端口扩展 + 判据测（§5-1/2/4）。触迁移/写路径 = 高危#1。
- **R2 PIPL 终局**：crypto-shredding 专项（裁④甲·信封改造 + 密钥驻留 + 被忘权 e2e）。高危（密钥·合规裁断）。
- **R3 异步投影与恢复语义**：outbox relay 从「claim 即 dispatched」升级为端到端 ack（P0′ C 片登记的「接外部 MQ 须重审」在此兑现）；投影滞后 + catch-up + 崩溃恢复判据。
- **R4 演化设施**：快照、upcaster（首个真实 v2 事件出现时）、第二上下文推广逐独立立项。
- **终态边界（保留人裁权）**：无状态/简单 CRUD 数据（sessions、verification、成员关系等）**可依法永远不事件化**——「教科书 ES」对被事件化聚合成立，不是"万物皆流"。是否扩面逐上下文归人。

## 5. 影响面与风险

- **高危命中**：#1 DB 迁移（bootstrap/信封改造·多轮）· 修宪（specs 宪法 + 事件公共契约）· PIPL 删除链改道（合规裁断归人）· 密钥管理（R2·不得入库凭证）。
- **对拍面冲击**：表所有权/列律/DDL 恒等守卫对 `event`/`tenant` 的既有断言需随裁⑤甲登记豁免/改锁；gated e2e 读写语义部分重写；BA 八表契约面不受影响（auth 面不事件化）。
- **可逆性**：R1 前一切可逆（doc）；R1 起写路径切换半可逆（保留 shadow 双写开关可回退窗）；R2 毁钥不可逆（演练先行）。
- **回滚**：逐片独立 commit（**严禁混提·承 P0′ babe233 教训**）；R1 回滚 = 切回 CRUD 写 + 投影表留存。

## 6. 完成判据（本案审计过审后逐片细化·此处为案级）

- [ ] 人对本 plan 六裁点 + 首试点选择签发（本案审计门）。
- [ ] R0 落档后，architecture/zh/vision/roadmap 四文对「真相源」表述一致、无「CRUD 唯一真相源」残留（grep 零命中或带 supersede 注记）。
- [ ] R1 起每片：带库对拍（真库回放 == 投影逐字段相等·崩溃重放收敛）+ `ci:db` 全链 + prod-boot；高危片逐次人亲签留痕。
- [ ] 本 plan 与 README/roadmap 状态单源同步。

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 人定向「回放即真相教科书 ES」·supersede 降级旧裁 | 首版呈审案：现状取证（回放侧全缺·聚合管道已删）+ 六硬问题归人裁（聚合形态/存量迁移/写切换/PIPL 死结/投影地位/契约演化）+ 首试点三选项（推荐 tenants 治理状态机）+ R0–R4 分期 ·零实现 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.0 起草（人定向·待审计·零实现）。状态以 README 索引表为单源。
