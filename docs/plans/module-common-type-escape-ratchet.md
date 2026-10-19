# 类型逃逸「只紧不扫」增量门禁（ratchet）

> 适用范围: `全局` ← 新增一条本地 CI 硬门禁（`scripts/` + `package.json` + `ci.ts` 插桩）· 命中高危#4（改门禁·CI）
> 关联: 外部评审架构债 ③（`module-external-review-architecture-debt-triage` §3）· `AGENTS.md` §4（L1=本地 CI·husky pre-push）· `docs/specs/tooling-standards.md` §3（工具红线·Biome/Vitest）· `scripts/ci.ts`（编排范式）· `verify-config-contract`（同类 fail-loud 契约闸先例）
> 性质: 定点新增（机制层，不逐模块特判）；**纯防增长 + 逐步收敛，不清存量**
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

- **问题**：外部评审指生产码存类型逃逸（`as any` / `as never` / `: any` / `<any>`）。取证（排除 `node_modules`/`dist`/`*.test·spec`/`*.gen`/`*.d.ts`）：**151 处 / 31 文件**，高度聚集于三方边界胶水（`auth.implement.ts` 50〔Better Auth adapter〕、MikroORM 仓储、`column-meta.ts` 8、`main.ts` 4〔Fastify register〕）。
- **非目标**：**不做存量盲扫**（triage §3 已裁：多数系上游类型不完备的正当逃逸，盲扫破坏可编译性/负收益）。
- **目标**：立一道**棘轮（ratchet / lint-baseline）门禁**——把当前存量固化为基线单源，**只拦新增**（任何文件逃逸数超过其基线即 fail），允许并鼓励逐步下调。即「只紧不扫」。

## 2. 方案

### 2.1 机制（`scripts/verify-type-escape-ratchet.ts`）

- **扫描面**：`apps/**/*.ts` + `libs/**/src/**/*.ts`；排除 `node_modules`、`dist`、`*.test.ts`、`*.spec.ts`、`*.gen.ts`、`*.d.ts`（与取证口径一致·生成物/产物/测试不计）。
- **计数正则**（行级·v1）：`:\s*any\b` / `as any\b` / `<any>` / `as never\b`。逐文件累计命中行数。
- **基线单源**：`scripts/type-escape-baseline.json`（`{ "<相对路径>": <允许计数> }`），提交入库。**初值 = 当前 31 文件实测计数**（grandfather 存量）。
- **判定**：
  - 文件当前计数 **>** 基线 → **fail**，报「新增类型逃逸 +N（文件·当前/基线）」并指向 `--update` 与正当性要求。
  - 文件当前计数 **<** 基线 → 通过，但提示「棘轮下调机会 -N」（v1 仅 advisory，不阻断；可选 `--strict-lower` 逼同步下调）。
  - **基线外新文件**带 ≥1 逃逸 → **fail**（须显式纳入基线=一次可审计的 git diff）。
- **人工闸门**：`--update`（`verify:type-escape:update`）重生成基线——仅在**确系正当三方逃逸**或**已收敛**时使用；因基线是入库文件，每次上调都在 PR/husky 前以 git diff 显形，可被审。杜绝「静默加 any」。

### 2.2 插桩（门禁接线）

- `package.json` 新增 `verify:type-escape`（`node scripts/verify-type-escape-ratchet.ts`）与 `verify:type-escape:update`（附 `--update`）——命名对齐既有 `verify:config-contract` 等。
- `scripts/ci.ts`：在 `step('Lint & format (biome)', …)` **之后**、build 之前插一步 **硬门禁** `step('Type-escape ratchet', run('run', 'verify:type-escape'))`（便宜、纯文本，full/quick 均跑，尽早失败）。非零 → `failed=1`（区别于 fallow 的 advisory 不阻断）。

### 2.3 垂直切片（可独立验证）

1. **切片 A**：脚本 + 基线初值 + 两个 package.json 脚本 —— 完成判据：单跑 `verify:type-escape` 对现网 exit 0（存量已入基线）；临时在某文件手加一处 `as any` → exit≠0 且报正确文件/增量；`--update` 后 exit 0 且 diff 精确反映该文件 +1。
2. **切片 B**：`ci.ts` 接线 —— 完成判据：`pnpm run ci` 与 `ci:quick` 均含该步；植入一处越界逃逸 → 两条链均 FAIL；撤除 → 全绿。

