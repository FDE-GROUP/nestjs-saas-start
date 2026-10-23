# global-tenant-isolation-vocabulary · 消灭 tenant 裸词暗号·机制层三分 + 业务遗留清扫

> 适用范围: `全局`（blast radius = 宪法措辞 + schema 迁移 + 501 处符号 + 55 处错误码引用）
> 关联: `global-organization-vocabulary-pivot`（本案承接·补其范围外遗留 + 修订裁决③） · `specs/architecture`±zh 四命题②
> 性质: 续案（前案已落地 A–E + dev 落库·本案承接 3 处已确认遗留并裁决机制层终态命名）
> 状态**不在此**: 审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

### 1.1 前案遗留（已确认·需补修）

前案 `global-organization-vocabulary-pivot`（切片 A–E · 2026-10-23 落地完毕）确立「业务实体全栈统一 organization」，但留下三处经取证确认的残留：

| # | 残留 | 性质 | 根因 |
|---|------|------|------|
| R1 | `tenant_subscription` 表 + `TenantSubscription` 实体 + 列 `tenantId`（FK→Organization·存 org id） | 业务 pivot 遗漏 | 前案 §2.1 只枚举了 `tenants`→`organizations` 上下文 + RBAC 三表；subscriptions 上下文未入范围 |
| R2 | openapi.yaml 41 处小写 "tenant"（控制器 `summary`/`description` 文案） | wire 文案清扫不完整 | 切片 D 按大写 `Tenant ` 模式清，漏了小写词 |
| R3 | 机制层 `Tenant*` 裸词（`TenantScopeGuard`/`TenantContext`/`TENANCY_*` 等）在前案裁定③下保留——但 pivot 后 "tenant" 不再指称任何业务实体，成为**需要外部知识才能破译的暗号** | 命名理念反思 | 裁决③允许「机制层保留 tenant 词面」，但未预见到完全 pivot 后裸 tenant 会失去指称锚 |

### 1.2 目标

- **消灭 tenant 裸词暗号**：全仓 `Tenant` 不再作为独立名词出现（只允许在复合词 `TenantIsolation`/`tenant-isolation` 中出现，保留行业可发现性）。
- **补修 R1/R2**：业务面 tenant→organization 到位。
- **修订裁决③**：由「保留 tenant 词面」→「机制层用 **tenant isolation** 复合词 + CASL 词汇归 **authorization** + 生命周期错误码归 **ORG/ROLE/GRANT**」。

### 1.3 非目标

- 不动 Better Auth 契约面/表列（BA 侧 `tenant` 概念属其内部实现·不波及本仓用户面）。
- 不改外部文档 `multi-tenancy` 业界术语描述（四命题② 原文合法保留）。
- 不改 `openapi.yaml` 路径 slug（已由前案 pivot 为 `/organizations`）。

## 2. 方案——三分命名映射

### 2.1 判据（沿用前案·精化）

> 名字指称**业务实体** → `organization`；
> 指称**隔离围隔机制** → `tenant isolation` 复合词；
> 指称**授权裁决词汇** → `authorization`/`permission`；
> 指称**生命周期/操作失败** → `ORG_*`/`ROLE_*`/`GRANT_*` 按具体语义。

### 2.2 区域 A · Tenant Isolation（真·隔离机制·围隔边界）

| 现名 | 终态名 | 备注 |
|------|--------|------|
| `tenancy/` 目录（libs/core + apps/api） | `tenant-isolation/` | 模块路径·行业标准复合词 |
| `tenancy.module.ts` | `tenant-isolation.module.ts` | |
| `TenantScopeGuard` | `TenantIsolationGuard` | 做行级注入隔离 |
| `tenant-scope.guard.ts` | `tenant-isolation.guard.ts` | |
| `TenantIsolationScope` (interface) | `TenantContext`→`TenantIsolationScope`·字段 `tenantId`→`organizationId` | 存 ALS 的隔离范围·字段名诚实反映值语义 |
| `tenant-context.ts` | `tenant-isolation-scope.ts` | |
| `tenantStorage` (ALS) | `tenantIsolationStorage` | |
| `TenantContextService` | `TenantIsolationService` | 43 处引用·最大单符号 |
| `requireTenantId()` | `requireActiveOrganizationId()` | 返回活跃 org id·裁ⓐ直取语义 |
| `TenantMiddleware` | `TenantIsolationMiddleware` | |
| `@TenantExempt` / `IS_TENANT_EXEMPT_KEY` | `@TenantIsolationExempt` / `IS_TENANT_ISOLATION_EXEMPT_KEY` | |
| `TENANCY_NO_ACTIVE_CONTEXT` | `ISOLATION_NO_ACTIVE_CONTEXT` | 唯一真正隔离机制码 |
| `'Missing active tenant context'` (message) | `'Missing active organization context'` | 与裁ⓐ `requireActiveOrganizationId` 对齐 |

