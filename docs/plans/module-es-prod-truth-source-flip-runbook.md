# ES 真相源生产翻面 runbook（本窗 tenants 单翻面·subscriptions 留后续窗·回放即真相 prod apply）

> 用途: 把已在 dev 亲签落地的 ES 真相源写切换（R1c `ES_TRUTH_SOURCE_TENANTS` / R4c `ES_TRUTH_SOURCE_SUBSCRIPTIONS`）安全推进到**生产**。
> 状态: **已定稿（裁点 A–D 人裁 2026-10-21）· 本窗范围 = tenants 单上下文 · 零 prod 动作 · 待运维逐条亲签执行**（本文件固化操作序列，不含任何自动执行；执行归人，问责归人 P2）。
> 权威指针: 方案单源 [module-es-r1-replay-core](./module-es-r1-replay-core.md)（§3-R1c/§7 回滚）· [module-es-r4-second-context-subscriptions](./module-es-r4-second-context-subscriptions.md)（§3-R4c）· 状态索引 [README](./README.md)。与 `docs/specs` / 代码冲突时以二者为准。
> 受众: 运维 / 值班工程师（持 prod `DATABASE_URL` 与部署权）。
> **本窗范围（裁点 A = 只翻 tenants）**：本次仅将 `ES_TRUTH_SOURCE_TENANTS` 推进到 prod；subscriptions（R4c）代码与旋钮已就位、缺省 false、**本窗不动**，列为后续独立签核窗——届时照本 runbook 同款保序流程（§3 A→E）对 `es-bootstrap-subscriptions` + `ES_TRUTH_SOURCE_SUBSCRIPTIONS` 执行即可。

## 0. 授权边界（先读）
- **本 runbook 不授权任何人自动跑 prod**。§3 每阶段均为**高危#1（写 prod 数据 / 改 prod env）**，须**逐条人工签核**后方可执行；Agent / 脚本不得自行 apply。
- 执行者须持**生产库连接**（本仓 dev 侧只有本地 `postgres-dev`，prod 连接不在本环境——即「我不自执行」的物理保证）。
- 全程只读命令（`--verify` / `psql SELECT` / `/health`）不改数据，可先行；**写命令（bootstrap / env 翻面 / 部署）一律停在此文件外等人签**。

## 1. 影响面与保序依据
- **blast radius（本窗 = tenants）**：tenants 治理写链（`transition` / reject handler）从「表为真相源」切到「event 流为真相源·表降投影」；subscriptions 写链本窗不切（旋钮 false·行为逐字节等价）。读链始终读投影，**对读侧零语义变更**。
- **保序硬依据（为何必须先 bootstrap 后翻面）**：真相源写路径 = `load('subscription'/'tenant', 行id) → replay fold 取前置态 → canTransition 裁决 → publishDurable(expectedVersion=流长+1) → 投影 upsert`。若存量行**未 bootstrap 成流**，`load` 得空流 → fold 前置态 `undefined` → 裁决与 expectedVersion 基错置。故 **bootstrap（存量补一条 `*.bootstrapped` 快照·version 续位）必须先于 env 翻面**。
- **正交项（勿耦合）**：真相源开关只要求 `publishDurable` 耐久 append（不受 `EVENT_PUBLISH_MODE` 门控·恒带乐观锁·与调用方 UoW 同事务·段③已证原子回滚无半写）。`EVENT_PUBLISH_MODE`（inproc/shadow/outbox）只决定**派发通道**，不影响 replay 正确性——见 §5 裁点 B。

