# ES R3 异步投影与端到端 ack（能力完备收口片）

> 适用范围: `模块(es/eventing · outbox relay)` ← blast radius：触及真相源写路径投递语义与（若择乙档）event 表 schema = 高危#1 候选
> 关联: `specs/architecture.md` ES 能力基线条 · 母案 `module-es-truth-source-amendment.md` §4 R3 · `module-es-outbox-transactional.md`（#1 甲档 claim 语义=被本片演进的对象）· `module-p0-async-boundary-correctness.md` 切片 C（「接外部 MQ 须重审」登记处）
> 性质: 重写型（母案已签发分期的细化提案）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

母案 §4 把 R3 定义为「异步投影与恢复语义：outbox relay 从『claim 即 dispatched』升级为端到端 ack + 投影滞后 + catch-up + 崩溃恢复判据」，且终态边界已裁「**能力面必须完备（CQRS/ES/EDA 可示范）**，实施面逐模块按需」（§4 终态边界·人定向 2026-10-20）。R1/R4 已结项后，R3 是能力基线上**最后一块未闭合拼图**——本片目标 = 把「投递保证的真实口径」收口到可示范、可验收的程度，并按最小必要圈定实施面。

**现状取证（2026-10-22 实读代码，非推断）**：

- `outbox-relay.ts`：#1 甲档=事务内 claim（置 `dispatchedAt`）→ 提交 → 提交后 `publishAll` 尽力投递；类头自白「进程内总线**无 ack**：handler 异常被本循环不可见·提交后崩溃即丢，故 `at-least-once-to-claim + best-effort in-process`，**非端到端 at-least-once**」。
- `event` 表：`dispatchedAt/attemptCount/lastError` 列已存（切片 A 落）——`dispatchedAt` 语义是 **relay 侧记账**（已 claim 已投），**不是消费者确认位**；毒行 DLQ 以表内态表达（不建独立死信表）。
- 去重窗 `seenEventIds` = 进程内 LRU（`SEEN_CAP=10_000`）·**重启即空**——注释自白「重启后窗清空时消费者仍需自身幂等」。
- 唯一跨上下文消费者 `TenantStatusSubscriptionLinkHandler`：**终态收敛幂等**（`convergeStatus` 端口契约·重投 no-op·不按计数变更）——端到端 ack 的「至少一次重投无害」基座已就位。
- 投影仍**同步**（裁③乙·append+投影同事务）；`rebuildTenantProjection` / `rebuildProjection` catch-up 原语已存且被 replay-truth e2e 间接演练（fold==投影对拍）。

**缺口诚实归纳（三条）**：① 消费侧无耐久 ack/进度（重启后在途窗口的事件对进程内消费者**永久丢失**，除非另有重建路径）；② 提交后-投递前崩溃窗（已 claim 未投 → 下拍不重取 → 同上）；③ 「投影滞后 + 崩溃恢复」只有原语、没有**成文判据与演练面**。

**非目标（锁死）**：不接外部 MQ/broker（microservice-readiness 触发器未满足·母案 §5）；不改 inproc 缺省模式（零 timer 零触库装配不变量不动）；不把 tenants/subscriptions 投影改回异步写（裁③乙已验收入魂·异步仅以「滞后重建」能力面示范）；不动 prod（翻面归运维）。

## 2. 方案

### 2.1 档位抉择（归人裁点 ⓐ，本案给推荐）

- **甲档 · 进程内端到端 ack（零 DDL·推荐起步）**：relay 对已 claim 批次改为**可观测尽力投递**——`publishAll` 后跟踪 handler 完成（经 `@nestjs/cqrs` EventBus 订阅回调计数或最小投递日志），并把「提交后-投递前崩溃窗」显式化为**已声明的丢失窗**：启动时对「已 claim 未 ack」行做一次重投（LRU 去重窗 + 消费者幂等收敛托底，重投无害已证）。端到端口径升级为 **at-least-once-to-consumer（进程内）**，前提=消费者幂等（roadmap 硬要求·唯一真实消费者已满足并须锁测）。
- **乙档 · 耐久投递账（新表 `event_delivery` per-订阅者进度·高危#1）**：`(eventId, subscriptionKey)` unique + `ackedAt` 列——多独立消费者各自进度、重启续投、真端到端。冲击：新表 DDL（表所有权登记/DDL 恒等闸/列律）、relay 拉取 SQL 重写、每事件 N 行写放大。
- **裁定逻辑**：能力完备判据若按母案字面「端到端 ack 可示范」，甲档只示范到**进程内端**；乙档才闭环语义。但本仓单进程无外部订阅者，乙档收益当前为零、成本为一次 schema 迁移——与 R2/crypto-shredding「机制先行·暂无对象」判例同构。**推荐：甲档本窗落地 + 乙档立触发判据**（首个非幂等消费者立项，或接入外部 MQ 那一刻——与 P0′ C 片「接外部 MQ 须重审」既有登记自洽）。

