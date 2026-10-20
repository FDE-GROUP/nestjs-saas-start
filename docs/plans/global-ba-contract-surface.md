# global-ba-contract-surface：Better Auth 契约面独立成区（database/ba/）

> 用途: **方案（提案–审计–实施）** | 状态: 已审计·进行中 | 版本: 0.1.0
> 定位: `global-entity-context-placement`（已结项）讨论的续案——人问「`mikro/entities.ts` 为何不拆回各领域」，答曰契约面非领域、可拆不值得拆；人续问「放 libs/mikro-adapter？」，答曰破坏抽包零耦合边界与官方约定（适配器不持用户 schema·raw SQL 寻址·Consent 非 BA 路由表）；人裁**乙档**：契约面在 `database/` 内独立成区，用目录名把「非领域」身份显形。
> 关联: 前案 global-entity-context-placement（②BA 表面不拆·本案不反转该判据，只改**落位目录**）、module-mikro-adapter-package-extraction（非目标锁「不搬 entities」——本案**维持**该锁）、global-entity-column-law（守卫表名恒等账锚 `MIKRO_ENTITIES`·随迁）。

## 0. 概览（TL;DR）
- **A 片（搬迁主体）**：`database/mikro/entities.ts` → `database/ba/entities.ts`（目录名即身份声明）；`database/mikro/auth-adapter.consistency.spec.ts` → `database/ba/`（契约面的对拍件同区）；`vitest.consistency.config.ts` include 路径同步（**硬账·漏更=套件静默零跑**）；全仓 32 处消费方 import sweep（相对/别名按各链现状保持·tsx 链约束沿用三级相对手法）；`orm.ts` **留 `mikro/`**（实测四消费双用：BA 默认实体集 + app-orm + seed + 文档引用·只改其 import）。零 schema/零行为变更。
- **B 片（死面处置·归人裁）**：`BY_MODEL` 实测全仓零消费（适配器 raw SQL 按表名寻址不读它）——删除或保留注明预留，归人签（删码高危）。
- **C 片（文档）**：architecture ±zh 目录图 database/ 行「Better Auth 契约面」注记升级为 `ba/` 路径；本仓惯例文档不动。
- 硬闸：`migration:generate` 空 diff + `ci` + `ci:db`（含 gated e2e + 一致性 9 测真 PG）+ `verify:prod-boot`。

