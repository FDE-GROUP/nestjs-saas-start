# 计费对账重放 前置勘察案：内部权益态 × PSP 外部账的漂移检测与修复——**纯勘察·零实现·不接 PSP·不落密钥·挂触发判据**

> 适用范围: `payment（webhook 分发/端口）× subscriptions（事件流真相源/权益读侧）× database/eventing（event store/replay/outbox/幂等）× 周期任务面` ← blast radius **大且涉资金语义·不可逆**（修复方向错=账务错）；审计深度 = 人签核（高危#1 落表/新增调度 + 资金/密钥合规裁断归人）
> 关联: 母案 [module-es-truth-source-amendment](./module-es-truth-source-amendment.md) · [event-sourcing-roadmap](./event-sourcing-roadmap.md)（**本案缘起**：其「ES 转真相源须有具体触发判据·如订阅计费对账重放·另立专项过审」）· [module-es-r4-second-context-subscriptions](./module-es-r4-second-context-subscriptions.md)（订阅 lifecycle 已事件化=内网一侧账就位）· [module-es-first-real-consumer](./module-es-first-real-consumer.md)（幂等收敛消费者范式）· [global-cn-adaptation](./global-cn-adaptation.md)（通道 recurring 能力差异）
> 性质: **前置勘察 / 触发判据 spike 案**——只出「机制要点 + 现状取证 + 冲击面 + 归人裁点 + 触发判据 + spike 验证判据」，**不含实现**；过审后据勘察结论决定「是否/何时立真实现案」
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 0. 本案定位与触发缘起

ES 路线把「**订阅计费对账重放**」点名为 ES 转真相源需**另立专项过审**的具体触发判据之一。经本窗复核：订阅 lifecycle 已被 R4 事件化（`subscription.{created,status.transitioned,bootstrapped}` + fold + 真相源写读链 + 投影），**「内网一侧的权益时间线可回放」这半已就位**；但「**对账**」的另一语义——**拿内网权益态与 PSP（Stripe/alipay/wechat）外部账比对、检出漂移、按权威方向修复**——**尚无 substrate**（见 §1 F1/F6）。

故本案**不是** R4 的重复（R4 治「状态真相源」，本案治「跨系统账务一致性」，正交），也**不预设现在就建**。本案交付两件事：(a) 若要落真·计费对账，机制上须备什么、会冲击哪些已落地面；(b) **触发判据**——满足什么条件才值得立项实现。在此之前维持「判据与能力就位·零实现」。

## 1. 现状取证（代码实证·本窗复核）

| # | 事实 | 取证锚点 | 对「对账」的含义 |
|---|------|----------|------------------|
| F1 | PSP webhook 分发是**空 stub**：`verifyWebhook` 返回 `NormalizedPaymentEvent` 后，`switch(event.type)` 各 case 体为空、仅 `return {received:true}`——**无落库·无幂等·无对订阅/权益的任何应用** | [payment.controller.ts L142-154](../../apps/api/src/modules/payment/api/payment.controller.ts) | **外部账根本没被收下来**→ 对账缺「一侧之账」·真实现的前置是先补 webhook 耐久留痕 |
| F2 | `PaymentProvider` 端口归一化：`createCheckout/retrieveCheckout/refund/verifyWebhook/supportsRecurring` + `NormalizedPaymentEvent{type,…}`；通道 stripe/alipay/wechat_pay，**仅 stripe `supportsRecurring()=true`** | [payment.service.ts](../../apps/api/src/modules/payment/application/payment.service.ts)·`domain/ports/payment-provider.port` | 原料形状在但未持久化；CN 通道无 recurring→续费事实无法由 PSP 推，对账谓词须按通道分级（裁ⓔ） |
| F3 | 订阅已事件化真相源：三事件类 + `subscription-lifecycle-fold`（流起点/canTransition 复验/最后快照重启）+ `convergeStatus(from,to)` + `rebuildProjection` + 旋钮 `ES_TRUTH_SOURCE_SUBSCRIPTIONS`（缺省 false）+ gated `subscription-replay-truth.e2e` | `libs/core/src/modules/subscriptions/{domain,application}`·`apps/api/src/modules/subscriptions/infrastructure/mikro-subscription.lifecycle.ts` | **内网一侧的权益时间线可回放**=对账比对的「A 侧」现成，修复动作可回灌此 seam |
| F4 | 权益「当前态」读视图 = `QuotaService.snapshot`（限额单点·读写同库·S5 正名**非**物化投影）；`SubscriptionRecord/SeatQuotaSnapshot` 转发 | `libs/core/src/modules/subscriptions/application/read-models/subscription.read-model.ts`·`quota/quota.service` | 漂移的「落点」=当前权益态；对账报告以此为内网真值 vs PSP 真值 |
| F5 | 既有**幂等收敛消费者先例**：`tenant-status-subscription-link.handler` 消费 `tenant.status.transitioned`→`convergeStatus`（业务键收敛式幂等·at-least-once 下重投零重复效果·gated 真库实证） | `apps/api/src/modules/subscriptions/infrastructure/dispatchers/tenant-status-subscription-link.handler.ts`·[module-es-first-real-consumer](./module-es-first-real-consumer.md) | 「按 PSP 事实收敛内网权益」可**直接复用**此范式（发补偿→convergeStatus），无需新写形态 |
| F6 | 全仓 `reconcil/对账/drift/ledger` grep（payment×subscriptions）= 0；周期任务除 `outbox-relay` 外为空 | grep 命中面 + `session-index` plan 佐证「全域周期任务除 outbox-relay 外为空」 | 对账 job 属**净新增调度面**，无既有件可挂 |

