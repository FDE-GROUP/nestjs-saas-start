# 残留 tenant 暗号清扫 + 文档漂移对拍修复（global-tenant-residual-cleanup）

> 适用范围: `全局`（跨 libs/apps + docs/specs + 根 README）← 决定审计深度与授权粒度（`workflow.md` §3/§5）
> 关联: `specs/architecture`±zh 命题①豁免清单 · [`global-tenant-isolation-vocabulary`](./global-tenant-isolation-vocabulary.md)（前案·本案承接其收尾）· [`global-organization-vocabulary-pivot`](./global-organization-vocabulary-pivot.md) · [`domain-concepts.md`](../domain-concepts.md)
> 性质: 重写型（当前方案整体重写 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 0. 三分取证（事实 · 推断 · 未知）

本案由「前案 A–F 收官后仍有 tenant 残留」触发。全仓 grep 取证把残留分五类，**只有前两类进范围**：

| 层 | 内容 | 判定 | 本案处置 |
|---|---|---|---|
| **T1 真暗号·活符号** | `ensureTenantContext`（seed 导出函数·8 引用）；`libs/contracts/src/event/tenant-events.ts` 文件 + `tenant{Status,Rejected,Bootstrapped}PayloadSchema` 常量 + `tenant-event-contract.test.ts`；`DOMAIN_EVENTS` 的 **TS key** `tenant{StatusTransitioned,Rejected,Bootstrapped}`（7 引用）；`quota.guard.test.ts` 局部 `tenantContext()` 助手 | 代码内部命名·指向已存在的当前实体·非冻结契约 | **清扫**（切片 B/C） |
| **T2 冻结持久化值** | eventType 值 `'tenant.status.transitioned'`/`'tenant.rejected'`/`'tenant.bootstrapped'`；`aggregateType: 'tenant'`；`EVENT_TYPE_REGISTRY` 按 eventType 值索引；已落库 outbox/event 行 | 跨进程/持久化契约·replay/relay 依赖 | **不动**（前案裁点ⓒ「事件面字符串值不改写」沿袭） |
| **T3 复合机制名** | `TenantIsolationGuard/Service/Middleware/Scope/Storage/Exempt/Module` + `tenant-isolation/` | 前案定名的**行业可发现性**复合词 | **不动** |
| **T4 概念锚 + 历史档案** | 术语/注释中「租户≡组织」「multi-tenancy」概念词；退役符号史实注（`isTenantActive`/`replayTenantLifecycle`/`bootstrapTenantStreams` 等仅存于注释的过去描述）；stories v0.2.0 changelog | append-only·史实 | **不动** |
| **T5 叙述散文** | 192 个 `.ts` 的注释散文含 `tenant`；11 个 story 文件 `租户` ~109 处；`epic-02-tenant-onboarding.md` 文件名 | 高噪声/术语政策问题·`租户` 是术语表定义的合法中文概念词 | **默认排除**（见 §1 非目标） |

> **取证附带的真实缺陷**：`docs/domain-concepts.md`、`docs/specs/vision.md` L64、根 `README.md` L81/91/103/105 仍引用**已不存在的符号**（`tenancy/`、`TenantScopeGuard`、`TenantMiddleware`、`TenantContext`、`TenantPermissionGuard`、`requireTenantId`、ALS `tenantId`、`tenant_subscription.tenantId`、`tenant_role`、`TENANT_META`、`modules/tenants`）。这三份文档**不在** `verify:stories-drift` 覆盖内（该闸只扫 stories/），故前案 A–F 静默漏改——属**指向失效符号的文档漂移**，非叙述偏好，必修。

## 1. 背景与目标

**目标**：收官前案遗留——(a) 修掉指向已退役符号的文档漂移（domain-concepts / vision / README），(b) 清掉纯代码内部的 tenant 命名暗号（seed 函数 + 事件契约文件/符号 + DOMAIN_EVENTS TS key），把「tenant 存活面」收敛到前案宪法定死的**唯一两例**（复合机制名 + 业界术语 multi-tenancy + 冻结事件值）。