## 1. 背景与取证（代码/配置实存）
- `mikro/entities.ts`：8 个 BA 契约面 EntitySchema + `MIKRO_ENTITIES` + `BY_MODEL`；消费方实测 **32 文件**（orm.ts / app-entities.ts / migration-entities / seed(.test) / 列定律守卫 / tenants·users·auth·platform·subscriptions·posts 各仓储与 e2e）——全为**基础设施/契约对拍面**，无领域层消费者（各领域模型在 libs/core 与 modules/*/domain）。
- `BY_MODEL` 定义后**全仓零 import 使用**（仅自文件注释提及）；`mikro-auth-adapter.ts` 实核按 `model`（物理表名）raw SQL 寻址。
- `vitest.consistency.config.ts` L32 硬编码 `apps/api/src/database/mikro/auth-adapter.consistency.spec.ts`——搬迁必同步，且该路径无恒等闸守护（`GATED_E2E_FILES` 清单不含 consistency 件）→ 列为 R1 硬账。
- 「为什么不进 libs/mikro-adapter」论证已入会话记录（零耦合验收判据/官方约定/Consent 反证/可发布性），落位方案 §2 约束。

## 2. 范围（两片定稿）
- **A｜契约面成区 + sweep**：两文件 `git mv` 入 `database/ba/`；`ba/entities.ts` 头注成文身份（「Better Auth 契约面存储视图·列形权威在 BA 上游·表属主台账见 table-ownership·**非领域模型**——按表属主拆分会割裂单一契约单位，如需重议先翻本条与 table-ownership 台账」）；32 处 sweep；consistency 配置路径同步；`ba/auth-adapter.consistency.spec.ts` 的 `./orm` 改 `../mikro/orm`。
- **B｜BY_MODEL 死面处置**（按裁点②）：删除（连带清理注释引用），或保留 + 头注明示预留身份。
- **C｜文档**：±zh 目录图 database/ 行注记 `ba/`；README 索引行翻正。
- **非目标（锁）**：不进 `libs/mikro-adapter`（维持抽包非目标锁）；不拆契约面为多文件；`orm.ts` 不搬（双用）；`mikro/` 其余件（column-meta/driver/install-guard/mikro-orm.service）不动；零 schema/DDL/行为。

## 3. 边界·风险·未决
- **R1 consistency 静默失跑**（高）：config 路径漏更则套件零收录且 vitest 不报错。对策：实施后**单跑 `pnpm run test:auth-consistency` 拿 9 用例红绿实据** + 本方案判据显式勾「config include 命中 1 文件」。
- **R2 tsx 链**：seed/mikro-migrate 直链文件（ba/entities.ts、migration-entities、seed）保持相对导入（前案教训入账）。
- **R3 sweep 漏改**：编译期红兜底（32 处清单落实施笔记）。
- **R4 高危项**：±zh 宪法行注 + 可能的 BY_MODEL 删码——均归人签（本审计即签核）。
- 归人裁：① 整案 GO；② BY_MODEL 删除 vs 保留注明；③ 两片分笔提交。

## 4. 审计结论
- 裁决：**GO**（人 2026-10-20 令「同意」：①整案 ②BY_MODEL 删除 ③两片分笔 均采建议档）
- 意见 / 修改要求：无修改；②采删除建议（零消费已实证·守卫恒等账走 MIKRO_ENTITIES 不受影响）；删码与 ±zh 行注之高危问责归签核人。
- 结论：**已结项**（两片实施·人验收 2026-10-20·提交 `e9b12c8`/`056e563` 推送远端）
- 未决项：无。
- 审计人 / 日期：人（同意·三裁点全采建议）/ 2026-10-20

## 5. 验收判据（已实施·带取证）
- [x] `git mv` 两件入 `database/ba/`（rename 识别 99%/91%）；sweep 净：代码/文档全仓 grep 旧路径 `mikro/entities`·`mikro/auth-adapter.consistency` 残留=0（仅历史叙述除外）。
- [x] `vitest.consistency.config.ts` include 命中新路径·`ci:db` 实跑 `apps/api/src/database/ba/auth-adapter.consistency.spec.ts (9 tests) 9 passed`（真 PG·assertScratchDb 库名恒等满足·容器零足迹）——R1 静默失跑风险销雷。
- [x] 硬闸：`migration:generate` 空 diff（`✅ no schema diff — 0 migration created`）；`ci` PASSED（含守卫 8 测·基线不变）；`ci:db` 绿；`verify:prod-boot` /health 200。
- [x] `BY_MODEL` 删除（人签②a）：全仓 grep=0；MIKRO_ENTITIES 注释引用同步清；守卫恒等账走 MIKRO_ENTITIES 不受影响（ci 绿即证）。
- [x] ±zh 目录图 database/ 行注记 `ba/entities.ts`·身份语成文（storage view·非领域模型）·两版同构。头注同步成文（ba/entities.ts 「身份」段）。

## 6. 变更记录
| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.3.0 | 人验收同意·状态翻正 | README 索引行翻正「已完成·两片分笔提交并推送」；本文件 §4 结论→已结项 |
| 2026-10-20 | 0.2.0 | 人签核「同意」后两片实施 | 切片 A：两件 `git mv` 入 `database/ba/`·BY_MODEL 死面删除（全仓 grep=0）·32 处 sweep+注释面 2 处·`vitest.consistency.config.ts` 路径同步（实跑命中 9/9）·`orm.ts` 留位只改 import——硬闸空 diff+ci+ci:db+prod-boot 全绿；切片 B：±zh 目录图 `ba/entities.ts` 行注成文 |
| 2026-10-20 | 0.1.0 | 用户问 entities.ts 拆分归属，否掉进 adapter 包后裁「乙」 | 首版两片方案（A 契约面成区+sweep+config 硬账 / B BY_MODEL 死面处置 / C 文档）；取证 32 消费面·BY_MODEL 零消费·consistency 路径硬编码 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.3.0 变更，以当前正文内容为准。
