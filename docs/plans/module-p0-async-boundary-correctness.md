# P0′ 异步/事务边界正确性收口（outbox 投递时序 · 硬删原子性 · 游标精度 · session 活性 · 500 message 收口）

> 适用范围: `多上下文(platform/eventing · tenants · posts · auth/session · common/filters)` ← blast radius 较大，逐片独立可验；审计深度=人签核（含 DB 迁移·PIPL 删除链·事件投递语义三类敏感面）
> 关联: `docs/plans/module-common-error-response-contract.md`（错误契约）· `module-es-outbox-transactional`（relay 出处）· `global-readiness-error-pagination.md`（分页契约）· `global-tenant-entity-reclamation.md`（硬删链 O 系列观察）· `global-validation-zod-constitution-amendment.md`（序列化白名单）
> 性质: 修复型（改实现·**五片已实施·合批验收人签·结项**·呈报见 §6）
> 来源: 四路并行深勘 + 逐条代码复核（本 plan 只纳入**已证实**条目·证据锚点见各片「现状」；复核已把 #11 降档、无一推翻，属外部审的处置不在本片）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**共同根因**：经数轮修宪，**同步请求路径**质量（守卫链、租户隔离、契约主干、错误信封）已相当扎实；剩余高危缺陷集中在**异步 / 并发 / 时间维度**边界。本 plan 把复核证实的 5 条 🔴 正确性/活性缺陷内聚为**一批**，统一裁决「事务边界 + 投递时序 + 精度 + 索引」，避免分片立方案后互相返工（尤其 #1 发布点 × #2 事务边界同处事件/事务域）。

**目标（逐条对应复核证实）**：
- **A · #4**：非 `HttpException` 的任意 `Error.message` 不再原样回客户端（内部信息泄露）。
- **B · #3**：游标分页对**亚毫秒时间戳**（DB `now()` 种子行）不再静默丢行，恢复「无重无漏」。
- **C · #1**：outbox relay 消除「提交前发布 → 回滚生幻影事件」，并诚实化/收口「消费侧失败不可见」。
- **D · #2**：租户硬删「补删事件 + 删主行」两步原子化，闭死孤儿事件窗口（PIPL 不留残迹）。
- **E · #5**：`session.token` 命中索引（终结每请求全表扫描）+ 过期 session 清理（终结无界增长）。

**非目标**：
- 不改 provider 选择逻辑、不改认证/会话建立语义、不动 zod 请求面（🟡 安全/契约/性能其余项 #6/#7/#8/#9/#10/#12/#13/#14 各自另立 plan）。
- 本 plan 不做实现；各片修复设计选项**归人裁**后方过审计门落码。

## 2. 方案（按可独立验证的垂直切片；每片：现状取证 → 根因 → 修复选项 → 推荐档 → 验收）

### 切片 A — #4 500 错误 message 收口（最小面·可独立先行）

- **现状（事实）**：`common/filters/http-exception.filter.ts` `catch()` 中，非 `HttpException` 分支 `else if (exception instanceof Error) { message = exception.message }`，该 `message` 进入 `responseBody` 并 `reply.status(status).send(responseBody)`；此时 `status` 缺省为 `500`。DB 驱动 / PG / 连接层错误的 message 常含 SQL 片段、约束名、表列名、连接拓扑。堆栈仅在 `status>=500` 时经 `loggerService.error` 落日志（正确·保留）。
- **根因**：`message` 未按「5xx 不外泄内部细节」收口，把开发者可读文本当作用户可安全消费的字段。
- **修复选项**：
  - **甲（推荐）**：仅对**非 `HttpException`**（即框架兜底 500）的分支，`responseBody.message` 归一为 `'Internal server error'`，原始 `exception.message` 改随堆栈一并进**日志**（不进响应）。`HttpException` 显式抛出的 message（含 5xx 的 `InternalServerErrorException(msg)`）**保持透传**（那是开发者 authored 的安全文本）。
  - **乙（更严）**：凡 `status>=500` 一律 `message='Internal server error'`（连 HttpException 5xx authored message 也遮蔽）——更保守但损失运维可读性，且改变既有 5xx 契约面文案。
- **涉及**：`http-exception.filter.ts`（单文件）+ 其单测（现测需锁「非 HttpException → message 归一 + 不入响应 + 入日志」）。
- **验收**：单测注入 `new Error('SELECT ... FROM secret_table')` → 响应 `message==='Internal server error'`、`statusCode===500`、日志断言含原文；`pnpm run ci` 全绿·基线只增不减。
- **定性**：局部可逆·零迁移·零契约外形改动（`errorResponseSchema.message` 字段类型不变）·**不属高危**。可与其余片解耦先行。

