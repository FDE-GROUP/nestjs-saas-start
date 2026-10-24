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
  - 构建（ⓕ=乙）：`openapi:export` → 产物置 `docs-public/swagger/`；`pnpm run docs:api` → `typedoc` 出 `docs-public/tsdoc/`；根 `docs-public/index.html` 落地页链 `/swagger/` 与 `/tsdoc/`（Swagger 从根迁至 `/swagger/`·接受旧链迁移）。
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

> **裁定**：ⓐ `excludeNotDocumented: true`（只文档化已注释符号·加注释即定义对外 API 面）｜ⓑ `excludeInternal: true`（对外产物只见 `@public`·`@internal` 剔除）｜ⓒ **对外发布=GO**：TypeDoc 产物经 GitHub Pages 发布（开源·用户补充需求·翻转原「不入 Pages」）——`docs:api` 构建仍本地/CI 可跑，发布走 workflow（见切片 F）｜ⓓ `apps/web` **不纳**｜ⓔ TypeDoc 作独立「API 文档生成」工具行·随切片 A **单列签核 高危#5 回灌宪法**｜ⓕ **Pages 布局=乙**（用户 2026-10-24 定·根落地页链两站·Swagger 迁 `/swagger/`·TypeDoc `/tsdoc/`·接受旧链迁移）。

- ⓐ **API 表面选择策略**：`excludeNotDocumented: true`（**只文档化已注释符号**·让"加 TSDoc"=顺带定义对外 API 面·贴合本案范围）**推荐** vs 全量文档化后靠 `@internal` 逐个剔除。
- ⓑ **`@internal` 是否在产物中隐藏**：`excludeInternal` 置 `true`（对外文档只见 `@public`·内部件不现）**推荐** vs `false`（`@internal` 也可见·利于内部导航）。
- ⓒ **发布与门禁位置**：`docs:api` 是否入默认 `ci`/GitHub Pages（=改门禁·高危#3·默认 **opt-in 不入**·与 TypeDoc 产物仅本地/按需生成）；若入链须单列签。
- ⓓ **apps/web 是否纳入**：本轮建议**不纳**（前端组件非对外 API 面）；确认。
- ⓔ **tooling 矩阵回灌口径**：TypeDoc 作为独立「API 文档生成」工具行（与 `@nestjs/swagger` OpenAPI 面区分）·高危#5·随切片 A 单列签。
- ⓕ **Pages 布局（已裁=乙 · 用户 2026-10-24）**：**根 `index.html` 落地页链两站**·**Swagger 迁至 `/swagger/`**·**TypeDoc 置 `/tsdoc/`**·**合并进一次 `publish_dir` 部署**（`peaceiris` 默认整分支替换·分两次发会互踩）。代价：既有 Swagger 根链接失效·需接受外链迁移（用户已知悉择乙·非推荐甲之零破坏）。

## 5. 审计记录

> 无已审方案不写码。全局 blast radius → 人签核。

