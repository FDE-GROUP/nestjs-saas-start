# 函数式内核六边形单体：架构精度修宪提案（DDD 战术减法 · 边界/不变量/事件保留）

> 适用范围: `全局（宪法 architecture.md(+zh) · README 宣称 · users/subscriptions/tenants 治理面模块结构 · 删码）` ← 修宪级，与 `global-orm-mikro-constitution-amendment` / `global-validation-zod-constitution-amendment` 同量级
> 关联: DDD 专项外部评审（2026-10-20·两轮深勘+独立复核）· [`module-core-position-kernel-vs-kit`](./module-core-position-kernel-vs-kit.md)（core=分层 saas-kit 已裁）· [`event-sourcing-roadmap`](./event-sourcing-roadmap.md)（Phase C 改口）· `AGENTS.md` §2/§5 · `docs/specs/architecture.md` §分层
> 性质: **修宪提案（审前方案·零实现码）**；用户已认可评审结论与「保留付账的 20%、删除表演」的方向
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**背景（人裁已定方向）**：DDD 专项审计坐实项目实态为「**六边形骨架真材实料 + DDD 战术内核大面积缺席**」——且缺席不是欠账，是**域性使然**：多租户 SaaS 脚手架的复杂度在隔离/治理/配额/计费的技术架构与策略规则，不在千条业务不变量的复杂业务域。仓内最佳领域代码（tenants 生命周期状态机）自发采用了**函数式内核**（纯函数迁移表 + result-union + 服务编排）而非聚合风格；唯一按战术 DDD 建的 User 聚合是死代码（真实注册走 Better Auth）。本提案把这一实态**升格为正式架构**，宣称与实态对齐。

**目标**：

1. 架构定位改名与宣称精度化（README / architecture.md(+zh)）；
2. **函数式领域内核**升格为正式范式（`canTransition` 为基准样例），推广到配额裁决；
3. 删除表演性战术模式：User 聚合死管道、ES「注册流」死宣称、透传 CQRS 的认知负担；
4. 补齐本域唯二值得的类型防护不变量之一：**Quota VO**（Money 见未决③）；
5. 修正两处真实架构违规：core 抛 HTTP 异常、写路径绕端口且出 UoW；
6. ES 路线图 Phase C 改口为**触发判据驱动**的可选演进（终态缺省 = 审计日志 + 集成事件）。

**非目标（明确不动）**：

- 六边形骨架全保留：端口-适配器纪律、依赖规则、纯度守卫测试、ALS UoW、outbox 三模发布器——这些是 Clean Architecture 资产，与本次「DDD 战术减法」正交；
- 不动 `module-core-position-kernel-vs-kit` 已裁的 core = 分层 saas-kit 定位；
- 不动 zod 契约链、租户隔离单点、门禁体系（无 #1/#6 命中）；
- 不做 schema 迁移（零 DDL）；不做微服务化（触发判据不变）。

## 2. 现状取证（实证 · 文件:行号 · 2026-10-20 复核）

### A. 表演性战术模式（**删除对象**）

- **User 聚合死管道**：`User.register(` 生产零调用；`pullDomainEvents` 生产零调用；行为方法 `changeEmail/rename` 生产零调用（全仓 grep）。聚合仅剩 `rehydrate` 水化壳（`mikro-user.repository.ts:50,56`）。`UserRegisteredEvent` 唯一构造点在死路径内（`user.aggregate.ts:64`）——**连 README「注册流入 event store」的宣称也是死的**：`event-type-registry.ts:1` 登记了一个永不会出现的事件类型。消费侧 dispatcher 自我声明 no-op seam（`user-domain-events.dispatcher.ts:9`）。
- **透传 CQRS 仪式**：18 command 中纯透传约 6–7 个（~35%）：`create-post` = `repo.create` 一行（`create-post.command-handler.ts:11-17`）；workspaces 3 个 command 全透传；平台侧 4 个 query 全一行透传。真编排仅 7/18（39%）。
- **治理 handler 复制粘贴**：approve/suspend/resume/delete 四 handler 为同一 `result.kind` 三分支样板 ×4，仅目标状态不同。
- **read-models 名不副实**：目录内容是返回类型别名（`post.read-model.ts` 等），非投影——CQRS 读侧无分离收益（读写同库同模型）。