### 2.3 区域 B · Authorization（CASL 判定词汇 + Permission）

| 现名 | 终态名 | 备注 |
|------|--------|------|
| `tenant-rules.ts` | `authorization-rules.ts` | |
| `TenantSubject` / `TENANT_SUBJECT_VALUES` | `AuthorizationSubject` / `AUTHORIZATION_SUBJECT_VALUES` | CASL 判定键 |
| `TenantAction` / `TENANT_ACTION_VALUES` | `AuthorizationAction` / `AUTHORIZATION_ACTION_VALUES` | |
| `TenantPermissionGuard` | `AuthorizationGuard` | 权限路由守卫·裁ⓑ |
| `tenant-permission.guard.ts` | `authorization.guard.ts` | |
| `TenantPermissionChecker` | `PermissionChecker` | port 接口·模块路径已含 authorization |
| `TenantPermissionInvalidator` | `PermissionInvalidator` | |
| `CaslTenantPermissionChecker` | `CaslPermissionChecker` | 实现类 |
| `TENANT_PERMISSION_CHECKER` (DI token) | `PERMISSION_CHECKER` | |
| `TENANT_PERMISSION_INVALIDATOR` (DI token) | `PERMISSION_INVALIDATOR` | |
| `invalidateTenant(orgId)` | `invalidate(orgId)` | 方法已在 permission 语境·无需重复 |
| `TenantPermissionCheck` | `PermissionCheckInput` | 方法入参 interface |
| `TenantListPredicate*` | `PermissionListPredicate*` | 行级谓词 |
| `TenantCaslAbility` / `TenantAbility` | `CaslScopedAbility` / `ScopedAbility` | |
| `TenantAbilityGrant` | `ScopedAbilityGrant` | |
| `@Can(action: TenantAction, subject: TenantSubject)` | `@Can(action: AuthorizationAction, subject: AuthorizationSubject)` | 装饰器签名 |

### 2.4 区域 C · 错误码族拆分（TENANCY_* → 按语义归位）

现 17 个码全用 `TENANCY_` 前缀，按实际语义重归：

| 原码 | 新码 | 语义归属 |
|------|------|----------|
| `TENANCY_NOT_FOUND` | `ORG_NOT_FOUND` | 组织生命周期 |
| `TENANCY_NOT_PENDING` | `ORG_NOT_PENDING` | |
| `TENANCY_NOT_DELETED_TERMINAL` | `ORG_NOT_DELETED_TERMINAL` | |
| `TENANCY_ILLEGAL_TRANSITION` | `ORG_ILLEGAL_TRANSITION` | |
| `TENANCY_APPLICATION_NOT_FOUND` | `ORG_PROVISIONING_NOT_FOUND` | |
| `TENANCY_PROVIDER_REJECTED` | `ORG_PROVISIONING_REJECTED` | |
| `TENANCY_OPERATOR_NOT_CONFIGURED` | `ORG_OPERATOR_NOT_CONFIGURED` | 平台治理 |
| `TENANCY_OPERATOR_ONLY` | `ORG_OPERATOR_ONLY` | |
| `TENANCY_PERMISSION_DENIED` | `AUTHZ_PERMISSION_DENIED` | 授权裁决 |
| `TENANCY_ROLE_DUPLICATE` | `ROLE_DUPLICATE` | RBAC |
| `TENANCY_ROLE_INVALID_KEY` | `ROLE_INVALID_KEY` | |
| `TENANCY_ROLE_NOT_FOUND` | `ROLE_NOT_FOUND` | |
| `TENANCY_ROLE_SYSTEM_PROTECTED` | `ROLE_SYSTEM_PROTECTED` | |
| `TENANCY_GRANT_DUPLICATE` | `GRANT_DUPLICATE` | |
| `TENANCY_GRANT_NOT_FOUND` | `GRANT_NOT_FOUND` | |
| `TENANCY_GRANT_INVALID_CONDITIONS` | `GRANT_INVALID_CONDITIONS` | |
| `TENANCY_NO_ACTIVE_CONTEXT` | `ISOLATION_NO_ACTIVE_CONTEXT` | 隔离机制（见 2.2） |

