# mikro-adapter 暴露 options 第二参：对齐官方 drizzle/mongo 适配器工厂签名

> 适用范围: `模块(libs/mikro-adapter 适配器本体公共签名)` ← blast radius：仅改私有包 `mikro-auth-adapter.ts` 函数签名 + `index.ts` barrel 导出（**纯增量·向后兼容**）
> 关联: `module-mikro-adapter-package-extraction`（抽包基线·本案是其后续增强）· 官方指南 https://better-auth.com/docs/guides/create-a-db-adapter · 官方 `drizzleAdapter(db, config?)` / `mongoAdapter(client, config?)` 形态
> 性质: 增量增强（非重写·零行为变更默认路径·不触碰 CRUD/transaction/consumeOne/incrementOne 逻辑）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**背景**：抽包完成后，对 `@okee/mikro-adapter` 逐条对标官方 `createAdapterFactory` 指南 + 官方 drizzle/mongo 适配器包，得出**唯一非测试面差距**：官方适配器工厂均接第二参 options（`drizzleAdapter(db, config?)`、`mongoAdapter(client, config?)`），把 `debugLogs` / `usePlural` 等 `config` 项透传给用户；本包 `mikroAuthAdapter(orm)` **无第二参**，`debugLogs` / `usePlural` 一律由内部 `config` 硬编码（实际依赖 factory 默认 `false`）。

**取证（实机·`node_modules` 直查 better-auth@1.7.7）**：
- `type DBAdapterDebugLogOption = boolean | { create?, update?, updateMany?, findOne?, findMany?, delete?, deleteMany?, consumeOne?, incrementOne?, count? }` —— 从 `@better-auth/core/db/adapter` 导出，经 `better-auth/adapters` `export *` 再导出（可 `import type` 值空间无涉）。
- `interface DBAdapterFactoryConfig` 实存字段：`usePlural?: boolean`（默认 false）、`debugLogs?: DBAdapterDebugLogOption`（默认 false）——二者皆为合法 `createAdapterFactory({ config })` 入参。

**目标**：给 `mikroAuthAdapter` 加**可选第二参**，透传 `debugLogs` / `usePlural` 至 `config`，向官方 drizzle/mongo 工厂签名对齐，**默认路径行为零变更**。

**非目标（明确划界）**：
- **不改任何 CRUD / `transaction` / `consumeOne` / `incrementOne` / `createSchema` 逻辑**（只增签名与 config 透传）。
- **不改 3 处消费方**（`mikro-orm.service.ts` / `seed.ts` / `consistency.spec.ts` 均传 `(orm)` 单参，新参可选 → 无需改动、向后兼容）。
- **不补齐官方 Normal CRUD 测试套件**（对标差距②，本案不涉，留独立决策）。
- **不改 schema / 迁移 / `docs/specs` / 公共契约 / 构建链**；**不发布**。

## 2. 方案

单一切片（纯增量·向后兼容）：

### 切片 A —— 加 options 第二参 + 透传 config

**A-1 定义 options 接口 + 扩签名（`libs/mikro-adapter/src/mikro-auth-adapter.ts`）**
- import 追加 `type DBAdapterDebugLogOption`：
  ```ts
  import { type CleanedWhere, type DBAdapterDebugLogOption, createAdapterFactory } from 'better-auth/adapters';
  ```
- 新增导出接口（贴官方 `CustomAdapterConfig` 范式）：
  ```ts
  /** 对齐官方 drizzle/mongo 适配器工厂第二参（透传 createAdapterFactory config 的用户可调项）。 */
  export interface MikroAuthAdapterOptions {
    /** 逐方法调试日志（bool 或方法选择对象·官方 debugLogs·默认关）。 */
    debugLogs?: DBAdapterDebugLogOption;
    /** 表名是否复数（本仓 BA 表名单数·默认 false·对齐官方 usePlural）。 */
    usePlural?: boolean;
  }
  ```
- 工厂签名扩为可选第二参（默认 `{}` → 与现硬编码行为等价）：
  ```ts
  export function mikroAuthAdapter(orm: MikroORM, options: MikroAuthAdapterOptions = {}) {
    const { adapter, config } = buildAdapterContract(orm, options);
    return createAdapterFactory({ adapter, config });
  }
  ```

**A-2 透传 config（`buildAdapterContract`）**
- 签名 `buildAdapterContract(orm: MikroORM, options: MikroAuthAdapterOptions)`。
- `config` 对象追加两字段（保持其余标志位与 `transaction` 原样不动）：
  ```ts
  const config = {
    adapterId: 'mikro-orm',
    adapterName: 'mikro-orm',
    usePlural: options.usePlural ?? false,
    debugLogs: options.debugLogs ?? false,
    supportsDates: false,
    // ...其余原样
  };
  ```
  - ⚠ `usePlural ?? false` / `debugLogs ?? false` 与「现 config 无此键→factory 默认 false」**逐位等价**，故单参调用零行为变更（向后兼容实锤点）。

**A-3 barrel 导出（`libs/mikro-adapter/src/index.ts`）**
- 追加类型导出（供消费者按包根引型·子路径亦可）：
  ```ts
  export { mikroAuthAdapter, type MikroAuthAdapterOptions } from './mikro-auth-adapter';
  ```

