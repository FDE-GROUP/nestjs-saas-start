# 翻案：四角配置契约对拍（`verify:config-contract`）由「独立脚本」升为 `ci` 链硬闸

> 性质：**反悔裁定**（高危#3 改门禁·CI + 撤销两处已签人裁）·决策待人类审计门亲签·问责归签核人
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表
> 关联被撤裁定：
> - [module-config-env-surface-contract](./module-config-env-surface-contract.md)（索引行）：**「切片 C 人裁不做 ⇒ 四角对拍仍无门禁持有·已显式列为遗留」**
> - [module-config-seed-fail-loud-and-contract-gate](./module-config-seed-fail-loud-and-contract-gate.md)（已验收·结项·索引行）：**「② 四角对拍裁『独立 verify 脚本』·`scripts/verify-config-contract.ts`·不进 `ci` 链·`ci.ts` 零改动」**

## 0. 概览（TL;DR）

把已存在、已加固、当前精准（0 假阳 / 1 真阳）的四角对拍脚本 `verify:config-contract` **织入 `scripts/ci.ts` 的静态便宜闸家族**，使其从「仅手动偶尔跑」升为每次 `pnpm run ci` / `pre-push` 的硬门禁。**本翻案撤销上述两处「不进链 / 切片 C 不做」的人裁**，理由是：阻止入链的原始顾虑（怕脆·怕误红卡推送）已被实跑证据消解，而其代价（死配置静默腐烂）已于 2026-10-23 现场演示一次。

## 1. 背景与取证（三分：事实 / 推断 / 未知）

**事实（均带取证）**：
- `verify:config-contract` 现仅挂 `package.json` 脚本，`scripts/ci.ts` 零引用（grep 坐实）、husky 不调 → 不在任何自动链内。这是**当前状态**，非缺陷本身。
- **死配置腐烂实例**：`ES_TRUTH_SOURCE_TENANTS=false` 在 governance-lifecycle-consolidation 撤治理面 ES 覆盖层后被遗留于 `.env.example`，一路进入 main 无人拦；且 consolidation 案 §5-D 自写验收判据「grep `ES_TRUTH_SOURCE_TENANTS`=0」因当时只扫 `.ts` 源、漏计 `.env.example` 而**过报**。本轮（2026-10-23 · commit `b3d3e5d`）方清。
- **脚本精准度实证**：本轮独立跑——判据②③全绿·判据① 仅揪 `ES_TRUTH_SOURCE_TENANTS` 一条、经 grep 坐实为**真阳性**（零 `process.env` 读 / 零 zod 条目 / 零 DI 消费）；**零假阳性**。
- **原始 FP 顾虑已闭合**：脚本采「双模式扫描」（覆盖直接 `process.env` 与 `@nestjs/config` 的 `configService.get` 回落），正是 config-env-surface-contract §25 记的教训（只扫 `process.env` 会把 `MAIL_HOST` 类误判死配置）落地后的形态。
- **合法 dev-only 键不入 FP**：`DATADOG_*`（仅存开发机 `.env`、非 `.env.example` 生效集）不进判据①扫描面；`scripts/` 面 `VERIFY_PORT` 等刻意不上图 → 皆不触发红。

**推断**：不织入链，则「撤旋钮忘删样例键」这类债将**持续静默累积**，仅靠人记得手动跑四角对拍才暴露——注意力成本不可靠（单人尤其，正是外部评审认定的头号瓶颈）。

**未知**：织入后长期是否有「合法声明-暂无消费者」的前瞻性键需临时豁免（见 §3 逃生阀，判定为可解而非阻断）。

## 2. 范围（决策完备·待签后实施）

- **唯一改动面**：`scripts/ci.ts` 静态便宜闸家族末尾（现「Overturned rulings guard」之后、`if (!quick)` 块之前）新增一行——
  `step('Config contract guard', run('run', 'verify:config-contract'));`
- **模式**：full + quick 同置（纯静态文本扫、无构建/DB 依赖、亚秒级，与 type-escape/domain-layout/stories-drift/i18n-parity/overturned-rulings 同族·早失败）。
- **不改脚本本体**：三判据逻辑、双模式扫描、WHITELIST 面均**保持现状**。
- **翻案留痕**：两处被撤 plan 的 README 索引行 + 各自 plan doc 追加「⚠️ 已被本翻案修订」注（**只标反悔、不改史**）。

## 3. 边界 · 风险 · 逃生阀

- **脆性风险**：低。脚本只读 `.env.example` + 静态 grep 代码，输入稳定；FP 面已被双模式扫描 + dev-only 键不入样例生效集两道消化。
- **逃生阀（若未来确出现合法「声明先于消费者」的样例键）**：沿用既有两法之一即转绿——① 纳 `WHITELIST`（前例 `module-config-web-dev-proxy-key` 人裁「采乙·入白名单」）；② 取**注释态**上图（前例 config 切片 B「四键均取注释态」）。故硬闸非刚性堵死，有 documented off-ramp。
- **归人裁点（本翻案需你定的三问）**：
  1. **GO / NO-GO** 撤销两处「不进链」人裁、把 `verify:config-contract` 升为硬闸？
  2. **模式**：full+quick（推荐·便宜早失败）还是仅 full（quick 保持最轻）？
  3. **范围**：本翻案**只**动 `config-contract`；同族 `verify:compose-contract`（判据偏部署编排）**是否一并入链、还是另案**？（推荐：本窗仅 config-contract，compose-contract 保持现状/另核，最小翻案面。）

## 4. 审计结论

**（待人类签核）** 本阶段仅立案、零实现。`ci.ts` 未被触碰，`verify:config-contract` 维持独立脚本现状。上述 §3 三问得裁并签核后方进实施。

## 5. 验收判据（签核实施后回写·带取证）

- [ ] `scripts/ci.ts` 新增 `Config contract guard` 步、位置于静态便宜闸家族末尾。
- [ ] **双向验收**：① 当前树 `pnpm run ci`（full）**PASSED**（现四判据已绿，无回归）；② 人造违规探针（往 `.env.example` 塞一个无任何消费者的 `PROBE_DEAD_KEY=1`）→ `pnpm run ci:quick` 与 `pnpm run ci` 均 **EXIT=1**（证闸在链且真拦）。
- [ ] `package.json` 无需新增命令（`verify:config-contract` 已存在）。
- [ ] README 索引 + 两被撤 plan doc 的修订注到位（状态单源一致）。

## 6. 变更记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-23 | 0.1.0 | `b3d3e5d` 清 `ES_TRUTH_SOURCE_TENANTS` 死键暴露「四角闸不在链 → 债静默腐烂」根因；用户令「乙开」→ 起草翻案供签 | 首版·候选稿·待审计门：§1 三分取证（含本轮 FP/TP 实证）·§2 唯一改动面（ci.ts 一步）·§3 逃生阀 + 三归人裁点·§4 零实现·§5 双向验收判据。未触碰 `ci.ts` |
