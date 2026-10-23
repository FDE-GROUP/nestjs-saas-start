# 已推翻裁定注释同步闸（overturned-ruling comment-sync guard）

> 适用范围: `全局`（新增 CI 门禁 · `scripts/` + `package.json` + `scripts/ci.ts`）
> 关联: global-organization-status-comment-sync（本次人肉清零·本案固化其机制）· global-tenant-residual-cleanup（明示排除「注释散文」留下的覆盖缺口）· verify-stories-drift / verify-domain-layout（同族恒等闸范式蓝本）
> 性质: 新增型（新闸·零业务代码改动）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与缺口

`global-organization-status-comment-sync` 本案（2026-10-23）人肉清零了 consolidation 切片 B 反悔
reclamation 后残留在代码注释里的 `tenant.status` 真列/户籍**现态断言**（8+9 段）——但**只擦了这一次**，
未造防未来同类漂移的机制。独立评价建议 1 点名此缺口：

> 决策反悔后代码注释漂移无闸……residual-cleanup 明确把注释散文排除在范围外，stories-drift 闸也不
> 覆盖代码注释——这是一个真实存在的覆盖缺口。

**根因**：本仓有一类高频结构漂移——某 plan 被后继 plan **反悔（overturn）**后，`specs/glossary/plans`
会同步翻账，但**散落在核心域文件头注的散文断言**（"状态存 `X.y` 真列""走 `Z` 户籍表单点写回"）落后
一代决策，且无闸拦截。现有闸各治一角：`stories-drift` 锁 docs/stories 溯源产物**实存性**、`domain-layout`
锁目录形状、`type-escape` 锁类型逃逸——**皆不覆盖「代码注释引用已推翻裁定」**。

**目标**：以一份集中的**「已推翻裁定登记表」**（数据）+ 一个**便宜纯文本闸**（enforcement），把「反悔
决策 → 代码注释散文须随翻」从人工自觉升格为机制强制，命中即 fail-loud（exit 1）。

## 2. 方案

### 2.1 数据：已推翻裁定登记表（enforcement 副本·内置于脚本）

新增 `scripts/verify-overturned-rulings.ts`，内置 `OVERTURNED_RULINGS` 数组，每条：

```ts
interface OverturnedRuling {
  /** 被推翻的 plan 短名（cites 检测用）。 */
  readonly plan: string; // 如 'global-tenant-entity-reclamation'
  readonly supersededBy: string; // 如 'global-governance-lifecycle-consolidation'
  /** 该裁定曾确立、现应禁于「非历史段」代码注释的**失实 token**（正则源·大小写敏感）。 */
  readonly bannedTokens: readonly RegExp[]; // 如 /tenant\.status\b(?!\.transitioned)/ 命「真列/户籍」语境
  /** 反证框定词：同一行含任一者视为「合法历史叙述」→ 豁免不判。 */
  readonly framingMarkers: readonly string[]; // 原 / 首用 / 当时 / 已归位 / 归位 / 已被反悔 / 反悔 / DROP / 退场 / 寄居 / 历史
}
```

初始登记**两条**（均有本案实证·非臆造）：
1. reclamation → consolidation：禁 `tenant.status`（真列/户籍语境）与「户籍表 / 户籍行」裸断言；
2. userfacing-tenant-naming → organization-vocabulary-pivot：禁业务上下文注释中「tenant 表」现存式说法
   （机制词面 `tenancy/`·`TenantIsolation*` 等留守，不在 banned 面）。

### 2.2 判据：token 命中 + 框定豁免 + 域排除

- **扫描域** = `libs/{core,contracts}/src` + `apps/api/src` 内 `*.ts`，**排除**：
  ① `**/migration/**`（迁移工件是 append-only 史实·天然合法）；② `*.test.ts`（测试可正名断言）；
  ③ `**/dist/**`·`node_modules`（承 stories-drift `SKIP_DIRS`）。
- **只扫注释**：正则/AST 抽 `//` 行注释与 `/** */` 块注释文本（纯核函数 `extractComments(src)`），
  避开字符串字面量——**这是防误杀 wire 值 `'tenant.status.transitioned'` 的关键**（负例锁测必测）。
- **违规判定**：某注释行命中 `bannedToken`，且**该行不含** 该条任一 `framingMarker` → 记违规
  （即：要么别说，要么说了就得带「原/已归位/DROP」等历史框定）。
- **框定词按条绑定**（非全局）：A 裁定的框定词不能替 B 裁定的失实断言开脱（防豁免面互相污染）。

### 2.3 诚实边界（明写·不可机器化的部分）

- 本闸只拦**登记表点名**的 token，**非通用语义检查**——未登记的决策反悔不会被抓（需随案补登·见 §5 演化）；
- 框定豁免是**行级启发式**：若某行既失实又恰含框定词（假阴），闸放行——这是「防误红优先」的既定取舍
  （承 residual-cleanup 对注释散文「不做硬闸」的谨慎），换取零假阳性可进 full/quick；
