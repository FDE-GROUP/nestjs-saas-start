# ES R4 第二上下文推广案（subscriptions 订阅治理状态机·「回放即真相」）——**已审计·裁ⓐ–ⓔ按推荐档 GO · R4a/R4b 已实现待验收（R4c 高危另签）**

> 适用范围: `modules/subscriptions 全域（domain/application/infrastructure）· tenant_subscription 表地位（真相源 vs 投影）· 新事件词汇 + fold + @saas/contracts payload schema · 新 env 键 ES_TRUTH_SOURCE_SUBSCRIPTIONS · 治理事件消费者 tenant-status-subscription-link 交互` ← blast radius 中（单上下文写读链换轨·复用 R1 机制）；审计深度 = 人签核（高危#1 bootstrap/写切换·R4b/R4c 逐次亲签）
> 关联: 母案 [module-es-truth-source-amendment](./module-es-truth-source-amendment.md) §4 **R4「第二上下文推广逐独立立项」**· §1「能力基线 + 逐模块按需实施」· [module-es-r1-replay-core](./module-es-r1-replay-core.md)（**本案复用其全部机制 seam**：`publishDurable`/fold「最后快照重启」/bootstrap 脚本/旋钮正交律）· [module-es-first-real-consumer](./module-es-first-real-consumer.md)（subscriptions 现为治理事件**消费者**）· R2 缓行见 [module-es-r2-crypto-shredding-spike](./module-es-r2-crypto-shredding-spike.md)
> 性质: **实施细化案**（母案签发分期下的第二试点）——分片框架/归人裁点/改锁清单/env 键位呈审；**过审计门前零实现**；R4b/R4c 高危#1 逐次亲签方动
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 0. 定位与择取（人裁 R4 目标 = subscriptions·证据）

母案 §4 定 R4 = 「第二上下文推广逐独立立项」（R2 crypto-shredding 已裁ⓐ缓行）。择 **subscriptions** 为第二试点，凭据：
- `libs/core/modules` 仅 subscriptions/tenants/workspaces 三域；**workspaces 无治理状态机**（grep 零 status/state·属成员/结构·母案「简单 CRUD 依法保持 CRUD」→ 排除）。
- subscriptions 具 **4 态治理状态机**：`SubscriptionStatus = 'active'|'suspended'|'expired'|'cancelled'`（`quota/tenant-plans.ts:17`）+ `SUBSCRIPTION_LIFECYCLE.convergeStatus(from→to)` 终态收敛端口。
- **PII 薄**：`tenant_subscription` 列仅 opaque 引用（`tenantId`/`providerCustomerId`/`providerSubscriptionId`）+ plan/status/limits/period 日期——无 subject PII·天然适配裁④丙起步（同 tenants 首试点画像）。
- 复用度高：R1 已把「回放即真相」全链（读侧 fold/bootstrap 幂等续位/写切换 `publishDurable`/旋钮正交）跑通并推至 `3a06668`，本案为**同模式横向复制**，非新机制。

## 1. 现状取证（代码实证·本轮复核）

