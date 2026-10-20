# mikro-adapter 抽包：自持 Better Auth × MikroORM 适配器独立为私有 lib

> 适用范围: `模块(database/mikro + 构建链)` ← blast radius：触 `build:libs` / 根 `tsconfig.paths` / 根 `deps` / 3 处 import 改写 / 删源文件（属**构建链/门禁邻接**，命中高危清单「改门禁·CI」类）
> 关联: `global-orm-mikro-constitution-amendment`（切片 1 自持 adapter 出身）· `tooling-standards` §4.1 R-η / §4.3 · `specs/architecture.md` 结构条款（本次不改宪法）
> 性质: 重写型（纯结构搬迁 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**背景**：`apps/api/src/database/mikro/mikro-auth-adapter.ts` 是本仓 Better Auth 数据面的**唯一自持适配器**（补齐社区包三大缺失：`transaction` / `consumeOne` / `incrementOne`）。经直查取证，它对外零耦合——不 import 任何 app 代码（不碰 `entities.ts` / `orm.ts` / config / DI），只依赖三项：

| 依赖 | 形态 | 处置 |
|---|---|---|
| `node:async_hooks`（`AsyncLocalStorage`） | Node 内建 | 随包带走，零配置 |
| `@mikro-orm/core`（`MikroORM`） | **纯类型** `import type` | peerDependency（连 `@mikro-orm/postgresql` 都不需要） |
| `better-auth/adapters`（`createAdapterFactory` 值 + `CleanedWhere` 类型） | 运行时值 | peerDependency |

其对外签名 `mikroAuthAdapter(orm) => AdapterFactory` 与官方 `@better-auth/drizzle-adapter` 的 `drizzleAdapter(db, opts)` 同款形态，天然适合抽为独立包（对标 https://better-auth.com/docs/adapters/drizzle）。

**目标**：把**适配器本体**抽为 `libs/` 下的**内部私有包**（不发布 npm），边界清晰、可独立构建与复用。

**非目标（明确划界，防 over-reach）**：
- **不发布**（`private: true`，无 CI 发布流水线、无版本对外承诺）。
- **不搬 `entities.ts` / `orm.ts` / `column-meta.ts`**：`MIKRO_ENTITIES` 被 15+ 仓储/e2e/seed 广泛直 import，且是 Mikro 迁移链（`mikro-migration.config.ts`）的 schema SSOT——跟着进包 = blast radius 爆炸 + 双 SSOT 漂移风险。BA 实体/orms 初始化**留 app**。
- **不改适配器逻辑**（纯文件搬迁，零行为变更）。
- **不改 schema、不触迁移、不改 `docs/specs`、不改公共契约**。
- 一致性验收套件 `auth-adapter.consistency.spec.ts` **留 app**（它需要 app 的 `initMikroOrm` + `MIKRO_ENTITIES` 起真库校验；改从包 import 适配器即可）。

## 2. 方案

单一切片（纯搬迁·可独立验证），因风险面集中在构建链一次性接线，拆片反增中间破绿态：

### 切片 A —— 建包 + 一次性接线 + 删旧

**A-1 新建包骨架 `libs/mikro-adapter/`（镜像 `libs/core` 构建形态）**
- `package.json`：
  ```jsonc
  {
    "name": "@okee/mikro-adapter",            // 人裁①=scoped `@okee/mikro-adapter`（对齐前端 okee 家族命名）·落位②=libs/·开工③=GO
    "version": "0.0.0",
    "description": "自持 Better Auth × MikroORM v7 adapter（createAdapterFactory 规格内·transaction/consumeOne/incrementOne 齐备·内部私有·§9.5.4 抽包）",
    "type": "module",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "./*": { "types": "./dist/*.d.ts", "default": "./dist/*.js" }
    },
    "typesVersions": { "*": { "*": ["./dist/*"] } },
    "peerDependencies": {
      "better-auth": "^1.7.7",
      "@mikro-orm/core": "7.2.5"
    }
  }
  ```
- `nest-cli.json`：照抄 `libs/core/nest-cli.json`（`sourceRoot: src`、`builder: swc`、`deleteOutDir`、`typeCheck: true`）。
- `tsconfig.json`：照抄 `libs/core/tsconfig.json`（`extends: ../../tsconfig.json`、`baseUrl: ../../`、`rootDir: src`、`include: src/**/*`）。
- `tsconfig.build.json`：照抄 `libs/core/tsconfig.build.json`（`rootDir: src`、`outDir: dist`、`paths: {}`、exclude `*.test.ts`/`*.spec.ts`）。
- `src/mikro-auth-adapter.ts`：**逐字迁入**现文件全部 341 行内容（含头注契约钉点），不改一字逻辑。
- `src/index.ts`：`export { mikroAuthAdapter } from './mikro-auth-adapter';`（**无扩展名**·对齐 `libs/core/src/index.ts` barrel 惯例·SWC 产物补 `.js`）。
- **无需 `.swcrc`**：`libs/core` 无自带 `.swcrc` 亦正常 `nest build --builder swc`（根 `.swcrc` 生效），本包同构。

