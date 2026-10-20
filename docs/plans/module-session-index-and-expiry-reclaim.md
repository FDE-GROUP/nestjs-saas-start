# session 活性收口：`session.token` 命中索引 + 过期 session 清理（P0′ #5·E 片独立呈审）

> 适用范围: `多上下文(auth/infrastructure·database/mikro/迁移·config 契约)` ← 触 **DB schema 迁移（高危#1）** + 新增运行期周期任务 + config 契约面
> 关联: 母案 [`module-p0-async-boundary-correctness`](./module-p0-async-boundary-correctness.md) 切片 E（本案将其 §2-E 细化为决策完备·可签核的独立呈审）· 归位案 [`global-ba-entity-domain-placement`](./global-ba-entity-domain-placement.md)（session 实体现归 auth 域）· `global-entity-column-law`（列律·BA 表只裁表名恒等）· `module-es-outbox-transactional`（周期任务 `setInterval` provider 范式先例）
> 性质: **修复型（改实现 + 高危#1 DB 迁移·待审计·零实现）**
> 来源: P0′ 四路深勘 + 🔴 逐条代码复核已证实（§2 现状均为本轮独立取证·带取证）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

母案 P0′ 五片中 A/B/C/D 已甲档落码，唯 **E（#5）** 因触**高危#1 DB schema 迁移**、且原§E 把「清理形态甲/乙/丙」与「是否引入 `@nestjs/schedule` 新依赖」列为归人裁未决项，故整片留白待人亲签。本案把 E 收敛为**可签核的具体设计**。

**两条已证实缺陷**：
- **E-a · 查询放大**：`session.token` 无索引，BA 服务端每请求按 token 查 session → **全表 seq scan**，延迟随历史会话行数线性恶化。
- **E-b · 无界增长**：无任何过期 session 回收 → session 表单调累积，反噬 E-a。

**目标**：以**最小面**同时终结两条：`token` 索引（终结扫描）+ `expiresAt` 索引 + 周期清理任务（终结无界增长）。

**非目标（锁）**：不改认证/会话**建立**语义；不动 BA 操作面（会话机器仍走 `auth.api.*`）；不改 session **列形**（仅加索引·见 §3 对拍）；不涉其它 BA 表；不引外部调度（pg_cron/运维脚本）——SSOT 落库外，宪法反对。

## 2. 现状取证（2026-10-20·本轮独立复核）

- **session 建表 DDL**（`database/mikro/migration/migrations/Migration20261016055354.ts`）：`create table "session" ("id" text … "expiresAt" timestamp not null, "token" text not null, … primary key ("id"))`——**仅 PK**，`token` 无索引（连 unique 无）、`expiresAt` 无索引；后续迁移无补。
- **迁移忠实模型**（`database/mikro/migration/migration-entities.ts` · `Session`）：**无 `indexes`/`uniques` 声明**。此文件是 `migration:generate` 的 DDL 唯一驱动源（运行时 `modules/auth/infrastructure/entities/ba-identity.entities.ts` 的 `Session` 仅 app-orm 消费、**不参与迁移 DDL**·见其类头注记）。
- **token 查询确证**：`libs/mikro-adapter/mikro-auth-adapter.ts` 的 `findOne` 拼裸 SQL `SELECT * FROM ${q(model)} WHERE …`，BA 会话校验以 `token` 入 `where` → 无索引 = PG 对 session 表顺序扫描。
- **既有周期任务范式（关键）**：仓内**已存在**周期 DB 后台任务——`database/eventing/outbox-relay.ts` 以 `onApplicationBootstrap` 起 `setInterval`（config 门控 `mode`/`pollMs`）+ 公开 `tickOnce()` 供确定性单测/e2e 直调 + `ticking` 防重入 flag + `onModuleDestroy` `clearInterval`。**全仓未依赖 `@nestjs/schedule`**（`grep` package.json = 0 命中）。
- **列律对加索引的态度（非阻断）**：`database/entity-column-law.ts` 对 BA 契约八表「**只做表名恒等、不裁列形**」（守卫测 `entity-column-law.guard.test.ts` 仅断言 `MIKRO_ENTITIES` 表名集合 == `BA_CONTRACT_TABLES`，不检索引）；且 **`user_email_idx` unique 索引已存在于 BA 契约表 `user`** ——BA 表带索引是本仓既有形态，加 `session` 索引不违契约。
- **既有索引写法**：`migration-entities.ts` 内普通索引 `indexes: [{ name, properties }]`、唯一约束 `uniques: [{ name, properties }]`（见 `Member`/`Invitation`/`Consent`）——本案沿用同一语法。
- **清理落点归属**：归位案已裁 session 归 **auth 域**；过期回收是 auth 域自有事实，清理 provider 应居 `modules/auth/infrastructure/`（与 relay 的 `database/eventing/` 分层同理：谁拥有域谁拥有其周期任务）。

