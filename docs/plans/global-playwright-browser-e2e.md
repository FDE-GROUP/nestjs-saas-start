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
  - ⓐ **工具选型**：Vitest Browser Mode（推荐·单 runner）vs 独立 `@playwright/test`。**〔已被 0.3.0 反悔修订·见 §4〕**——实施切片 B 时实证 Vitest Browser Mode 的 `page`（BrowserPage）**无 `goto`/`navigate`/`reload`**，跑在自家 iframe，不能驱动部署态 SPA 跨路由导航；用户令「同意，乙」→ 部署态黄金流改采 `@playwright/test`（`page.goto` 真 SPA + 真 API + 真库），Vitest Browser Mode **保留**用于其原生强项（真浏览器组件/逻辑级测·免起栈）。
  - ⓑ **门禁位置**：opt-in 独立命令（推荐）还是直接进 `ci`/`pre-push`；入链属改门禁·高危#3，须单列签核。
  - ⓒ **范围/耗时预算**：浏览器面（仅 chromium？）、黄金流条数、是否复用 `ci-fullstack` 的一次性 PG。
  - ⓓ **是否回灌 `tooling-standards.md` 工具矩阵**（新增测试工具=触宪法·高危#5）。
  - ⓔ **与既有 browser-use 人肉验收的关系**：定位=人肉 exploratory + Playwright 回归锁（互补·非替代首轮人工签核）。

## 4. 审计结论

**已审计·签发**（用户令「同意，推」＝GO 全采推荐 §3 五裁点：ⓐ Vitest Browser Mode／ⓑ opt-in 独立命令·不入默认 `ci`/`pre-push`／ⓒ 仅 chromium·黄金流待切片 B·复用一次性 PG／ⓓ 回灌 tooling 矩阵（待切片 C）／ⓔ 与 browser-use 互补·非替代首轮人签）。高危面=新增依赖·供应链（已 GO）；ⓓ 回灌宪法=高危#5 待切片 C 单列签核。**切片 A/B 已落地**（见 §5/§6·B 真栈黄金流实跑 2 passed）·**切片 C（收口）已落地**（2026-10-24）：gated 清单恒等经 ⓐ 反悔判定为字面不适用（等价防护=auto-discovery + playwright 零测 exit1 + config-contract 白名单·留痕 §5）、ⓓ 回灌 tooling 矩阵经人签 2026-10-24 GO（高危#5）。三切片全收口。

**反悔修订（ⓐ 撤换 · 用户令「同意，乙」2026-10-23 · 高危=撤已签选型 + 新增依赖·问责归令者）**：切片 B 启动前实证——`@vitest/browser/context` 的 `page`（BrowserPage 类型）**无 `goto`/`navigate`/`reload`**（grep 零命中），测跑在 Vitest 自家浏览器服务器所服的 iframe 内，**不能按 URL 驱动已部署 SPA 跨路由导航**（登录→活跃组织→写）。而 F 层 10/24 积压的验收口径恰是「dev 反代真跑端到端·需起 DB+后端+登录态」（`module-frontend-tenant-console:84`）——即部署态导航，Vitest Browser Mode 不覆盖。故 ⓐ 选型仅对「组件/逻辑级浏览器测」成立、对「部署态 E2E」不成立。
- **再裁**：部署态黄金流改由 `@playwright/test` 承担（`page.goto` 真 SPA）；Vitest Browser Mode（切片 A）**保留**做其原生强项（真浏览器组件/逻辑测·免起栈）——两 runner 各司其职·非重复。
- **合宪核验**：AGENTS 工具红线仅禁 jest/`bun test` 作单测 runner，**未禁 Playwright**；部署态 E2E 是与单测 runner 不同的工具类别，故 ⓐ 撤换**不违「Vitest 单源」**（原判「复用 lock 里 browser-playwright provider=单 runner」混淆了 browser-mode 与 E2E·属立案 under-specification）。

## 5. 验收判据（签核实施后回写·带取证·分片）

- [x] **切片 A（设施）**：装 `@vitest/browser@5.0.4`+`@vitest/browser-playwright@5.0.4`+`playwright@1.64.1`（✅ npmmirror 解析 OK·chromium 二进制经 `PLAYWRIGHT_DOWNLOAD_HOST=cdn.npmmirror.com` 拉取成功 120MB→`~/.cache/ms-playwright`）；独立 `vitest.browser.config.ts`（不并入默认 `vitest.config.ts`）+ `ci:e2e:web` opt-in 脚本；默认 `vitest.config.ts` `exclude` 增 `**/*.browser.test.ts(x)` 防污染默认 ci。一条冒烟 `browser.smoke.browser.test.ts`（2 tests）**真起 chromium 绿**（`PW_SMOKE_EXIT=0`·UA 含 chrom 证非 jsdom）。**双向验收**：① 当前树 `pnpm run ci`（full）**PASSED EXIT=0**（149 测试文件·各闸+fallow 0·默认链无回归）；② 默认 config 定向筛 `browser.smoke` = `No test files found`（exclude 生效·browser 测不入默认链）。
  - **落地实证 · Vitest 5.0.4 API 校正**：provider 须置 `test.browser.provider: playwright()`（读源 `index.B8VfM7Mf.js:1768` 判据 `browser.provider ?? instances[].provider`·**不认** `plugins` 数组注册——曾误按 5.0.5 plugin 写法致「provider not specified」）；且 `@vitest/browser*` 须与 `vitest` **同 5.0.4**（5.0.5 provider 注册进另一 `@vitest/browser` 实例·内核看不见）。
