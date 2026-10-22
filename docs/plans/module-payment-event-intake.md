# 支付事件收账（Webhook 耐久落库 + eventId 幂等）实现细化案：对账链「B 侧有源」的前置切片

> 适用范围: `模块(payment) · 新增 database 表 payment_event + MikroORM 实体/迁移 · PaymentProvider 端口形状（幂等键来源） · webhook controller 写路径接线` ← blast radius **中**；触 **高危#1（新建表/schema 迁移）**；不触 HTTP 公共契约、不接真 PSP、不新增密钥（验签密钥已在各 provider 配置内）
> 关联: 母案 [module-es-billing-reconciliation-spike](./module-es-billing-reconciliation-spike.md)（§2「真实现第一步=先收外部账」·本案即该步的细化）· [event-sourcing-roadmap](./event-sourcing-roadmap.md) Phase A「写路径只有 Command→CommandHandler」· [module-es-outbox-transactional](./module-es-outbox-transactional.md)（eventId 去重窗/幂等硬要求先例）· [global-cn-adaptation](./global-cn-adaptation.md)（境内支付 P2/P3 暂缓·D9）· 样板 `database/eventing/entities/event.entity.ts`（留痕表形态）
> 性质: **实现细化案（待审）**——切片化、决策尽量前置；仍存归人裁点见 §5。**过 CreatePlan 审计门 + 高危#1 迁移亲签前不写码。**
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 0. 目标与非目标

**目标**：把入站 PSP webhook 的归一化事件 `NormalizedPaymentEvent` **耐久落 `payment_event` 表**并做到**消费幂等**（PSP at-least-once 重投不产生重复效果），使对账链具备「B 侧（外部账）有源」。本片**只收账、不处理**——落库后不动订阅/权益。

**非目标（锁）**：
- 不做对账谓词、漂移检测、修复（另片·需先裁母案 §5 权威源方向）；
- 不在本片把事件应用到 subscription/权益（`processedAt/status` 列预留但本片恒置 `received`）；
- 不接真实 PSP 凭证、不落密钥（`verifyWebhook` 已用各 provider 既有配置验签·本片不改）；
- 不改 `PaymentService` 门面既有语义、不削弱 webhook 签名校验；
- **触发判据张力如实挂账**：母案 §4 前提 (a)「真接带续费 PSP·计费进营收」当前不成立（[global-cn-adaptation](./global-cn-adaptation.md) 境内支付 P2/P3 **暂缓/D9**）。本案系**应用户明示预备审计就绪的细化案**，最终是否/何时 apply 仍归人裁——见 §5 裁ⓐ。

## 1. 现状取证（代码实证）

- **F1 webhook 是 stub**：[payment.controller.ts L142-154](../../apps/api/src/modules/payment/api/payment.controller.ts) `verifyWebhook→NormalizedPaymentEvent` 后 `switch(event.type)` 空 case、仅 `return {received:true}`——无落库/幂等/应用。
- **F2 归一化形状无外部 id**：`NormalizedPaymentEvent = { providerId; type: string; data: unknown; raw: unknown }`（[payment-provider.port.ts L57-62](../../apps/api/src/modules/payment/domain/ports/payment-provider.port.ts)）——Stripe `evt_...`/境内 `out_trade_no` 藏于 `raw`/`data`，**端口层未暴露稳定幂等键**→ 本片须先解此约束（§5 裁ⓑ）。
- **F3 留痕表样板现成**：`event` 表以 `TableMeta` 单源 + `buildRuntimeEntity` 生成运行时扁平实体，`uniques` 含 `event_event_id_key`（eventId 唯一=幂等去重锚）、`indexes` 承载拉取面（[event.entity.ts](../../apps/api/src/database/eventing/entities/event.entity.ts)）。
- **F4 表所有权登记**：`TABLE_OWNERSHIP: Record<string,string>`（`event:'database'` 等·[table-ownership.ts](../../apps/api/src/database/table-ownership.ts)）→ 新表须登记属主（本片 `payment_event:'payment'`）；恒等由 `table-ownership.guard.test.ts` 强制。
- **F5 实体装配根**：[sys-entities.ts](../../apps/api/src/database/mikro/sys-entities.ts) 集中聚合（META 单源双变体）·迁移另有 `migration/migration-entities.ts` 同源装配 → 新实体在**两处**并入 + 一组 `*_TABLE_METAS`。
- **F6 迁移链**：`mikro-migration-create <name>` 于 `apps/api/src/database/mikro/migration/migrations` 生成增量工件 + 更新 snapshot（样板 `Migration20261016181722_add_event_outbox_columns`）；`mikro-migrate` 应用；**DDL 恒等闸**=实体就位后 `migration:generate` 空 diff。
- **F7 幂等硬要求先例**：outbox/relay「at-least-once·重投必然·消费者按 eventId 或业务键幂等」为母案既有裁定（[module-es-outbox-transactional](./module-es-outbox-transactional.md)）。