- **完成判据**：
  1. `pnpm run build:libs` 产出 `mikro-auth-adapter.d.ts` 含新可选第二参 + `MikroAuthAdapterOptions`，TSC 0 issues；
  2. 3 处消费方**不改**仍编译通过（向后兼容验证）；
  3. `pnpm run ci` 全绿，测试基线**不动**（纯增量·无新增/删除用例）；类型棘轮**不上抬**（新增为强类型透传·无 `as any`·应仍 148=基线）；openapi 零漂移；fallow 0 违规；
  4. `pnpm run test:auth-consistency`（env-gated 真 PG）EXIT=0——证明签名扩展后适配器仍满足官方 authFlow 契约；
  5. `pnpm run verify:prod-boot` `/health` 200。

## 3. 影响面与风险

- **blast radius**：低。改 1 私有包文件签名 + `config` 两透传字段 + barrel 一行；不改逻辑、不改消费方、不触构建链/schema/契约/宪法。
- **可逆性**：可逆（git revert 即回滚）。
- **风险登记**：
  - R-1 向后兼容：新参**可选 + 默认 `{}`**，且 `?? false` 与 factory 默认同值 → 单参调用路径**逐位不变**（非仅「大概率不变」，是显式等价）。
  - R-2 类型导入：`DBAdapterDebugLogOption` 系纯类型（`import type` 语义），无 DI/运行时值擦除风险（tooling R-η 合规）。
  - R-3 `usePlural` 语义：本仓 BA 表名单数（consistency 套件 `count('user'/'account'/'session')` 实锤），默认 false 与实际一致；若未来启用复数需同步表名——本案不涉，仅透传能力就位。
  - R-4 debugLogs 噪音：`debugLogs:true` 会在 adapter 各方法打日志；默认关，消费方按需开，本阶段不主动在任何调用点点开。

## 4. 审计记录

> 无已审方案不写码。本切片**不在高危清单**（未触 schema 迁移/门禁·CI/宪法/公共契约/.env），属私有包内部签名增强，但审计门**强制**（即便单人）。

- **归人裁点（开工前须定）→ 已人裁（2026-10-20·用户令「GO」）**：
  - **① 开工**：**GO**（用户直签·方向另见于对标选项「加 options 第二参（差异1）」）。
  - **② options 覆盖面**：按 Agent 建议确认 = **仅 `debugLogs` + `usePlural`** 两项；`transaction` 保持内部强制实现不开放关闭（数据一致性优先）。
- 结论：**已审计·GO→已实施·已结项（人验收·提交推送 `6ab88da`）**
- 未决项：无。
- 审计人 / 日期：人（GO 直签·覆盖面按建议）/ 2026-10-20

## 5. 完成判据（可核验 + 穷尽）

- [x] `pnpm run build:libs` 产出新第二参类型 + `MikroAuthAdapterOptions`·TSC 0 issues（`dist/mikro-auth-adapter.d.ts` 实存 `options?: MikroAuthAdapterOptions` + 接口声明）
- [x] 3 消费方**零改动**仍编译（向后兼容实锤：ci 内 build:nest 未改任一消费方即通过）
- [x] `pnpm run ci` 全绿（`Local CI PASSED`）·基线测试数不动（672 passed · 31 skipped）·类型棘轮不上抬（148=基线）·openapi 零漂移·fallow 0 违规
- [x] `pnpm run test:auth-consistency`（真 PG）**9 passed EXIT=0**（签名扩展后仍满足官方 authFlow 契约）
- [x] `pnpm run verify:prod-boot` `/health` 200

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.3.0 | 人验收并令提交+推送（与抽包案合并单笔 B 案） | **结项**：入提交 `6ab88da`（17 files·+377/−13）推远端 main（a40645c..6ab88da），pre-push ci 再全绿；README 索引同步翻正「已完成」 |
| 2026-10-20 | 0.2.0 | 用户令「GO」（覆盖面按建议）→ 实施切片 A | **已实施（待人类验收）**：`mikroAuthAdapter(orm, options?)` 第二参落地（新导出 `MikroAuthAdapterOptions`：`debugLogs`/`usePlural`）·`config` 透传 `?? false` 两项·barrel 补类型导出·CRUD/transaction 逻辑零变更·3 消费方零改动。验收全绿：build:libs 出参类型·ci PASSED（672/31skip 不动·棘轮 148=基线·openapi 零漂移·fallow 0）·`test:auth-consistency` 9/9 真 PG·`verify:prod-boot` 200。可逆（git revert） |
| 2026-10-20 | 0.1.0 | 抽包完成后对标官方 createAdapterFactory 指南 + drizzle/mongo 包，识出唯一非测试面差距（工厂不接第二参 options）→ 用户选定「加 options 第二参」→ 依「无已审方案不写码」起草 | 首版（**零代码·只提议**）：`mikroAuthAdapter(orm, options?)` 加可选第二参，透传 `debugLogs`/`usePlural` 至 config；默认 `{}` + `?? false` 保证单参路径逐位向后兼容；不改 CRUD/transaction 逻辑、不改 3 消费方、不补 Normal 套件、不触构建链/schema/契约/宪法·不发。取证坐实 DBAdapterDebugLogOption/usePlural/debugLogs 均 better-auth@1.7.7 官方导出实存 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.3.0 变更，以当前正文内容为准。