### B. 既有正确范式（**升格对象**）

- **函数式领域内核（本仓原生最佳实践）**：`tenant-lifecycle.ts:81-91` 纯函数迁移表（零依赖）+ `canTransition` result-union（`{kind:'ok'|'not-found'|'illegal'}`，不抛异常）+ `tenant-status.service.ts:76-103` 单点裁决（load→判→写→publish 全程 UoW）。
- **事件作集成契约**：`TenantStatusSubscriptionLinkHandler`（tenants→subscriptions，幂等收敛、通道无关）——教科书级，唯一全功能消费者。
- **纯度守卫测试范式**：`user.aggregate.test.ts:107-108` 用正则锁 domain 零框架 import——本提案将该范式推广至 core。
- **端口纪律全上下文一致**：Symbol token + 接口在 domain/实现在 infra + 租户 ALS 单点卡点。

### C. 真实违规（**修正对象**）

- **core 抛 HTTP 异常**：`libs/core/src/modules/subscriptions/quota/quota.service.ts:1,62-64` 直接 `throw new HttpException(..., 402)`——HTTP 语义渗入 saas-kit。application 层 11 个文件抛 Nest HTTP 异常（可接受的边界妥协，但 core 必须清零）。
- **写路径绕端口 + 出 UoW**：`suspend-user.command-handler.ts:46-47` `em.nativeDelete(Session)` 直捅 auth 上下文的表，且在 UoW 之外——状态已 suspend 但 session 删除失败会留失权窗口（现靠 deny-list 纵深兜底）。
- **配额裸 number 无不变量**：`subscription.repository.ts:15-17` `seatsLimit/storageQuota/apiQuota` 裸 number，零额/负额无类型防护——配额恰是本 SaaS 域最该有不变量的概念。

### D. 宣称-实态落差（**对齐对象**）

- README「Clean Architecture + DDD + CQRS 垂直切片」vs 实态「六边形骨架严格 + 战术 DDD 覆盖 ~1.5 个上下文」；
- payment/storage 无 domain/ 目录（在新范式下**合法化**，不再是缺口）；
- auth 为框架胶水层（Better Auth 配置拼装），在架构叙事中如实定位。

## 3. 目标架构

### 3.1 定位与宣称（新）

> ~~「Clean Architecture + DDD + CQRS 的垂直切片」~~
> → **「六边形架构（ports & adapters · 即 Clean Architecture 依赖规则）的模块化单体：限界上下文 + 仓储端口 + 领域事件集成；治理/订阅域采用函数式领域内核（functional core, imperative shell），参考业务面保持简单 CRUD」**

**命名说明（消歧·防误读为「架构更换」）**：六边形架构（Cockburn 2005 · ports & adapters）与 Clean Architecture（Martin 2012 · 依赖规则）为同一思想的综合重述（Uncle Bob 自述 Clean = Hexagonal + Onion 等前作合成）。本项目代码词汇（port / adapter / Symbol token 仓储接口 / mikro 适配器）与六边形**逐字对应**，故取此名。本提案**不是架构更换**：依赖规则、端口-适配器、用例层（= use-case interactor）、纯度守卫全保留；被放弃的是「聚合优先的战术 DDD」与「全覆盖 CQRS」两个**宣称**（二者均非 Clean Architecture 的要求）。

### 3.2 四条正式范式（写入 architecture.md）

