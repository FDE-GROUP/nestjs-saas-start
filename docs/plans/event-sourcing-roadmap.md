# 事件溯源与事件驱动架构路线图（ES + EDA Roadmap）

> 受众: **人 + Agent**（**确定采纳目标**·分期递延；`读者: Agent`）| 语言: 中文优先（`AGENTS.md` §6）

事件溯源（ES）与事件驱动架构（EDA）是**已确定的架构目标**（人澄清 2026-10-14：当前架构 CA + DDD + CQRS，**明确还需增加 ES 与 EDA**），按分期**审慎递进**：分期节奏与门禁不变，但不再以「某上下文真需要才做」为前提。本文记录：(a) 当前 CA/DDD/CQRS 构建中**已接好的钩子**、(b) 点亮它们所需的**具体 schema 与写路径切换**、(c) Sagas 如何**叠加其上**。

指导原则：**现在只做让未来 ES/EDA 变便宜的最小工作，但方向已定、按分期推进**。ES 是存储范式（事后 retrofit 很贵），不同于 CA/DDD/CQRS 这类代码组织方式（随时可重构）——所以**接缝预先切好**；EDA 的演进路径：Phase A 进程内事件（已落地）→ Phase B 同事务 outbox（耐久发布）→ 跨进程 broker 订阅（微服务触发后，见 [microservice-readiness](./microservice-readiness.md) §2.2）。

## Phase A — 今天已接好的钩子（本仓库现状）

1. **写路径只有 Command → CommandHandler**。Controller 从不直接改状态。把某个 handler 的持久化从 CRUD 换成 append-event，只触及 handler + repository，不触及传输层。
2. ~~**聚合根记录领域事件**：经 `AggregateRoot.recordEvent(...)` 记录、`pullDomainEvents()` 暴露。仓储返回同一个聚合实例，使待派发事件活到 dispatch 点。见 `libs/core/src/shared-kernel/domain/aggregate-root.ts` 与 `apps/api/src/modules/users/domain/entities/user.aggregate.ts`。~~ **（2026-10-20 R0 sweep·幻影订正）**聚合事件管道已随架构精度修宪 S1 删除，上述两文件不存在（从未存在）；事件现由 service/handler 层直接产出（P3「操作记录」正式模式）：`TenantStatusService/UserStatusService.transition`、reject/delete handlers 经 `EventBus.publishAll` + `EVENT_STORE` 端口。
3. **`DomainEvent` 信封已是 ES 形状**——`eventId`、`aggregateId`、`aggregateType`、`eventType`、`eventVersion`、`occurredAt`、`correlationId`、`causationId`、`payload`。这些正是一张 append-only 存储表的全部列；`eventVersion` 就是未来 upcaster 的键。（原注契约测试 `user-registered.event.test.ts` 系幻影·从未入库（2026-10-20 R0 sweep）；现事件类契约由 `EventBus` 三实现一致性测等锁定，如 `TenantRejectedEvent`。）
4. 事件当前**进程内派发**：`EventBus.publishAll(...)` + `@EventsHandler`（`apps/api/src/modules/users/infrastructure/dispatchers/`）。（Phase A 快照时点「什么都不持久化」；Phase B 后 event store（shadow append·0009）与 outbox+relay 已分别于 2026-10-14/17 落地——见下段与「当前明确不做」段校准；投影/快照/upcaster 仍无。）

## Phase B — 为选定上下文点亮 ES