**A-2 根接线**
- `package.json` → `dependencies` 追加 `"@okee/mikro-adapter": "workspace:*"`（与 `@core/saas-kit` / `@saas/contracts` 同列）。
- `package.json` → `build:libs` 脚本**尾部追加**本包构建段：
  ```
  ... && cd libs/mikro-adapter && nest build --builder swc && cd ../.. && tsc --project libs/mikro-adapter/tsconfig.build.json --emitDeclarationOnly
  ```
- `tsconfig.json`（根）+ `apps/api/tsconfig.json` → `paths` 各追加（供 **vitest `tsconfigPaths` / IDE** 解析）：
  ```jsonc
  "@okee/mikro-adapter": ["libs/mikro-adapter/src/index.ts"],
  "@okee/mikro-adapter/*": ["libs/mikro-adapter/src/*"]
  ```
  - ⚠ **关键约束（实施期实拓·R-δ 同型）**：**`tsconfig.build.json` 不得加 `@okee` 路径**——nest 的 SWC builder 会按 build paths 把 import **重写为相对 src 路径**（`../../libs/mikro-adapter/src/index`），产物运行时指向不存在的 `dist/libs/...` → `ERR_MODULE_NOT_FOUND`。`@core`/`@saas` 当年即因此从 build paths 移除·产物保裸句柄经 `node_modules`→`dist` 解析。本包同理。
  - 后果：根 `tsconfig` 用 `moduleResolution: node`（Node10）**无法裸解析**带 `exports` 的 workspace 包根（TS2307·repo 内 `@saas/contracts` 裸导入仅出现在被 build 排除的 `*.test.ts`·非先例）→ 故消费方走**子路径导入**（经 `typesVersions` `*`→`dist/*` 解析·与 `@core/saas-kit/<子路径>` 同法）。
- `pnpm-workspace.yaml` / 根 `workspaces` **无需改动**：`libs/*` glob 已自动纳入本包。

**A-3 改写消费方 import（全仓实锤 3 处·均采**子路径** `'@okee/mikro-adapter/mikro-auth-adapter'`·见 A-2 约束）**
- `apps/api/src/database/mikro/mikro-orm.service.ts:5`
- `apps/api/src/database/seed.ts:11`
- `apps/api/src/database/mikro/auth-adapter.consistency.spec.ts:4`（其余 `./orm` / `vitest` import 不动）
- `auth.implement.ts` **不改**（经 `mikroOrmService.createAuthAdapter()` 间接消费，不直 import 适配器）。

**A-4 删除旧文件**
- 删 `apps/api/src/database/mikro/mikro-auth-adapter.ts`。

**A-5 一致性配置**
- `vitest.consistency.config.ts` include 路径 `apps/api/src/database/mikro/auth-adapter.consistency.spec.ts` **不变**（spec 留 app）。

- **完成判据**：
  1. `pnpm install` 无错、workspace 识别新包；
  2. `pnpm run build:libs` 产出 `libs/mikro-adapter/dist/{index.js,index.d.ts,mikro-auth-adapter.*}`；
  3. 全仓 grep `mikro-auth-adapter` 相对路径 import **零残留**；
  4. `pnpm run ci` 全绿，测试基线**只增不减、实为不动**（纯搬迁无新增/删除用例）；
  5. `pnpm run test:auth-consistency`（env-gated 真 PG + `BA_MIKRO_CONSISTENCY=1`）EXIT=0——证明适配器搬家后仍满足官方 authFlow 契约；
  6. `pnpm run verify:prod-boot` `/health` 200。

## 3. 影响面与风险

- **blast radius**：中。新增 1 包目录 + 根 3 处接线（deps / build:libs / tsconfig paths）+ 3 处 import 改写 + 删 1 文件。**命中高危清单「改门禁·CI / 构建链」**（`build:libs` 与根 `tsconfig.paths` 属产线装配面）→ **须人签核后方可实施**。
- **可逆性**：**可逆**（git revert 即回滚；未删依赖、未动 schema/迁移/契约/宪法）。
- **风险登记**：
  - R-1 peer 解析：包 `private` 不发布，`better-auth` / `@mikro-orm/core` 已在根 `dependencies`，workspace hoist 解析无忧——但若将来发布需转真 peer + dev 安装（本阶段不涉及）。
  - R-2 ESM/decorator：适配器无装饰器、无 `__dirname`、`better-auth/adapters` 为值 import 子路径——tooling §4.1 R-η 合规；`index.ts` re-export 用 `.js` 后缀防裸子路径断裂。
  - R-3 `build:libs` 串行长链追加一段，若某步 `cd` 目录名笔误会 fail-loud（构建即红，不静默）。
  - R-4 双 SSOT 诱惑：本方案**显式不搬** `entities.ts`/`orm.ts`——留 app 为唯一 BA schema/迁移源，防包内包外两份实体漂移（非目标已锁）。

## 4. 审计记录

> 无已审方案不写码。本切片触构建链（高危邻接）→ **人签核**。