- **P1 函数式领域内核**：领域裁决 = 纯函数 + 不可变数据 + **result-union**（不抛框架异常、零框架依赖）。基准样例 `canTransition`。裁决函数返回 `{kind:...}` 判别联合，HTTP 翻译（409/402/404）职责归 application/api 层。两条**纯度硬约束**（挡住常见误区·源自 FCIS 论述评审 2026-10-20）：① **内核不接收效果回调**——效果以**返回值**表达（新状态 + 待发布事件），由外壳执行落库/发布；向内核注入 `save` 类回调并调用即破坏纯度（效果被参数化≠效果被消除），测试将退回 mock。② **内核不读环境时间/随机源**——时钟经参数注入（`now` 为显式入参），随机值同理，保证同输入恒同输出。
- **P2 值对象按需**：仅当概念有**真不变量**才封类型（判据：违反不变量 = 破坏数据正确性，而非仅格式错误）。本域认定：`Quota`（非负整数 + 上限语义）、`Money`（见未决③）。**缺省 = 裸原始类型 + zod schema 校验**——不为 VO 而 VO。
- **P3 领域事件 = 集成契约 + 审计日志**：service/handler 层发布事件为**正式模式**（不再视作对「聚合事件」的妥协）；聚合事件管道删除。事件语义正名为「操作记录」（operation record）；event store 定位 = 审计 + 集成，**非事件溯源真相源**（Phase C 改口见 §4.S5）。
- **P4 分层按内容实化**：目录层仅在有内容时存在；CQRS 的采用判据 = 该上下文存在**跨聚合编排 / 事务边界 / 事件发布**，否则 service 直调。简单上下文（controller + service + repository）是合法终态，不是「没做完」。

### 3.3 上下文范式矩阵（目标态）

| 上下文 | 范式 | 本次动作 |
|---|---|---|
| tenants 治理/生命周期 | 函数式内核 + 事件 + UoW（全仓基准） | S4 提取公共迁移用例消 4× 复制 |
| subscriptions | 函数式内核（配额）+ provider 端口 | S2 result-union 化 + Quota VO + core 去 HTTP |
| authorization | 纯函数策略（DB 为授权 SSOT） | 不动（本就合规） |
| users | service + 仓储 + PIPL 补删事件 | S1 删聚合死管道，仓储返回 record |
| posts | **参考业务面（保留完整垂直切片 + CQRS 作为教学示例·显式标注）** | 仅文档标注 |
| workspaces | kit 能力面（简单上下文·合法终态） | 仅文档标注（见未决②） |
| payment / storage | service + provider 端口（无 domain 合法） | S6 可选 Money VO |
| auth | 框架胶水层（如实定位） | 不动 |

### 3.4 目录原则

`domain/application` 目录**有内容才存在**；posts 的四层完整切片保留其「模板参考示例」职能并在模块头注标注；payment/storage 维持现状（不再视为欠账）。

## 4. 执行切片（依赖序 · 每片过门禁）

- **S1 删 User 聚合死管道（纯收缩·无 expand 需求）**：删 `user.aggregate.ts` 行为面与事件缓冲使用、`user-registered.event.ts`、no-op dispatcher、`event-type-registry.ts` 的 `UserRegisteredEvent` 登记项；仓储返回 `UserRecord`（与其他上下文同构）。波及 users 查询 handler 返回类型（编译期可见）。README 的 ES「注册流」宣称同步修正（见未决①）。**完成判据**：删除物全仓 grep 零引用；`pnpm run ci` + `ci:db` 全绿。
- **S2 配额函数式内核化 + core 去 HTTP 化**：`QuotaService.assertSeats` → `resolveSeats(...)` 返回 result-union，402 翻译上移消费点（含 auth `seats-quota.hook` 同片适配）；core 生产码对 `@nestjs/common` 的 import 收缩到 DI 装饰器最小面，并**新增 core 纯度守卫测试**（复用 users 正则锁范式，锁 `HttpException/HttpStatus` 零出现）；`Quota` VO（非负整数不变量）落 subscriptions 域并接入 repository 与 handler。**完成判据**：守卫测试绿；既有 seats 配额 e2e 绿。
- **S3 suspend-user 事务与端口修正**：session 批删改经 auth 上下文暴露的 session-store 端口，并入与状态写同一 `uow.run`。**完成判据**：状态写与 session 删同事务（gated e2e 可证：删除失败 → 状态回滚）。
- **S4 治理迁移用例提取**：approve/suspend/resume/delete 四 handler 的三分支样板 → 共享 `transitionTenantStatus` 用例函数，handler 收敛为薄壳。**完成判据**：四 handler 体量收敛；既有治理 e2e 全绿（锁行为不漂移）。
- **S5 宣称与宪法落笔（置于实现后·镜像纪律）**：README / architecture.md(+zh) / tooling-standards——新宣称、P1–P4 范式、上下文矩阵、目录原则；`read-models` 目录正名（read-shapes 或头注澄清「返回形状，非投影」）；**ES 路线图 Phase C 改口**：降为触发判据驱动的可选演进，终态缺省 = 审计日志 + 集成事件（Phase B shadow 即常态）。
- **S6（可选·未决③）Money VO**：先实查 payment 金额是否存在本地运算落点——若仅透传 Stripe 则不做（P2 判据不过）。