> **首切片已落地（shadow append·2026-10-14·[module-users-es-append](./module-users-es-append.md)）**：users 域事件经双模开关耐久落 `event` 表（迁移 0009·camelCase 列名 + `eventId` 保真列·见其 §6），CRUD 仍为唯一真相源（**切片时点口径·已被 2026-10-20 人定向 supersede**：被事件化聚合以 event store 为唯一真相源·读表降为可重建投影；本切片事实——shadow 追加不改写主表——仍成立）；下述 schema 即其形态，回放/投影/同事务化待续。
>
> **架构精度修宪改口（2026-10-20）**：① 注册流事件随 User 聚合死管道删除（S1）——users 聚合流现存 `user.status.transitioned`；② 事件语义正名为「操作记录」（P3·service/handler 发布为正式模式，非聚合事件妥协）；③ ~~**Phase C 降为触发判据驱动的可选演进**——终态缺省 = 审计日志 + 集成事件，ES 转真相源须有具体触发判据（如订阅计费对账重放）另立专项过审~~ **（该终态口径已被同日人定向「回放即真相」supersede——见 [module-es-truth-source-amendment](./module-es-truth-source-amendment.md)：event store 为被事件化聚合唯一真相源·能力基线 + 逐模块按需实施；「另立专项过审」仍成立=R1 逐片审计）**。
>
> **第二切片已落地（2026-10-14·[module-tenancy-es-lifecycle-events](./module-tenancy-es-lifecycle-events.md)）**：租户治理动作（approve/suspend/resume/delete）经 `TenantStatusService.transition` 单点产出 `tenant.status.transitioned` 同表耐久（无新迁移）；`EventStore.deleteByAggregate` 收口 PIPL 硬删级联补删（§6-④ 定向关闭）。
>
> **第三切片已落地（2026-10-14·[module-tenancy-es-user-status-events](./module-tenancy-es-user-status-events.md)）**：平台用户 suspend/resume 经 `UserStatusService.transition` 产出 `user.status.transitioned`，（**2026-10-20 R0 sweep 订正**：注册流 `user.registered` 系幻影·从未入库，码中 event 流实为 `tenant.status.transitioned` / `tenant.rejected` / `user.status.transitioned` 三种。至此 event store 覆盖：租户/用户两级治理动作。）
>
> **第四切片已落地（2026-10-14·[module-tenancy-es-tenant-rejected-event](./module-tenancy-es-tenant-rejected-event.md)）**：reject 硬删成功产出 `tenant.rejected`（同 tenant 流·PII 最小：只留审计事实不留申请内容），治理事件面**收口**——含对第二切片 §6-①「需动迁移表」误判的忠实修正（reject 实为硬删路径不经状态机）。Phase B shadow-append 覆盖面无已知缺口；后半（同事务化/rehydrate）待专项方案。（**后续校准 2026-10-20·R0 sweep**：其时 reject 路径缺事件，后由 E 片 `tenant.rejected` 补齐；同事务化 + relay 后已落地；「无缺口」仅指当时 shadow 覆盖面，回放/投影侧仍全缺——见 [module-es-truth-source-amendment](./module-es-truth-source-amendment.md) §2。）
>
> **Phase B 后半已落地（2026-10-17·[module-es-outbox-transactional](./module-es-outbox-transactional.md)）**：经人再裁决（推翻「shadow append 即终态」既有裁决）同事务化 outbox + relay 耐久投递落地——`EVENT_PUBLISH_MODE: inproc|shadow|outbox` 三态旋钮（缺省 inproc·行为逐字节等价）；`UNIT_OF_WORK` ambient 事务使业务行与事件行**同生共死**（dual-write 窗口消灭）；app 内 `OutboxRelay` 以 `FOR UPDATE SKIP LOCKED` 批量投递、`eventVersion` 拒收、重试上限表内留痕、eventId 去重窗。**投递语义 at-least-once：重投必然发生，消费者幂等为硬要求**（裁点丙·`@EventsHandler` 消费方须按 `eventId` 或业务键幂等）。rehydrate/投影/快照仍待后续。**消费者兑现（2026-10-17·[module-es-first-real-consumer](./module-es-first-real-consumer.md) 治理档）**：首个真实业务消费者落地——`tenant.status.transitioned` → 订阅行终态收敛（suspend→suspended·resume→active·业务键收敛式幂等·gated 真库重投零重复效果实证），硬要求自此有真实兑现体；附带应用生成 id 切 UUIDv7（时序可排·零迁移）。

