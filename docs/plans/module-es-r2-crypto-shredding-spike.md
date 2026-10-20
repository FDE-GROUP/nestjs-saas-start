# ES R2 前置勘察案：crypto-shredding（PIPL 终局·被忘权 vs append-only）——**纯勘察·零实现·零密钥接触 · 已审计·裁ⓐ缓行（挂触发判据）**

> 适用范围: `database/eventing 全域 · event.payload 信封形态 · PIPL 删除链（deleteByAggregate / 硬删 e2e）· 回放读侧（load/event-hydration/fold/真相源写读）· outbox/relay 投递时序 · 密钥驻留（新增设施）` ← blast radius **大且不可逆**（毁钥即永失）；审计深度 = 人签核（高危#1 + 密钥/合规裁断归人）
> 关联: 母案 [module-es-truth-source-amendment](./module-es-truth-source-amendment.md) §3 裁④（丙起步→**甲终态**）· §4 **R2 PIPL 终局**· §5「R2 毁钥不可逆（演练先行）」· [module-es-r1-replay-core](./module-es-r1-replay-core.md)（R1 真相源链是本案冲击对象）· [module-tenancy-hard-delete](./module-tenancy-hard-delete.md)（现状物理删被忘权）· [module-es-outbox-transactional](./module-es-outbox-transactional.md)（relay 投递需明文）· PIPL 基线（C1+C2）
> 性质: **前置勘察 / 可行性 spike 案**——只出「机制要点 + 冲击面 + 归人裁点 + spike 验证判据 + 风险」，**不含实现**；过审后据勘察结论决定是否/何时立「真 R2 实现案」
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 0. 本案定位与触发缘起

母案 §4 把 **R2 = crypto-shredding 专项（裁④甲）** 定为「回放即真相」终态下 PIPL 被忘权的正解：事件不可变 vs 被忘权的死结，用「每聚合数据密钥加密事件 payload·擦除=毁钥·事件行留而不可解」解开（GDPR/PIPL 通说可接受）。

R1（tenants 真相源写读链）已落地并推至 `908ed2a`。按人指示，R2 不贸然进实现，**先做前置勘察**：把「真要在本模板落 crypto-shredding，会动到哪些已落地面、需要哪些新设施、哪些必须归人裁」逐条取证摊清，产出决策完备的 spike 判据——**本案本身不写码、不碰真密钥、不改任何已落地链**。

## 1. 现状取证（代码实证·本轮复核）