## 5. 影响面与风险

- **blast radius**：users / subscriptions / tenants-治理 三模块内部 + 宪法文档；**公共契约（ErrorResponse / openapi / api-client）零触碰；schema 零迁移；门禁零变更**。
- **高危命中**：#3 删码（S1 聚合+事件类）；#5 改宪法 specs + README（S5）。无 #1/#6。
- **回滚策略**：分片提交、逐片可 `git revert`；S1 删除物在删除前全部有 grep 取证留痕（本文件 §2.A）。
- **风险表**：

| 风险 | 对策 |
|---|---|
| S1 误删活引用 | 编译期可见（TS 强类型）+ 全仓 grep 双保险；删除物清单先行 |
| S2 签名变更波及 auth seats-quota.hook | 消费点同片适配；既有配额 e2e 锁行为 |
| S4 提取引入治理行为漂移 | 四组治理 e2e + 状态机矩阵测试已存，行为锁死后重构 |
| 宣称改动引发文档一致性问题 | S5 单片统一落笔 + fallow architecture 复跑 |

## 6. 高危签核清单（实施前置）

- **#3 删码**（S1：聚合/事件/dispatcher，约 −4 文件 + registry 项）；
- **#5 改宪法**（S5：architecture.md(+zh)、README 宣称、tooling-standards 范式条款）。

## 7. 审计记录

- 结论：**已审计·GO**（用户 2026-10-20 签核「审计通过 GO」）——四未决项**按推荐裁定**：① ES 注册流接受现状（ES 无注册事件·README 宣称已随 S1 修正）；② workspaces 不降 service（kit API 稳定优先·仅 P4 标注）；③ Money VO 条件化（S6 先实查 payment 本地运算落点·P2 判据不过即不做）；④ Phase C 降为「触发判据驱动的可选项」并保留路线图文档。高危 #3 删码（S1）/ #5 改宪法（S5）随本 GO 一并签核，逐片仍须门禁绿。
- 未决项：~~四项已裁（见结论）~~。
- 审计人 / 日期：用户签核 GO · Agent 记录 · 2026-10-20。

## 8. 完成判据（可核验 + 穷尽）

