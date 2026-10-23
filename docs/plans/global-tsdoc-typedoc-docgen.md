# 采纳 TSDoc 注释规范 + 引入 TypeDoc 生成公共 API 文档

> 适用范围: `全局`（← blast radius：新增工具 TypeDoc 触 `specs/tooling-standards` 工具矩阵=高危#5 修宪；注释跨 `libs/contracts`+`libs/core`+`apps/api` 对外接口）
> 关联: `specs/tooling-standards` §2 工具矩阵 / §3 红线 / §7 命令速查 · [tsdoc.org](https://tsdoc.org/) · [typedoc.org](https://typedoc.org/) · `.github/workflows/deploy-swagger.yml` + `gh-pages` 分支（GitHub Pages 现供 Swagger·本案扩供 TypeDoc）· AGENTS.md §5 分支说明 · `libs/contracts` · `libs/core` · AGENTS.md 工具红线（TypeDoc 属**文档生成**新工具类别·非禁·与 `@nestjs/swagger` 的 OpenAPI 运行时契约文档是不同表面）
> 性质: 新建型（首案）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**现状（取证）**：代码已高密度**中文 why 型块注释**（`libs/core` 94% / `libs/contracts` 90% / `apps/api` 81% 文件带 `/** */`），但 **TSDoc 结构化标签几乎为零**——`@param` 仅 2 文件、`@returns`/`@remarks`/`@public`/`@internal`/`@since`/`@defaultValue` **全 0**，仅 `@example`(14)、`@link`(3) 偶用。即：注释是给人读的设计说明，**不是机器可解析的 API 文档源**。

**目标**：让**公共 API 面**的注释符合 [TSDoc](https://tsdoc.org/) 标准，并引入 [TypeDoc](https://typedoc.org/) 从源码**生成 API 文档**——
1. 现有散文注释**规范化**为 `summary`（首行职责）+ `@remarks`（承既有 why 内容·含义不变）；
2. 非平凡导出符号补 `@param x - …` / `@returns …` / `@throws …` 块标签；
3. 用 TSDoc **发布修饰符** `@public` / `@internal` 显式界定对外契约面 vs 内部件；
4. 补齐**真缺注释**的公共符号（api 里无块注释文件约 60·core/contracts 少数）；
5. 接入 TypeDoc 工具 + 配置 + 生成脚本，产物满足文档生成要求；
6. **开源对外发布**：TypeDoc 产物经 GitHub Pages 发布（用户 2026-10-24 补充需求·翻转原 ⓒ「不入 Pages」推荐）。

**非目标（显式锁定·防过度注释）**：
- **不**给纯内部/平凡件（简单 getter/setter、仅复述签名者可推知者）加注释——违反"匹配既有注释密度、不写可简单推知之物"，制造噪声。
- **不**改任何**行为 / DI 形态 / schema / 路由 / 契约签名**（本案纯注释 + 工具 + 配置）。
- **不**在本轮覆盖 `apps/web`（前端组件非对外 API 面·见裁点 ⓓ）。
- **不**改写现有高质量文件级散文的**语义**（只重排为 TSDoc 合法结构）。
- **不**把 TypeDoc 产物替代/并入 OpenAPI（`@nestjs/swagger`）——两套面向不同受众（TS API 参考 vs REST 契约），并存。

## 2. 方案

垂直切片，A 为「工具/配置 + 触宪」前置，B 为**风格样板**先行、人验收定样后再向 C/D 推广（宽面 churn 用样板锁风格）；E 收口。

- **切片 A —— 工具与配置（触宪前置）**
  - `pnpm add -D typedoc`（**禁 bun**·npmmirror 解析·devDependency·供应链面高危经此案 GO 覆盖）；可选 `typedoc-plugin-*`（如 markdown 输出·按需）。
  - 建 `typedoc.json`：`entryPoints` = 公共包 `index.ts`（+ 选定的 api 对外模块）；**关键生成就绪项**——`commentStyle: "jsdoc"`（默认·`/** */`）、`excludeNotDocumented`（见裁点 ⓐ）、`excludeInternal`（见裁点 ⓑ·默认 false=`@internal` 仍出·要隐藏须显式 true）、`validation`（brokenLink/notExported/missingComment 分级）、`outDir`。
  - **回灌 `specs/tooling-standards`**（ⓓ 高危#5·单列签）：§2 工具矩阵新增「API 文档生成（TS 码面）= TypeDoc」行并与 §2「API 文档=@nestjs/swagger（OpenAPI 运行时）」并列不混；§3 红线核验并显式声明「TypeDoc 属文档生成工具、非第二测试/构建 runner、不触既有唯一性红线」；§7 命令速查补 `docs:api`。
  - 建 `package.json` 脚本 `docs:api`（`typedoc`）；**先在单包（contracts）实跑生成对拍**跑通。
  - 完成判据：`typedoc` 生成**零 unknown-tag / 零 broken-link warning**（或按裁点 ⓑ/ⓒ 策略明确降级）；HTML 产物可开；`pnpm run ci` 不受影响（typedoc 不入默认链·除非裁点 ⓒ 另签）。
- **切片 B —— `libs/contracts` 样板（对外传输契约·范围最小最典型）**
  - 全导出符号（envelope/strict/helpers/各契约 schema）补 TSDoc：`summary` + `@remarks`（迁现有 why）+ 仅非平凡件 `@param/@returns`；`@public`=对外契约、`@internal`=`strict.ts`/`helpers.ts` 等装配件；交叉 `{@link}`。
  - 跑 `docs:api` + `pnpm run check`（Biome）+ `verify:test-types`/tsc 绿；**本片产物 + 生成文档交人验收定风格**。
- **切片 C —— `libs/core` 导出面**（shared-kernel + tenant-isolation/authorization/platform 契约 + modules 领域层公共符号）·同法。
- **切片 D —— `apps/api` 对外接口**（各 module 的 `domain/ports` · `application` 公共 command/query/handler 接口 · `api` controller 对外方法·**非** infrastructure 内部实现件）·按 module 分批（users/auth/authorization/organizations/workspaces/platform/payment/storage/subscriptions/posts）。范围最大·据 B 定样推进。
- **切片 E —— 收口**：AGENTS.md §3 命令 + README 文档区同步；`.gitignore` 加 TypeDoc 产物目录（`docs/api-ref/` 之类·不入库）。
- **切片 F —— Pages 对外发布（高危#3 改 CI·须远端真跑对拍）**：把 `deploy-swagger.yml` 扩为**单 job 合并构建 + 单次部署**——
  - 构建：`openapi:export` → `swagger-static/`（现状·保持根路径）；新增 `pnpm run docs:api` → `typedoc` 出 `tsdoc/`；造 `docs-public/` 汇总目录：根 `index.html` 落地页链 `/swagger` 与 `/tsdoc`（或 Swagger 留根、TypeDoc 置 `tsdoc/`·见裁点 ⓕ）。
  - 部署：`peaceiris/actions-gh-pages@v4` 单步 `publish_dir: ./docs-public`（**一次替换整分支**·杜绝双部署互踩）。
  - `on.push.paths` 评估纳入 `typedoc.json` / 相关 `docs/**`（改了注释/配置也能触发重发）。
  - **对拍**：本地只能验 `docs:api` 产物 + workflow YAML 逻辑；Pages 真生效须推 `main` 触发远端 workflow·人盯 `gh-pages` 更新与 `/tsdoc` 可开（AGENTS §4.10 部署声明必真跑·不得以「配置就位」充当完成）。
  - 同步 **AGENTS §5 分支说明**（现写 gh-pages「只装 Swagger 静态产物」→ 改「Swagger + TypeDoc API 文档」）。

## 3. 影响面与风险

- **blast radius / 可逆性**：范围全局但**纯注释 + 新增工具 + 配置·零行为变更·完全可逆**（`git revert` 逐片可撤·工具/配置切片独立）。
- **命中高危清单**（`workflow.md` §3 / AGENTS 铁律）：**高危#5** 改 `docs/specs` 宪法（TypeDoc 入 tooling 工具矩阵=切片 A·须人签）；**高危#3** 若把 `docs:api` 入默认 `ci`/Pages（裁点 ⓒ·默认不做）；新增依赖=供应链面（devDependency）。
- **风险与缓解**：
  1. 数百文件注释 diff 的审查负担 → 缓解=分包切片 + **B 样板先行验收**锁风格，不一次铺开。
  2. TypeDoc 对既有中文散文里的**字面 `{`/`}`**（如内联 JSON 例）与**裸 `@`**（`@core/*` 包名、`@Body`/`@Inject` 装饰器、`NAMESPACE:NAME` 无 `@` 但 i18n 键含点分）会报 **unknown-tag / unescaped-brace warning** → 缓解：注释内字面花括号按 TSDoc **转义**（`\{`/`\}`）；必要时用 `blockTags/inlineTags/modifierTags` 白名单 + `excludeTags`/`jsDocCompatibility.ignoreUnescapedBraces` 兜；`validation` 分级不轻启 `treatWarningsAsErrors`。
  3. `excludeInternal` 默认 **false** → `@internal` 仍会进产物；要真正隐藏须显式配（裁点 ⓑ）。
  4. `{@link}` 解析依赖 tsconfig（`useTsLinkResolution` 默认 on）→ 跨包符号链接需 entryPoints/tsconfig 覆盖，否则退化为纯文本。
- **风险（Pages 发布段·切片 F）**：`peaceiris` 默认整分支替换 → 双 deploy 互踩（已用「合并单次 `publish_dir`」消解）；改 workflow=**高危#3 改 CI**·且部署声明**须远端真跑对拍**（本地不可完全验）；gh-pages 为 CI 生成的**孤儿发布分支**·**勿手工改/勿更名/勿并 main**（AGENTS §5）。
- **回滚策略**：每片独立提交；工具/配置（A）与注释（B/C/D）解耦·可单撤 TypeDoc 保留规范化注释，或反之；workflow（F）改动独立可 revert。

## 4. 归人裁点（已裁 · 用户令「定稿」＝全采推荐 · 2026-10-24）

> **裁定**：ⓐ `excludeNotDocumented: true`（只文档化已注释符号·加注释即定义对外 API 面）｜ⓑ `excludeInternal: true`（对外产物只见 `@public`·`@internal` 剔除）｜ⓒ **对外发布=GO**：TypeDoc 产物经 GitHub Pages 发布（开源·用户补充需求·翻转原「不入 Pages」）——`docs:api` 构建仍本地/CI 可跑，发布走 workflow（见切片 F）｜ⓓ `apps/web` **不纳**｜ⓔ TypeDoc 作独立「API 文档生成」工具行·随切片 A **单列签核 高危#5 回灌宪法**。

- ⓐ **API 表面选择策略**：`excludeNotDocumented: true`（**只文档化已注释符号**·让"加 TSDoc"=顺带定义对外 API 面·贴合本案范围）**推荐** vs 全量文档化后靠 `@internal` 逐个剔除。
- ⓑ **`@internal` 是否在产物中隐藏**：`excludeInternal` 置 `true`（对外文档只见 `@public`·内部件不现）**推荐** vs `false`（`@internal` 也可见·利于内部导航）。
- ⓒ **发布与门禁位置**：`docs:api` 是否入默认 `ci`/GitHub Pages（=改门禁·高危#3·默认 **opt-in 不入**·与 TypeDoc 产物仅本地/按需生成）；若入链须单列签。
- ⓓ **apps/web 是否纳入**：本轮建议**不纳**（前端组件非对外 API 面）；确认。
- ⓔ **tooling 矩阵回灌口径**：TypeDoc 作为独立「API 文档生成」工具行（与 `@nestjs/swagger` OpenAPI 面区分）·高危#5·随切片 A 单列签。
- ⓕ **Pages 布局（推荐·最小破坏）**：**Swagger 保持 Pages 根路径不变**（不破既有对外链接）·**TypeDoc 置子路径 `/tsdoc/`**·单 `index.html` 落地页互链·**合并进一次 `publish_dir` 部署**（`peaceiris` 默认整分支替换·分两次发会互踩）。

## 5. 审计记录

> 无已审方案不写码。全局 blast radius → 人签核。

- 结论：**已审计·签发**（用户令「定稿」＝GO 全案·ⓐ–ⓔ 全采推荐·2026-10-24）；本窗仅定稿方案，**未加依赖 / 未动码 / 未触宪**
- 未决项：裁点 ⓕ（Pages 布局推荐已给·待确认）；**实施期 高危#5 回灌宪法 + 新增依赖（切片 A）、高危#3 改 CI workflow（切片 F）须逐片单列签**
- 审计人 / 日期：用户（FDE）· 2026-10-24

## 6. 完成判据（签核实施后回写·带取证·分片）

- [ ] **切片 A**：`typedoc` 装入（devDependency·pnpm）+ `typedoc.json` 就位 + `docs:api` 脚本；单包实跑生成**零 unknown-tag/零 broken-link**（或按 ⓑ/ⓒ 策略）；`specs/tooling-standards` 工具矩阵回灌（ⓔ 经签）；默认 `ci` 不受影响。
- [ ] **切片 B**：`libs/contracts` 全导出符号 TSDoc 化（summary+@remarks+非平凡 @param/@returns+@public/@internal）；`docs:api` 产物 + `pnpm run check` + tsc 全绿；**样板交人验收定风格**。
- [ ] **切片 C**：`libs/core` 导出面同法·绿。
- [ ] **切片 D**：`apps/api` 各 module 对外接口同法·分批绿·无行为变更（diff 仅注释·`ci` 测试基线只增不减守住）。
- [ ] **切片 E**：产物落位/发布指针 + 文档同步（AGENTS §3/README）；（入链与否按 ⓒ）。
- [ ] **切片 F**：`deploy-swagger.yml` 合并单次 `publish_dir`·推 `main` 后 `gh-pages` 实跑更新·Swagger 根链接不失效 + `/tsdoc` 可开（远端真跑存照）·AGENTS §5 分支说明同步。
- [ ] **双向验收**：① `docs:api` 生成成功且 `ci` PASSED；② 故意造一处 unknown-tag → TypeDoc validation 报红（证明校验在位）。

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-24 | 0.3.0 | 用户补充：开源项目·生成文档须经 GitHub Pages 对外发布 | **裁点 ⓒ 翻转**（不入 Pages → GO 对外发布）·新增 ⓕ Pages 布局（Swagger 保根·TypeDoc `/tsdoc/`·合并单次 publish_dir 防 peaceiris 互踩）·新增切片 F（扩 `deploy-swagger.yml` 合并部署·高危#3 改 CI·须远端真跑对拍·AGENTS §5 分支说明同步）。仍零依赖零码零触宪·实施待逐片签 |
| 2026-10-24 | 0.2.0 | 用户令「定稿后一并提交」＝按推荐裁 ⓐ–ⓔ·过审计门 | **定稿·已审计·签发**：ⓐ `excludeNotDocumented:true`／ⓑ `excludeInternal:true`／ⓒ `docs:api` opt-in 不入默认链／ⓓ web 不纳／ⓔ TypeDoc 独立工具行随切片 A 单列签 高危#5。本窗仅定稿方案·零依赖零码零触宪；实施待逐片签核（切片 A 起） |
| 2026-10-24 | 0.1.0 | 用户令「按 tsdoc.org 规范为代码加中文注释·下一步用 typedoc.org 生成文档」→ 走审计门先立方案 | 首版·候选稿·待审计：现状取证（注释高密度但 TSDoc 标签近零）·范围（公共包+api 对外接口·跳内部/平凡件·web 缓）·标签（基础块标签+@public/@internal+散文规范成 summary/@remarks）·五切片（工具触宪→contracts 样板→core→api→收口）·TypeDoc 生成就绪项（commentStyle/excludeNotDocumented/excludeInternal/validation/brace 转义）·归人裁点 ⓐ–ⓔ。零依赖·零码·零触宪 |

---

<!-- 变更戳 -->
正文已于 2026-10-24 / v0.3.0 变更，以当前正文内容为准。