| # | 事实 | 取证锚点 | 对 R2 的含义 |
|---|------|----------|--------------|
| F1 | 现存**全部**事件流 PII 极薄：tenant 三类 payload 仅 `status`/`from`/`to` + opaque `actorId`/`reason`；刻意不携 name/slug | `libs/contracts/src/event/tenant-events.ts`（`tenantRejectedPayloadSchema` 注「PII 最小：不携申请内容」）·`tenant-bootstrapped.event.ts:21`·`tenant-rejected.event.ts:18` | 被加密的「有价值 PII」在当前流里**几乎不存在**→ 现无施加对象 |
| F2 | `user.status.transitioned` payload 同态：`from/to`(枚举)+`actorId`(注释「仅 id 不携邮箱」)+`reason`；aggregateType=`user` | `libs/core/src/modules/tenants/lifecycle/events/user-status-transitioned.event.ts:5-13` | 唯一 user 事件流亦 PII 极薄（`user.registered` 系幻影·从未入库，母案 R0 sweep 已订正） |
| F3 | 被忘权**现状 = 物理删**：`deleteByAggregate` 走 `nativeDelete` SQL DELETE 返删除条数；不受 `EVENT_PUBLISH_MODE` 门控（「表在就要清」） | `libs/core/src/shared-kernel/domain/event-store.port.ts:21-30`·`apps/api/src/database/eventing/mikro-event-store.ts:93`·调用点 `delete-tenant-permanently.command-handler.ts:60` / `delete-user.command-handler.ts:33` | crypto-shredding 将**替代**此路径的语义（行留·不可解）→ 现有断言链需改锁 |
| F4 | 硬删 e2e 断言「事件行物理清零」：`purged>=1`·`eventsLeft toBe(0)`·各表 `count toBe(0)` | `apps/api/src/modules/tenants/tenant-hard-delete.e2e.test.ts:185,197,201` | 毁钥模式下这些 `toBe(0)` **不再成立**（行仍在）→ 对拍面冲击点·须登记改锁 |
| F5 | `event.payload` 为**明文 jsonb** 列；回放读侧 `load()` 经 event-hydration 反序列化重建事件实例·fold/真相源全依赖可读 payload | `apps/api/src/database/eventing/entities/event.entity.ts`（`['payload',{k:'json'}]`）·`event-store.port.ts` load 注（「经事件类注册表反序列化·信封显式值透传不重掷」） | 信封化后 load/replay 遇**不可解**事件的降级语义是新增设计题·R1 链为冲击对象 |
| F6 | **零加密设施**：全仓无 KMS/信封/`createCipher·createDecipher·aes`（grep 仅命中 `crypto.randomUUID` 于 uuid-v7/main/authorization repo） | grep `crypto|createCipher|KMS|ENCRYPTION_KEY` 命中面核 | DEK/KEK、加解密、密钥驻留皆为**净新增**，无既有件可复用 |
| F7 | `eventVersion` 列（default 1）+ metadata jsonb 已就位（upcast / 每行密钥引用的挂载点候选） | `event.entity.ts`（`eventVersion`/`metadata`） | 密钥引用（keyId/KDF 参数）可落 `metadata`·不改表结构即有挂载面（待裁） |

**勘察主结论**：本模板当前**没有需要 crypto-shredding 的事件流**（全 PII 极薄·物理删已足满足 PIPL 被忘权）。R2 属「**机制先行·暂无施加对象**」的终态预建。是否现在建、还是挂**触发判据**待首个「含 PII 且需保留时间线/计数不可物理删」的事件流出现再建——这是本案交归人的第一裁点（见 §4 裁ⓐ）。此判断与母案 §1「能力基线 + 逐模块按需实施」澄清同构：crypto-shredding 是**能力完备性**要求，实施可择时。

## 2. crypto-shredding 机制要点（教科书形态 → 本模板落点）

> 以下为「若要实现须具备什么」的要点梳理，**非实现承诺**；供 spike 与后续实现案参照。

- **信封双层密钥**：每个加密域（候选粒度=per-aggregate 流 / per-aggregateType / per-tenant——§4 裁ⓑ）一把 **DEK**（数据密钥·随机）；DEK 用 **KEK**（主密钥）包裹存 `metadata`/独立表。被忘权 = **销毁 DEK**（不删 event 行）→ 该域密文永不可解，而行保留（append-only 时间线/计数完整）。
- **算法**：对称 AEAD（AES-256-GCM 候选·Node 原生 `crypto` 即备·零新依赖，合工具红线）；`payload` 列存 `{ciphertext, iv, authTag, keyId, alg}` 信封对象（或整体 base64）。
- **密钥引用面**：event 行需携 `keyId`（哪把 DEK 解的）——候选落 `metadata` jsonb（F7·不改列律）或新列（触表所有权/DDL 恒等守卫·高危#1）。
- **KEK 驻留**（最高危·§4 裁ⓒ）：env 明文 / 本地密钥文件 / 外部 KMS——须过境内 `DATA_RESIDENCY` 约束 + 「不得写入真实凭证」纪律 + 毁钥不可逆护栏。
- **回放降级语义**（对 R1 冲击核心·§4 裁ⓓ）：`load()` 遇不可解事件（DEK 已毁）时——整体拒回放 / 跳过该事件继续 fold / 返「已碎裂」墓碑态——三者对真相源/投影一致性影响迥异。
- **outbox/relay 时序**（§4 裁ⓔ）：relay 投递给订阅者需**明文** payload（EDA 消费方不解客户密钥）→「明文只在投递瞬间」的加解密接线点与同事务 append 的次序需设计；`publishDurable`（R1c seam）在此的交互需评估。