只针对**实际需要审计轨迹/回放能力的重状态上下文**（如 orders / ledger）；经 2026-10-20 定向澄清（能力基线 + 逐模块按需实施），是否转「回放即真相」逐模块立项归人裁，简单 CRUD 可依法永不事件化（判据与 CQRS P4 同构·R0 已入 architecture §ES 条）。auth users 这类有状态身份数据**可能永远保持 CRUD**。

### Event store 表（MikroORM）

> 下表为**初稿示意 DDL**（snake_case 仅为直观）；实际落表列名为 **camelCase**（`EntityCaseNamingStrategy` 对齐 BA 字段名）且含 `eventId` 保真列——**以首切片 [module-users-es-append](./module-users-es-append.md) §6 为准**，本表已随基线迁移 `Migration20261016055354` 建立。

```sql
CREATE TABLE event (
  id            bigserial PRIMARY KEY,        -- 全局序列（全局排序）
  aggregate_id  text        NOT NULL,          -- 流 id
  aggregate_type text       NOT NULL,          -- 如 'user'
  version       int         NOT NULL,          -- 聚合内序列，乐观锁
  event_type    text        NOT NULL,          -- 'user.registered'
  event_version int         NOT NULL,          -- 用于 upcasting 的 schema 版本
  payload       jsonb       NOT NULL,
  metadata      jsonb,                         -- correlationId/causationId/actor/...
  occurred_at   timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_type, aggregate_id, version)
);
CREATE INDEX event_aggregate_idx ON event (aggregate_type, aggregate_id);
```

经 **MikroORM** `migration:generate` + `migration:run`（tsx 运行器 · 见 `docs/mikro-migration-guide.md`）落表（显式迁移，**永不** `synchronize` / schema push 到生产）；新表属高危#1，逐次人审后 apply。

### 写路径切换

- 今天：`handler → repo.save(aggregate)`（INSERT/UPDATE），然后 `eventBus.publishAll(events)`。
- ES：`handler → eventStore.append(aggregateId, events, expectedVersion)`——聚合的 `toState()`/`rehydrate()` 通过回放事件重建当前状态。
- 被 append 的就是 `pullDomainEvents()` 的输出（metadata → `jsonb`）。Command handler 主体其余不变。
- 若事件必须与 append **同事务跨进程边界**，引入 **outbox**（避免 dual-write）。设计参考（机制级借鉴·非工具链，见 [research/nestjs-fastify-nx-review.md](../research/nestjs-fastify-nx-review.md) §2.2 / [plans/microservice-readiness.md](./microservice-readiness.md) §2.3-2）：① 域行与事件行**同事务原子写**；② 事件名集中常量 + 契约测试双向锁定（与 trigger SQL/仓储同锁）；③ envelope 携 schema 版本，relay **拒收**比自己新的信封而非猜；④ 消费者幂等为硬要求（重投必然发生）；⑤ 发布通道做成**双模开关**（进程内默认 / outbox 耐久），与 Phase A 平滑共存。**①–⑤ 已由 [module-es-outbox-transactional](./module-es-outbox-transactional.md) 全部落地**（⑤ 终态为三态 `EVENT_PUBLISH_MODE`·超出原双模设想）。

### 读侧

- 从事件流构建**投影（projections）**写入读表；现有 `Query` handler 继续读这些表——其契约不变。
- 当某条流的重放成本开始要紧时加**快照（snapshots）**（存 `aggregate_type='snapshot'` 或独立表；从最近快照回放）。

## Phase C — Sagas（流程编排）【触发判据驱动·可选项·架构精度修宪改口】