### 切片 B — #3 游标分页毫秒截断静默丢行

- **现状（事实）**：`posts/infrastructure/repositories/mikro-post.repository.ts` 游标 `encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })`（JS `Date`→**毫秒**串），下页解码 `new Date(key.createdAt)`（毫秒），谓词 `{ $or:[ {createdAt:{$lt:cursorDate}}, {createdAt:{$eq:cursorDate}, id:{$lt:key.id}} ] }`，排序 `createdAt DESC, id DESC`。而 `post` 表 DDL `createdAt timestamp not null default now()`——PG `timestamp` 为**微秒**精度；`database/seed.ts` 明载「`createdAt` 靠 DB 默认 `now()` 填充·`em.insert` 不发该列」，同事务 `now()` 相等于微秒级。仓储 `create()` 走 `new Date()`（毫秒·亚毫秒尾 `.000`）。
- **根因（事实）**：混合精度表（种子/外部写=µs，app 写=ms）。当页边界行 `last` 为 µs 行时，`toISOString()` 截去亚毫秒 → `= cursorDate` 永不命中实际 µs 值，`< cursorDate` 又排除 `[cursorDate, last实际µs)` 区间 → **同刻（now() 事务内相等·本应靠 id tie-break）的后续行成批漏**。app-only 数据（ms）无此患。
- **修复选项**：
  - **甲（推荐·零迁移）**：游标改以 **`id` 单键**（`post.id` 为 **UUIDv7**·时间有序·毫秒时间前缀）。排序 `id DESC`，谓词 `id < cursorId`。UUIDv7 的 ms 时间前缀使 `id` 序与 `createdAt` 序在毫秒级一致，亚毫秒 tie 本就不可辨 → **语义等价**且彻底摆脱精度陷阱（`id` 无截断问题）。需同步改 `cursor` 编解码形状与契约（`response/page` 游标为 opaque base64·wire 不变·仅内部从 `{createdAt,id}` 换 `{id}`）。
  - **乙（µs 保真·触迁移）**：`createdAt` 列降为 `timestamp(3)`（毫秒对齐）并 backfill 现有 µs 行截断——**触 DB schema 迁移 + 数据改写 = 高危#1·人签核**，且需 `migration:generate`。
  - **丙（读原始串）**：`em` 以 formula/raw 取 createdAt 的全精度字符串入游标——与 `toRecord` 现有 `Date` 抽象冲突，复杂度高，不推荐。
- **涉及**：`mikro-post.repository.ts`（游标编解码 + 排序 + 谓词）· cursor 编解码助手（`{createdAt,id}`→`{id}`）· 分页契约测 / `posts-cursor-pagination.e2e.test.ts`（**须新增「µs 同刻种子行不丢」用例**——现有 e2e 用 app 写 ms 数据，正是掩盖此 bug 的盲区）。
- **验收**：gated e2e（真库·`E2E_DATABASE_URL`）插入若干 `createdAt` 显式带亚毫秒 µs、id 相邻的种子行，跨页遍历对拍**行数守恒、无重无漏**；`pnpm run ci` 全绿。
- **登记**：若新增/改 gated e2e 文件须同步登记 `scripts/ci-fullstack.ts` 的 `GATED_E2E_FILES`。

### 切片 C — #1 Outbox 消费侧失败不可见 + 提交前发布生幻影事件

- **现状（事实）**：`database/eventing/outbox-relay.ts` `tickOnce()` 在 `em.transactional(tx => …)` 内 `FOR UPDATE SKIP LOCKED` 取批 → 逐行 `dispatchRow`；`dispatchRow` 内 `this.eventBus.publishAll([instance])`（**无 await·无订阅错误回调**）后 `await markDispatched(tx,row.id)`；`try/catch`（`catch(error)`）意图捕获投递异常走 `attemptCount+1`/DLQ。**两处失真**：
  1. **fire-and-forget**：真实 `@nestjs/cqrs` `EventBus.publishAll` 同步入队（`subject.next`）、handler 在微任务执行，其异常**不回抛**进本 `catch` → handler 失败对 relay **不可见**，行仍被标记 `dispatched`。本仓 `tenant-status-subscription-link.e2e.test.ts` 注释**自认**「relay 对 `bus.publishAll` 是 fire-and-forget」；`outbox-relay.test.ts` 却用「同步 throw 的 mock」模拟 `publishError`——**单测锁的是真实总线不产生的失败形态**，DLQ 分支对消费失败形同虚设。
  2. **提交前发布**：发布发生在 `transactional` 块内、事务**提交之前**；若后续行处理致事务回滚，已下发至进程内总线的事件不可撤销 → 幻影事件（DB 记未投递、消费方已收到）。
  - **范围**：仅 `EVENT_PUBLISH_MODE=outbox` 时（缺省 inproc/shadow 不走 relay）。