## 3. 方案（两块·F1 迁移 · F2 清理）

### F1 · session 索引（高危#1 DB 迁移）

- **改动**：仅 `migration-entities.ts` 的 `Session` 追加：
  ```
  uniques: [{ name: 'session_token_idx', properties: ['token'] }],
  indexes: [{ name: 'session_expires_at_idx', properties: ['expiresAt'] }],
  ```
  `migration:generate` 即产 `create unique index "session_token_idx" on "session" ("token")` + `create index "session_expires_at_idx" on "session" ("expiresAt")`。**运行时实体不改**（索引属 DB 侧·对 app-orm 无运行期语义·改之无益且徒增面）。
- **token 采 unique（推荐）**：BA token 本质每会话随机唯一，唯一索引兼作完整性防线。**风险登记 R-唯一性**：对**已 populate 的库**加 unique，若历史存在重复 token 会使迁移失败——BA 随机 token 实际不重复，dev/e2e 库无虞；生产首次施加前应 `SELECT token, count(*) … HAVING count(*)>1` 查重（列入 §5 前置）。**降档备选**：若人裁不愿承担查重前置，可退化为**普通索引**（`indexes` 而非 `uniques`·仍终结 seq scan·仅少一层完整性）。
- **对拍硬闸**：`migration:generate`（产非空 index DDL·有意为之）→ `migration:run` → **二次 `migration:generate` 空 diff**（证实体元数据与 DDL 对齐·沿归位案/收权案先例）。
- **零列形变更**：不新增/删改 session 任何列，仅加索引——故**不破** `session` 的列律表名恒等、不改 BA adapter 的 model/列寻址契约。

### F2 · 过期 session 周期清理（形态归人裁·推荐「甲′：镜像 relay 零依赖」）

**四档对拍**（本案据取证给推荐）：

| 档 | 形态 | 依赖 | 评 |
|----|------|------|-----|
| 甲（原§E） | `@nestjs/schedule` `@Cron` | **引新依赖** | 现无必要——仓内既有 `setInterval` provider 范式（relay）已覆盖，引第二套调度反增熵 + 触工具红线/npmmirror 核对·签核面更大 |
| **甲′（推荐）** | `SessionReclaimService` provider，镜像 `OutboxRelay`：`onApplicationBootstrap` config 门控起 `setInterval` + 公开 `reclaimOnce()` + 防重入 + `onModuleDestroy` 摘 timer | **零新依赖** | 与 relay 完全同构·复用既有范式·高危仅余 F1 迁移；DELETE 天然幂等（多实例并跑无害·清理无需 relay 式 SKIP LOCKED 互斥） |
| 乙 | 读/登录路径被动删该用户过期 session | 零依赖 | 治标——不清「永不再登录」的僵尸行，无界增长仅放缓 |
| 丙 | pg_cron / 运维脚本 | 出应用边界 | 宪法反对（SSOT 落库外） |

**推荐 = 甲′**（既终结无界增长，又**消除「新增依赖」这一高危维度**，与既有 relay 对称）。

- **改动（若采甲′）**：
  - 新增 `modules/auth/infrastructure/session-reclaim.service.ts`：`reclaimOnce(): Promise<number>` = `const em = await this.mikro.fork(); return em.nativeDelete(Session, { expiresAt: { $lt: new Date() } })`（走 F1 `session_expires_at_idx`）；生命周期骨架逐字镜像 relay（config 门控 + 防重入 + 公开入口 + destroy 摘表）。批量上限为可选优化（模板规模单语句删净即可·如需限批用 `DELETE … WHERE ctid IN (SELECT ctid … LIMIT n)`）。
  - 在 `database/database.module.ts` 注册 provider（与 `OutboxRelay` 同处）。
  - config 契约面新增段 `sessionReclaim`：`config.module.ts` zod 加 `SESSION_RECLAIM_ENABLED`(默认 true·**test 环境默认关**防干扰 e2e 墙钟)、`SESSION_RECLAIM_INTERVAL_MS`、`SESSION_RECLAIM_BATCH`(可选)；`config.service.ts` 加 `getSessionReclaimConfig()`（镜像 `getEventPublishConfig()`）；`Config` 接口 + `.env`/`.env.example` 同步（四角对拍 `verify-config-contract` 须登记新键·见 §5）。
- **测试**：单测 mock em 断言 `reclaimOnce` 删除谓词 = `{ expiresAt: { $lt: <Date> } }` 且防重入返回 0；新增 gated e2e（真库）插「过期行 N + 未过期行 M」→ `reclaimOnce()` → 断言仅删过期（剩 M）、幂等二次调用删 0——**须同步登记 `scripts/ci-fullstack.ts` 的 `GATED_E2E_FILES`**。

