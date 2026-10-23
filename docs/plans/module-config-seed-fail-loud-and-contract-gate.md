# 配置面两待裁点落地：seed 弱口令兜底「生产 fail-loud + 非生产 warn」+ 四角对拍独立 verify 脚本

> ⚠️ **本案一处裁已被反悔修订（2026-10-23 · [global-config-contract-gate-in-chain](./global-config-contract-gate-in-chain.md)）**：本案「② 四角对拍裁『独立 verify 脚本』·`scripts/verify-config-contract.ts`·不进 `ci` 链·`ci.ts` 零改动」经人令「GO」撤销——`verify:config-contract` 已织入 `scripts/ci.ts` 静态便宜闸家族（full+quick）。「不进链/零改动」为结项时史实、不改，现状以翻案案为准（seed 弱口令 fail-loud 裁不受影响）。

> 适用范围: `模块(config + database/seed + scripts 独立门禁)` ← = blast radius：seed 行为变更（只影响 `NODE_ENV=production` 路径·零 DB schema）+ 新增独立静态脚本（不进 `ci` 链）+ `.env.example` Seed 段文案
> 关联: [module-config-env-surface-contract](./module-config-env-surface-contract.md)（本片执行其「缓行 / 另案」两条的**人裁结果**：弱口令兜底 + 切片 C）· `specs/tooling-standards.md` §4.7（静态分析须人工核验）· §4.10（对拍口径）· `AGENTS.md` §2（高危归人）
> 性质: 缺陷收口（配置供给面遗留的两处「声明有防线、实现无持有」闭合）·机制单点修、不逐键特判
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

config 片（module-config-env-surface-contract·已验收·结项 v0.3）把两项缺陷查到底但按纪律**未自裁**，登记归人；2026-10-17 人经 AskUserQuestion 双问拍板：

- **裁点一（seed 弱口令兜底）**：选「生产 fail-loud + 非生产 warn」——`NODE_ENV=production` 且缺 `ADMIN_PASSWORD` / `USER_PASSWORD` 即**拒跑**（平台经营者账号 `admin123` 零弱口令上生产）；非生产保留兜底 + **点名 warn**。与本 plan 切片 A-1 已落地的 OAuth social 面「非生产 warn / 生产 fail-loud」**完全同构**（机制不特判）。
- **裁点二（四角对拍门禁化）**：选「独立 verify 脚本」——落 `scripts/verify-config-contract.ts`（与 `verify-compose-contract` / `verify-prod-boot` / `verify-i18n-assets` 同构·**不进 `ci` 链**·零门禁行为变更）。

**非目标（明确不做，均留 config 片缓行清单继续挂账）**：compose `5432` + `postgres/postgres` 弱口令发布宿主；`DATA_RESIDENCY_ENFORCE` 逃生阀在非编排路径彻底移除；generic OAuth 面升级生产 fail-loud。

## 2. 方案（切片）

### 切片 E · seed 面 fail-loud（裁点一）

- `apps/api/src/database/seed.ts`：入口裁决单点（不逐处特判）——`NODE_ENV=production` 且（缺 `ADMIN_PASSWORD` 或缺 `USER_PASSWORD`）→ throw 拒跑，错误文案点名两键与后果（平台经营者口令不得静默内置）；非生产行为逐字不变 + 在 seed 日志头部补一条点名 warn（两键未配 → 使用内置 `admin123` / `user123`）。
- `.env.example` Seed 段：三键现均注释态（v0.2.2 上图）；本切片只把后果文案更新为「**生产环境缺 `ADMIN_PASSWORD`/`USER_PASSWORD` 将拒跑 seed**」（键集合不变·仍不写入任何真实凭证）。
- 锁测（`seed.test.ts` 旁挂或并入）：① 生产缺键 → reject/throw 且文案点名；② 生产配齐（合成假值）→ 不 throw·hash 用注入值；③ 非生产缺键 → 兜底现值不变 + warn 恰一条。
- 完成判据：三例锁测绿 + `NODE_ENV=production pnpm run db:seed`（缺键）真实拒跑复现（**取证姿势见 §4**，不真写库）。

