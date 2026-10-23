# 采纳浏览器端到端测试面（推荐 Vitest Browser Mode）——解 F 层真机验收积压

> 性质：**工具选型 + 新增依赖 + 门禁面**（高危·供应链/CI/可能触宪法工具矩阵）·**待人类审计门亲签·本窗零实现**
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表
> 关联：global-frontend-adoption（F2/F3）· module-frontend-test-completion（前端测试收口）· [global-ci-fullstack-pg 编排器 `scripts/ci-fullstack.ts`]（Testcontainers + `GATED_E2E_FILES` gated 范式·本案复用蓝本）· `specs/tooling-standards.md` 工具矩阵（若裁回灌则触宪法·高危#5）· global-config-contract-gate-in-chain（"改门禁前先核是否已签人裁"教训同源）

## 0. 概览（TL;DR）

为前端补一层**真浏览器端到端测试**（现仅 jsdom 渲染单测），把散落各 frontend 案、标着"dev 反代真跑端到端归人"的验收，从**人肉开浏览器**升级为**可复现自动闸**。技术选型**推荐 Vitest Browser Mode（`@vitest/browser` + `@vitest/browser-playwright` + chromium）**而非独立 `@playwright/test`——单一 runner、贴合"Vitest 单源"铁律、少工具蔓延；且其 provider 已在 lock 中浮现。**初期作为 opt-in 独立命令**（复用 `ci-fullstack` 的 gated 范式），**不并入默认 `ci`/`pre-push`**。

## 1. 背景与取证（三分）

**事实（均带取证）**：
- 前端测试现为 `vitest + jsdom@30`（`apps/web/package.json`），**无任何真浏览器 E2E**；`@vitest/browser-playwright@5.0.4` 存在于 `pnpm-lock.yaml`（Vitest 5 的 browser-mode 可选 peer·当前未装为声明依赖）。
- `scripts/ci-fullstack.ts` 已具备**一次性 Testcontainers PG + `GATED_E2E_FILES` 双向恒等校验 + "不入默认 `ci`/`ci:quick`/`pre-push`"** 的门禁范式——本案 gated 浏览器 e2e 直接复用该编排哲学。
- 端口单一真源：API `start:dev`=7009（前缀 `/api/v1`）、前端 `dev:web`=5173（Vite 反代→7009）——`webServer`/baseURL 可复用。
- 待验收积压中 **10/24 系前端**（上轮分层实测），其 plan 自述验收="dev 反代真跑端到端**归人**"（如 module-frontend-tenant-console）。

**推断**：无自动化真机闸 ⇒ 前端验收**结构性占用人注意力**（单人尤甚），是外部评审认定的头号瓶颈；评价"建议 2（清积压）被建议 4（浏览器测试）阻塞"即此。

**未知**：chromium 二进制境内拉取稳定性（需 npmmirror 镜像验证）；真机 E2E 与既有"干净重建/dev 反代"夹具的耦合度；全栈 e2e 引入的 flaky 率与 pre-push 耗时预算。

## 2. 范围（推荐档·待签后分片实施）

- **选型**：Vitest Browser Mode（`@vitest/browser` + `@vitest/browser-playwright` provider·仅 chromium）；**备选**=独立 `@playwright/test`（另起 runner）——ⓐ归人裁。
- **分层职责**：jsdom 继续管组件/渲染单测（不退）；browser-mode **只**管少数"真栈黄金流"（登录→选活跃组织→一条核心写操作，如建 workspace / 改成员角色），**不铺全组件**（避免与 jsdom 重复 + 维护爆炸）。
- **门禁形态**：新增 opt-in 命令（拟 `ci:e2e:web`），经独立 playwright/vitest-browser 配置 + `webServer` 拉起 7009/5173（或复用 dev 栈）；浏览器 e2e 文件按 `ci-fullstack` 的 `GATED_E2E_FILES` 同款**登记 + 恒等校验**；**初期不入默认 `ci`/`pre-push`**（防 flaky/耗时/重演仓促入链）。
- **依赖与镜像**：`pnpm add -D @vitest/browser @vitest/browser-playwright playwright`（**禁 bun**）；chromium 下载走 npmmirror（`PLAYWRIGHT_DOWNLOAD_HOST` 或 `.npmrc` 镜像）；只装 chromium 一浏览器控体积。
- **非目标**：视觉回归、跨浏览器矩阵（firefox/webkit）、a11y 自动化、性能测试、E2E 铺满全站。

## 3. 边界 · 风险 · 归人裁点

- **风险**：pre-push 链耗时与 flaky、选择器维护负担、境内二进制拉取不稳、真库 e2e 与容器编排耦合。缓解=opt-in 起步 + 少数黄金流 + 重试上限 + 复用已验证的 Testcontainers 范式。
- **归人裁点（需你定·均高危面）**：
  - ⓐ **工具选型**：Vitest Browser Mode（推荐·单 runner）vs 独立 `@playwright/test`。
  - ⓑ **门禁位置**：opt-in 独立命令（推荐）还是直接进 `ci`/`pre-push`；入链属改门禁·高危#3，须单列签核。
  - ⓒ **范围/耗时预算**：浏览器面（仅 chromium？）、黄金流条数、是否复用 `ci-fullstack` 的一次性 PG。
  - ⓓ **是否回灌 `tooling-standards.md` 工具矩阵**（新增测试工具=触宪法·高危#5）。
  - ⓔ **与既有 browser-use 人肉验收的关系**：定位=人肉 exploratory + Playwright 回归锁（互补·非替代首轮人工签核）。