### 2.5 区域 D · 业务遗漏补修 R1（tenant_subscription）

| 现名 | 终态名 |
|------|--------|
| `tenant_subscription` 表 | `organization_subscription` |
| `TenantSubscription` entity class + interface | `OrganizationSubscription` |
| `TENANT_SUBSCRIPTION_META` | `ORGANIZATION_SUBSCRIPTION_META` |
| `tenantSubscription` (table-ownership key) | `organizationSubscription` |
| 列 `tenantId`（FK→Organization） | `organizationId` |
| 索引 `tenant_subscription_tenant_status_idx` 等 | `organization_subscription_org_status_idx` 等 |
| `TenantSubscriptionView` | `OrganizationSubscriptionView` |
| 文件 `tenant-subscription.entity.ts` | `organization-subscription.entity.ts` |
| `tenant-status-subscription-link.handler.ts` | `org-status-subscription-link.handler.ts` |
| `bootstrap-tenant-subscription-streams` 相关 | `bootstrap-organization-subscription-streams` |

> 事件面裁决：`eventType` 值（`tenant.status.transitioned`）、`aggregateType`（`'tenant'`）属存量事件行·**本片不动**（沿用前案裁决）。仅 TS 类/接口/字段名 pivot。

### 2.6 区域 E · openapi 文案补修 R2

前案切片 D 按 `Tenant ` 大写清扫；本次补清**小写** `tenant` 共 41 处：

- 业务义（改 organization）：`"List all tenants"`→`"List all organizations"`、`"Apply to create a tenant"`→`"…organization"`、`"Soft-delete a tenant"`→`"…organization"`、`"Per-tenant diagnostics"`→`"Per-organization diagnostics"`、`"tenant data export"`→`"organization data export"`、`"tenant-owned data"`→`"organization-owned data"` 等。
- 机制义（改 tenant isolation 或保留·视 2.2 终态）：`"the active tenant"`→`"the active isolation scope"` 或 `"the active tenant context"`；`"No active tenant context"`→与区域 A 错误码 message 对齐 `"No active tenant isolation context"`。

> 具体逐条判定在实施切片中按 grep 行号逐一裁决，本提案只定规则。

## 3. 实施切片

每片过 `pnpm run ci`，逐片提交（前案经验：改标识符后 biome import-sort 需 `--write`）。

| 切片 | 内容 | 门禁/风险 | 预估改动量 |
|------|------|-----------|-----------|
| **A · 业务遗漏 (R1)** | tenant_subscription 全 pivot + 保数据 RENAME 迁移 + entity-column-law + table-ownership + 列律测 + openapi/contracts + gated e2e 同步 + **落库亲签** | **高危#1 schema** | ~88 refs / 25 files / 1 migration |
| **B · wire 文案 (R2)** | 控制器 summary/description 小写 tenant→organization/isolation·openapi 重导出·api-client 再生 | 中危（wire 文案·不破坏结构） | 41 strings / ~10 controllers |
| **C · 隔离机制 (区域 A)** | tenancy/→tenant-isolation/ 目录改名 + guard/context/service/middleware/exempt 符号 pivot + 全仓引用 + ALS + 错误码 ISOLATION_* 唯一一条·DI 集成测·矩阵测·e2e | **高危（跨全栈·改基础设施）** | ~120 refs + 2 目录 mv + 测试 |
| **D · 授权词汇 (区域 B)** | authorization-rules/port/guard/checker/subject/action/permission 符号全改·DI token·CaslScopedAbility·前端 rbac-matrix | **高危（授权契约·跨包）** | ~141 refs + 文件改名 |
| **E · 错误码族 (区域 C)** | `ERROR_CODES` enum 改名（17→分族）·全仓引用·i18n 无涉及（码值属 wire·前端按码字符串 switch） | 中危（值改变·wire 可见） | 55 refs |
| **F · 文档同步 + 终验** | specs/architecture±zh 四命题②注（tenant isolation 复合词承载·multi-tenancy 合法保留）· AGENTS.md §5 目录地图同步·plan README 翻账·ci:db + verify:prod-boot·守恒断言对拍 | **高危#5 宪法** | doc + verify |

