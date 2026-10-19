# 外部评审架构债处置（取证裁定 · 纯文档零代码）

> 适用范围: `全局` ← 对一份外部评审报告所列「架构债」逐条取证裁定处置口径
> 关联: 外部评审报告（2🔴+2🟡 即时必修 + 架构债清单）· `AGENTS.md` §4（L1=本地 CI）· `docs/specs/tooling-standards.md` §4.7（静态分析假阳性）· `libs/core`↔`apps` 依赖方向 · `ERROR_CODES`
> 性质: 定点处置 / 留痕（不引入代码变更；把「当前真相 + 为何不动」固化，防重复误报与重复争论）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 0. 前置：即时必修四项已闭环（非本 plan 处置对象）

外部评审的 2🔴 + 2🟡 即时必修已在相邻切片全部修复并推送（取证 = commit 链）：

- 🔴-1 CORS `origin:'*'`+`credentials:true` → 白名单化 + 函数式回显（复用 `ALLOWED_ORIGINS` 单一真源）——commit `6facd85`
- 🔴-2 `.env` 疑似真实凭证 → **核实为占位符**（`your-secret-key` / `sk_test_*` / `postgres://postgres:postgres@localhost` 等），无需动作（评审该断言为实质误判）
- 🟡-2 会话旁路子串地雷 `url.includes('/auth')` → 完整路径段对齐匹配——commit `c1f8522`
- 🟡-1 CSRF 显式防线缺失 → 丁（甲 `CsrfOriginGuard` Origin/Referer 校验 + 丙 显式钉 `sameSite:lax`）——commit `dc810f6`

本 plan 只处置评审另列的**四项架构债**，逐条给取证与处置口径。

## 1. 远程 CI「缺失」

- **评审断言**：仓库无远程 CI workflow（`.github/workflows/` 仅 `deploy-swagger.yml`），视为质量门禁缺口。
- **取证**：`AGENTS.md` §4 明文——「**L1 = 本地 CI（`pnpm run ci`，不走远程 CI）**；husky：`pre-commit`→`lint:fix`、`commit-msg`→commitlint、`pre-push`→`ci`」。`.github/workflows/` 实存仅 `deploy-swagger.yml`（Pages 部署，非质量闸）。
- **处置**：**维持现状·非缺陷**。这是宪法级（AGENTS §4）有意选择：门禁前移到本地 husky（`pre-push` 已跑完整 `ci`），不依赖远程 CI。新增远程 CI workflow 属高危#4（改门禁·CI）且**直接违反 §4**，须人签核方可议；Agent 不擅自引入。
- **若未来确需**：应先在 `docs/specs` 层面修订 §4（宪法变更·归人），再谈落地。

## 2. core 边界失守

- **评审断言**：`libs/core`（@core 共享内核）边界失守——疑指反向/越层依赖。
- **取证**：
  - `grep "from '@app/" libs/core/src`（排除 node_modules）→ **0 处**（core 不反向依赖 apps）。
  - `grep "@core/saas-kit" apps/api/src`（排除 node_modules）→ 366 处（apps→core **单向**，方向正确）。
  - `fallow architecture`（`pnpm run ci` 尾段）→ **No issues found · 0 boundary violations**。
- **处置**：**断言不成立·无需动作**。依赖方向经 grep + fallow 双重坐实为正确单向。若评审所指系 core **内部**层序（如 domain→infrastructure 越层），则属另一具体命题，须给出具体文件对再核；当前无此证据，不臆测扩大处置面。

## 3. `as never` 74 / `any` 93 类型击穿

- **评审断言**：生产代码（非 test）存大量 `as never`（评审称 73·实测 **74**）与 `any`（评审称 48·实测 **93**，评审此处偏低），视为类型安全债。
- **取证**（计数口径 = 排除 `node_modules` 与 `*.test.ts`/`*.spec.ts`；聚集分布）：
  - `as never` 高度集中于 **MikroORM 仓储/事件面**：`mikro-tenant-governance.repository.ts`(15)、`mikro-user.repository.ts`(7)、`outbox-relay.ts`(7)、`seed.ts`(6)、`mikro-workspace.repository.ts`(5)……多为 MikroORM 类型化 `FilterQuery`/`em.insert` 对对象字面量的边界逃逸（上游类型不完备的**正当用法**）。
  - `any` 高度集中于：**`auth.implement.ts`(50)**（Better Auth adapter 胶水·BA 侧类型本就宽）、`apps/web/src/routeTree.gen.ts`(15)（**TanStack 生成物**·非手写码）、`database/mikro/column-meta.ts`(8)、`main.ts`(4)（Nest+Fastify 插件 `register()` 泛型不流转的已知缺口）。