### 切片 F · verify-config-contract.ts（裁点二·plan 切片 C 既有设计执行）

三判据（全部**静态声明面**校验，与 compose 门禁互补不互替）：

1. 样例生效键 ⊆（Joi schema 键 ∪ 代码读取键）→ 无死配置；
2. 代码读取键 ⊆（样例 ∪ 显式白名单）→ 无隐藏必需项（白名单初始集 = config 片 §4.6 已甄别的 `scripts/` 面三键等刻意不上图项）；
3. Joi `.required()` 键全部出现在 `docker-compose.yml` 的 `environment` → 承接 D4 已闭合判据不回潮。

口径硬约束（config 片 §1 口径教训的制度化）：代码读取集必须 **`process.env.K` 与 `configService.get('K')` 双模式扫描**（否则重演 MAIL_* 型假阳性与 F8 型陈旧账）；扫描范围钉死 `apps/**` + `libs/**` + `scripts/**`（排除 `*.test.ts`）；判定尽量**复用产物**（dist 的 envs / Joi schema）而非另写第二套解析，防门禁与真相漂移。脚本输出四组集合（仅真实有 / 仅样例有 / 代码读两文件皆无 / 文件有两代码不读）作为可复核存照。

- 落点：`scripts/verify-config-contract.ts` + `package.json` scripts 增 `verify:config-contract`（**独立命令·`scripts/ci.ts` 零改动**）。
- 完成判据：正跑 PASSED + 人造违规 ×3（样例塞死键 / 代码读键不上样例 / required 键不上编排）各 EXIT=1，验毕还原。

## 3. 影响面与风险

- **高危触达**：改 seed 行为（数据面脚本）+ 新增门禁面脚本（不进链故不改变 L1 语义）→ **本 plan 须人签核后方可实施**（`AGENTS.md` §2）；`.env.example` 触配置供给面（只改文案不改键集合）。
- **可逆性**：两切片各自独立成 commit、零迁移、可逐片 revert；seed 生产拒跑只影响「以 production 口径跑 seed」的路径（现有部署文档未以此跑 seed·实施前复核 `install&run.md` / `docs/docker-deployment.md` 无该用法，若有则文档同步）。
- **风险**：切片 F 的静态解析存在假阳性面（反射/动态键）→ 白名单机制兜底 + 首轮以 config 片 §4.6 已核集合对拍校准；锁测新增例数归人裁（默认 +3 只增不减）。

## 4. 取证计划

1. 切片 E：`seed.test.ts` 三例进 Vitest 基线；生产缺键拒跑用 **env 注入 + 桩/早退**或 scratch 库复现（**禁真写开发机库**·config 片已登记「跑 db:seed 取证属高危」，本轮取证不得违反）；非生产现流程回归（`ci:db` 夹具若依赖兜底值 → 零影响证明）。
2. 切片 F：正跑存照 + 人造违规 ×3 非零退出 + 四组集合与 config 片 §4.6 存照一致性核对。
3. 门禁：`pnpm run ci` 全绿·基线只增不减；Biome 净。

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 E：生产缺两键拒跑有真实存照；非生产行为与文案逐点落地；三例锁测绿
  （实测：`NODE_ENV=production ADMIN_PASSWORD= USER_PASSWORD= tsx seed.ts` → **EXIT=1**·文案点名两键·裁决先于建连零库足迹；seed.test.ts 9→12 例全绿）