- **根因**：把「DB 耐久投递」与「进程内尽力派发」两种语义缝合在一个事务里，且进程内总线无 ack 通道却承诺 at-least-once。
- **修复选项（核心矛盾：进程内总线无外部重试语义）**：
  - **甲（推荐·post-commit 投递 + 诚实化边界）**：
    1. `tickOnce` 事务内**只做** claim（`FOR UPDATE SKIP LOCKED` + 置 `dispatchedAt`/或 `claimedAt` 预占）→ **提交**；
    2. **提交后**再对已 claim 行 `publishAll`（消灭幻影事件：回滚则未 claim 成功、下拍重取）；
    3. 承认并**如实登记**「进程内派发为尽力而为·非端到端 at-least-once」：消费失败的重投语义在无外部 MQ 前提下不成立——要么把文档/注释从「at-least-once」降格为「at-least-once-to-relay-claim + best-effort in-process」，要么走乙。
    4. **修单测失真**：`outbox-relay.test.ts` 的 mock 不再伪装同步 throw；新增用例锁「handler 抛错不影响 `dispatchedAt` 置位」的**既定（best-effort）契约**，或改用真实 `@nestjs/cqrs` `EventBus` 集成测坐实语义。
  - **乙（引入定向错误回收·重）**：relay 侧对每事件投递等待 handler 结算（改造为 handler 返回 Promise 聚合 / 或消费方各自 try/catch 落一张 `event_processing_failure` 表），实现「消费失败可感知 + 可重投」。改动面大、触及事件消费契约，且本仓 handler 现为同步副作用——**除非确有外部订阅需求，不建议**。
- **涉及**：`outbox-relay.ts`（事务边界重排 + 提交后发布）· `outbox-relay.test.ts`（去 mock 失真 + 锁语义）· `outbox-relay.e2e.test.ts`（真库验回滚不产幻影）· 注释/文档中 at-least-once 措辞诚实化。
- **验收**：单测证明 handler 抛错场景下 relay 的决定与文档口径一致；gated e2e 构造「claim 后进程在 publish 前崩溃」→ 重启重投不产双影；`pnpm run ci` 全绿。
- **定性**：触事件投递**行为语义**（虽无对外 HTTP 契约变化），属高影响内部机制改动 → 建议人审。

### 切片 D — #2 租户硬删「补删事件 + 删主行」两步无事务原子性

- **现状（事实）**：`tenants/application/commands/handlers/delete-tenant-permanently.command-handler.ts` `execute()`：前置 `governance.findById` 校验 `status===DELETED` → ① `eventStore.deleteByAggregate('tenant', orgId)` → ② `governance.destroy(orgId)`。`deleteByAggregate`（`database/eventing/mikro-event-store.ts`）与 `destroy`（`tenants/infrastructure/repositories/mikro-tenant-governance.repository.ts`）**各自 `mikro.fork()` 取独立 em**，两步**无共享事务包裹**。且 `event` 表 DDL **无对 organization/tenant 的外键**（仅 `event_aggregate_idx`）→ 主行 FK cascade **删不到** event 行。
- **根因（事实）**：非原子的两段删除 + event 无 FK 安全网。①成功、②失败/崩溃之间，任何**不经 `deleted` 终态守卫**写入的 tenant 事件即成**孤儿**（主行已没、事件残留、relay 仍会投递幽灵事件），破 PIPL「不留残迹」。
- **可利用性（诚实标注·推断）**：`deleted` 为终态、状态机 `TRANSITIONS[DELETED]=[]` 拒再迁移 → **常规并发治理写 tenant 事件被拦**；真正裸露是「未来新增不经守卫的 `aggregateType='tenant'` append」或「②前进程崩溃且①已提交」的窄窗。**结构脆弱性确凿，现网触发概率低**（复核据此与审的原始措辞略有出入·已在裁定登记）。
- **修复选项**：
  - **甲（推荐）**：把 ①② 包进**单一 UoW**（`TransactionScope.uow.run(() => { await deleteByAggregate(...); await destroy(...) })`）——本仓已有先例：`SuspendUserCommandHandler` 注释「关键段包 `uow.run`·适配器 `fork()` ALS 感知·事务内自动同 em」。据此 `deleteByAggregate` 与 `destroy` 内部 `fork()` 在 ALS 下复用同一事务 em → 两步同生共死、原子提交；回滚则事件与主行均未变，可整请求重试。
  - **乙**：给 `event` 表加对 `organization` 的 FK（`ON DELETE CASCADE`）作 DB 兜底——但 event 是**跨聚合通用表**（`aggregateType` 可指 user/tenant），加单表 FK 破坏其通用性，**不推荐**；且触迁移=高危#1。