- [x] **切片 B（部署态黄金流 · 采 `@playwright/test`）**：✅ 已落地实跑对拍。新增 `@playwright/test@1.64.1`（对齐 `playwright@1.64.1`·npmmirror 解析 OK·chromium 二进制复用切片 A 已拉的 `~/.cache/ms-playwright`）；新建 `playwright.config.ts`（`testDir=./e2e`·单 worker·retries 0·chromium·baseURL 取 env `E2E_BASE_URL`·**不用** `webServer`——生命周期归编排器）；编排器 `scripts/e2e-web.ts`（仿 `ci-fullstack`：Testcontainers 一次性 PG → `initMigrationOrm`+`migrator.up()` 重放基线 → `db:seed`（tsx 直跑·显式供 `ADMIN_PASSWORD`）→ `pnpm run build` 产编译产物 → `node dist/apps/api/src/main.js` 起 API :7009 轮询 `/health` 200 → `vite dev` :5173（proxy `/api`→7009·同源 cookie/CSRF 天然通）→ `playwright test` → finally 杀栈 + stop 容器）；opt-in 脚本 `pnpm run test:e2e:web`（**不入默认 `ci`/`pre-push`**）。2 条黄金流（`e2e/golden.spec.ts`）：① 未登录访问 `/posts` → 弹回 `/login`；② 登录→首页「引导落租」激活唯一成员组织→建 post→成功反馈「文章已创建」+ 列表回显。**双向验收**（实跑取证）：① 真链生效——`12 migrations → seeded → build ok → API healthy → web healthy → 2 passed (4.1s) → playwright exit 0`（服务端日志证 `GET /api/v1/posts` 回显本次新建文章）；② 人造违规（改坏断言文案）→ `1 failed, 1 passed` → `pnpm run test:e2e:web` **EXIT=1**；③ 默认链不受影响——`pnpm run check` 全仓 clean（新增 3 文件过 biome·1 info 系存量非本次）、`vitest list` 不收集 `e2e/*.spec.ts`（默认 `include` 白名单只覆 `apps/libs/packages/scripts` 下 `*.test.ts(x)`·`golden.spec.ts` 用 `@playwright/test` 导入不泄入 vitest）。
  - **零足迹加固 · 迁移快照保真**：`migrations.snapshot:true`（与 `db:setup`/`ci-fullstack` 共用装配）会在 `migrator.up()` 按 scratch 库回写已提交快照 `mikro-migrations.json`（`timestamp`→`timestamp(6)` 归一）——首跑实证脏化跟踪文件后，编排器改为 up() 前留存原字节、后原样回写（不改共享迁移配置），复跑日志证 `migration snapshot restored (零足迹)`·工作树干净。
- [x] **切片 C（收口）**：✅ 已落地（纯文档·零代码/零依赖）。
  - **gated 清单恒等校验 · 反悔后字面不适用（留痕）**：plan §2/§5 此句写于 ⓐ 反悔**前**（当时假设浏览器测=vitest `GATED_E2E_FILES` 同类需显式列文件）。ⓐ 翻为 `@playwright/test` 后，spec 靠 `playwright.config.ts` `testDir=./e2e` **自动发现**，既不被 `ci-fullstack.ts` 的 gated walker（只扫 `apps/api/src`+`libs` 下 `*.e2e.test.ts`）匹配、也不入默认链——**字面「登记进 gated 清单」机制不适用**。等价防腐已在位三件：① `playwright test` 对「零测试」默认 exit 1（除非 `--pass-with-no-tests`）→ e2e 目录丢失/清空 fail-loud、非静默绿；② 切片 B 已把 6 个 `E2E_*` 编排旋钮登记进 `verify-config-contract.ts` 白名单（闸②「代码读键⊆（样例∪白名单）」在默认链守护新增未声明键）；③ 默认 `vitest.config.ts` exclude 已隔 `*.browser.test.ts`。经人裁（2026-10-24）**不新增 ci.ts 静态接线闸**（避高危#3·auto-discovery 已覆盖漂移面）。
  - **ⓓ 回灌 tooling 矩阵（高危#5·人签 2026-10-24 GO）**：`docs/specs/tooling-standards.md` 六处改写——§2 新增「浏览器/E2E 测试面」矩阵行（Vitest Browser Mode 组件级 + Playwright 部署态·均 opt-in）；L32「测试运行器 Vitest 唯一」加注「唯一仅约束单测 runner·部署态 E2E 属不同类别」；前端测试行撤旧「Playwright e2e 缓采」失真口径→改「已采纳落地」；§3 红线澄清 Playwright 非禁；§4.5 补 opt-in 运行纪律；§7 命令速查补 `ci:e2e:web`/`test:e2e:web`。
  - **文档/runbook**：`docs/frontend-dev-proxy-runbook.md` §9 补自动化回归锁指针（手动 §5/§6 端到端链已由 `test:e2e:web` 机械锁·互补非替代首轮人肉 exploratory）。
  - **基线"只增不减"**：本切片零代码/零依赖变更·vitest 测试文件基线不动（playwright spec 不泄入 vitest）。