> **口径校准（2026-10-20·R0）**：本节「可选」定位不变（Sagas 仍按判据触发）；但精度修宪段的「终态缺省 = 审计日志 + 集成事件」真相源口径已被同日人定向 supersede——见 [module-es-truth-source-amendment](./module-es-truth-source-amendment.md)（event store 为被事件化聚合唯一真相源·能力基线 + 逐模块按需实施）。

`@nestjs/cqrs` 自带 Sagas：一个响应事件、发出命令的 `@Saga()` 生成器，支撑跨上下文的**补偿事务**（如 register → create profile → 失败则删除 auth user）。在需要多步编排之处替代 Phase A 中临时的 `@EventsHandler` 反应。无 DB 变更；Saga 放在 `application/`。

## 当前明确不做（分期节奏，非方向保留）

无投影、无快照、无 upcaster、无 broker 跨进程订阅、无独立死信表（relay 以表内 `attemptCount` 顶限 + `lastError` 留痕代 DLQ）。这些属于 Phase B 后段/C，**以真实的回放/审计需求为门**。event store（shadow append）与 outbox 同事务化 + relay 耐久投递已分别于 2026-10-14 / 2026-10-17 落地，不再列入「不做」。

## 参考警示

那些号称「Event Sourcing」、实际只用进程内事件总线的 boilerplate（如 `@nestjs/event-emitter` + sagas、无 store/回放）**是事件驱动，不是 ES**。本路线图保持这个区分的诚实性：Phase A 是事件驱动；ES 从 Phase B 才开始。

## 演变记录

| 日期 | 变更 |
|------|------|
| 2026-10-20 | R0 修宪 sweep（事实订正 + supersede 注记·ES 真相源修宪案过审后首个非实现动作）：① 幻影清理——`aggregate-root.ts`/`user.aggregate.ts`/`user-registered.event.test.ts`/`user.registered` 四指针经磁盘实核均不存在（从未入库），Phase A 第 2/3 条与第三切片句订正为现状口径（事件面实为 tenant.transitioned/tenant.rejected/user.status.transitioned 三种）；第四切片「无已知缺口」补后续校准；② 「终态缺省=审计日志」口径挂 supersede 注（首切片句/改口块/Phase C 头·历史行不改写）；③ 「只针对」段挂能力基线+逐模块按需澄清 |
| 2026-10-17 | 人签核（AskUserQuestion）：本路线图文档**整篇视同已审计**——方向确证（人澄清 2026-10-14）+ Phase A/B 各切片均已逐个过审计门落地·路线自身无待裁项；后续新切片仍逐片过审计门；README 索引行审计列同步翻牌 |
| 2026-10-17 | 账目卫生扫描（事实订正留痕）：Phase A「本仓库现状」段三行引用路径校准至现布局（`packages/core→libs/core`·`apps/reference→apps/api`·逐条磁盘实存坐实）；第 4 条「什么都不持久化」现状句与 Phase B 已落地事实自相矛盾，改为带时点口径的如实描述（历史演变行不改写） |
| 2026-10-17 | 消费者兑现留痕（module-es-first-real-consumer 治理档）：首个真实业务消费者（治理→订阅终态收敛·幂等真库实证）；附带应用生成 id 切 UUIDv7 |
| 2026-10-17 | Phase B 后半（outbox 同事务化 + relay）落地留痕（第五切片引用段）；消费者幂等硬要求显式声明；「当前明确不做」段校准（event store/outbox 移出·补无独立死信表口径） |
| 2026-10-14 | 整篇中文化（AGENTS §6 中文优先）；Phase A 引用路径校准至 S10 后布局（`packages/core/src/shared-kernel/*`、`apps/reference/src/modules/users/*`）；补 outbox 设计参考链接（前次已回灌）；补高危#1 口径一句 |
| 2026-10-14 | 经人澄清升格定位：ES + EDA 为**确定的架构目标**（CA+DDD+CQRS+ES+EDA 五件套），分期节奏与门禁不变；标题/指导原则改写，补 EDA 演进路径（进程内→outbox→broker） |