- **涉及**：`delete-tenant-permanently.command-handler.ts`（包 `uow.run`）· 确认 `EventStore.deleteByAggregate` 与 `GovernanceRepository.destroy` 的 `fork()` 在 ALS 事务下复用 em（若某端未走 ALS 需对齐）· 现有 `tenant-hard-delete.e2e.test.ts`（gated）**新增断言**：②失败注入 → ①事件删除一并回滚（原子）。
- **验收**：gated e2e 真库验「补删+删主行」原子（中途抛错→两者皆回滚）；正常路径无孤儿事件（`SELECT count FROM event WHERE aggregateType='tenant' AND aggregateId=deletedOrg` = 0）；`pnpm run ci` 全绿。
- **定性**：触 **PIPL 删除链事务边界**——建议人审（虽甲档不改契约/不触迁移）。

### 切片 E — #5 session.token 无索引（每请求全表扫描）+ 过期 session 无清理（无界增长）

- **现状（事实）**：`session` 表 DDL（`Migration20261016055354.ts`）`create table "session" ("id" text not null, "expiresAt" timestamp not null, "token" text not null, … primary key ("id"))`——**仅 PK**，`token` 无索引（连 unique 无）、`expiresAt` 无索引；后续迁移无补。BA 服务端直调按 `token` 查 session（`libs/mikro-adapter` `mikro-auth-adapter` `findOne WHERE token=?`）= **每请求全表 seq scan**。全域周期任务 grep（`@Cron`/`setInterval`）**除 outbox-relay 外为空** → **无任何过期 session 清理**（仅 suspend-user 定点删·verification 走 `consumeOne` 消费即删，泄露面在 session 表）。
- **根因（事实）**：缺 `token` 索引（查询放大）+ 缺过期回收（无界累积）双重复利：延迟随历史会话行数线性恶化。
- **修复选项**：
  1. **索引（必做·高危#1 DB 迁移）**：`session.token` 加**唯一索引**（BA token 本质唯一·兼作完整性防线）+ `session.expiresAt` 加普通索引（供清理扫描）。经 `migration:generate`+`migration:run` 产迁移（dev 可用 `db:reset`·生产只走 migration）。
  2. **清理（归人裁形态）**：
     - **甲（推荐）**：低频周期任务（`@nestjs/schedule` cron·如每 6h）`DELETE FROM session WHERE expiresAt < now()`（批量·走新索引）。
     - **乙**：读路径被动删（登录/校验时顺手删该用户过期 session）——零新依赖但不清理「永不再登录」的僵尸行，治标。
     - **丙**：外部（pg_cron/运维脚本）——出应用边界，不推荐（SSOT 落库外）。
- **涉及**：新迁移文件（session 索引）· `session` MikroORM 实体加 `@Index`/`@Property({unique})` 元数据（对拍迁移非空 diff 防线·见 `global-entity-column-law`）· 新增清理任务（若甲·引 `@nestjs/schedule` 依赖 = 需评估工具红线/新增依赖签核）或复用现有 interval 基建 · 清理任务单测（mock em 断言 `expiresAt<now` 删除谓词）。
- **验收**：迁移在带数据库上 `migration:generate` 空 diff 复跑（实体元数据与 DDL 对齐）；`verify:prod-boot` 起服绿；清理任务单测锁谓词；如新增依赖过 `pnpm run ci` + 依赖镜像核对（`npmmirror`）。
- **定性**：**高危#1（DB schema 迁移）** + 可能**新增依赖**（`@nestjs/schedule`）——**必须人签核，Agent 不得自行迁移/加依赖**。