| # | 事实 | 取证锚点 | 对 R4 的含义 |
|---|------|----------|--------------|
| G1 | 状态机 4 态·现**无转换守卫**（`convergeStatus` 任意 from→to·不校验合法迁移） | `subscription-lifecycle.port.ts:17-23`·`mikro-subscription.lifecycle.ts:24-45` | 真相源 fold 需 `canTransition` 表——**本案须新定义**（tenants 有 `tenant-lifecycle.ts` 对照·subscriptions 缺） |
| G2 | 一个租户可**多行**订阅（分期）：`convergeStatus` 取「最新一条 from 态行」跨行选择（`periodStart`/`createdAt` 倒序·limit 1） | `mikro-subscription.lifecycle.ts:30-34` | **聚合流身份是核心裁点**（§3 裁ⓐ）：per-行 vs per-租户合并——与 tenants（organizationId 1:1 单行）结构不同 |
| G3 | subscriptions **零自身事件类**（现仅消费 tenant 治理事件）：`tenant-status-subscription-link.handler` 把租户 suspend/resume/delete 映射为 `convergeStatus` | `infrastructure/dispatchers/tenant-status-subscription-link.handler.ts:28-46` | R4a 须**从零立事件词汇**（比 R1 更绿地·R1 有 shadow 事件基座） |
| G4 | 写路径二处：`convergeStatus`（nativeUpdate status·治理联动）+ `create-subscription` command-handler（插入新行·default active） | `mikro-subscription.lifecycle.ts:39`·`application/commands/handlers/create-subscription.command-handler.ts` | R4c 写切换覆盖两面（更新 + 创建）·比 tenants 多「创建即成流」语义 |
| G5 | 读侧现直读 `tenant_subscription`：`get-current-subscription.query-handler` + `subscription.read-model` | `application/queries/handlers/`·`application/read-models/` | 真相源下该表降为投影（读语义可仍读投影·同 tenants·裁⑤甲） |
| G6 | `event` 表 shared·`aggregateType` 区分；`tenantSubscription→subscriptions` 表属主 | `entities/tenant-subscription.entity.ts:6,10-27`·`table-ownership.ts` | 复用 event 表 = **预期零 DDL**（承 R1）；`status` 列降投影需改锁注记 |

**结构性结论**：R4 = 对已验证机制的横向复制，但subscriptions 有两处 R1 没有的真裁点——**聚合流粒度（G2）**与**需新定义的状态机守卫（G1）**——故不可无脑套 R1，须先裁ⓐ/ⓑ。

## 2. 归人裁点（本案不代裁·附推荐档待批）

- **裁ⓐ 聚合流粒度**（G2·最关键）：
  - 甲：`aggregateType='subscription'`·`aggregateId=订阅行 id`（每行一条流·行内生命周期事件·fold 得单行态）——**推荐**（贴合现有 per-行模型·bootstrap 一行一 bootstrapped·读侧「当前订阅」= 投影表查最新行·与 tenants「一 org 一流」同构到「一 subscription 行一流」）。
  - 乙：`aggregateId=tenantId`（合并该租户全部订阅历史为一流）——跨期 fold 复杂·与现有「多行」schema 冲突·不推荐。
- **裁ⓑ 状态机守卫表**（G1）：需人确认合法迁移集（建议参照 tenants：`active→[suspended,cancelled,expired]`·`suspended→[active,cancelled,expired]`·`expired/cancelled→[]` 终态·`from 缺省=active` 起态）——此为本上下文业务规则·**归人裁**，非 Agent 臆定。
- **裁ⓒ 事件词汇**（G3）：建议 `subscription.created`（流起点·payload={plan,status:active,...}）+ `subscription.status.transitioned`（from/to）+ `subscription.bootstrapped`（R4b 存量成流快照·沿 tenants 命名律）·落 `@saas/contracts` payload zod（裁⑥甲）。
- **裁ⓓ 与治理消费者（G3）的时序**：link handler 是**订阅态的触发方**（租户 suspend→订阅 converge）。真相源下 converge 改为发自身事件 + append——须防「消费租户事件」与「写订阅流」双触发/环。建议：link handler 仍作调用方，经 R4c 的 `publishDurable` 落订阅流·不新增第二条写径。
- **裁ⓔ create 路径是否纳入真相源**（G4）：新行创建即流起点（`subscription.created`）——纳入则 R4c 触 create handler；或首片仅管 transition（create 仍 CRUD 写·仅 converge 事件化）·**推荐先全覆盖**（否则新行无流·bootstrap 与实时创建分叉）。

## 3. 分期方案（每片独立过审计门·高危逐次亲签·复用 R1 seam）