- **分析**：绝大多数落点在**三方边界胶水**（MikroORM / Better Auth / Fastify 插件 / 代码生成物）。对这些做「消除逃逸」的盲扫会破坏可编译性或强塞无谓适配层，属负收益；`routeTree.gen.ts` 更非可改对象。
- **处置**：**不做盲扫式 sweep**。此项「债」的定性证据不足（多数系合理逃逸）。若确要收紧，唯一安全路径是**「只紧不扫」增量门禁**：立一条检查防**新增无理由** `as any`/`as never`，存量按文件白名单豁免并逐步收敛。**→ 后续已兑现**：该门禁已成方案并经用户 GO 签高危#4 落地（见 [module-common-type-escape-ratchet](./module-common-type-escape-ratchet.md)·基线 grandfather 151/31·接进 `ci.ts` 硬门禁）。

## 4. `nextVersion` 无锁 max+1（并发）

- **评审断言**：`MikroEventStore.nextVersion` 以 `max(version)+1` 取聚合内序号且无锁，存在并发竞态。
- **取证**：`apps/api/src/database/mikro-event-store.ts:58` `nextVersion` 经 `find(orderBy version DESC limit 1)` 取 max 再 +1；类文档 §16-17 明载——「并发窗口与重复 `eventId` 由 DB 唯一键 `(aggregateType, aggregateId, version)` / `event_event_id_key` 兜底 **fail-loud**（`em.insert` 直发 INSERT，违约束即如实抛、不静默吞、不重试覆盖）」；且本 ES 为 **shadow append**（CRUD 仍是唯一真相源·见 module-users-es-append / event-sourcing-roadmap Phase B）。
- **分析**：竞态客观存在，但**处置已被前序已审切片明确选定为「不锁·靠唯一键 fail-loud」**——是影子追加语义下的有意并发取舍，非静默数据损坏缺陷（违约抛错、不吞、不覆盖）。改为 advisory lock / serializable 事务会**推翻一项既有人类架构裁决**，并触及并发/事务行为语义。
- **处置**：**维持现状·非缺陷**。若业务演进到「ES 成为真相源·并发同聚合追加需保序不失败」，则应作并发语义升级**另立专项**（涉 DB 访问模式·高危#1/#4·归人问责 P2），本片不动。

## 5. 影响面与风险

- **blast radius**：纯文档·零代码·零配置变更。
- **命中高危**：否（不改门禁/CI/Biome/契约/schema）。本 plan 的价值恰在于**记录「哪些项被判为不动、依据为何」**，把高危项（远程 CI、类型门禁、ES 锁语义）留在需人签核的位置，避免 Agent 越权或未来重复误报。
- **可逆性**：git revert 即回；无副作用。

## 6. 审计记录

> 无已审方案不写码。本 plan 系处置留痕（零代码），非开发依据。

- 结论：**四项架构债逐条处置完毕**——① 远程 CI 违宪维持；② core 边界断言不成立（fallow 0 + 单向 366/0）；③ 类型逃逸多为三方胶水正当用法、拒绝盲扫、收紧须另立增量门禁 plan 过人签核；④ `nextVersion` 系已审 fail-loud 有意取舍、维持。
- 未决项（均需人签核·归 P2 问责）：~~③ 是否值得建「只紧不扫」类型门禁~~→**已建已落地**（module-common-type-escape-ratchet·用户 GO）；④ ES 是否演进至需保序追加→当前**不动**（条件性未来项）。
- 审计人 / 日期：用户授权「全部由你自行裁定」· Agent 取证裁定 · 2026-10-20

## 7. 完成判据（已达成）

- [x] 四项架构债各附**可复核取证**（命令/计数/文件行/文档段）与明确处置口径。
- [x] 高危项（远程 CI / 类型门禁 / ES 锁语义）显式留于人签核位，未被 Agent 擅自实施。
- [x] README 索引登记本 plan（状态 = 已裁·零代码处置）。

## 8. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 起草 | 首版：外部评审四项架构债逐条取证处置（含即时必修四项闭环锚定） |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.0 变更，以当前正文内容为准。