**勘察主结论**：本模板当前**不具备、也暂无需求承载「计费对账」**——(1) webhook 未落库⇒无外部账；(2) 是否接真实带续费的 PSP、是否进入营收路径，均由 [global-cn-adaptation](./global-cn-adaptation.md) 列为劣后/暂缓（P2/P3）。本案属「**机制/判据先行·暂无施加对象**」的终态预研，与 [crypto-shredding spike](./module-es-r2-crypto-shredding-spike.md) 同构。是否现在建、还是挂触发判据（§4）待信号出现再建——此即交归人的第一裁点。

## 2. 机制要点（若要实现须具备什么·非实现承诺）

- **账的两端**：A 侧 = 订阅事件流 fold 出的权益/状态时间线（F3）；B 侧 = PSP 真值（webhook 增量 F1 补留痕 + 主动 `retrieveCheckout`/listing 全量拉取）。对账 = 按 (tenantId, 计费周期) 键比对两端谓词。
- **前置·先收外部账**：真实现的第一步**不是**对账算法，而是把 `NormalizedPaymentEvent` **耐久落库 + `eventId` 去重**（承 outbox at-least-once「消费者幂等是硬要求」）；否则 B 侧无源，对账无从谈起。
- **漂移定义**：谓词集（status/`currentPeriodEnd`/座位数/金额 minor-units 一致性/悬挂未决态超窗）。逐条产出 `ReconciliationReport{键, 期望, 实际, 偏差类型, 建议动作}`。
- **修复方向策略（关键·归人·资金语义不可逆）**：三档——① PSP 为权威（钱在哪为准，回灌内网）；② 内网为权威（重发 PSP 指令）；③ 隔离带（不自动修·仅报警待人工）。**修复动作实现=发一条补偿事件经 `convergeStatus` 落真相源**（复用 F3/F5 seam），**而非**直改投影/直 UPDATE 主表（违「写路径只有 Command→Handler」）。
- **触发与频率**：周期 job（候选挂 `@Cron`·F6 净新增）vs 按需/on-checkout；批量 vs 单聚合。幂等护栏防重复修复。

## 3. 对已落地面 / 红线的冲击清单（登记项·真实现案须逐条过门）

1. **新增 PSP 事件留痕表 + 可能的对账报告表**：触表所有权 `table-ownership.ts` / DDL 恒等闸 → **高危#1**（须 `migration:generate`+`migration:run`·禁裸改）。
2. **周期对账 job**：打破「除 outbox-relay 外无周期任务」现状·新增调度面与幂等窗；须入 CI/e2e 对拍。
3. **补偿事件词汇**：新事件类型须登记 `EVENT_TYPE_REGISTRY` 恒等 + `@saas/contracts` payload zod（公共契约面 → 高危#5 随签）。
4. **webhook 幂等**：`eventId` 去重窗 + 签名校验例外（S11 deny-by-default 旁路已就位·[payment.controller.ts L128-129](../../apps/api/src/modules/payment/api/payment.controller.ts)）不得削弱。
5. **契约面**：若对账报告/命令进 HTTP 面，`@saas/contracts` 加传输型 + openapi:drift 对拍。
6. **不受影响锁**：auth 不事件化（母案 §5）·BA 八表·既有 CRUD 主表语义（除非旋钮开）。

