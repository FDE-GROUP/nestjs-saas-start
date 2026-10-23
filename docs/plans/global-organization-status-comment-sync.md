# 治理态注释散文归位（`tenant.status` → `organization.status`）

> 适用范围: `全局`（libs/core + apps/api 代码注释散文·零逻辑变更）
> 关联: `global-governance-lifecycle-consolidation`（被其切片 B 翻案而未同步的下游散文）· `global-tenant-residual-cleanup`（明确把「注释散文」排除在范围外留下的覆盖缺口）
> 性质: 订正型（注释同步·单切片）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与取证

`global-governance-lifecycle-consolidation`（人裁 2026-10-23·反悔 reclamation 旁表裁定）已把租户治理
生命周期态从自有 `tenant` 旁表归位 **BA 共享表 `organization` 上的自撰域列 `status`**（实体见
`apps/api/src/modules/organizations/infrastructure/entities/ba-org.entities.ts`·物理列即属性名
`status`·`organization_status_check` 表级 CHECK·旁表随本案 DROP）。specs/glossary/plans 均已同步，
但**代码注释散文落后了一代决策**——residual-cleanup 当时把「192 文件注释散文」明确排除在范围外，
stories-drift 闸亦不覆盖代码注释，形成真实覆盖缺口（外部独立评价亦实测命中此条）。

逐处实扫坐实（改前基线·`grep -rn 'tenant\.status' libs apps --include='*.ts'` 排除 dist/test）：

| # | 文件 | 失实散文 | 失实类型 |
|---|------|----------|----------|
| 1 | `libs/core/src/modules/organizations/lifecycle/organization-lifecycle.ts` 头注 | 「状态存自有 **`tenant.status` 真列**（reclamation 切片 B）」 | 现态描述·已 DROP |
| 2 | `libs/core/src/modules/organizations/lifecycle/events/organization-status-transitioned.event.ts` 头注 | 「shadow append·`tenant.status` 真列仍是唯一真相源」 | 现态描述·直接失实 |
| 3 | `apps/api/src/modules/organizations/domain/repositories/organization-governance.repository.ts` port 头注 | 「户籍表 `tenant.status` 单点」 | 现态描述 |
| 4 | 同文件 `OrganizationDataExport` 头注 | 「收权案切片 B：态在 `tenant.status` 真列」 | 引注的裁定已被反悔 |
| 5 | 同文件 `status` 字段注 | 「生命周期态（`tenant.status` 真列·无户籍兑底 active）」 | 现态描述 |
| 6 | `apps/api/src/modules/platform/api/platform-organizations.controller.ts` 头注（EN） | 「single choke-point on the `tenant.status` column」 | 现态描述 |
| 7 | `apps/api/src/modules/auth/infrastructure/auth.implement.ts` org 插件注 | 「强制户籍行 tenant.status=pending_approval」 | 现态描述·旁表已不存在 |
| 8 | `apps/api/src/database/mikro/column-meta.ts` `checks` 字段注 | 括号现态半句「`tenant.status` 值域 DB 防线」（「reclamation 首用」史实半句合法保留） | 现态半句失实 |

**v0.2 扩段（实施窗内复扫新发现·同属用户「等…统一改回」指令范围）**：以「户籍」为关键词复扫
非迁移件代码注释，另命中 9 段现态断言（旁表已 DROP 仍说现存）——

| # | 文件 | 处置 |
|---|------|------|
| 9 | `organization-lifecycle.ts` isBlocked/TRANSITIONS 两处「无户籍」 | → 「无状态记录」（一处加「旧无户籍行」历史框定） |
| 10 | `organization-status.service.ts` read/isBlocked/transition 三处 | → 「本体行无记录/无状态记录/写回 `organization.status` 真列」 |
| 11 | `events/organization-bootstrapped.event.ts` 两处「户籍表」 | **保留历史语义加注**（R1b bootstrap 读的是成流当时旁表快照·旁表现已 DROP——改现状名反造新失实） |
| 12 | `suspend-organization.command-handler.ts` / `approve-organization.command-handler.ts` 各一处「`tenant` 户籍表单点/统一写回」 | → `organization.status` 真列 |
| 13 | `organization-provisioning.repository.ts` 两处 | 现态归位 + 演变链（寄居→旁表→真列）存注 |
| 14 | `seed.ts` ensureActiveOrganization 注「无户籍行」 | → 「直落列默认 `active`」+ 演变链存注 |

**保留不动（完整历史框定·append-only 史实豁免）**：三个迁移工件文件
（`Migration20261020075700_backfill_*` / `Migration20261023093000_*` / `Migration20261023100000_*`）与
`ba-org.entities.ts:33`（已带「归位」现态从句）。

## 2. 方案（单切片·纯注释）

上表 8 处散文统一改回当前真相：**态在 `organization.status` 真列**（consolidation 切片 B·BA 共享表
additive 自撰域列）。改法纪律：

- 「已被反悔的**历史裁定**」以**历史归属**措辞保留（如「原 reclamation 切片 B 定 tenant.status·已被
  consolidation 归位」），**不得抹除演变史**（append-only 史实豁免仍守）；现态一律说 `organization.status`。
- 「户籍 / 户籍表 / 户籍行」措辞系旁表时代暗号残留，随本片段落改为「`organization.status` 真列」口径
  （仅限命中文件内的直接伴生措辞，不做全仓 192 文件注释清扫——维持 residual-cleanup 的排除边界）。

### 非目标（逐字冻结·不得改动）

- **wire 事件类型字符串** `'tenant.status.transitioned'`（及其镜像 `DOMAIN_EVENTS.organizationStatusTransitioned`
  值、`libs/contracts` 同名值、log 文案中对该事件名 `tenant.status.transitioned` 的指称）——residual-cleanup
  切片 C 已裁「wire 值逐字冻结」，本计划沿用；
- `AGGREGATE_TYPE = 'tenant'` 及其注释指称（同上冻结）；
- 历史框定完整、无现态断言的段落（如 `ba-org.entities.ts`「原 tenant.status 旁列归位」——已带归位
  现态从句，合法史实）；
- 注释散文全仓清扫（`租户` 叙述等·residual-cleanup 排除边界不动）；零逻辑 / 零 schema / 零命名符变更。

## 3. 验收判据

- [x] 8 处散文归位（v0.1）+ 9 段扩段归位/加注（v0.2）；grep 口径：非历史段（无「原/首用/当时/已归位/已 DROP/已被反悔」框定词）内 `tenant.status`
      真列/户籍表断言 = 0；
- [x] wire 面守恒：带引号字符串值 `'tenant.status.transitioned'` src 非 test 恰 2 处（contracts/domain-event-names）与改前基线逐字一致；模板字面量 log 文案（handler.ts）与注释内事件名指称（service:36/event:17/contracts:29）均未触；
- [x] `pnpm run check` 绿（改动 12 文件单独 biome check 零告警；全仓 1 info 为存量非本次文件）；
- [x] `pnpm run build` 绿（TSC 0 issues + SWC 211 files EXIT=0）；
- [ ] 索引表翻账（本 plan 行登记 → 实施后翻「待人类验收」）。

## 4. 风险与回滚

纯注释改动，`git revert` 单提交即回滚；不触任何守卫 / 门禁 / 契约文件。