**切片顺序**：A → B → C → D → E → F。A/B 低风险先行·建立信心；C/D/E 为核心机制面·体量最大；F 收束验证。

## 4. 影响面与风险

- **blast radius**：501 Tenant* + 55 TENANCY_ + 22 requireTenantId = ~580 处（跨 apps/api + libs/core + libs/contracts + apps/web + scripts + openapi + docs/stories）。
- **可逆性**：全为符号改名 + RENAME 迁移（数据保）·无删除·可 RENAME 回退。
- **高危清单命中**：#1 schema 迁移（A）·#5 宪法改写（F）·#2 DI token（C/D）·门禁不动（F 仅同步文档）。
- **回滚策略**：逐片独立 revert；schema RENAME 可反向 ALTER TABLE RENAME。
- **恒等闸联动**：type-escape-baseline（路径 key 改）、stories-drift（符号实存）、table-ownership.guard、domain-layout、GATED_E2E_FILES（测试文件名）、vocab-parity、i18n-key-parity。
- **openapi 对拍**：C/D/E 切片后路径/slug 不变·summary/description/schema title 变 → openapi:drift 闸须重导。

## 5. 完成判据（终验·逐片累积）

- [ ] `grep -rP '\bTenant(?!Isolation|Subscription)'` apps/api/src libs apps/web/src（TS/TSX·非测试·非历史注释）**零结果**
- [ ] `grep -r 'TENANCY_'` 全仓 **零结果**
- [ ] `grep -r 'requireTenantId\b'` 全仓 **零结果**
- [ ] `grep -r 'TenantContext\b\|TenantContextService\|TenantScopeGuard\|TenantMiddleware\|TenantExempt\b'` **零结果**
- [ ] `grep -r 'TenantSubject\|TenantAction\|TenantPermission'` **零结果**
- [ ] `pnpm run ci` 全绿（860+ tests）
- [ ] `pnpm run ci:db`（Testcontainers·gated e2e 全链 + BA 一致性）全绿
- [ ] `pnpm run verify:prod-boot` /health 200
- [ ] `openapi.yaml` `grep -c 'tenant'` 零结果（不区分大小写·排除 `tenant-isolation`）
- [ ] dev 真库落库（RENAME 迁移 Applied + 实查表名 = `organization_subscription`）
- [ ] README 索引翻账

## 6. 审计记录

> 无已审方案不写码。本案全局·不可逆（含 schema 落库）·高危#1+#5 须人亲签。

 结论：（待人正式 GO 签发·四裁点已定·见下）
- 裁定结果（2026-10-23 人裁）：
  - ⓐ `requireTenantId()` → **`requireActiveOrganizationId()`**（诚实·它返回的就是活跃组织 id）；ALS 字段同步 `tenantId→organizationId`
  - ⓑ `TenantPermissionGuard` → **`AuthorizationGuard`**
  - ⓒ 错误码值变（`TENANCY_NOT_FOUND→ORG_NOT_FOUND` 等）→ **前后端同步改·不走过渡兼容**（同片内 web 一起动）
  - ⓓ `@TenantExempt` → **`@TenantIsolationExempt`**（全称·接受 23 字符·不用缩写备选）
- 审计人 / 日期：（待填）

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-23 | 0.1.0 | 起草 | 首版·承接前案遗留 + 用户裁「机制层用 tenant isolation 复合词」·三分映射 |
| 2026-10-23 | 0.2.0 | 四裁点定案 | ⓐ requireActiveOrganizationId·ⓑ AuthorizationGuard·ⓒ 前后端同步无过渡·ⓓ @TenantIsolationExempt 全称 |

---

<!-- 变更戳 -->
正文已于 2026-10-23 / v0.2.0 变更，以当前正文内容为准。