### 2.2 垂直切片（每片独立过审计门·高危逐次亲签）

1. **R3a · 投递语义成文 + 端口面（零行为变更）**：relay 类头与 `specs/architecture.md` ES 条把「当前投递保证」写成可验收口径（inproc=同步同事务无丢失窗；outbox=甲档口径）；消费者幂等硬要求升格为**锁测**（link handler 重投收敛 no-op 断言补强）。完成判据：文档口径 + 镜测绿 + `ci` 全绿。
2. **R3b · 启动重投（甲档核心·dev 真库 gated e2e）**：relay `onApplicationBootstrap` 时对「`dispatchedAt` 已置但本进程生命周期内未 ack」的行重投一轮（复用 claim 事务与 LRU 去重）；投递完成回报（最小 ack 记账·内存态即可）。完成判据：新增 gated e2e（登 `GATED_E2E_FILES` 恒等闸）演练「提交后崩溃 → 重启 → 消费者补收 → 投影 fold==重投结果」；既有 relay 单测/e2e 零语义弱化。
3. **R3c · 滞后与恢复判据演练面（catch-up 成文）**：以运维脚本/文档形式固化「投影滞后检测（`rebuild*` 前置 `store.load` 对拍）+ 恢复 runbook」，复用 replay-truth 对拍判据（fold==投影逐字段）。完成判据：脚本进 `scripts/` + 真库演练存照 + 回滚窗说明（零 DDL 前提）。

### 2.3 与既有纪律的衔接

- 高危命中预判：R3a/R3c 非高危（文档+镜测+脚本）；**R3b 触 relay 运行期行为但零 schema**（半高危——门禁行为变更，按 R1c 先例逐次亲签）；乙档若被裁启用则高危#1（迁移）另立子案。
- 旋钮延续：一切新行为挂在既有 `EVENT_PUBLISH_MODE=outbox` 之下（缺省 inproc 不动=零回归面）；**不新增 env 键**（重投是 mode 内语义修正非新能力开关——若审计认为须独立旋钮，裁点 ⓒ 补列）。

### 2.4 R3b 实施前设计复核（v0.5.0·呈裁ⓐ 再决·**再判前不动 relay·零码**）

> 触发：承「授权裁定」，R3b 半高危、实施前对其做取证复核（实读 `outbox-relay.ts` + `subscriptions.module.ts` 消费者接线·非推断）。发现两处须在签核前明判，且**不推翻** R3a/R3c（皆已落链有效）。

**F1 · 甲档原理性触不到缺口②「跨重启」部分（目标-手段错配）**：relay 拉取谓词 `dispatchedAt IS NULL`（L93）一旦 claim 即永不重取；进程重启后内存态（`seenEventIds`/拟加的 ack map）全空，唯一耐久标记 `dispatchedAt` **无法区分**「已投」与「提交后崩溃前从未投」。故 §2.2「对 `dispatchedAt` 已置未 ack 行重投」在 fresh boot = **全量已投历史每启动重放一遍**（幂等托底=安全，但 O(全表)·re-fire 早已落定的跨上下文副作用·非「仅补在途窗」）。内存 ack（裁ⓒ）**无法把重投范围界定到崩溃在途窗**；真·跨重启续投须耐久进度=**乙档**。甲档自称「端到端 ack」实为「run 内」，而它要闭合的「提交后-投递前崩溃窗」定义上跨进程——手段触不到目标。

**F2 · 崩溃窗真实业务后果 = lost 跨上下文 link·且现 R3c 医生检不出（盲区坐实）**：唯一进程内消费者 `TenantStatusSubscriptionLinkHandler`（`@EventsHandler`·`subscriptions.module.ts` EventHandlers·tenant→subscription 联动·裁点乙商业规则）。若 `tenant.status.transitioned` 已入库但投递在崩溃窗丢失 → 订阅未联动挂起；而该订阅**自有流/投影同步地都没有这条 transition**，R3c 医生比对「自有流 ⇄ 投影」遂判一致——**盲区**。即缺口②的实际代价 =「tenant 已 suspended 而其 subscription 仍 active」的跨上下文不变量违反，当前无任何防线检测/修复。