## 4. 触发判据（本案主交付·满足即值得立「真实现案」·否则维持零实现）

> 建议**同时满足 a+b（硬前置）且 c 或 d 之一（需求侧）**再立项：

- **(a) 真接带续费的 PSP**：至少一条 `supportsRecurring()=true` 通道（stripe）在生产持有订阅续费，计费进入营收路径；
- **(b) webhook 已耐久留痕**：F1 stub 被补、`NormalizedPaymentEvent` 落库且幂等（B 侧有账可对）；
- **(c) 出现可观测漂移**：权益/账务不一致事故或人工对账成本 > 自动化（SLA 要求）；
- **(d) 合规/审计要求**：需向客户或监管出具「PSP 与内网账一致」的重放证据链。

未满足前，本案保持「能力/判据就位·不实现」；真实现案另起草、逐片过审计门、高危逐次亲签（落表#1/契约#5/资金语义）。

## 5. 归人裁点（本案不代裁·交签发）

- **裁ⓐ 时机**：现在预建对账机制／**挂 §4 触发判据**待信号出现再建（本案勘察倾向后者·与母案按需实施 + crypto-shredding 缓行同构）。
- **裁ⓑ 权威源方向**：PSP 为准／内网为准／隔离带人工（资金不可逆·必归人）。
- **裁ⓒ 修复动作形态**：一律「补偿事件经 convergeStatus」／允许受限直改投影。
- **裁ⓓ 对账粒度与频率**：per-tenant·per-cycle / 全局批量；cron 周期 / 按需 / 混合。
- **裁ⓔ CN 无 recurring 通道降级**：alipay/wechat 无续费事实时，对账谓词如何退化（仅 checkout 级 / 跳过状态时间线）。
- **裁ⓕ PSP 凭证与密钥**：真凭证驻留（Stripe secret/API key）——**不得写入真实凭证**红线 + `DATA_RESIDENCY`，合规裁断归人（本案绝不触）。

## 6. spike 验证判据（过审后才跑·不进主干·不触 prod/真密钥）

> 沿用「临时 ESM 探针/Stripe **test mode** 或本地 stub provider 直调生产路径做语义取证」。绝不用真凭证、绝不连 prod PSP。

- S1 以 fixture `NormalizedPaymentEvent` 落测试留痕表→证「B 侧可收账」的最小闭环语义（不落 prod）。
- S2 造一条「内网 fold 态 ≠ PSP fixture 态」的漂移→跑对账谓词→断言检出偏差类型正确。
- S3 走「补偿事件→`convergeStatus`」修复→断言 fold==投影恒等（复用 `subscription-replay-truth` 对拍口径）且幂等（重放零重复效果）。
- S4 `migration:generate` 空 diff 前提下的新表影响评估（仅 spike 分支·不合主干）。

## 7. 非目标（锁）

- **不在本案实现**任何 webhook 落库/对账 job/修复路径/表迁移/契约变更；
- **不接真 PSP**、**不落真密钥/凭证**（红线）；
- 不改 `PaymentService` 门面既有语义、不削弱 webhook 签名校验；
- 不预设「现在就建」——本案价值恰在 §4 判据；
- 不重复 R4（lifecycle 真相源）——本案治跨系统账务一致性·正交。

## 8. 完成判据（本案=纯文档·可核验）

- [x] 现状取证 F1-F6 均带代码锚点（非臆测）
- [x] 机制要点 / 冲击清单 / 触发判据 / 归人裁点 / spike 判据 / 非目标锁 齐备
- [x] 与母案、R4、crypto-shredding spike、CN-adaptation 交叉引用一致、不双 SSOT
- [x] README 索引登记（候选稿·待审计）
- [x] 零代码变更（`pnpm run ci` 主干不受影响）

## 9. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 用户裁定（三选一→「你裁定」）选 subscriptions 方向；核得 R4 已覆盖「回放真相源」半、真空白为「计费对账」且 webhook 为 stub | 首版：定位正交于 R4、纯勘察·零实现、主交付=§4 触发判据 + §5 归人裁点 |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.1.0 变更，以当前正文内容为准。