**非目标（显式排除）**：
- 不改事件面字符串值 / `aggregateType`（T2·破坏持久化契约）。
- 不改复合机制名 `TenantIsolation*` / `tenant-isolation/`（T3·前案定名）。
- 不做 192 文件注释散文全量替换、不扫 `租户` 叙述、不改 `epic-02-tenant-onboarding.md` 文件名（T5·高噪声/术语表认定 `租户` 为合法概念词·越界）。若日后要统一叙述，另案。
- 不动 append-only 历史档案（T4）。

## 2. 方案（垂直切片·可独立验证·逐片门禁）

- **切片 A（文档漂移对拍·非代码·触 docs/specs 高危#5）**
  - `docs/domain-concepts.md`：把失效符号指针订正为现名——`tenancy/`→`tenant-isolation/`、`TenantScopeGuard`→`TenantIsolationGuard`、`TenantMiddleware`→`TenantIsolationMiddleware`、`TenantContext.role`→`TenantIsolationScope.role`、`TenantPermissionGuard`→`AuthorizationGuard`、`requireTenantId`/ALS `tenantId`→`requireActiveOrganizationId`/`organizationId`、`tenant_subscription`→`organization_subscription`、`TENANT_META`→（随旁表退役已消·删该残句或改述）、`modules/tenants`→`modules/organizations`。**保留**「租户≡组织」概念叙述与 `tenant_role` 作 BA 表史称的处理（按现列律：`organization_role`——订正为现表名）。逐条人工核验、不做盲 sed。
  - `docs/specs/vision.md` L64：`tenancy/` 横切层→`tenant-isolation/`（与 architecture±zh 同步口径一致）。
  - 根 `README.md` L81/91/103/105：`tenancy/`→`tenant-isolation/`、`tenancy/authorization 契约`→`tenant-isolation/authorization 契约`、`modules/tenants`→`modules/organizations`。
  - **完成判据**：全仓 `TenantScopeGuard`/`TenantPermissionGuard`/`requireTenantId`/`` `tenancy/` ``/`TenantMiddleware`/`TenantContext`（作 ALS 符号）在非历史注释外**归零**；每处改动附「现符号实存」取证（grep 代码确认目标名存在）。

- **切片 B（seed 活符号·纯内部·低风险）**
  - `ensureTenantContext` → `ensureActiveOrganizationContext`（`apps/api/src/database/seed.ts` 定义 + `seed.ts` 内调用 + `seed.test.ts` 6 引用与两处 describe/注释）。
  - `quota.guard.test.ts` 局部 `tenantContext()` 助手 → `isolationContext()`（test-only）。
  - **完成判据**：`pnpm run ci` 全绿（含 seed 测）。

- **切片 C（事件契约内部命名·wire 值逐字冻结）**
  - `libs/contracts/src/event/tenant-events.ts` → `organization-events.ts`（`git mv`）；导出常量 `tenant{StatusTransitioned,Rejected,Bootstrapped}PayloadSchema` → `organization*PayloadSchema`（其派生 `type` 名已是 `Organization*EventPayload`·一并对齐）；`event/index.ts` barrel 改 `./organization-events`。
  - `apps/api/src/database/eventing/tenant-event-contract.test.ts` → `organization-event-contract.test.ts`（`git mv`·内含 3 常量引用同步）。
  - `DOMAIN_EVENTS` TS **key** `tenant{StatusTransitioned,Rejected,Bootstrapped}` → `organization*`；**value 字符串 `'tenant.status.transitioned'`/`'tenant.rejected'`/`'tenant.bootstrapped'` 与 `aggregateType:'tenant'` 一字不动**；`DOMAIN_EVENTS.organization*` 的 7 处引用同步。
  - **完成判据**：`pnpm run ci` 全绿 + `pnpm run ci:db` 重放全链 + `EVENT_TYPE_REGISTRY` 对拍测绿 + `organization-hard-delete.e2e` / `status-transitioned` 关联 gated e2e 绿（证明冻结值与重放未受 key 改名影响）。

- 宽面走 expand–contract 不必要（T1 面小·直改即可）。

## 3. 影响面与风险