**出路（呈裁ⓐ 再决·荐序）**：
- **丙（荐·新增）· 跨上下文联动不变量对拍**：把 R3c 医生**扩一档「不变量」面**——检查 `tenant.status=suspended ⇒ 其 subscription 无 active 残留`（及 resume 反向一致性），违例点名/补收敛。**非高危·零 DDL·纯脚本**（沿 R3c 同构）·直击 F2 真盲区·**不触 relay 运行期行为**。缺口②的实际后果由「检测+修复」闭合——对本仓单消费者+可重建投影，这是比「名义端到端 ack」更稳且诚实的等价保障。
- **甲′（降级）· 启动全量重投**：照 §2.2 原样实现·靠幂等托底·承认 F1 全量重放代价。价值有限且带噪声。
- **乙（维持缓行）· 耐久投递账**：真·跨重启续投唯一解·高危#1 新表·触发判据（外部 MQ/多独立消费者/非幂等消费者）未到·缓行不变。

**荐**：R3b 目标从「relay 端到端 ack 改造」**重定向为「丙·跨上下文不变量对拍」**——用非高危手段补上 F2 真盲区，甲′/乙按判据挂账。不改母案分期精神（能力完备收口），且避半高危 relay 运行期改动。**裁ⓐ 系人裁 GO·是否重定向归人再判**；再判前不动 relay、不写码。此复核防的是「为名义实施一个触不到其目标的手段」（过度工程/反效）。

## 3. 影响面与风险

- **blast radius**：`database/eventing/`（relay 本体 + 启动时序）+ subscriptions handler 锁测 + gated 清单；HTTP 契约零变更；OpenAPI 零漂移。
- **可逆性**：甲档全可逆（重投窗逻辑关掉=回 #1 甲档原语义·零 DDL）；乙档不可逆点=新表落库（故另案子裁）。
- **风险**：启动重投与 LRU 去重交互=双份投递竞态——靠消费者幂等托底（须先有 ⓓ 锁测背书才动 R3b）；`@nestjs/cqrs` handler 异常可见性依赖总线实现细节，ack 记账机制须以临时探针直调真总线取证后再设计（实证原则·禁拍脑袋）。
- **回滚**：逐片独立 commit（严禁混提·P0′ 教训）；R3b 回滚=revert relay 启动段。

## 4. 审计记录

> 无已审方案不写码。本案**已过审计门**（2026-10-22）。

- 结论：**过审计门 · GO**（2026-10-22 人「按推荐过审」= ⓐ–ⓔ 五裁点全采纳推荐档）——R3a/R3c 非高危可直启；R3b 半高危·实施前另须逐次亲签（承 R1c 先例）。
- 裁点处置（皆按推荐档定案）：
  - **ⓐ 档位 = 甲档**（进程内端到端 ack·零 DDL）；乙档（耐久投递账新表·高危#1）挂触发判据缓行——首个非幂等消费者立项或接入外部 MQ 时另立子案（与 P0′ C 片「接外部 MQ 须重审」登记自洽）；「整体缓行」未取（能力基线甲档即可示范）。
  - **ⓑ 消费者幂等 = 契约级硬要求**：outbox 消费者必须终态收敛幂等（现有 `TenantStatusSubscriptionLinkHandler` 已满足·R3a 补强重投收敛 no-op 锁测背书）。
  - **ⓒ ack 记账 = 内存态**（甲档够用·重启再投托底；表列 `ackedAt` 属乙档·本片不触 DDL）。
  - **ⓓ 滞后检测 = 不进 CI**：runbook 手动 + gated 演练测进链即可（replay-truth 已锁 fold==投影·每拍全量对拍无新信息量且拖慢链）。
  - **ⓔ R3b 签核序 = 逐次亲签**（触 relay 运行期行为·虽零 schema 仍按半高危走·不并档）。
- 裁ⓐ 再判（2026-10-22·承 §2.4 复核）：人「同意」= 采纳推荐——R3b 目标由甲档「relay 端到端 ack」**重定向为「丙·跨上下文不变量对拍」**（非高危·零 DDL·不动 relay），甲′/乙 按判据挂账；丙-i（detect）授权直施已落链，丙-ii（relink 修复）待续片。
- 审计人 / 日期：用户（FDE）· 2026-10-22

## 5. 完成判据（可核验 + 穷尽 · 案级，过审后逐片细化）