## 3. 对已落地面的冲击清单（改锁/重写登记项）

1. **PIPL 硬删链**（F3/F4）：`deleteByAggregate` 语义与 `tenant-hard-delete.e2e` / `delete-user` 的 `toBe(0)` 断言在毁钥模式下失效——需新增「crypto-shred 模式」对拍（行留·密文不可解·重放该流失败）并改锁旧测（承 R1c tenant-table 投影地位注记先例·断言本体处置需人裁）。
2. **回放读侧**（F5）：`load`/`event-hydration`/`replayTenantLifecycle`/真相源 `transition` 分支——加解密 hook 注入点、不可解事件降级、correlationId/metadata 透传链。
3. **表所有权 / DDL 恒等守卫**：`payload` 列形态变（明文对象→信封对象）与可能的 `keyId` 新列，触 `table-ownership.ts`、列律、DDL 恒等闸——高危#1（schema）。
4. **契约面**（`@saas/contracts`）：payload zod schema 是**明文语义**；信封是持久层细节，契约层应不受线（待核）——但若 upcast/keyId 进公共面需重议裁⑥。
5. **配置四角对拍**：KEK 驻留相关新 env 键（若走 env）须上 zod schema + `verify-config-contract` + compose 判据——境内密钥**不得**入 compose 明文（与哨兵冲突）。
6. **BA 八表 / auth 面**：不受影响（auth 不事件化·母案 §5 已锁）。

## 4. 归人裁点（本案不代裁·交签发）

- **裁ⓐ 时机**：现在预建 crypto-shredding 机制（能力完备性优先·为未来 PII 流铺路）／**挂触发判据**延至首个「含 PII 且需保留时间线不可物理删」的事件流立项时再建（本案勘察倾向此项·与母案按需实施同构）。
- **裁ⓑ 加密域粒度**：per-aggregate 流（毁一个聚合的钥·最贴被忘权个体单位）／per-tenant／per-aggregateType（密钥数与运维复杂度权衡）。
- **裁ⓒ KEK 驻留与合规**：env / 文件 / KMS；境内 `DATA_RESIDENCY`；密钥轮转与「不得入库凭证」「毁钥不可逆」护栏——**合规裁断归人**。
- **裁ⓓ 回放遇不可解流语义**：整体拒 / 跳过续 fold / 墓碑碎裂态（一致性 vs 可用性取舍）。
- **裁ⓔ 明文只在投递瞬间的接线点**：与 outbox/relay、R1c `publishDurable` 同事务 append 的次序交互。
- **裁ⓕ 与物理删的关系**：纯毁钥替代 `deleteByAggregate`／保留物理删作「行也必须消失」的更强删除兜底（双模并存·按 PIPL 请求强度选）。

## 5. spike 验证判据（过审后执行·不进主干·不触真密钥）

> 沿用记忆先例「无构建链时用临时 ESM 探针直调库生产路径做语义取证」。**仅用 ephemeral（内存随机）密钥**，绝不落盘真凭证、绝不触 prod。

- [ ] S1 用 Node 原生 `crypto` AES-256-GCM 对**样例** tenant payload 做 DEK+KEK 包络加解密 round-trip 探针（临时 ESM·主干外），验证信封形态可逆解。
- [ ] S2 验「毁 DEK 后密文永不可解且 event 行仍在」——证 crypto-shred 与 append-only 时间线保真同时成立。
- [ ] S3 探 `load()`/hydration 在遇不可解事件时的**最小改动降级面**（是否需端口加解密 hook / keyId 透传），产出对 R1 链的真实冲击量级实测（非估计）。
- [ ] S4 探 relay「明文只在投递瞬间」的接线可行性与 `publishDurable` 交互。
- [ ] S5 KEK 驻留三选项（env/文件/KMS）在本模板境内约束下的可行性对照表 + 与 config 四角对拍/compose 哨兵的冲突点清单。
- [ ] S6 结论回填本案 → 决定是否立「真 R2 实现案」及其范围/分期/高危清单（另过审计门）。