- 注释**多行断言跨行**（首行 token·次行才出现框定词）会被误红——实施时约定「框定词须与 token 同行」，
  本 plan 的本次人肉清零成果（每处均同行带框定）即符合此约定。

### 2.4 门禁接线（高危 · 触门禁面 · 须人签核）

1. `package.json` 新增 `"verify:overturned-rulings": "node scripts/verify-overturned-rulings.ts"`；
2. `scripts/ci.ts` 于 `verify:domain-layout`/`verify:stories-drift` 同置区新增
   `step('Overturned rulings guard', run('run', 'verify:overturned-rulings'))`（full+quick 均跑·纯文本便宜）；
3. 不碰 husky/commitlint/Biome 配置本身（仅在既有 `ci` 步序内追加一步）。

## 3. 非目标

- **不改任何业务代码 / 注释**（本案已清零·本闸首跑预期全绿，仅登记未来拦截能力）；
- 不做「已推翻 plan 名」在 `docs/` 散文中的清扫（只管**代码注释**·文档翻账另有单源纪律）；
- 不回溯补登 2026-10-23 之前的历史反悔案（仅登当前两条有据案·其余留演化）；
- 不引入 AST 解析依赖（纯正则·保持零 dep·与既有 verify-* 同构）。

## 4. 验收判据

- [x] 新增 `scripts/verify-overturned-rulings.ts`（纯核 `extractCommentUnits` + `findViolations` 可单测）；
- [x] 同址 `scripts/verify-overturned-rulings.test.ts`（镜像 `verify-domain-layout.test.ts`）·**9 例全绿**：
      ① 现态断言行 → 违规；② 同行带框定词 → 豁免；③ **同一注释块跨行** token⇄框定词仍豁免（实证修正
      §2.3 原「同行」假设→改按注释块粒度）；④ 注释内事件名指称 `tenant.status.transitioned` 前瞻放行；
      ⑤ 「自有 tenant 表」命中 vocabulary 裁定；⑥ 裁定间豁免面隔离；⑦⑧ 字符串字面量不入注释单元；⑨ 登记表漂移守卫；
- [x] `pnpm run verify:overturned-rulings` 对**当前工作树全绿**（293 文件 · 2 条登记 · 零失实现态断言）；
- [x] **人造违规实证（双向）**：临时探针 `apps/api/src/__probe_overturned.ts` 注「状态存 `tenant.status` 真列，
      为唯一真相源」（无框定词）→ **EXIT=1** 精确定位 `:1` + 回显被禁源 plan；删探针 → **EXIT=0**；
      （过程顺带坐实一项诚实发现：探针初版含「无**历史**框定词」字样，因 `历史` 自身是框定词而被豁免—
      —即 §2.3 假阴边界实证：失实行恰含 marker 词会放行·非缺陷·属既定取舍）；
- [x] 门禁接线：`package.json` `verify:overturned-rulings` + `scripts/ci.ts` 「Overturned rulings guard」步
      （full/quick 同置）；`pnpm run ci:quick` **Local CI PASSED**（EXIT=0·测试文件 148→149 passed 只增不减）；
      Biome check 对新/改 3 文件净（autofix 仅 format·未误擦 `OVERTURNED_RULINGS` 值导入）。

## 5. 演化与遗留

- **登记表随案生长**：未来任何「决策反悔」plan 结项时，应追加一条 `OVERTURNED_RULINGS`——建议在
  `docs/specs/workflow.md` 审计门清单一句话挂钩（「反悔类 plan 结项须登记被禁 token」），使闸不退化成
  一次性脚本（此挂钩触 `docs/specs` 宪法·高危#5·**另案裁**，本片不做）；
- 框定词表若过宽会吞掉真阳性——首轮取**保守集**（本案清零时实际用到的框定词），随假阴反馈再扩；
- **假阴实证（本次验收顺带捕获）**：框定豁免为块级启发式，一行若既失实又偶然含任一 marker 词（如探针
  初版含「无历史框定词」的 `历史`）会被放行——这是 §2.3 既定「防误红优先」取舍的体现，非缺陷；
  若未来需收紧，应改为「token 邻域窗口」匹配而非整块包含（归演化·本片不做）。

## 6. 风险与回滚

新增独立脚本 + 两处登记（package.json / ci.ts），**零业务改动**；回滚 = revert 单提交。
唯一实质风险是**假阳性把 full/quick 卡红**——以「只扫注释 + 同行框定豁免 + 排迁移/test」三重收敛，
并要求 §4「当前树全绿 + 人造违规必红」双向实证后方可合入。

> **高危面自陈**（workflow §3）：本闸新增 CI 门禁步、改 `package.json`/`scripts/ci.ts` 门禁编排 →
> **属「改门禁·CI」高危清单，须人签核后实施**。本 plan 为**待审提案·零实现**。