## 3. 影响面与风险（blast radius / 可逆性 / 高危清单核对 workflow §3）

| 片 | blast radius | 可逆性 | 高危命中 |
|----|--------------|--------|----------|
| A #4 | 单过滤器 + 其单测 | 可逆 | **无**（契约外形不变） |
| B #3 | post 游标仓储 + cursor 助手 + 分页测 | 可逆（甲·零迁移） | 甲无；乙触迁移#1 |
| C #1 | outbox relay + 其单/集测 + 注释口径 | 半可逆（行为语义变） | 触**事件投递语义**（建议人审）·无 HTTP 契约/迁移 |
| D #2 | 硬删 handler + 相关 store fork 语义核对 + gated e2e | 可逆 | 触 **PIPL 删除链事务边界**（建议人审）·甲不触迁移/契约 |
| E #5 | session 实体 + 新迁移 + 清理任务(+新依赖) | **不可逆**（迁移·数据） | **高危#1 DB 迁移** + 可能新增依赖 → **人签核·不可代裁实现** |

**共同验收铁律**：本仓 L1 = 本地 `pnpm run ci`（Biome→build→Vitest→fallow advisory·基线只增不减）；涉 DB/启动/部署声明者须**实跑对拍**（gated e2e 真库 / `verify:prod-boot`），「配置就位/构建通过」不算完成。新增/改 gated e2e 必同步登记 `scripts/ci-fullstack.ts` 的 `GATED_E2E_FILES`。

**回滚**：A–D 逐片独立 commit，可单片 revert；E 迁移回滚用相应 down migration（或 dev `db:reset`）。

## 4. 审计记录

> 无已审方案不写码。

- 结论：**A/B/C/D 已审·GO（甲档·人类明示）**；E **待审计·未开工（高危#1 人亲签）**
- 已裁项（人类以「A/B/C/D 一并甲档 GO」明示·问责归该授权人）：
  - ① **切片拆分**：A/B/C/D 一并落码（各片独立 commit·可单片 revert）；E 独立片，本批不动。
  - ② #3 采 **甲**（uuidv7 `id` 单键游标·零迁移）。
  - ③ #1 采 **甲**（post-commit 投递 + 诚实化 best-effort·去 mock 失真）。
  - ④ #2 采 **甲**（①② 包单 `uow.run` 原子）。
- 未决项（归人裁·**Agent 不得自行实施**）：
  - ⑤ #5 清理形态 甲/乙/丙；是否引入 `@nestjs/schedule`（新依赖·工具红线核对）。
  - ⑥ E 迁移与索引 → 高危#1 **人亲签**（Agent 不自行 `migration:run`/加依赖）。
- 审计人 / 日期：人类签核（承「A/B/C/D 一并甲档 GO」）/ 2026-10-20

## 5. 完成判据（可核验 + 穷尽）

- [x] A：非 HttpException 500 → `message` 归一 `'Internal server error'`、原文入日志不入响应；单测锁（含原文样例）——`http-exception.filter.test.ts` 12 passed（注入 `SELECT…secret_table` 断言归一 + `logger.error` 一次含原文 + authored 5xx 透传）
- [x] B：游标不丢亚毫秒种子行；gated e2e 真库跨页**行数守恒**；`GATED_E2E_FILES` 登记——`pagination.test.ts` 11 + repo 单测 16 passed；`posts-cursor-pagination.e2e.test.ts`（单语句 µs 同刻种子·六行守恒）`ci:db` 真库绿；既存文件无需新登
- [x] C：relay 提交后投递（回滚不产幻影）；at-least-once 措辞诚实化；去 mock 失真·单测锁既定语义——`outbox-relay.test.ts` 10 passed（含「事务回滚→零投递」幻影回归锁）；`outbox-relay.e2e.test.ts` `ci:db` 真库绿
- [x] D：硬删 ①② 包单 UoW 原子；gated e2e 验中途失败回滚 + 零孤儿事件——`delete-tenant-permanently.command-handler.test.ts` 6 passed（②失败传播 + uow 接线）；`tenant-hard-delete.e2e.test.ts` #2 甲档原子反证（注入 `destroy` 失败→事件回滚留存）`ci:db` 真库绿
- [x] E：已拆出专章 [`module-session-index-and-expiry-reclaim`](./module-session-index-and-expiry-reclaim.md) 独立实施完成（高危#1 迁移经人「同意 GO」亲签后落）——`session_token_idx`(unique)+`session_expires_at_idx` 迁移已应·二次空 diff·gated e2e 真库绿；清理采甲′镜像 relay 零依赖（未引新依赖）
- [x] 各片 `pnpm run ci` 全绿·基线只增不减·Biome 净·fallow 0（Local CI PASSED·701 passed）；`ci:db` 带库全链 PASSED（gated e2e 10 文件 36 passed + BA 一致性 9 passed）
- [x] 零越权：E 的迁移经人「同意 GO」亲签后方于专章实施（未自行 migration:run）；未引新依赖（甲′镜像 relay）；余片过审计门后方落码

