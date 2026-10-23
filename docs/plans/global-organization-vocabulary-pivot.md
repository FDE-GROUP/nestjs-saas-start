# global-organization-vocabulary-pivot · 推翻双词汇命名纪律，业务实体全栈统一 organization

- 状态: 单源见 [README](./README.md) 索引（本案**已审计·签发**·人令 GO 2026-10-23·执行状态（切片 A–E）以 README 索引为准）
- 签核基础: 人类指令「（global-userfacing-tenant-naming 的双词汇纪律）这条纪律应该推翻，过时了」（2026-10-23），随后经 AskUserQuestion 三裁决：
  1. **统一词面 = organization 全词**（表名/符号/路由皆 organization，不用 org 缩写，不采 Lightdash 去前缀式）；
  2. **范围 = 全栈一次到位**（含 wire 面：路由 slug、OpenAPI 产物、前端联动）；
  3. **机制层保留 tenant/tenancy 词面**（`tenancy/` 边界层、`TenantScopeGuard`、CASL 判定键 `TenantPermission/TenantAction/TenantSubject`、`TenantExempt`、`requireTenantId`、`TenantContext`/ALS、`TENANCY_*` 错误码前缀——只废「业务实体叫 tenant」，不废「隔离机制叫 tenancy」）。
- 高危触面: 改 `docs/specs` 宪法四命题①措辞（以本次人裁为凭）· schema 迁移（表改名，实施时另须逐次亲签）· wire 契约破坏性变更（已裁可破，前端同仓联动）· 门禁不动。

## 1. 背景与推翻对象

`global-userfacing-tenant-naming`（2026-10-23 人裁）确立「tenant=内部机制词 / organization=用户面词，1:1 两词表」，其「双词汇」条款后被写入宪法四命题①（`faafbc5`）。本案人类裁定该纪律**过时、推翻**：业务实体在全栈只叫 **organization**（与 BA 契约词、四命题「租户即组织」语义核心同源）；`tenant/tenancy` 仅存两个合法用途——**隔离机制层内部命名**（裁定③清单）与业界术语 **multi-tenancy** 的文档表述（四命题②原文不动）。

参照先例: Lightdash backend（CASL 同路生产系统）全栈 organization 单词汇零 tenant；其「grant 居 DB + 规则运行时投影」模式与本项目 D3 裁决同构（评价见会话记录，非本案依据）。

## 2. 边界裁决表（pivot 判据：名字指称「业务实体」→ pivot；指称「围隔机制」→ 留守）

### 2.1 Pivot（业务面改 organization）
- **DB 三表**: `tenant_role/tenant_role_grant/tenant_role_audit` → `organization_role/organization_role_grant/organization_role_audit`（含索引名 `tenant_role_org_key_idx` 等）；实体 `TenantRole*` 类与 `TENANT_ROLE_META` 同步。
- **上下文目录**: `apps/api/src/modules/tenants/` → `modules/organizations/`；文件内类/命令/查询/读模型：`SuspendTenantCommand/DeleteTenantCommand/ResumeTenantCommand/ExportTenantDataQuery/PlatformUser read-model 措辞/tenants.controller 等` → Organization* 系。
- **core 包**: `libs/core/src/modules/tenants/lifecycle/` → `modules/organizations/lifecycle/`（业务实体生命周期=业务词）；其 `tenant-lifecycle.ts` 及导出符号同步（P1 函数核件身份不变，仅更名）。
- **控制器/路由 slug（wire 破坏·已裁）**: `@Controller('tenants')` ×4 → `'organizations'`；`'tenants/roles'` → `'organizations/roles'`；`@ApiTags` 同步；`openapi.yaml` 重导出；前端 `apps/web` 路由 `/platform/tenants*` → `/platform/organizations*` + 300 处词面。
- **守卫豁免装饰器消费面**: `@TenantExempt` 本身属机制留守（裁定③），但其注释/文档中「租户」用户面措辞不在本案范围（已系组织）。
- **测试文件**: 随迁（`tenant-isolation.e2e.test.ts` 属机制层命名→留守；`platform-tenants` 类业务测试→更名）。
- **plans/docs 在文案名**: 不改历史案文（档案如实），只在 `global-userfacing-tenant-naming` 与四命题宣示处加 superseded 注。

### 2.2 留守（机制层，裁定③明文）
`apps/api/src/tenancy/` 目录及 `tenancy.module.ts`；`TenantScopeGuard`、`TenantPermission/TenantAction/TenantSubject`（CASL 判定键词汇）、`tenant-rules.ts`、`TenantExempt`、`requireTenantId`、`TenantContext`/ALS、内部变量 `tenantId`（非 wire）、`TENANCY_*` 错误码全族、i18n（实核无 tenant 键·无需动）。

### 2.3 宪法/文档同步（高危#5·以本次人裁为凭）
- `architecture.md ±zh` 四命题①改写：由「one business object, two vocabularies…map 1:1」→「业务实体唯一词汇 organization；tenant 仅存机制层内部命名与 multi-tenancy 业界术语」（②③④不动）。
- `docs/plans/global-userfacing-tenant-naming.md` 头部加 superseded-by-本案注（案文保留存档）。
- 两包目录树、§Layer-shape、§限界上下文地图中 `tenants` 上下文名 → `organizations`；偏移登记册 D 表如涉及上下文名同步。
- `verify-domain-layout.ts` 上下文清单同步（门禁随迁，不放松）。

## 3. 实施切片（每片过门禁，逐片提交）
- **A. 宪法+案文留痕**: §2.3 全量；`pnpm run check`（doc-only）。
- **B. core 包+DB 实体+authorization**: 2.1 core/三表实体更名；迁移工件——`mikro-migration-create` 对 rename 会生成 DROP+CREATE，须人工改写为 `ALTER TABLE ... RENAME`（+索引/约束名），dev 库以 `db:reset` 重建验证。**schema 迁移执行前另请亲签**。
- **C. apps/api 业务面**: modules/tenants→organizations 目录树、命令/查询/控制器/路由 slug、`verify-domain-layout` 同步；gated e2e 清单 `GATED_E2E_FILES` 登记同步（漏登即 fail-loud）。
- **D. wire+前端联动**: `openapi:export` 重导出、api-client 类型再生、`apps/web` 路由与词面 300 处；`openapi:drift` 闸绿。
- **E. 终验**: `pnpm run ci` 全链 + `verify:prod-boot` 真起服 + 残留 grep 断言：`apps/api/src/modules/organizations`、`libs/core` 内业务面零 `Tenant[A-Z]`（留守白名单除外）；`TENANCY_`、`tenancy/`、`TenantScopeGuard` 计数不变（机制面守恒断言）。

## 4. 判据（验收）
1. 业务面 grep：`organization_role` 表存在且 `tenant_role` 零残留；路由 slug 仅 `/organizations*`；openapi 产物 tenant 路径零。
2. 机制面守恒：§2.2 清单符号计数与本案前一致（防误改扩大化）。
3. 宪法：四命题①新措辞就位、②③④原文无损；userfacing-tenant-naming 案挂 superseded 注。
4. 门禁：`pnpm run ci` + `ci:db`（gated e2e 全链）绿；`openapi:drift` 绿；prod-boot `/health` 200。

## 5. 风险与未验证项
- MikroORM snapshot/迁移对 rename 的生成质量属**推断**（切片 B 实跑为准，人工改写 SQL 归人审）。
- `routeTree.gen.ts` 为生成物，须以 TanStack generator 再生而非手改（前端实跑取证）。
- 历史 plans/stories 中 tenant 词面**不回改**（档案如实），验收 grep 范围限定活代码 + specs。