- [x] 切片 F：脚本三判据 + 双模式口径落地；正跑 PASSED + 人造违规 ×3 EXIT=1；`ci.ts` 零改动坐实
  （实测：正跑三判据全绿 PASSED；V1 样例塞死键 / V2 代码读键不上样例 / V3 required 键不上编排各 **EXIT=1** 且判词各自点名，验毕探针全还原；首跑自捕一处口径注释自匹配（示例即毒例）已订正；口径如实记录：Joi 键采脚本内源解析而非「复用 dist 产物」——`createSchemaForEnv` 未导出，为门禁改源码导出属行为面变更，口径写死脚本供复算；白名单按 §4.6「三键**等**」口径扩至 4 键（+`TESTCONTAINERS_RYUK_DISABLED`·scripts/ 面同类））
- [x] `.env.example` 键集合不变（diff 坐实仅注释文案行变更）
  （Seed 段仅注释 5 行改 6 行文案；取证探针 `PROBE_DEAD_KEY` 已 `git checkout` 还原·提交面 diff 零键变更）
- [x] `pnpm run ci` 全绿（基线 ≥483 只增不减）+ Biome 净
  （**Local CI PASSED**·基线 510→**513 passed / 30 skipped**·+3 只增不减；fallow 零边界违规）
- [x] README 索引 + 本 plan 演变对账，人类验收后结项
  （人验收 2026-10-17：双签「验收结项」+ roadmap 同批签核在案·实现 `564bdc6` + 落案 `5426ed6` + 结项账行均在 origin/main）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人裁「2」→ AskUserQuestion 双问定档（生产 fail-loud + 非生产 warn / 独立 verify 脚本）后依「无已审方案不写码」起草 | 首版（零代码·只提议）：切片 E seed 裁决单点 + 切片 F 三判据静态脚本（承 config 片切片 C 既有设计与口径教训）；三条非目标继续挂账显式排除 |
| 2026-10-17 | 0.2.0 | 审计门签核：人就「GO/分两轮/整改再审」三选答「你定」（授权执行方择档·问责归人记录在案）→ 采推荐档 **GO·E→F 连做·锁测 +3 默认档** | 实施前事实复核落定：① fail-loud 非「生产禁跑 seed」——生产配齐两键照常可跑，缺键才拒，与 install&run.md L54「空库/CI/生产再 db:seed」不冲突，按 §3 预案该文档补一行「生产跑 seed 须先配两键」提示；② seed.ts L24「兜底逐字不变」旧注释系 config 片保障·本片行为变更须同步改形留痕；正文零改判 |
| 2026-10-17 | 0.3.0 | 切片 E/F 实施完成·全部判据实测落地 | 切片 E：`enforceSeedPasswordPolicy` 裁决单点（main 先于建连调用·env 可注入供锁测直调）+ seed.ts 保真律注释改形 + `.env.example` Seed 段/`install&run.md` 文案两处；切片 F：`scripts/verify-config-contract.ts`（三判据+双模式扫描+四角存照+白名单 4 键）+ `verify:config-contract` 命令（`ci.ts` 零改动）；取证：拒跑 EXIT=1 / 正跑 PASSED / 人造违规 ×3 EXIT=1 / L1 **513/30**；口径如实订正两处（Joi 键脚本内源解析非复用 dist；首跑自捕口径注释自匹配）；**取证事故如实登记**：V1 探针还原用 `git checkout .env.example` 连带冲掉同文件未提交的 Seed 段文案，提交面 diff 清点自捕（feat commit 仅 5 文件）后重做文案并以未推送本地 amend 补齐（终形 6 文件·`564bdc6`）——教训：同文件探针应用独立副本还原，不用 checkout；待人类验收 |
| 2026-10-17 | 0.3.1 | 人类验收·结项（AskUserQuestion 签「验收 seed-fail-loud 片·结项」） | §5 末框勾齐；README 行翻「已验收·结项」——config 片「缓行/另案」两项人裁（seed fail-loud + 四角对拍门禁化）彻底闭环；本片零后续待裁项；同批人签 event-sourcing-roadmap 整篇视同已审计（另file另账行）|

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.3.0 实体变更（切片 E/F 实施完成·判据实测入账），v0.3.1 仅结项戳与验收翻账不改实体；以当前正文内容为准。