- **归人裁点（开工前须定）→ 已人裁（2026-10-20·用户令「1、@okee/mikro-adapter，2、3、由你裁定」）**：
  - **① 包名**：定 **`@okee/mikro-adapter`**（人直裁·对齐前端 `okee` 家族命名）。
  - **② 落位**：Agent 代裁 = **`libs/`**（内部私有共享码·贴三区划界·与 `@core/saas-kit`/`@saas/contracts` 同区）。
  - **③ 开工签核**：Agent 代裁 = **GO**（用户「由你裁定」= 授权实施·触 `build:libs`/根 tsconfig 门禁邻接面之问责归签核人 P2）。
- 结论：**已审计·GO→已实施·已结项（人验收·提交推送 `6ab88da`）**
- 未决项：无（①②③均已裁）。实施期实拓一结构约束（Node10 裸包解析/SWC build-path 重写）已回写 §2 A-2/A-3·非遗留。
- 审计人 / 日期：人（①包名直裁·②③「由你裁定」代裁授权）/ 2026-10-20

## 5. 完成判据（可核验 + 穷尽）

- [x] `pnpm install` 成功·workspace 识第 3 个 lib 成员（7 projects·`+ @okee/mikro-adapter 0.0.0 <- libs/mikro-adapter`）
- [x] `pnpm run build:libs` 产出本包 `dist/{index,mikro-auth-adapter}.{js,d.ts}` + maps（SWC 2 文件·TSC 0 issues）
- [x] grep `mikro-auth-adapter` 相对 import 零残留
- [x] `pnpm run ci` 全绿（`Local CI PASSED`）·基线测试数不动（**672 passed · 31 skipped**·纯搬迁）·类型棘轮 148=基线（旧路径条目 5 → 新路径条目 5·净数不变）·openapi drift 零漂移·fallow 0 违规
- [x] `pnpm run test:auth-consistency`（真 PG·`BA_MIKRO_CONSISTENCY=1`）**9 passed EXIT=0**（authFlow 8 + 真行存照·契约搬家后仍绿）
- [x] `pnpm run verify:prod-boot` `/health` 200（编译产物真起服·运行时 `@okee/mikro-adapter` 子路径经 `node_modules`→`dist` 解析成立）
- [x] `docs/plans/README.md` 索引登记本 plan（状态单源同步）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.3.0 | 人验收并令提交+推送（与 options 第二参案合并单笔 B 案） | **结项**：提交 `6ab88da`（17 files·+377/−13·适配器搬迁 git 识为 rename 90%）推远端 main（a40645c..6ab88da），pre-push ci 再全绿；README 索引同步翻正「已完成」 |
| 2026-10-20 | 0.2.0 | 人裁①包名 `@okee/mikro-adapter` + ②③「由你裁定」（= 落位 libs + 开工 GO）→ 实施切片 A | **已实施（待人类验收）**：建 `libs/mikro-adapter`（package/nest-cli/tsconfig/build/src 镜像 libs/core）+ 根接线（`@okee/mikro-adapter` workspace 依赖 + `build:libs` 追加段 + 根/apps `tsconfig.paths`）+ 3 消费方改子路径 import + 删旧。**实施期实拓两个非预期约束**（均非适配器逻辑变更·回写 §2）：① nest SWC builder 按 `tsconfig.build.json` paths 将 import 重写为相对 src 路径致运行时 `ERR_MODULE_NOT_FOUND`（R-δ 同型）→ build paths **不加** `@okee`；② 根 tsconfig Node10 **不能裸解析**带 `exports` 的 workspace 包根（TS2307·无先例）→ 消费方改**子路径** `'@okee/mikro-adapter/mikro-auth-adapter'`（经 `typesVersions` 解析）。验收全绿：`ci` PASSED（基线 672/31skip 不动）·类型棘轮 update 后 148=基线·openapi 零漂移·fallow 0 违规·`test:auth-consistency` 9/9·`verify:prod-boot` 200。未发布/未搬实体/未改 schema/契约/宪法·可 git revert 回滚 |
| 2026-10-20 | 0.1.0 | 用户咨询「能否参考 drizzle-adapter 把自持 Mikro 适配器抽为独立包」→ Agent 取证确认适配器零 app 耦合、官方无 Mikro 适配、社区包缺 transaction/consumeOne/incrementOne；用户拍板「内部私有·不发布·命名 mikro-adapter」→ 依「无已审方案不写码」起草 | 首版（**零代码·只提议**）：范围只圈适配器本体（明确不搬 entities/orm 防双 SSOT 与 blast radius 爆炸）；切片 A 建包骨架（镜像 libs/core 构建形态）+ 根三处接线（deps/build:libs/tsconfig paths·workspace glob 无需改）+ 3 处消费 import 改写 + 删旧文件；验收以 build:libs + ci 基线不动 + 一致性套件 EXIT=0 + verify:prod-boot 为准；三项归人裁点（包名 scoped vs 裸·落位 libs 确认·开工签核·触构建链高危邻接）留审计 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.3.0 变更，以当前正文内容为准。