## 4. 影响面与风险（blast radius / 高危清单核对 workflow §3）

- **blast radius**：中。`migration-entities.ts`（+2 索引声明）· 一个迁移文件（`migration:generate` 产）· 新增 1 provider + `database.module` 注册 · config 三处（module/service/interfaces + `.env`/`.env.example`）· 单测 + 1 gated e2e + `GATED_E2E_FILES`。**不改 BA 列形·不改认证语义**。
- **可逆性**：**F1 不可逆**（DB schema·回滚需 down migration）；F2 provider 可 revert（纯 additive）。
- **高危命中（workflow §3）**：
  - **#1 DB schema 迁移**（F1 索引 DDL）→ **人亲签·Agent 不得自行 `migration:run`/`migration:generate` 落生产**。
  - ~~新依赖签核~~ → **采甲′后消失**（零依赖）。
  - config 契约扩展 = 改公共配置面 → 属可审方案内改动，随本案一并签核（非独立高危）。
- **风险登记**：
  - R-唯一性：unique token 对已 populate 库的历史重复敏感（§3-F1 前置查重·或降普通索引）。
  - R-墙钟：清理 provider 若 test 环境不关会干扰 e2e 时序（→ `SESSION_RECLAIM_ENABLED` test 默认关）。
  - R-config 漂移：新 env 键须过四角对拍（`verify-config-contract.ts` + `.env.example` 同步），否则门禁红。

## 5. 审计记录（待审·归人裁项）

> 无已审方案不写码；本片触高危#1，**须人亲签**方进实现。

- 结论：**设计档已裁·实施未开工**（本案仅呈审·零实现；迁移执行待高危#1 人亲签）。
- 已裁项（人类以「你裁定」授权·Agent 代裁·问责归该授权人）：
  - ① **F1 token 索引 = unique**（承取证：`user_email_idx` 已为 BA 契约表 unique 先例·加索引不违契约；采 `uniques: [{ name: 'session_token_idx', properties: ['token'] }]`）。施加前置仍列 §5：对已 populate 库先 `SELECT token,count(*) HAVING count(*)>1` 查重（BA 随机 token 实际不重复·dev/e2e 无虞）。
  - ② **F2 清理形态 = 甲′**（镜像 `OutboxRelay` 零依赖 `setInterval` provider）——取证显示仓内既有周期任务范式·无需第二套调度，**否** `@nestjs/schedule`（新依赖维度消失）。
- 不可代裁项（硬闸·归人）：
  - ③ **高危#1 迁移亲签**：`migration:generate`+`migration:run` 由人签发后方可实施；「你裁定」仅授设计选档，**不构成 DB 迁移执行授权**。Agent 不自行迁移。
- 审计人 / 日期：人类授权「你裁定」·Agent 代裁①②（③ 待亲签）/ 2026-10-20

## 6. 完成判据（可核验 + 穷尽·签核后方落）

- [ ] F1：`migration:generate` 产 session 两索引 DDL → `migration:run` → **二次 generate 空 diff**；（若 unique）前置查重通过。
- [ ] F2：清理 provider 镜像 relay 骨架；`reclaimOnce()` 单测锁删除谓词 `{ expiresAt:{ $lt } }` + 防重入。
- [ ] 新增 gated e2e 真库验「过期删净、未过期幸存、幂等二次删 0」；`GATED_E2E_FILES` 已登记。
- [ ] config 新键过 `verify-config-contract` 四角对拍 + `.env`/`.env.example` 同步；test 默认关清理。
- [ ] `pnpm run ci` 全绿·基线只增不减·Biome 净·fallow 0；`pnpm run ci:db` 带库全链绿；`verify:prod-boot` `/health` 200。
- [ ] 零越权：F1 迁移经人亲签后方实施；未改 BA 列形/认证语义；未引新依赖（采甲′）。

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 起草呈审 | 承母案 P0′ §2-E·本轮独立取证（session DDL 仅 PK·adapter token seq scan·列律只表名恒等·`user_email_idx` BA 表索引先例·relay `setInterval` 零依赖范式）细化为决策完备呈审：F1 索引迁移（unique 推荐·前置查重）+ F2 清理采甲′（镜像 relay·消除新依赖高危）·三待裁项归人 |
| 2026-10-20 | 0.2.0 | 人「你裁定」·Agent 代裁设计档 | ① F1 token = unique（带前置查重）· ② F2 = 甲′镜像 relay零依赖（否 `@nestjs/schedule`）；③ 高危#1 迁移亲签**不可代裁**·留硬闸——实施（含 `migration:run`）仍待人明确签发·本批仅提交呈审 doc

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.2.0 修订（设档已代裁①②·③高危#1 迁移亲签未给→零实现），状态以 README 索引表为单源。