## 6. 变更记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-24 | 0.5.0 | 用户令「继续开切片 C」→ gated 收口方式 + ⓓ 回灌宪法两签核经 AskUserQuestion 落定（不加新闸·GO 回灌） | **切片 C（收口）落地**：ⓓ 回灌 `tooling-standards.md` 工具矩阵六处（新增「浏览器/E2E 测试面」行·L32 Vitest 唯一加注限定单测 runner·前端测试行撤旧「缓采」失真口径·§3 红线澄清 Playwright 非禁·§4.5 opt-in 纪律·§7 命令速查）=高危#5 经人签；gated 清单恒等经 ⓐ 反悔判定字面不适用（auto-discovery+playwright 零测 exit1+config-contract 白名单等价覆盖）·经人裁不新增 ci.ts 闸（避高危#3）；`frontend-dev-proxy-runbook.md` §9 补 `test:e2e:web` 自动化回归锁指针。纯文档·零代码/零依赖·基线只增不减守住。三切片全收口 |
| 2026-10-23 | 0.4.0 | 用户令「开切片 B」→「同意，乙」后实施·过审计门 | **切片 B（部署态黄金流）落地实跑**：新增 `@playwright/test@1.64.1`·建 `playwright.config.ts`（testDir=./e2e·opt-in·不用 webServer）+ 编排器 `scripts/e2e-web.ts`（Testcontainers PG→迁移→seed→build 后起 API :7009 健检→vite dev :5173 proxy→playwright test→finally 拆栈·零足迹）+ `e2e/golden.spec.ts` 2 条黄金流（会话墙弹回 + 登录→引导落租→建 post）。实跑 2 passed（真库回显新建文章）·人造违规 EXIT=1·默认链不受影响（biome clean + vitest 不收集 e2e）。修“migrator.up() 脏化已提交快照”副作用→快照保真。`.gitignore` 加 `test-results/`+`playwright-report/`。未动 `ci.ts`·未入默认链·未回灌宪法（ⓓ 留切片 C·高危#5 待签） |
| 2026-10-23 | 0.3.0 | 切片 B 启动前实证 Vitest Browser Mode `page` 无 `goto`·不能驱动部署态 SPA；用户令「同意，乙」 | **ⓐ 反悔修订**：部署态黄金流改采 `@playwright/test`（`page.goto` 真 SPA+真 API+真库）·Vitest Browser Mode 保留做组件/逻辑级浏览器测；合宪核验=红线仅禁 jest/bun·Playwright 属 E2E 不同类别不违「Vitest 单源」。切片 B 重写为 `scripts/e2e-web.ts` 编排器（Testcontainers PG+迁移+seed+起 API+vite dev+playwright·opt-in 不入默认链）。零实现（本行仅登记·待实施） |
| 2026-10-23 | 0.2.0 | 用户令「同意，推」＝GO 全采五裁点·过审计门·进实施 | **切片 A（设施）落地**：装 `@vitest/browser@5.0.4`+`@vitest/browser-playwright@5.0.4`+`playwright@1.64.1`（npmmirror 解析 + chromium 二进制境内拉取实证成功）；新建独立 `vitest.browser.config.ts`（provider=`test.browser.provider: playwright()`·仅 chromium·headless）+ `ci:e2e:web` opt-in 脚本；默认 `vitest.config.ts` `exclude` 补 `**/*.browser.test.ts(x)`；冒烟 `browser.smoke.browser.test.ts` 真起 chromium 2 passed。**双向验收**：full `pnpm run ci` PASSED EXIT=0（149 文件·fallow 0·默认链无回归）+ 默认 config 筛 browser 测 No test files found。修 Vitest 5.0.4 provider 写法与版本对齐两处坑（见 §5）。未动 `ci.ts`·未入默认链·未回灌宪法（ⓓ 留切片 C·高危#5 待签） |
| 2026-10-23 | 0.1.0 | 评价建议 4·F 层 10/24 真机验收积压"归人"卡脖子；上轮分层实证"建议 2 被建议 4 阻塞"；用户令「同意」→ 起草采纳案供签 | 首版·候选稿·待审计门：§1 三分取证（含 lock 已现 `@vitest/browser-playwright` 关键发现）·§2 推荐 Vitest Browser Mode + opt-in 门禁 + npmmirror·§3 五归人裁点（选型/门禁位/范围/回灌宪法/与 browser-use 关系）·§4 零实现·§5 三切片双向验收判据。未加依赖·未建 config·未动 ci.ts/宪法 |