- **blast radius**：切片 A 文档（3 文件·零代码）；切片 B seed（2 文件）；切片 C contracts + eventing + shared-kernel（约 6–8 文件·含 2 次 `git mv`）。
- **高危命中**：
  - 切片 A 改 `docs/specs/vision.md`（宪法）= **高危#5**（需人亲签·问责归签核人）。
  - 切片 C 改跨端契约文件/`DOMAIN_EVENTS` key = 触**契约面**（高危清单「改契约」），但**冻结 wire 值不动**→对持久化/前后端线协议零影响；`git mv` 保留历史；api-client/openapi 与事件码无耦合（事件面走 `DOMAIN_EVENTS`·非 openapi·`openapi.yaml` 现 tenant=0）。
  - 无 schema 迁移、无依赖增删、无门禁/CI/husky 改动。
- **可逆性**：全可逆（重命名 + 文档订正·逐片提交可回退）。
- **主要风险**：切片 C 若误改 eventType/aggregateType 字符串值 → 破坏 replay/registry。缓解：值零改动由 `ci:db` 重放 + 契约对拍测 + 守恒 grep（`'tenant.` 出现数改名前后恒等）三重锁。

## 4. 审计记录

> 无已审方案不写码。全局 / 触宪法与契约 → 人签核。

- 结论：**已审计·签发**（人「同意」2026-10-23＝整案 GO·三未决项按推荐裁定·含高危#5 宪法 vision + 契约面·问责归签核人）。
- 未决项（已裁定）：
  1. domain-concepts.md 的 `租户` 概念叙述**保留**·只修失效符号指针——认可。
  2. `DOMAIN_EVENTS` TS key 改名**纳入**（value 逐字冻结）——采纳。
  3. T5（192 文件注释散文 / `租户` 叙述 / `epic-02` 文件名）**排除**——确认。
- 审计人 / 日期：人（签核人）· 2026-10-23

## 5. 完成判据（可核验 + 穷尽）

- [x] 全仓指向失效符号（`TenantScopeGuard`/`TenantPermissionGuard`/`requireTenantId`/`TenantMiddleware`/`TenantContext`/`` `tenancy/` ``/`modules/tenants`）的**活引用**归零（历史注释除外·逐条取证）。【切片 A·domain-concepts/vision/README】
- [x] `ensureTenantContext`、`tenant-events.ts`、`DOMAIN_EVENTS.tenant*` key、`tenant-event-contract.test.ts` 更名落地·`git mv` 保历史。【切片 B `17cd959` + C `fbb398e`·rename 检测 66%/74%】
- [x] 事件面字符串值 `'tenant.*'`、`aggregateType:'tenant'` 改名前后**逐字恒等**（守恒 grep + 契约对拍）。【domain-event-names.ts 键 organization*而值仍 'tenant.*'·ORGANIZATION_EVENT_TYPES_WIRE 内联值未变·对拍测绿】
- [x] 复合机制名 `TenantIsolation*`、`tenant-isolation/`、multi-tenancy 概念词、append-only 史实注**未被波及**。
- [x] `pnpm run ci` 全绿 + `pnpm run ci:db` 真容器重放全链 + gated e2e + BA 一致绿 + `pnpm run verify:prod-boot` /health 200。【ci PASSED·863 测·ci:db 真容器一阶段绿】
- [x] 前案 plans/README 索引新增本案行（状态单源）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-23 | 0.1.0 | 起草 | 首版（五层取证 + 三切片 + 冻结值边界 + 高危#5/#契约标注） |
| 2026-10-23 | 0.2.0 | 人签发 | 「同意」整案 GO·三未决项按推荐裁定（叙述保留/key 纳入/T5 排除） |
| 2026-10-23 | 0.3.0 | 实施落地 | 切片 A `6d4ee7e`（文档漂移订正）·B `17cd959`（seed 活符号）·C `fbb398e`（事件契约内部命名·wire 值冻结）全绿·§5 判据逐项打勾 |

---

<!-- 变更戳 -->
正文已于 2026-10-23 / v0.3.0 变更（切片 A–C 全部落地·ci+ci:db 绿），以当前正文内容为准。