## 2. 方案（垂直切片·可独立验证）

**切片 A — 表 + 实体 + 迁移（高危#1 本体）**
- `payment/infrastructure/entities/payment-event.entity.ts`：仿 `event.entity.ts` 以 `PAYMENT_EVENT_META: TableMeta` 单源（`name:'PaymentEvent'`·`tableName:'payment_event'`）+ `buildRuntimeEntity`。列（候选·幂等键形态随裁ⓑ定）：
  `id`(bigintAutoPk)·`providerEventId`(text·**unique 去重锚**)·`providerId`(text)·`eventType`(text)·`payload`(json·=`data`)·`raw`(json·nullable·原始留痕)·`occurredAt`(datetime)·`receivedAt`(datetime·defaultNow)·`processedAt`(datetime·nullable·本片恒空)·`processStatus`(text·default `received`)·`correlationId`(text·nullable)。
  `uniques:[payment_event_provider_event_id_key]`（镜像 F3）；`indexes:['(providerId,eventType)','receivedAt']`。
- 装配：`sys-entities.ts` `MIKRO_SYS_ENTITIES` + 新 `PAYMENT_TABLE_METAS`；`migration/migration-entities.ts` 同源并入。
- 表所有权：`table-ownership.ts` 加 `payment_event:'payment'`。
- 迁移：`migration:generate add_payment_event_table` → 提交工件；`migration:run`（dev 库·亲签后）。

**切片 B — 端口幂等键 + 写路径（Command→Handler 纪律）**
- 依裁ⓑ：
  - **B-甲（推荐）** 扩展 `NormalizedPaymentEvent` 加 `providerEventId: string`，各 provider 在 `verifyWebhook` 内映射（Stripe `evt.id`·境内 `out_trade_no`/`trade_no`）——端口形状变更（**内部面·非 HTTP 契约**），类型安全、去重键显式。
  - **B-乙** 端口不动，`PaymentEventRepository.record` 从 `raw` 提取外部 id（弱类型·脆）。
- 写路径遵 Phase A：Controller(webhook) **不直接改状态**→ 经 `RecordPaymentEventCommand` + `PaymentEventCommandHandler`（落 `payment_event`·幂等：`providerEventId` unique 冲突→捕获并 skip·返「已存在」）。DB-free 单测覆盖 handler（幂等/映射），真库 dup-skip 归 gated e2e。

**切片 C — webhook controller 收账接线**
- [payment.controller.ts](../../apps/api/src/modules/payment/api/payment.controller.ts) `handleWebhook`：验签后 `switch` 前**无条件先 record**（落库=审计留痕·与后续处理解耦），dup→ack 不重复；保留返回体 `webhookAckSchema`（**契约不破**·可 additive 加 `deduplicated` 布尔待裁ⓓ）。
- 现有 `switch(event.type)` 空 case 保留为**未来处理位**（本片不填）。

## 3. 影响面与风险