## 4. 审计结论

**已审计·签发**（用户令「同意，推」＝GO 全采推荐 §3 五裁点：ⓐ Vitest Browser Mode／ⓑ opt-in 独立命令·不入默认 `ci`/`pre-push`／ⓒ 仅 chromium·黄金流待切片 B·复用一次性 PG／ⓓ 回灌 tooling 矩阵（待切片 C）／ⓔ 与 browser-use 互补·非替代首轮人签）。高危面=新增依赖·供应链（已 GO）；ⓓ 回灌宪法=高危#5 待切片 C 单列签核。**切片 A 已落地**（见 §5/§6）·切片 B/C 待续。

## 5. 验收判据（签核实施后回写·带取证·分片）

- [x] **切片 A（设施）**：装 `@vitest/browser@5.0.4`+`@vitest/browser-playwright@5.0.4`+`playwright@1.64.1`（✅ npmmirror 解析 OK·chromium 二进制经 `PLAYWRIGHT_DOWNLOAD_HOST=cdn.npmmirror.com` 拉取成功 120MB→`~/.cache/ms-playwright`）；独立 `vitest.browser.config.ts`（不并入默认 `vitest.config.ts`）+ `ci:e2e:web` opt-in 脚本；默认 `vitest.config.ts` `exclude` 增 `**/*.browser.test.ts(x)` 防污染默认 ci。一条冒烟 `browser.smoke.browser.test.ts`（2 tests）**真起 chromium 绿**（`PW_SMOKE_EXIT=0`·UA 含 chrom 证非 jsdom）。**双向验收**：① 当前树 `pnpm run ci`（full）**PASSED EXIT=0**（149 测试文件·各闸+fallow 0·默认链无回归）；② 默认 config 定向筛 `browser.smoke` = `No test files found`（exclude 生效·browser 测不入默认链）。
  - **落地实证 · Vitest 5.0.4 API 校正**：provider 须置 `test.browser.provider: playwright()`（读源 `index.B8VfM7Mf.js:1768` 判据 `browser.provider ?? instances[].provider`·**不认** `plugins` 数组注册——曾误按 5.0.5 plugin 写法致「provider not specified」）；且 `@vitest/browser*` 须与 `vitest` **同 5.0.4**（5.0.5 provider 注册进另一 `@vitest/browser` 实例·内核看不见）。
- [ ] **切片 B（黄金流）**：2–3 条真栈 E2E（登录→活跃组织→核心写操作·经真实 API+PG，复用 Testcontainers 或 dev 栈）绿；**双向验收**——断言在真链生效 + 人造违规（改坏选择器/断反）必 EXIT=1。
- [ ] **切片 C（收口）**：浏览器 e2e 文件登记进 gated 清单并双向恒等校验（仿 `ci-fullstack`）；文档/runbook 更新；若裁 ⓓ GO 则回灌 tooling 工具矩阵。基线"只增不减"守住。

## 6. 变更记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-23 | 0.2.0 | 用户令「同意，推」＝GO 全采五裁点·过审计门·进实施 | **切片 A（设施）落地**：装 `@vitest/browser@5.0.4`+`@vitest/browser-playwright@5.0.4`+`playwright@1.64.1`（npmmirror 解析 + chromium 二进制境内拉取实证成功）；新建独立 `vitest.browser.config.ts`（provider=`test.browser.provider: playwright()`·仅 chromium·headless）+ `ci:e2e:web` opt-in 脚本；默认 `vitest.config.ts` `exclude` 补 `**/*.browser.test.ts(x)`；冒烟 `browser.smoke.browser.test.ts` 真起 chromium 2 passed。**双向验收**：full `pnpm run ci` PASSED EXIT=0（149 文件·fallow 0·默认链无回归）+ 默认 config 筛 browser 测 No test files found。修 Vitest 5.0.4 provider 写法与版本对齐两处坑（见 §5）。未动 `ci.ts`·未入默认链·未回灌宪法（ⓓ 留切片 C·高危#5 待签） |
| 2026-10-23 | 0.1.0 | 评价建议 4·F 层 10/24 真机验收积压"归人"卡脖子；上轮分层实证"建议 2 被建议 4 阻塞"；用户令「同意」→ 起草采纳案供签 | 首版·候选稿·待审计门：§1 三分取证（含 lock 已现 `@vitest/browser-playwright` 关键发现）·§2 推荐 Vitest Browser Mode + opt-in 门禁 + npmmirror·§3 五归人裁点（选型/门禁位/范围/回灌宪法/与 browser-use 关系）·§4 零实现·§5 三切片双向验收判据。未加依赖·未建 config·未动 ci.ts/宪法 |