## 6. 合批验收呈报（人签·2026-10-20）

> 承人类「同意」将五片合批验收呈报固化入库。核验方式 = **三方对齐**（非凭提交标签/记忆）：① as-built 代码标志实读 ② 锁测（§5 记录·E 收口时全链复跑覆盖）③ git 落地取证。

- **结论**：**五片（A/B/C/D/E）合批验收通过·结项**（审计人=人类·2026-10-20）。
- **实现提交索引**：A/B/C/D 代码+锁测与归位修宪 doc **混承载于 `babe233`**（14 文件 +357/−218），回写 `78f30eb`；E 呈审 `f4dfdcf` / 实现 `61bda4e`（origin/main）。
- **as-built 实据**（本轮实读）：A `http-exception.filter.ts` 缺省归一 `'Internal server error'`（原文只入日志）；B `mikro-post.repository.ts` `encodeCursor({id})` + 谓词 `id < cursorId` + `ORDER BY id DESC`；C `outbox-relay.ts` 事务内只 claim、**提交后** `publishAll`（best-effort 不回滚 claim）；D `delete-tenant-permanently.command-handler.ts`（现居 `modules/tenants/…`）`uow.run` 包 ①补删+②删主行；E `Migration20261020150833`（unique+普通索引·二次空 diff·库直查在位）+ `SessionReclaimService`（缺省关·镜像 relay 零依赖）。
- **偏差登记（如实·不掩盖）**：`babe233` 题为 `docs(plans)` 却承载 A/B/C/D 生产代码——① 提交类型与内容不符；② §3 曾承诺「A–D 逐片独立 commit·可单片 revert」，实为一提交**不可单片 revert**。代码正确性不受影响，回滚粒度与留痕受损。纪律成文：**严禁以 `docs(*)` 承载生产代码**。
- **验收附带·部署前置（非本片缺陷）**：① E 回收缺省关——生产须显式 `SESSION_RECLAIM_ENABLED=true`，否则无界增长仍在（仅查询已索引化），runbook 待补；② token unique 上线前对已 populate 生产库查重（重复行会阻 `migration:up`，必要时拆「普通→清重→升 unique」）；③ C 为 best-effort in-process 语义，接外部 MQ 时须重审。

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 起草 | 首版（承四路深勘 + 🔴 逐条代码复核·纯方案·零实现·待审计） |
| 2026-10-20 | 0.2.0 | A/B/C/D 甲档落码 | 承人类「A/B/C/D 一并甲档 GO」：A #4 500 message 收口·B #3 uuidv7 id 单键游标·C #1 post-commit 投递诚实化·D #2 硬删 ①② 包单 uow.run；各片单测 + gated e2e（B/C/D）真库绿·E 零改动待亲签 |
| 2026-10-20 | 0.3.0 | E 拆专章实施完成 | 承人「同意」=GO E·亲签迁移：E 拆为 `module-session-index-and-expiry-reclaim` 专章独立落地（F1 索引迁移 unique+普通·二次空 diff·库直查双索引；F2 甲′镜像 relay 零依赖清理+config 两键+单测 5+gated e2e 3真库）·ci(705)/ci:db(gated 11+BA 9)/prod-boot 全绿。至此 P0′ 五片 A/B/C/D/E 均实施·待人类验收 |
| 2026-10-20 | 0.4.0 | 合批验收人签·结项 | 承人「同意」新增 §6 合批验收呈报（三方对齐实读取证·五片通过结项）；坦白登记 babe233 docs 混提生产代码偏差；部署前置（回收开关/unique 查重/MQ 重审）随批留痕。README 单源同步翻「已验收·结项」 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.4.0 更新：§6 合批验收呈报入库（人签·五片结项·babe233 混提偏差如实登记·部署前置随批留痕）。状态以 README 索引表为单源。