- **blast radius / 可逆性**：`payment_event` 为**纯 additive 新表**·零破坏·不改既有表 → 可逆（回滚=新迁移 down drop 该表·dev 先行）。命中 **高危#1（schema 迁移）**→ 迁移 `generate/run` 须人亲签；禁破坏性 `db:reset`。
- **端口变更**（B-甲）：`PaymentProvider.verifyWebhook` 返回形状 + 三 provider 实现同步；DB-free 测锁定向后兼容。不触 `@saas/contracts` HTTP 契约（若裁ⓓ加 ack 字段→才触契约面·高危#5·随签）。
- **DI/ESM**：新增 provider/handler 注入**值导入 + 显式 `@Inject`**（避 `UnknownDependenciesException`）；`@app`/`@core` 别名在 tsx 消费链须相对导入（承 sys-entities 注）。
- **数据驻留**：`raw`/`payload` 可能含 PSP 返回的客户信息→ 受 `DATA_RESIDENCY` 约束；PIPL 保留策略归后续「处理/保留」片，本片仅留痕。
- **回滚策略**：切片可分笔合入；旋钮缺省不影响主链（无 feature flag 亦安全·纯增量落库·失败仅 webhook ack 返 5xx 由 PSP 重投）。

## 4. 完成判据（可核验 + 穷尽）

- [ ] 实体 + META 单源·`migration:generate` **空 diff**（DDL 恒等·加表后再生成为空）
- [ ] `payment_event` 上 `providerEventId` **unique 生效**（真库重投同 id→第二条 dup-skip·不双插）
- [ ] gated e2e `payment-event-intake.e2e.test.ts`：真库投 fixture webhook×2 同 eventId → 表 1 行 + 第二次返 dedup；**须登记 `scripts/ci-fullstack.ts` 的 `GATED_E2E_FILES`**（漏登=不在链·恒等闸 fail-loud）
- [ ] `table-ownership.guard.test.ts` 绿（新属主登记）；core 纯度守卫不受影响
- [ ] 端口变更（B-甲）三 provider 单测对拍·向后兼容；handler DB-free 幂等测绿
- [ ] webhook 返回契约不破（openapi:drift 零漂移·除非裁ⓓ显式 additive 并随签）
- [ ] type-escape：新文件如带 `any` → `verify:type-escape:update` 落基线（棘轮只减不增）
- [ ] `pnpm run ci` 全绿 + `pnpm run ci:db`（gated）全绿 + `verify:prod-boot` `/health` 200

## 5. 归人裁点（本案不代裁·交签发）

- **裁ⓐ 时机**：鉴于母案 §4 前提 (a) 未满足 + 境内支付 **暂缓/D9**——现在就落本前置片（能力/审计就绪优先）／**挂至接真 PSP 再启**（母案勘察倾向·防过早建表）。
- **裁ⓑ 幂等键来源**：B-甲 端口扩 `providerEventId`（推荐·类型安全·触端口非 HTTP 契约）／B-乙 repository 从 raw 提取（弱·不改端口）。
- **裁ⓒ 留痕列形态**：`raw` 全量存（利于将来说不清的 PSP 字段对账）vs 仅归一 `payload`（PIPL 最小·少留 PII）——数据驻留/保留合规裁断归人。
- **裁ⓓ ack 契约**：webhook 返回是否 additive 暴露 `deduplicated`/`recorded` 布尔（触 `@saas/contracts`→高危#5）／维持 `{received:true}` 不破契约（推荐）。
- **裁ⓑ′(附)** 写路径形态：`Command→Handler`（对齐 Phase A·推荐）vs 直 `Service.record`（薄·但违「Controller 不改状态」）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 用户裁定「只先起草实现细化案」·承母案 §2「先收外部账」 | 首版：三切片（表+迁移 / 端口幂等键+Command 写路径 / webhook 接线）·高危#1 亲签闸·§5 归人裁点·§4 完成判据（含 GATED_E2E_FILES 登记 + DDL 空 diff） |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.1.0 变更，以当前正文内容为准。