- **R4a 读侧 + 事件类 + 契约面（纯增量·零写切换·预期零 DDL）**：新事件类三（`subscription.created/status.transitioned/bootstrapped`）+ payload zod 入 `@saas/contracts/event/subscription-events.ts` + `canTransition`（裁ⓑ·新建 `subscription-lifecycle.ts`）+ `replaySubscriptionLifecycle` fold（沿「最后快照重启」）+ 镜测 + 契约对拍测。**不接写路径**·既有全量测零改。
- **R4b bootstrap 存量成流（高危#1·dev 先行）**：`bootstrapSubscriptionStreams`（每 `tenant_subscription` 行按裁ⓐ甲发 `subscription.created`(或 bootstrapped)+ 已有态快照·幂等判重·version 续位）+ `scripts/es-bootstrap-subscriptions.ts --verify` + gated 对拍段。dev 库亲签后实跑·prod 另签。
- **R4c 写切换（高危#1·新 env 键）**：`ES_TRUTH_SOURCE_SUBSCRIPTIONS`（缺省 false·config 四件套·`.env.example`·optional 不上 compose·沿 `ES_TRUTH_SOURCE_TENANTS` 律）；`convergeStatus`（+ create）旋钮开走「load→fold 裁决（canTransition）→`publishDurable([event],len+1)`→投影 upsert/insert」；`rebuildSubscriptionProjection`；`tenant_subscription.status` 降投影改锁注记；gated `subscription-replay-truth` 段①②③④。

## 4. 改锁 / 对拍面冲击清单

1. **投影地位**：`tenant_subscription.status` 真相源下降为投影——DDL 恒等/列律登记注记（承 R1c `tenant-table` 先例·断言本体不放宽）。
2. **治理消费者**：`tenant-status-subscription-link` 现有测在旋钮缺省 false 下须零改（等价证明）；旋钮开时其触发的 converge 走订阅流（裁ⓓ）。
3. **gated e2e 登记**：新 `subscription-replay-truth.e2e.test.ts` 须登 `scripts/ci-fullstack.ts` `GATED_E2E_FILES`（漏登恒等校验 fail-loud）。
4. **read-model/query**：`get-current-subscription` 读投影语义不变（真相源不强制读侧重写·同 tenants）。
5. **契约面**：`@saas/contracts` 新增 subscription 事件 payload·wire enum 内联由对拍测锁（零依赖 @core）。
6. **BA/auth/微服务线**：不触。

## 5. 风险与可逆

- **env 键缺省 false ⇒ 全量既有测零改 = 行为逐字节等价**（R1c 同律·可作 R4c 验收判据）。
- **可逆**：R4a 纯增量可逆；R4b bootstrap 半可逆（幂等·skipped 重跑·行留无害）；R4c 写切换半可逆（切回 CRUD 写·投影表留存）。
- **高危命中**：R4b（数据 backfill·写库）· R4c（写路径 + 新 env 键）——逐次人亲签·Agent 不自行执行。
- **不触 R2**：本案 PII 薄·不需 crypto-shredding·与 R2 缓行不冲突。

## 6. 完成判据（本案级·案级交付=「呈审就绪的细化」）

- [x] 择取凭据 + 现状取证 G1–G6 带代码锚点。
- [x] 归人裁点 ⓐ–ⓔ（含推荐档）/ 分期 R4a–R4c / 改锁清单 / 风险可逆 齐备、决策完备可审。
- [x] 人对本案签发 + 裁ⓐ–ⓔ 定向（审计门）——**2026-10-21 人同意=过审计门·裁ⓐ甲/裁ⓑ推荐守卫表/裁ⓒ三事件词汇/裁ⓓ link handler 单径/裁ⓔ create 全覆盖，均按推荐档 GO**。
- [x] R4a 已实现（读侧+事件类+契约·纯增量·零写切换·零 DDL·`ci` 749 passed 含 14 新测·registry⇄DOMAIN_EVENTS 恒等锁过）；既有全量测零改=行为逐字节等价。
- [x] R4b（dev 亲签 2026-10-21）已实现：`bootstrap-subscription-streams.ts`（幂等判重/version max+1 续位/zod 三律·镜像 R1b）+ `scripts/es-bootstrap-subscriptions.ts --verify`（只读对拍 fail-loud）+ gated `subscription-replay-truth.e2e.test.ts` 段①（登记 `GATED_E2E_FILES`）；**dev 真库全链演练**：预检 0/3 FAIL→bootstrap created=3→复验 3/3 OK→幂等重跑 skipped=3→清场无损；`ci` 755（+6 镜测）+ `test:fullstack` 13 gated 恒等绿（订阅对拍段 2 tests 真库执行）；type-escape 棘轮 +2 正当 MikroORM 胶水随基线人审。零 DDL。
- [ ] R4c（高危另签）写切换·新 env 键 `ES_TRUTH_SOURCE_SUBSCRIPTIONS`·`ci` + `test:fullstack` + 行为等价取证；prod apply/翻面另签。
- [x] 本 plan 与 README/母案 §4 状态单源同步。