## 2. 前置条件（缺一不得进 §3）
1. **prod schema 已迁移到当前链**（含 `event` 表及其投递列 `dispatchedAt`/`attemptCount`/`lastError`）：
   `pnpm run migration:run`（`DATABASE_URL=<prod>`）。生产只走 `migration:generate`+`migration:run`，禁 `db:reset`。核对：
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name='event' AND column_name IN ('dispatchedAt','attemptCount','lastError');
   -- 期望 3 行；event/tenant_subscription/organization 表均存在
   ```
2. **构建产物就位**（bootstrap 脚本走 `@core/saas-kit` / `@saas/contracts` dist 值导入）：`pnpm run build:libs`。
3. **prod 全量备份快照**（bootstrap 前·回滚底牌）：`pg_dump` 目标库或云快照，留存窗口见 §5 裁点 C。
4. **维护窗**：建议低峰；bootstrap 为幂等批写（逐行 `tenant_subscription` / `tenant`），量大需评估时长。
5. 环境变量口径：dev/prod 均**不重写** `esTruthSource`（靠 `@nestjs/config load:[default,env]` 继承缺省 false），翻面即在 prod env / secret store 显式置 `true`（**不写真实凭证入仓**）。

## 3. 执行序列（每阶段后停，等签核再进下一阶段）

### 阶段 A · 只读预检（不写·可先行）
对 prod 跑全量 `--verify`，**预期 FAIL-LOUD exit 1**（存量尚未成流·空流/无 bootstrapped 逐行点名）——证明确需 bootstrap：
```bash
DATABASE_URL=<prod> pnpm exec tsx scripts/es-bootstrap-tenants.ts --verify
```
判据：exit 1 且点名行 ≈ prod 存量 `tenant` 户籍行数（非 0）。**若这里已全绿**（罕见·说明早前已 apply），跳过阶段 B 直接进 C。

### 阶段 B · bootstrap apply（高危#1·写 prod 数据·人签后执行）
幂等·可安全重跑（version 从 max+1 续位·每流恰含 1 条 bootstrapped·payload 过 zod）：
```bash
DATABASE_URL=<prod> pnpm exec tsx scripts/es-bootstrap-tenants.ts
# 预期日志：total=N created=M skipped=K（首轮 created≈N；重跑 skipped≈N created=0）
```

### 阶段 C · 翻面前对拍闸（只读·**必须 100% 绿才允许进 D**）
```bash
DATABASE_URL=<prod> pnpm exec tsx scripts/es-bootstrap-tenants.ts --verify
# 预期：N/N 行对拍通过（每流 replay fold.status === 户籍行 status·bootstrapped 恰 1）·exit 0
```
任一不符即 exit 1 并逐行点名——**带病不过门**，回 §4 排查（多为 bootstrap 中断/手工改表），修复后重跑 B→C。

### 阶段 D · env 翻面 + 重新部署（高危#1·改 prod 配置·人签后执行）
在 prod 环境注入（值以字符串 `true`·zod `z.enum(['true','false'])`）：
```
ES_TRUTH_SOURCE_TENANTS=true
# 本窗不动 ES_TRUTH_SOURCE_SUBSCRIPTIONS（裁点 A = 只翻 tenants·subscriptions 留后续窗）
# 裁点 B = 保持现 mode 不动（不注入 EVENT_PUBLISH_MODE 变更·真相源正确性与 mode 正交）
```
重新部署后起服回归（Node 起 `dist` 产物·命中 `/api/v1/health` 至 200）：
```bash
pnpm run build            # 若部署链未含构建
DATABASE_URL=<prod> VERIFY_PORT=<port> pnpm run verify:prod-boot
```

### 阶段 E · 冒烟与观测（只读/可回退·人签后执行）
- 真实触发一次 tenant 治理动作（suspend→resume 一次），核验：tenant 流新增恰 1 条 `tenant.status.transitioned`（expectedVersion=流长+1）·投影行 status == fold 终态。
- 观测乐观锁护栏：正常并发不应触发 fail-loud；若日志现「expectedVersion 与流当前 max+1 不符」——说明有旁路直写表或双写残留，**立即 §4 回滚**并排查。
- 建议对拍抽查若干行 `replay fold == 投影`（生产口径复用 `--verify` 只读面）。

## 4. 回滚窗（随时可退·低风险）
- **配置级回退（首选）**：prod env 置 `ES_TRUTH_SOURCE_*=false` 并重启 → 写路径逐字节回到 shadow/表真相源旧语义。
- **数据无害保留**：已 bootstrap 的 `*.bootstrapped` 事件行**无需删除**——R1a 起 fold 起点语义容「无快照=全治理事件」空流，事件行留存不影响回退后的读写路径（event 表非 prod 读源·读恒走投影）。
- **回退后可安全重进**：修好旁路写入/双写问题后，幂等重跑 B→C→D 即可（bootstrap 不重排 version·不重复落快照）。
- schema 无破坏性变更（本翻面零 DDL），**不需也不做** schema 回退。

## 5. 归人裁点（**已裁·定稿 2026-10-21**）
- **裁点 A · 覆盖范围与批次 = 只翻 tenants**：本窗仅切 tenants（R1c）；subscriptions（R4c）旋钮就位但置 false·本窗不动·列后续独立签核窗。故障面最小、回退定位最清晰。
- **裁点 B · `EVENT_PUBLISH_MODE` = 保持现 mode 不动**：真相源耐久 append 与 mode 正交（`publishDurable` 恒带锁·同 UoW），本窗不注入任何 mode 变更；`outbox` 迁移（relay 异步·要求全部 `publishAll` 调用点在活跃 UoW 内）作为独立议题另案审，**不与本次翻面耦合**。
- **裁点 C · 备份与停机窗 = 运维占位**：`pg_dump`/云快照留存时长、维护窗时段、通知面由运维按 prod 规模与既有变更管理决定；本 runbook 仅强约束「bootstrap 前须有一次可回滚备份就位」这一前置事实，不写死具体策略/时刻。
- **裁点 D · bootstrap 放量 = 一次性全量（幂等）**：`es-bootstrap-tenants` 对 prod 存量 `tenant` 一次性全量补流·幂等可重跑；prod 行数大或写高频时，运维可自行分批重跑（脚本逐行处理·天然可分段），本窗不设专门限流开关。

## 6. 验收判据（翻面「结项」口径·防 over-claim）
仅当以下**全部**满足，方可在 README / r1 案把状态从「已实现待验收」翻为「prod 已翻面结项」（本窗仅 tenants）：
1. §3-C 全量 `--verify` 100% 绿（prod·tenants）；
2. §3-D `verify:prod-boot` `/health` 200；
3. §3-E 真实 tenant 治理动作核验「append 先于投影·fold==投影·expectedVersion 乐观锁在场」，观测窗内无异常 fail-loud；
4. 既有 gated（tenant-table / hard-delete）语义不变（缺省关时行为等价已在 dev `ci`/`test:fullstack` 证·prod 侧只需确认无旁路直写）。
> **subscriptions 结项另计**：R4c prod 翻面在其后续独立窗完成后，方可翻 r4 案状态；本窗不动 subscriptions。

## 7. 命令速查（prod 连接须显式）
```bash
pnpm run build:libs                                                   # bootstrap 前置
DATABASE_URL=<prod> pnpm exec tsx scripts/es-bootstrap-tenants.ts          # 本窗 B apply（幂等·一次性全量）
DATABASE_URL=<prod> pnpm exec tsx scripts/es-bootstrap-tenants.ts --verify  # 本窗 A 预检 / C 闸
DATABASE_URL=<prod> pnpm run migration:run                           # §2-1 schema
pnpm run verify:prod-boot                                            # D 起服回归
```

---
> 变更戳
> | 日期 | 版本 | 事件 |
> |---|---|---|
> | 2026-10-21 | 0.1.0 | 首版 runbook：固化 R1c/R4c prod 翻面保序（bootstrap→verify 闸→env→boot→smoke）+ 回滚窗 + 归人裁点 A–D + 结项判据；零 prod 动作·待运维逐条亲签 |
> | 2026-10-21 | 0.2.0 | 裁点 A–D 人裁定稿：A=只翻 tenants（subscriptions 留后续窗·本 runbook 全程收窄到 tenants）/ B=保持现 mode 不动（outbox 另案）/ C=备份停机窗运维占位 / D=bootstrap 一次性全量幂等；命令与结项判据同步去 subscriptions |
