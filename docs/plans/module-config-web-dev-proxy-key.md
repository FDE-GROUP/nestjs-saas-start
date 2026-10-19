> 用途: **已审方案 = 开发依据** | 状态: 已实施 v0.3.0（乙档·纳管毕） | 受众: 人（审计门）+ Agent
> 适用范围: `模块(config 契约面 / apps/web dev 反代)`（blast radius 极小·单键纳管）| 关联: `module-config-env-surface-contract` · `module-config-seed-fail-loud-and-contract-gate`（契约门禁出处）· 前端 F0（`global-frontend-adoption` / d50672f）
> 定位: 结清 `verify:config-contract` 判据② 的**单条既存红**——`WEB_PROXY_TARGET@apps/web/vite.config.ts`「代码读取但样例/白名单皆未声明」。
> 铁律: 处置方式（改门禁脚本白名单 ∪ 改 `.env.example` 样例面）命中 `AGENTS.md` §2 高危「**改门禁 / 改公共契约**」→ **审计门强制·须人签核**，本片仅起草不改码。

## 0. 一句话

前端 F0 落 `vite.config.ts` 时用 `process.env.WEB_PROXY_TARGET ?? 'http://localhost:7009'` 做 dev 反代目标覆盖；该键被配置契约门禁（扫描范围钉死含 `apps/**`）判为「隐藏必需项」。需人裁二选一纳管（推荐**进脚本白名单**），使 `verify:config-contract` 转绿。

## 1. 现状取证（代码实证）

- **触发点**：[`vite.config.ts:14`](../apps/web/vite.config.ts) `target: process.env.WEB_PROXY_TARGET ?? 'http://localhost:7009'`（前端 dev 反代目标·带硬编码兜底·非部署 config）。
- **判据② 机制**：[`verify-config-contract.ts`](../../scripts/verify-config-contract.ts) 扫描 `CODE_DIRS=['apps','libs','scripts']`（含 apps/web）双模式取代码读取键，要求 ⊆（`.env.example` 生效 ∪ 注释态 ∪ `WHITELIST`）。`WEB_PROXY_TARGET` 三处皆无 → `bad(...)` → `FAILED (1)`（exit 1）。
- **既存非本片引入**：该键随前端 F0 骨架提交 `d50672f` 入库；magic-link 变更集**未触碰** `vite.config.ts`。经 `git stash` magic-link 改动后对 HEAD 复跑同一门禁，仍只报此键（坐实为前端 F0 遗留债·非 magic-link 引入）。
- **唯一红**：全门禁仅 `WEB_PROXY_TARGET` 一条不符，纳管后 `verify:config-contract` 即全绿（无连带其它前端 dev 键）。
- **门禁不在 L1 `ci` 链**：`verify:config-contract` 为独立命令（`package.json`·非 `scripts/ci.ts` 编排段），故本片修复**不改本地 CI 门禁行为**，仅令独立闸转绿。
- **白名单语义现况**：`WHITELIST` 注释自述用途=「**刻意不上图的进程 env 键**·四个 verify/ci 脚本与 ci-fullstack 均不装载 dotenv」。现含 4 键（`NO_COLOR`/`VERIFY_PORT`/`VERIFY_TIMEOUT_MS`/`TESTCONTAINERS_RYUK_DISABLED`）·皆为「进程/dev 便捷项·非部署契约」。

## 2. 方案（二选一·**采乙**）

- **甲·纳管进 `.env.example`（注释态）**：加 `# WEB_PROXY_TARGET=http://localhost:7009`（含一句前端 dev 反代说明）。
  - 判据②：注释态计入 `declaredSet` → 过；判据①：仅检 `example.active`，注释态不参与 → 不受影响。
  - 代价：把一个**前端 dev 便捷项**混入 `APP_URL/MAIL_*/OAUTH` 等**后端/部署 config 契约面**，语义纯度受损（`.env.example` 是 compose/Joi 对拍的样照来源·非前端 dev 覆盖的家）。