## 7. 非目标

- 本案**不实现**任何代码（呈审·过审方动）；不改 `event`/`tenant_subscription` 表结构（预期零 DDL）。
- 不动 R2 crypto-shredding（缓行）·不事件化 workspaces（无状态机）·users 仍否决事件化（PII·R2 未落）。
- 不接真支付 provider 连线、不触微服务/broker。

## 8. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 人裁 R4 目标（择 subscriptions·自行裁定授权）·R2 缓行后转推广 | 首版呈审案：择取凭据（workspaces 无状态机排除·subscriptions 4 态+PII 薄+复用 R1 seam）+ 现状取证 G1–G6（无转换守卫/多行 per 租户/零自身事件/双写路径/读投影/表 shared 零 DDL）+ 归人裁点 ⓐ–ⓔ（聚合流粒度/状态机守卫表/事件词汇/与治理消费者时序/create 是否纳入·各附推荐档）+ 分期 R4a 读侧+事件类+契约/R4b bootstrap/R4c 写切换（新 env 键 ES_TRUTH_SOURCE_SUBSCRIPTIONS）+ 改锁清单 + 风险可逆 · 零实现 |
| 2026-10-21 | 0.2.0 | 审计门通过 + R4a 落地 | 人同意=过审计门·裁ⓐ–ⓔ按推荐档全 GO（甲 per-行流 / 守卫表 active↔suspended→expired/cancelled 终态 / 三事件词汇 / link handler 单径 / create 全覆盖）；**R4a 纯增量落地**：DOMAIN_EVENTS +3 键、`subscription-lifecycle.ts`（SUBSCRIPTION_STATUS + canTransition）、三事件类（created/status.transitioned/bootstrapped·aggregateType=subscription）、`subscription-lifecycle-fold.ts`（replay/apply·最后快照重启·from 漂移/非法迁移 fail-loud）、`@saas/contracts/subscription-events.ts`（payload zod·wire enum 内联）、EVENT_TYPE_REGISTRY 登记三件（保恒等）；镜测 fold 10 + 契约对拍 4·DB-free；`ci` PASSED 749（+14）·fallow 零违规·未触配置面（env 键留 R4c）。零写路径改动·零 DDL。R4b/R4c 高危待逐次亲签 |
| 2026-10-21 | 0.3.0 | R4b bootstrap 落地（dev 亲签） | **R4b 存量成流 bootstrap**（高危#1·dev 范围人亲签 2026-10-21·prod apply 另签）：`bootstrap-subscription-streams.ts`（每 `tenant_subscription` 行按裁ⓐ甲发 `subscription.bootstrapped`·aggregateId=行 id·幂等判重/version max+1 续位/payload 过 zod·`actorId='bootstrap'`·镜像 `bootstrapTenantStreams` 全 seam）+ `scripts/es-bootstrap-subscriptions.ts`（`--verify` 只读全量 replay fold ⇄ 表行·不符逐行点名 exit 1）+ gated `subscription-replay-truth.e2e.test.ts`（段①·登记 `GATED_E2E_FILES`→13 gated·写切换段属 R4c 不越界）。**dev 真库全链演练**（合成行经 FK→Organization 链）：预检 0/3 FAIL·EXIT1→bootstrap created=3→复验 3/3 OK→幂等重跑 skipped=3→清场还原 subs=0/events=0 无损。`ci` PASSED 755（+6 镜测）·`test:fullstack` 恒等绿（订阅对拍 2 tests 真库执行）·type-escape 棘轮 +2 正当 MikroORM 胶水落基线随 PR 人审。零 DDL。R4c 写切换高危另签 |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.3.0 修订（审计门 GO·裁ⓐ–ⓔ按推荐档·R4a+R4b 已实现待验收·R4b dev 真库演练全链绿·零写切换/零 DDL）。状态以 README 索引表为单源。