- 结论：**已审计·签发**（ⓐ–ⓔ 定稿全采推荐·ⓕ=乙·2026-10-24）；用户 GO **进入实施**（切片 A 起·新增依赖 + 高危#5 回灌 tooling 矩阵逐片单列签）
- 未决项：无（ⓕ 已裁=乙）；**实施期 高危#5 回灌宪法 + 新增依赖（切片 A）、高危#3 改 CI workflow（切片 F）须逐片单列签**
- 审计人 / 日期：用户（FDE）· 2026-10-24
- 实施留痕：**切片 A 已落地**（2026-10-24·用户 GO）——新增 `typedoc` devDep + `typedoc.json` + `docs:api` + 高危#5 回灌 tooling 矩阵；contracts 对拍通过·6 warning 归 B。**切片 B 已落地**（2026-10-24·用户 GO）——`libs/contracts` 全导出符号 TSDoc 化（纯注释·零行为变更）·**6 条 `@core` warning 全消解→0**·`docs:api`/`check`/contracts tsc 全绿；**样板交人验收定风格中**，通过才向 C/D 铺开。**切片 C 已落地**（2026-10-24·用户 GO C + coverage 采「乙」expand）——`libs/core` 68 非测试源分 6 原子提交全导出符号 TSDoc 化（typedoc 转 `entryPointStrategy:"expand"` + `tsconfig.doc.json` 多包 program）·纯注释零行为·代码逐字不变·`docs:api` EXIT=0/0 warning·check/core tsc 全绿·**全量 `ci` PASSED**（877 passed/48 skipped）。**切片 D 已落地**（2026-10-24·用户验收 posts 样板通过后继批）——`apps/api` 10 module 对外接口（api/domain/application·排除 infrastructure/module.ts）分 13 原子提交全导出符号 TSDoc 化·纯注释零行为·`docs:api` EXIT=0/0 warning·**全量 `ci` PASSED**（877 passed/48 skipped）。**切片 E+F 已落地**（2026-10-24·用户「继续切片 E、切片 F」签核·高危#3 改 CI）——E=AGENTS §3/README 收口同步（`83e41b7`·纯文档）；F=`deploy-swagger.yml` 重写为单 job 合并构建→单次 `publish_dir ./site`（乙布局·根落地页+`/swagger/`+`/tsdoc/`·`384ef37`）·**远端真跑对拍**：Actions `40057292697` 全 6 步绿·`gh-pages`→`50381da`·三站 curl 200·双向验收②负向探针证 validation 在位。**全案 A–F 六切片 + 双向验收收口完成**。

## 6. 完成判据（签核实施后回写·带取证·分片）