## 6. 风险与可逆性

- **不可逆高危**：毁钥即永失明文——任何实现**必须**先在可销毁环境（Testcontainers / scratch 库）演练（母案 §5「R2 毁钥不可逆·演练先行」），严禁拿 prod 密钥试。
- **密钥即凭证**：本案与后续 spike 一律 ephemeral/内存密钥，不得写入真实凭证（AGENTS 高危）。
- **对 R1 稳定性**：本案为勘察·零改动，R1 已推 `908ed2a` 不受影响；真实现案的冲击面见 §3，需逐片改锁过审。
- **触发未熟**：§1 主结论——现无 PII 事件流施加对象；若裁ⓐ选「挂触发器」，则 R2 实现案应**缓行**，R4「第二上下文推广」优先并行不悖。

## 7. 非目标

- **不实现**任何信封/加解密/密钥件；不改 `event` 表；不动 R1 真相源链；不碰 prod 数据/密钥。
- 不承诺本模板**必须**现在就落 crypto-shredding（时机归裁ⓐ）。
- 不触碰微服务/broker 线、auth/BA 面。

## 8. 完成判据（本案级·案级交付=「呈审就绪的勘察」）

- [x] 现状取证七项（F1–F7）带代码锚点、本轮复核。
- [x] 机制要点 / 冲击清单 / 归人裁点（ⓐ–ⓕ）/ spike 判据（S1–S6）/ 风险可逆 齐备、决策完备可审。
- [x] 人对本案签发 + 裁ⓐ 定向（审计门）——**2026-10-21 人同意=采纳勘察倾向：裁ⓐ「挂触发判据缓行」**（未启 spike、未启实现、未碰密钥/prod）。
- [x] 过审后走「触发器缓行」分支：本案**归档为参考**，真 R2 实现案待「首个含 PII 且需保留时间线/计数不可物理删的事件流」立项时再启；裁ⓑ–ⓕ（加密域粒度/KEK 驻留合规/回放降级语义/relay 时序/与物理删关系）随该触发作专项裁（本案不预裁）。
- [ ] 本 plan 与 README/母案 §4 状态单源同步。

## 9. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 人定向「先只出 crypto-shredding 前置勘察案·零实现·推广片待后续」（R1 真相源链推至 `908ed2a` 后） | 首版呈审案：定位（R2=裁④甲终态·本案为前置勘察）+ 现状取证 F1–F7（全事件流 PII 极薄·被忘权现状物理删·零加密设施·payload 明文 jsonb 冲击回放）+ 主结论「机制先行·暂无施加对象」+ 机制要点 + 冲击清单 + 归人裁点 ⓐ–ⓕ + spike 判据 S1–S6（ephemeral 密钥·不触 prod）+ 风险可逆 + 非目标 · 零实现零密钥接触 |
| 2026-10-21 | 0.2.0 | 审计门通过·裁ⓐ缓行 | 人同意=采纳勘察倾向「挂触发判据缓行」：本案过审计门归档为参考，**不启 spike/不启实现/不碰密钥·prod**；真 R2 实现案待「首个含 PII 且需保留时间线不可物理删的事件流」立项再启·裁ⓑ–ⓕ 随该触发作专项裁。下一步转 R4「第二上下文推广」另立项（归人择模块） |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.2.0 修订（审计门通过·裁ⓐ=挂触发判据缓行·本案归档为参考·不启 spike/实现/密钥）。状态以 README 索引表为单源。