## 3. 影响面与风险

- **命中高危**：**是·高危#4（改门禁·CI·husky 行为链）** → 本 plan 交付即停在**待签核位**，须人签后方可实施（切片 A/B 不动码，过审计门后逐片实现）。经 `pre-push` 亦随之生效（其调 `ci`）。
- **可逆性**：纯加法·git revert 可回；不触 DB/schema/运行时代码。
- **主要风险与缓解**：
  - *误报正当新逃逸*（新写一段 MikroORM/BA 胶水确需 `as never`）→ 由 `--update` + git diff 人审放行，非硬堵死。
  - *行级正则非 AST*：字符串/注释内偶现「as any」会虚高 → 对棘轮单调比较影响极小（基线与当前同口径·同涨同落）；v2 可升 TS AST 精确化（`ts.createSourceFile` 数 `as` 表达式），但增重，v1 不引。
  - *与 Biome `noExplicitAny` 关系*：后者现 `off`（biome.json line 69·大量正当 any 不宜全局开）→ 本棘轮**独立于 Biome**，用脚本补其不能（Biome 无 baseline 能力）。

## 4. 审计记录

> 无已审方案不写码。本 plan 系含机制设计的审前方案，命中高危#4 → 须人签核。

- 结论：**已签核（用户 GO）并实施**。「只紧不扫」棘轮（切片 A→B）已落地：基线初值 grandfather 现网 151 处/31 文件，之后只拦新增、鼓励下调。是 triage §3「收紧须另立增量门禁 plan 过人签核」的兑现件。
- 未决项（均已定）：① 高危#4 已由用户 GO 签核实施；② `--strict-lower` 已实现为默认关闭的可选 flag（v1 越下仅提示不阻断）；③ v1 采行级口径（零依赖·够用），AST 精确化留 v2。
- 审计人 / 日期：用户 GO 签核（高危#4）· Agent 实施 · 2026-10-20

## 5. 完成判据（已达成）

- [x] `scripts/type-escape-baseline.json` 初值 = 现网实测（31 文件·151 处）·已提交入库。
- [x] 回归测：`scripts/verify-type-escape-ratchet.test.ts`（8 例·`shouldScan` 口径 + `evaluate` 越界/新文件/下调/相等/stale）·全绿。
- [x] 行为验证：向 `logger.service.ts`（基线 3）注入一处 `: any` → 脚本 exit≠0 且报 `当前 4/基线 3（+1）`；`git restore` 后 exit 0。（临时探针未入库）
- [x] `pnpm run ci` / `ci:quick` 含 `Type-escape ratchet` 硬门禁步且全绿（658 测·fallow 0 违规）；pre-push 随之生效。
- [x] `.env`/密钥·DB·其余门禁零改动（仅 `vitest.config.ts` 拓一条 `scripts/**/*.test.ts` 收录·纯加测试面）。

### 5.1 落地纪要

- 新增 `scripts/verify-type-escape-ratchet.ts`（可导入纯函数 `shouldScan`/`computeCounts`/`evaluate` + CLI 入口仅直接执行时跑）·`scripts/type-escape-baseline.json`·`scripts/verify-type-escape-ratchet.test.ts`。
- `package.json` 新增 `verify:type-escape` / `verify:type-escape:update`；`scripts/ci.ts` 在 biome 后、build 前插硬门禁步（full/quick 均跑）。
- 口径修正：脚本自身 `let st` 隐式 any 已显式 `Stats` 类型饰正（管逃逸者自身零无理由逃逸）。
- 局限如方案③：行级正则非 AST（字符串/注释偶现会虚高·基线同口径单调比较影响极小）；v2 可升 `ts.createSourceFile`。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 起草 | 首版：类型逃逸只紧不扫棘轮门禁机制 + 插桩 + 切片（停待签·高危#4） |
| 2026-10-20 | 0.2.0 | 签核·落地 | 用户 GO 签高危#4 → 脚本+基线（31/151）+回归测（8例）+ci.ts 接线均落地·`pnpm run ci` 658 测全绿·行为验证越界 exit≠0 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.2.0 变更，以当前正文内容为准。