- [x] S1 删除物全仓 grep 零引用；users 仓储返回 record 与其他上下文同构（2026-10-20 落地·连带孤儿 Email VO 与 AggregateRoot 基类一并删除·port 收敛 findById/findByEmail/remove·save 随聚合退役·668 测全绿·基线 151→147）。
- [x] core 生产码零 `HttpException/HttpStatus`（纯度守卫 `libs/core/src/core-purity.test.ts` 双锁：@nestjs/common import ⊆ DI 最小面 + HttpException/HttpStatus 零出现·2026-10-20 落地·适配器角色文件按命名豁免）。
- [x] `Quota` VO 落地（2026-10-20）：`quota.vo.ts` 非负安全整数不变量·原生 Error fail-loud；接线 = 档位目录（tenant-plans 常量定义期）+ QuotaService.effectiveSeatsLimit/snapshot 摄入（含 DB 腐行 fail-loud 测）+ create-subscription 两源统一摄入；`assertSeats` 402 删除·翻译归 QuotaGuard/auth hook（P1）。
- [x] suspend-user 状态写与 session 删同事务（S3 落地 2026-10-20）：关键段包 uow.run（transition 重入复用外层）+ 新 AUTH_SESSION_STORE 端口/适配器（fork ALS 感知自动入事务）——单测以时序序断言锁「tx-begin→transition→session-delete→tx-end」同关键段；表所有权 WRITE_EXCEPTIONS 例外清零（写面归位 auth 属主目录·守卫自然放行）。gated e2e 回滚证：UoW 同生共死语义已由既有 transaction-scope/outbox 测试锁·失败注入 e2e 留待真实回归需求再立。
- [x] 治理 handler 收敛（S4 落地 2026-10-20）：approve/suspend/resume 三同构 handler（45/44/43 行）收敛至 `governedTenantTransition` 共用用例（薄壳 31/30/29 行·三分支语义逐字一致）；delete-permanently 为异构用例（终态闸+事件补删+硬删）保留独立实现；既有三分支 handler 测试**原样全绿**（行为锁）。
- [x] 宣称与宪法落笔（S5·2026-10-20）：README 技术栈/架构两处、architecture.md(+zh) 三支柱改写（六边形=Clean 同族 + 函数式内核 + CQRS 按需 P4）、tooling-standards CQRS 强制→按需、ES roadmap Phase C 改口（触发判据驱动·注册流事件删除留痕）·read-models 头注正名 ×N。
- [x] `pnpm run ci` 全绿（check+ratchet+build+drift 三向对拍+web typecheck+tests+fallow 0 违规·2026-10-20 终跑 PASSED）+ `test:fullstack` gated e2e 9 文件 31 测 + BA 一致性 9 测全绿（EXIT=0）。
- [x] `verify:type-escape` 棘轮不越界：基线 151→147（S1 删码下调留 diff）→148（S3 适配器正当胶水 +1 留 diff）。
- [x] **S6 不做**（未决③条件裁定·2026-10-20 实查）：payment `amount` 纯透传 Stripe 零本地运算——P2 判据不过，不为 VO 而 VO。

## 9. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 起草 | 首版：函数式内核六边形单体修宪提案（P1–P4 范式 + S1–S6 切片 + 四未决项） |
| 2026-10-20 | 0.1.1 | 评审补强（用户认可） | P1 增两条纯度硬约束：效果=返回值非回调注入；时钟/随机源经参数注入——挡住「效果参数化冒充纯内核」误区 |
| 2026-10-20 | 0.2.2 | 内核地图补笔 | architecture.md(+zh) 增「函数式内核件清单」表（五件·纯度判据·防退化守卫指引·体积小说明）——P1 的物理可见化 |
| 2026-10-20 | 0.2.1 | S5 补笔 | vision.md §6 架构条对齐（宪法顶层·消除与改写后 architecture.md 的顶层矛盾）+ §7「聚合」措辞精度化——S5 宪法落笔面由五文件补齐为六 |
| 2026-10-20 | 0.2.0 | S5 收官 | 宣称/宪法五文件落笔（README/architecture±zh/tooling/ES roadmap Phase C 改口）·read-models 头注正名 ×9·S6 条件裁定不做（amount 纯透传·P2 判据不过）·终跑 ci+fullstack 全绿——**方案 S1–S5 全部落地·结项** |
| 2026-10-20 | 0.1.3 | S1 执行留痕 | 执行时连带删除两项孤儿：Email VO（唯一消费者为被删聚合·零引用）与 AggregateRoot 基类（零消费者）——e2e 夹具换同聚合流 UserStatusTransitionedEvent |
| 2026-10-20 | 0.1.2 | 消歧（用户认可） | §3.1 宣称补「即 Clean Architecture 依赖规则」等价注 + 命名说明（六边形=Clean 同族综合重述·非架构更换·放弃的仅是聚合 DDD 与全覆盖 CQRS 宣称） |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.2 变更，以当前正文内容为准。