- [x] ⓐ–ⓔ 全部有归人裁决留痕后方可动码（2026-10-22 过审·见 §4）；
- [x] R3a（2026-10-22 部分）：ⓑ 消费者幂等锁测**硬化落链**（handler.test 重投断言升到「同参数收敛请求」 `mock.calls[0]`==`[1]`·5 测绿）；relay 头 `at-least-once-to-claim` 口径**前序已成文**（outbox-relay.e2e L188 已锁重投）；architecture ES 条对拍注 = 宪法且口径随 R3b 真变（to-claim→to-consumer），**并入 R3b 一次成文防双写**（宪法段改动仍需亲签）；
- [ ] R3b（裁ⓐ 再判 2026-10-22·采纳丙·见 §2.4/§4）：目标由「relay 端到端 ack」重定向为「丙·跨上下文 lost-link 不变量对拍」；**丙-i（detect·非高危·零 DDL·零 relay 改动）已落链**——扩 `scripts/es-projection-doctor.ts` 加 `scanLinkInvariant`（tenant suspended ⇒ 其订阅无 active 残留·前向不变量·link 违例单列非 raw 可修不并入 `--rebuild`）·dev 真库闭环演练存照（基线 0→注入 suspended+active 子→检测点名→清场归 0·净还原）·tsc/biome 绿；原甲′ gated e2e 崩溃-重启-补收项**随重定向作废**（relay 未改·无新链）；**丙-ii（relink 修复·经 convergeStatus 端口重放缺失联动）待续片**（非 raw·需端口装配·归人按需启）；
- [x] R3c（2026-10-22）：新增 `scripts/es-projection-doctor.ts`——跨上下文（tenants+subscriptions）只读巡检 fold⇄投影 + `--rebuild` catch-up 恢复面（bootstrap `--verify` 只检不修·此为真增量）；dev 真库演练存照：注入投影漂移(suspended)→医生检出可修(fold=active⇄投影=suspended)→`--rebuild` 回写真相→复验漂移消失（净还原·零 DDL 不动流·tsc+biome 绿）；空流者诚实归类「须 bootstrap·非本工具可修」；
- [ ] `pnpm run ci` 全绿 + `pnpm run test:fullstack` 全链绿 +（若触 schema）`migration:generate` 空 diff 证明。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-22 | 0.1.0 | 起草（承 ES 主线代裁方向·母案 §4 R3 细化提案） | 首版：现状取证（relay/实体/handler 实读）+ 甲/乙档 + R3a–R3c 切片 + 裁点 ⓐ–ⓔ |
| 2026-10-22 | 0.2.0 | 过审计门·定案 | §4 裁 ⓐ–ⓔ 全采纳推荐档（ⓐ 甲档落地·乙档触发判据缓行）；§5 首判据勾选；R3a/R3c 非高危可直启·R3b 半高危待逐片亲签 |
| 2026-10-22 | 0.3.0 | R3a 实施（部分） | ⓑ 幂等锁硬化：handler.test 重投断言升到「同参数收敛调用」（`mock.calls[0]`==`[1]`）·5 测绿；取证发现 relay 头口径 + 端口幂等真测前序已落，architecture 对拍注并入 R3b（防双写·宪法高危） |
| 2026-10-22 | 0.4.0 | R3c 实施 | 新增 `scripts/es-projection-doctor.ts`（只读检测默认 + `--rebuild` 可选修投影·零 DDL·不动流）；dev 真库跑 catch-up 闭环存照（漂移注入→检出→修复→净还原）·tsc/biome 绿；沿 es-bootstrap 先例不注 package.json |
| 2026-10-22 | 0.5.0 | R3b 实施前设计复核（呈再裁·零码） | 取证坐实 F1（甲档+内存 ack 触不到跨重启窗·全量重放代价）与 F2（真后果=lost 跨上下文 link·R3c 医生盲区）；新增 §2.4 丙/甲′/乙 三出路·荐将 R3b 重定向为「丙·跨上下文不变量对拍」·归裁ⓐ 再判·再判前不动 relay |
| 2026-10-22 | 0.6.0 | 裁ⓐ 再判采纳丙·R3b-丙-i 实施 | 人「同意」采纳推荐·R3b 重定向为丙；扩 `es-projection-doctor.ts` 加 `scanLinkInvariant`（跨上下文 lost-link 不变量只读检测·非高危零 DDL 不动 relay）·dev 真库闭环演练（注入→点名→净还原）·tsc/biome 绿；丙-ii relink 修复待续片 | 

---

<!-- 变更戳 -->
正文已于 2026-10-22 / v0.6.0 变更，以当前正文内容为准。
