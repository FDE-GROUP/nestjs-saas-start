# module-mikro-orm-factory-rename：orm.ts 正名工厂 + 归还 BA 默认参

> 用途: **方案（提案–审计–实施）** | 状态: 已审计·进行中 | 版本: 0.1.0
> 定位: 用户问「`mikro/orm.ts` 命名是否准确」，答曰两处不准（文件是大名词占位、实为无状态工厂；通用工厂却特化绑死 BA 默认实体集），人裁「乙」单独立案。

## 0. 概览（TL;DR）
- 单片：`database/mikro/orm.ts` → **`mikro-orm.factory.ts`**（角色后缀入目录命名法）；`initMikroOrm(databaseUrl, entities = MIKRO_ENTITIES)` **去默认参**——`entities` 改必填，工厂彻底中性；唯一裸调用方 `ba/auth-adapter.consistency.spec.ts` 显式传 `MIKRO_ENTITIES`（BA 默认语义归还 `ba/` 分区，import 同目录零爬升）。
- sweep：3 处代码 import + 9 处注释/文档路径提及（含 **tooling-standards.md 一处宪法行**·高危归签）。函数名 `initMikroOrm` **保留**（改 `createMikroOrm` 收益不抵 3 调用点+注释 churn·留裁点②复核）。
- 零行为变更：同一 `MikroORM.init` 路径、同参数值（默认参只是从声明处移到调用点）。

## 1. 背景与取证（代码/文档实存）
- `orm.ts` 全文只导出无状态工厂 `initMikroOrm`；实例持有者实为 `mikro-orm.service.ts`（app）/spec/seed（一次性）——「orm.ts」暗示 ORM 本体/单例，名实错位。
- 目录命名法：`mikro-orm.service.ts`/`mikro-orm.module.ts`/`app-entities.ts`/`column-meta.ts` 皆带角色或具体名词，`orm.ts` 唯一大名词占位。
- 调用点实形（实测）：service L36 与 seed L426 已显式传 `MIKRO_APP_ENTITIES`；**仅 spec L46 裸调用依赖 BA 默认**。
- 提及面账：import 3（service/seed/spec）；注释/文档 9（governance 仓储×2、workspace/post 仓储×2、post.entity、ba/entities.ts 头注、mikro-migration.config.ts、seed.ts L31 头注、tooling-standards.md L103、mikro-migration-guide.md L104、scripts/mikro-migration-create.ts L6）。

## 2. 范围（单片定稿）
- `git mv orm.ts → mikro-orm.factory.ts`；签名 `entities` 必填（删默认值与 `MIKRO_ENTITIES` import）；头注「entities 形参」段重写为中性表述（历史：默认参源于修宪切片 2）。
- spec：`import { MIKRO_ENTITIES } from './entities'` + `initMikroOrm(databaseUrl, MIKRO_ENTITIES)`。
- sweep 上表全部 import/注释/文档提及（宪法行只改路径名不改动语义）。
- 顺带清 seed.ts L31 注释中的陈旧例举（`./four-tables` 已随归位案迁走——改述为现链 `./ba/entities` 系）。
- **非目标（锁）**：不改 `MikroORM.init` 任何参数值/行为；不动 service/module/column-meta 命名；不并做 `mikro/` 目录其余清账（column-meta/migration 混居问题留后续）；零 schema。

## 3. 边界·风险·未决
- **R1 静默面**：无专用 config 收录本文件（区别于 consistency spec 教训），import 漏改即编译红——低风险。
- **R2 高危项**：tooling-standards.md 宪法行注名改动（纯路径正名·零语义），归人签（本审计即签核）。
- 归人裁：① 整案 GO；② 目标名 `mikro-orm.factory.ts` 认可 vs 他选（`init-mikro-orm.ts` 等）、函数名保留 `initMikroOrm` vs 同改 `createMikroOrm`（建议保留）；③ 去默认参认可（BA 语义归 ba/）vs 保留默认；④ 单笔提交（实施一笔，验收后结项再一笔）。

## 4. 审计结论
- 裁决：**GO**（人 2026-10-20 令「你来裁定」→ Agent 代裁四裁点全采建议档：①整案 GO ②`mikro-orm.factory.ts`+函数名保留 ③去默认参 ④单笔实施+结项笔；**问责归授权令签发人**，沿 module-mikro-adapter-package-extraction 代裁先例）
- 意见 / 修改要求：无；含 tooling-standards.md 宪法行纯路径正名（高危面随整案授权）。
- 结论：**已签核·已实施**（待人类验收与推送）
- 未决项：无。
- 审计人 / 日期：Agent 代裁（人令授权）/ 2026-10-20

## 5. 验收判据（已实施·带取证）
- [x] `git mv` 识别 rename；`entities` 必填后全仓 `initMikroOrm(` 三调用点均双参（service/seed 原本即显式·spec 新增传 `MIKRO_ENTITIES` 同目录 import）。
- [x] 旧路径提及 grep=0（全字 `orm.ts` 实文仅剩本/前案计划文档历史叙述）；棘轮基线单行路径更名（32 文件 · 148 处恒等）。
- [x] `ci` PASSED（基线不变）；`migration:generate` 空 diff；`ci:db` 绿且 spec 显式传参实跑 9/9（库名恒等满足）；`verify:prod-boot` 200。

## 6. 变更记录
| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.2.0 | 「你来裁定」代裁落地·实施 | 单片实施：`orm.ts`→`mikro-orm.factory.ts`（rename）·去 BA 默认实体参（spec 显式传 MIKRO_ENTITIES）·12 处 import/注释/文档 sweep（含 tooling-standards.md 宪法行与 seed 头注陈旧例举订正）·棘轮基线路径更名（148 恒等）——空 diff+ci+ci:db(9/9)+prod-boot 全绿 |
| 2026-10-20 | 0.1.0 | 用户问 orm.ts 命名准确性，裁「乙」立案 | 首版单片：改名工厂正名 + 去 BA 默认参 + 12 处 import/注释/文档 sweep（含宪法行一处） |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.2.0 变更，以当前正文内容为准。