- **乙·纳管进脚本 `WHITELIST`（推荐）**：`verify-config-contract.ts` 的 `WHITELIST` 追加 `'WEB_PROXY_TARGET'`，并把该集注释从「scripts/ 面三键」放宽为「含前端 dev-only 覆盖（带硬编码兜底·从不需为启动而设）」。
  - 判据②：白名单命中 → 过；不改样例面/不动 compose·`.env.example` 后端契约面保持纯净。
  - 语义契合度最高：`WEB_PROXY_TARGET` 与现列 4 键同属「刻意不上图的进程 env 项」。
  - 代价：改门禁脚本（§2 高危面之一）·但纯加性、单行、零判据逻辑改动。

> 机制非特判：两档都是把该键纳进既有「声明 ∪ 白名单」框架，不逐模块打洞、不放宽扫描口径、不动判据①③。

## 3. 影响面与风险

- **blast radius**：极小·单键·单文件（甲改 `.env.example` 一行 / 乙改 `verify-config-contract.ts` 一行 + 注释）。**可逆**（删该行即回退）。
- **高危命中**：甲=改公共契约样例面（`.env.example`）；乙=改门禁脚本。均属 `AGENTS.md` §2 → 须人签核。
- **回归面**：`verify:config-contract` 不在 L1 ci，故无 CI 行为变更；`pnpm run ci` 应保持全绿（不受此片影响）。无 schema、无迁移、无代码运行路径改动。
- **回滚**：`git revert` 单提交即可。

## 4. 审计记录

> 无已审方案不写码。本方案触 config 契约面 / 门禁脚本——§2 高危·须人签核。

- 结论：**GO·采乙（已实施）**。人令「1」＝审计门签核放行·按推荐档乙自裁（改门禁脚本白名单）。问责归人。
- 未决项裁决：
  1. **甲 vs 乙**：采 **乙（进 `WHITELIST`）**——语义契合·后端契约样例面不受污染。
  2. **连带放宽 `WHITELIST` 注释语义**：采推荐·同步将注释从「scripts/ 面三键」改写为「含前端 dev-only 覆盖（带硬编码兜底·从不需为启动而设）」并指名本 plan·留痕防后人误读为特判。
  3. **顺路登记 tooling/config 片**：**不做**（本仓最小面·口径已在脚本注释与本 plan 留痕，免额外触宪法/公共契约面）。
- 审计人 / 日期：FDE Team · 2026-10-19

## 5. 完成判据（实施回执）

- [x] 按乙档改单处：`verify-config-contract.ts` 的 `WHITELIST` 追加 `'WEB_PROXY_TARGET'` + 注释放宽（单文件·纯加性）。
- [x] `pnpm run verify:config-contract` → **PASSED**（判据②「66 键·白名单 5 项」全命中·①③不回潮）。
- [x] `pnpm run ci` 全绿（Biome/build/openapi-drift/tests 619/fallow 净·不受本片影响·基线只增不减）。
- [x] 无 schema/迁移/运行路径改动；`.env`（真实凭证面）**零触碰**；`.env.example` 未改（样例面保持纯净）。
- [x] README 状态单源已翻账（待审计 → 已实施）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：`WEB_PROXY_TARGET` 既存债取证（前端 F0 d50672f 引入·非 magic-link·已 stash 对拍 HEAD 复现）+ 判据② 机制 + 甲/乙两档纳管方案（推荐乙·进 `WHITELIST`·语义契合且后端契约样例面不受污染）·触 §2 高危待人签核 |
| 2026-10-19 | 0.2.0 | 人签核 GO | 人令「1」＝审计门放行·采推荐档乙（进 `WHITELIST`）；未决项②连带放宽注释语义一同采纳·③不顺路登记 tooling（保持最小面） |
| 2026-10-19 | 0.3.0 | 实施回执 | 乙档落地：`verify-config-contract.ts` 白名单追加 `'WEB_PROXY_TARGET'` + 注释改写（含前端 dev-only 覆盖口径·指名本 plan）。验收：`verify:config-contract` **PASSED**（判据② 66 键·白名单 5 项）·`pnpm run ci` 全绿（619·不受本片影响）·Biome 净·零 schema/依赖/运行路径改动·`.env`/`.env.example` 零触碰 |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.1.0 变更，以当前正文内容为准。