- [x] **切片 A**（2026-10-24 落地）：`typedoc@^0.28.20` 装入根 devDependency（`pnpm add -D -w`）+ `typedoc.json`（ⓐ `excludeNotDocumented:true`／ⓑ `excludeInternal:true`／`commentStyle:jsdoc`／`validation`=`invalidLink`+`notExported`·0.28 已把 `brokenLink` 更名 `invalidLink`）+ `docs:api` 脚本 + 产物 `docs/api-ref/` gitignore（Biome `useIgnoreFile` 自动跳扫）；**contracts 单包实跑对拍 EXIT=0**·HTML 生成（`index.html` + `variables/`52 + `functions/`3·ⓐ 生效剔除无注释装配件）；**6 条 unknown-block-tag warning 全部源于既有中文散文裸 `@core`**（§3.2 预判风险实证命中·反引号包裹不能抑制·归**切片 B** 规范化消解·非工具/配置缺陷·`validation` 未启 `treatWarningsAsErrors` 故仅告警不 fail）；`specs/tooling-standards` §2 矩阵新增「API 文档生成=TypeDoc」行 + §7 补 `docs:api`（ⓔ 高危#5 经 GO 回灌）；默认 `ci` 不受影响（`docs:api` opt-in 不入链）。
- [x] **切片 B**（2026-10-24 落地）：`libs/contracts` 24 文件全导出符号 TSDoc 化（`summary` + `@remarks` 承既有 why 散文 + 函数 `@param`/`@returns` + `@public`/`@internal` 发布修饰符·代码逐字不变）；@public=对外 wire 契约（各 schema const·view 型·wire enum 值集）·@internal=装配件（`strictObject`/`reqString*`/`optStringMax`/`pageShape`）·type alias 采「不加注释→`excludeNotDocumented` 剔除·doc 落配对 schema const」；**`docs:api` 实跑 EXIT=0 且 warning 6→0**（三处裸 `@core`〔response/authorization·organizations·payment〕+ envelope/event 侧全部反引号消解）·`{@link reqString}`（链被 excludeInternal 剔除符号）改反引号防 `invalidLink`；`pnpm run check` EXIT=0（579 文件）+ `tsc --noEmit -p libs/contracts` EXIT=0。待：样板交人验收定风格 → 通过后向 C/D 铺开。
- [x] **切片 C**（2026-10-24 落地·6 原子提交）：`libs/core` 68 非测试源全导出符号 TSDoc 化（`summary`〔中文职责首行〕+ `@remarks`〔既有中英 why 散文原样保留·语义不变〕+ `@public`·方法补 `@param`/`@returns`·纯注释零行为·代码逐字不变）。**coverage 采乙 = `entryPointStrategy:"expand"` 逐子域目录**（未加注释符号靠 `excludeNotDocumented` 自动隐身）·分 6 批：shared-kernel 12（`e7c623b`）→ 多包接线 `tsconfig.doc.json`（解 root tsconfig 把 `apps/web` 拖入触发 **880 类型错**·`14fe5b5`）→ authorization 5（转 expand·`9f4afbf`）→ tenant-isolation 7（`7f75a23`）→ platform 4（`8a6d2a3`）→ modules/{organizations 9·workspaces 10·subscriptions 19}（`75789b3`/`c3d6537`/`78fd99e`）。富构造分类法：interface/端口/抽象类/DI Symbol token/泛型工厂/guard·middleware·service 类/装饰器工厂/领域事件类 + payload 接口/VO/命令·查询·处理器。**派生 alias**（`(typeof X)[number]`·`DomainEventName` 等）与私有件不加注自动隐身·**有意义联合类型/词汇**标 `@public`；裸 `@` token（`@Can`/`@app/*`）反引号消解；`fallow-ignore-next-line` 指令保持紧邻 `execute`（TSDoc 置其上）。`barrel`/`src/index.ts` 未改。**验证**：`docs:api` EXIT=0 且 warning **0**（expand 后各子域符号全出）·`check` EXIT=0（580 文件·仅 i18n 脚本 1 既有 info）·core tsc EXIT=0·**全量 `pnpm run ci` PASSED**（877 passed/48 skipped·fallow 无边界违规·各 typecheck/openapi 对拍/domain-layout/stories-drift/overturned-rulings 全绿）。
- [x] **切片 D**（2026-10-24 落地·13 原子提交）：`apps/api` 10 module 对外接口 TSDoc 化（`summary`〔中文职责首行〕+ `@remarks`〔既有中英 why 散文原样保留·语义不变〕+ `@public`·方法/端点补 `@param`/`@returns`·DI Symbol→「…端口 DI 注入 token」·纯注释零行为·代码逐字不变）。**纳入 api/domain/application、排除 infrastructure/module.ts**（靠 `entryPointStrategy:"expand"` 只列对外子目录）·富 file-head 散文下移/上移附着主类/主接口·`fallow-ignore-next-line` 保持紧邻 `execute`（TSDoc 置其上）·裸 `@`（`@core`/`@Inject`/`@ApiProperty`）反引号消解·跨文件裸名 `{@link}` 改代码跨度防 `invalidLink`·纯派生 alias 不加注靠 `excludeNotDocumented` 隐身·纯 re-export read-model 无自有符号按 expand 正常不产条目。分提交：posts 样板（`7063468`·含 `tsconfig.doc.json` 纳入 apps/api + typedoc entryPoints 接线）→ subscriptions/workspaces/platform/payment（`a3339d0`/`0515222`/`6f1246b`/`516ed15`·薄 api 层）→ auth/authorization/users/storage（`985d3d3`/`43e0791`/`e147dfa`/`93af679`）→ organizations 41 件内分 4 小批 domain/commands/queries+read-models/api（`7d83bdf`/`b93e10b`/`ee5b880`/`e79e8d9`）。**验证**：各批 `docs:api` EXIT=0 且 warning **0**、infrastructure 零泄漏、git diff 仅注释/接线；收口**全量 `pnpm run ci` PASSED**（877 passed/48 skipped·fallow 无边界违规·各 typecheck/openapi 对拍/domain-layout/stories-drift 全绿）。
- [x] **切片 E**（2026-10-24 落地·`83e41b7`）：收口同步（纯文档）——AGENTS.md §3 常用命令补 `pnpm run docs:api`（opt-in 不入默认 ci 链）；README 文档区新增「公共 API 参考（TypeDoc）」本地生成口径条目；`.gitignore` 已含 `docs/api-ref/`（切片 A 落地·本次核实无改）。零代码零触宪。
- [x] **切片 F**（2026-10-24 落地·`384ef37`·高危#3 改 CI·用户「继续切片 E、切片 F」签核）：重写 `.github/workflows/deploy-swagger.yml` 为**单 job 合并构建→单 peaceiris deploy**（`publish_dir: ./site`·消解双 deploy 整分支替换互踩）——Swagger 产物迁 `site/swagger/`、新增 `docs:api` 段产 TypeDoc 落 `site/tsdoc/`、新增根落地页 `site/index.html`（链 `./swagger/` 与 `./tsdoc/`·ⓕ=乙·接受旧根链迁移）；触发 paths 追加 typedoc.json/tsconfig*.json/package.json/pnpm-lock.yaml/本 workflow；AGENTS §5 分支说明同步。**远端真跑对拍存照**：Actions run `40057292697` 全 6 步绿（含合并构建 + 部署）·`gh-pages` 快进至 `50381da`·线上三站 curl **200** — `/`（含 `./tsdoc/` 链）、`/swagger/`（载 swagger-ui）、`/tsdoc/`（现「公共 API 参考」）。
- [x] **双向验收**（2026-10-24）：① `docs:api` 生成成功且全量 `ci` PASSED（877/48 skipped）；② 负向探针——向 `ba-error.mapping.ts` 临时注 `@qoderProbeInvalidTag` → TypeDoc validation 精确报 `[warning] Encountered an unknown block tag @qoderProbeInvalidTag` @ `:15:3`（证明校验在位）·随即原样还原（git diff 空·重跑 docs:api 0 warning）。

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-24 | 0.9.0 | 用户「继续切片 E、切片 F」签核·E/F 落地 + 双向验收 | **切片 E+F 完成·全案 A–F 六切片收口**：E=AGENTS §3 补 `docs:api` + README 文档区本地生成指针（`83e41b7`·纯文档零触宪·.gitignore 已含 docs/api-ref）。F（高危#3 改 CI）=`deploy-swagger.yml` 由「仅 Swagger」重写为**单 job 合并构建→单 peaceiris deploy**（`publish_dir ./site`·乙布局：根落地页链 `/swagger/`+`/tsdoc/`·消解双 deploy 互踩·paths 追 typedoc.json/tsconfig*/package.json/lock/本 workflow·AGENTS §5 同步）（`384ef37`）。**远端真跑对拍存照**：Actions run `40057292697` 全 6 步绿·`gh-pages` 快进 `50381da`（root index.html + swagger/ + tsdoc/）·线上 curl 三站 **200**（/、/swagger/、/tsdoc/）。**双向验收**：① docs:api 生成 + 全量 ci PASSED（877/48）；② 向 ba-error.mapping 临时注 `@qoderProbeInvalidTag` → TypeDoc validation 精确报 unknown block tag @ `:15:3` 随即原样还原（证校验在位）。无遗留切片 |
| 2026-10-24 | 0.8.0 | 用户验收 posts 样板通过·续铺余 9 module·切片 D 落地 | **切片 D 完成**：`apps/api` 10 module 对外接口 TSDoc 化（纳入 api/domain/application·排除 infrastructure/module.ts·`expand` 只列对外子目录）·summary+@remarks+@param/@returns+@public·富 file-head 下移附着主类·裸 `@` 反引号消解·跨文件裸名 `{@link}` 改代码跨度·纯 re-export 无自有符号正常不产条目·分 13 提交（posts 样板 7063468 含 apps/api 接线 + subscriptions/workspaces/platform/payment a3339d0/0515222/6f1246b/516ed15 + auth/authorization/users/storage 985d3d3/43e0791/e147dfa/93af679 + organizations 内分 4 小批 7d83bdf/b93e10b/ee5b880/e79e8d9）·纯注释零行为·各批 `docs:api` EXIT=0/0 warning + check/tsc 全绿·收口**全量 `ci` PASSED**（877/48 skipped）。下一步切片 E（收口同步 AGENTS §3/README·产物落位）/ F（Pages 发布·高危#3·远端真跑对拍） |
| 2026-10-24 | 0.7.0 | 用户 GO C + coverage 采「乙」expand·切片 C 落地 | **切片 C 完成**：`libs/core` 68 非测试源全导出符号 TSDoc 化（summary+@remarks+@param/@returns+@public·纯注释零行为·代码逐字不变）·typedoc 转 `entryPointStrategy:"expand"` 逐子域（coverage=乙·未注释符号靠 `excludeNotDocumented` 隐身）+ `tsconfig.doc.json` 多包 program（解 root tsconfig 拖入 `apps/web` 触发 880 类型错）·分 6 提交（e7c623b/14fe5b5/9f4afbf/7f75a23/8a6d2a3 + modules 三批 75789b3/c3d6537/78fd99e）·`docs:api` EXIT=0/0 warning·check/core tsc 全绿·**全量 `ci` PASSED**（877/48 skipped）。下一步切片 D（`apps/api` 对外接口·范围最大）/ E（收口同步）/ F（Pages 发布·高危#3） |
| 2026-10-24 | 0.6.0 | 用户 GO 切片 B 落地 | **切片 B 完成**：`libs/contracts` 全导出符号 TSDoc 化（summary+@remarks+@param/@returns+@public/@internal·纯注释零行为·代码逐字不变）；@public=对外契约 · @internal=装配件（strictObject/reqString*/optStringMax/pageShape）；裸 `@core` 反引号消解 + `{@link reqString}`→反引号；`docs:api` warning **6→0**·check/tsc 全绿。**样板交人验收定风格**·通过才开 C/D |
| 2026-10-24 | 0.5.0 | 用户 GO 切片 A 落地 | **切片 A 完成**：`typedoc@^0.28.20`（根 devDep·pnpm -w）+ `typedoc.json`（ⓐ/ⓑ/commentStyle/validation）+ `docs:api`（opt-in 不入默认链）+ 产物 `docs/api-ref/` gitignore；contracts 单包实跑对拍 EXIT=0·HTML 生成（52 vars/3 funcs）·6 条 `@core` unknown-tag 归因切片 B；高危#5 回灌 `tooling-standards` §2 矩阵 + §7 命令。下一步切片 B（规范化 contracts 注释定风格·交人验收） |
| 2026-10-24 | 0.4.0 | 用户三令：ⓕ=乙 · 推 docs · GO 切片 A | **ⓕ 裁=乙**（根落地页链两站·Swagger 迁 `/swagger/`·TypeDoc `/tsdoc/`·接受旧链迁移）·§2/§6 切片 F 同步乙布局·§5 结论翻「进入实施」。切片 A（新增 `typedoc` devDep + `typedoc.json` + `docs:api` + contracts 单包对拍 + 高危#5 回灌 tooling 矩阵）随本次 GO 起实施 |
| 2026-10-24 | 0.3.0 | 用户补充：开源项目·生成文档须经 GitHub Pages 对外发布 | **裁点 ⓒ 翻转**（不入 Pages → GO 对外发布）·新增 ⓕ Pages 布局（Swagger 保根·TypeDoc `/tsdoc/`·合并单次 publish_dir 防 peaceiris 互踩）·新增切片 F（扩 `deploy-swagger.yml` 合并部署·高危#3 改 CI·须远端真跑对拍·AGENTS §5 分支说明同步）。仍零依赖零码零触宪·实施待逐片签 |
| 2026-10-24 | 0.2.0 | 用户令「定稿后一并提交」＝按推荐裁 ⓐ–ⓔ·过审计门 | **定稿·已审计·签发**：ⓐ `excludeNotDocumented:true`／ⓑ `excludeInternal:true`／ⓒ `docs:api` opt-in 不入默认链／ⓓ web 不纳／ⓔ TypeDoc 独立工具行随切片 A 单列签 高危#5。本窗仅定稿方案·零依赖零码零触宪；实施待逐片签核（切片 A 起） |
| 2026-10-24 | 0.1.0 | 用户令「按 tsdoc.org 规范为代码加中文注释·下一步用 typedoc.org 生成文档」→ 走审计门先立方案 | 首版·候选稿·待审计：现状取证（注释高密度但 TSDoc 标签近零）·范围（公共包+api 对外接口·跳内部/平凡件·web 缓）·标签（基础块标签+@public/@internal+散文规范成 summary/@remarks）·五切片（工具触宪→contracts 样板→core→api→收口）·TypeDoc 生成就绪项（commentStyle/excludeNotDocumented/excludeInternal/validation/brace 转义）·归人裁点 ⓐ–ⓔ。零依赖·零码·零触宪 |

---

<!-- 变更戳 -->
正文已于 2026-10-24 / v0.7.0 变更，以当前正文内容为准。
