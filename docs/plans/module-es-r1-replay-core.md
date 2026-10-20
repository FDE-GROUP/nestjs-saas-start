# ES R1 回放核心：tenants 治理状态机「回放即真相」首试点（已审计 · R1a 已实现待验收 · R1b/R1c 各需高危另签）

> 适用范围: `libs/core saas-kit tenants/lifecycle · shared-kernel EventStore 端口 · apps/api database/eventing + tenants handlers · tenant 户籍表地位 · @saas/contracts 新增事件 payload 面` ← blast radius **大**（首个动写路径的 ES 片）；审计深度 = 人签核（高危#1：写路径切换 + 数据 bootstrap）
> 关联: 母案 [module-es-truth-source-amendment](./module-es-truth-source-amendment.md)（**已签发**·本案=其 §4 R1 细化；裁①乙/裁②甲+丙/裁③乙/裁④丙起步/裁⑤甲/裁⑥甲/首试点 A 为本案前提）· [event-sourcing-roadmap](./event-sourcing-roadmap.md) · [module-es-outbox-transactional](./module-es-outbox-transactional.md)（UoW/三态旋钮机制复用）· global-tenancy S4/S5（治理状态机）
> 性质: **实施细化案**（母案方向与六裁已归人；本案只裁"怎么落"·分三子片各自过门）
> **审计签发（2026-10-21）**：人同意=按案 GO——三子片框架/改锁清单/env 键位 `ES_TRUTH_SOURCE_TENANTS` 均签；R1a 授权开工（纯增量无高危）；**R1b（dev 库数据 backfill）/R1c（写路径切换）仍各需高危亲签另次放行**。
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 1. 现状取证（本轮实核·本案立论基础）

- **事件面（tenant 流）**：`tenant.status.transitioned`（approve/suspend/resume/delete 经 `TenantStatusService.transition` 单点·uow.run 内 publishAll）+ `tenant.rejected`（reject 硬删路径 handler 直发）。aggregateType 均 `'tenant'`。事件名 SSOT=`libs/core/.../domain-event-names.ts` 三键；类→名映射由 `eventing/event-type-registry.ts` 双向锁（漏登记=测红）。
- **EventStore 端口现貌**：仅 `append`（内部 `nextVersion` 自取·无 expectedVersion 参数）+ `deleteByAggregate`；**无 `load`**——回放读取语义零存在（与母案 §2 一致）。
- **真相源现状**：治理态读写链迁 `tenant` 户籍表真列（hard-delete 换轨片·`Migration20261020075523` + backfill）；`TENANT_STATUS_STORE` 端口 → `mikro-tenant-status.store` 直读直写表行。
- **写手清单**（apps/api tenants handlers·10 个）：tenant 流涉写 = approve / suspend / resume / delete（软删治理）/ reject（硬删）+ delete-permanently（PIPL 硬删·uow 内 `deleteByAggregate` + destroy）；submit-application 不产事件（org 创建期）；suspend/resume-user 属 user 流（**本案不动**·裁④丙起步：users PII 流不事件化）。
- **gated e2e**：`GATED_E2E_FILES` 现 10 文件（含 event-store.mikro / outbox-relay / tenant-table / tenant-hard-delete）；新增必须登记（恒等校验机制 fail-loud）。
- **迁移链**：`Migration20261020150833` 为尾。**本案预期零 DDL**（event 表/tenant 表列均已就位；投影降格是同表语义翻转不加列）。

## 2. 目标态（本试点「回放即真相」的可执行定义）

对 tenant 流：**event 表 = 唯一真相源**。① 任何治理写 = 同事务内 `append(事件, expectedVersion)` 成功即提交，`tenant` 表行由同一 UoW 内以「事件 fold 结果」同步刷投影（裁③乙·读己之写不变）；② 任何时点 `replay(tenant 流事件) fold ⇒ 投影行逐字段相等`（判据测）；③ 投影可全量重建（`rebuildProjection`·裁⑤甲同表）；④ env 旋钮回退窗保留 shadow 旧语义（可逆性·母案 §5）。简单 CRUD（含 user 流、sessions 等）依法不事件化（裁④丙·母案终态边界）。

## 3. 分片方案（三子片·各自独立 commit / 独立过审 / 可单片 revert·严禁混提）

### R1a 回放读侧 + 契约面（纯增量·不改任何写路径·无高危）
- `libs/core/shared-kernel/domain/event-store.port.ts`：+`load(aggregateType, aggregateId): Promise<DomainEvent[]>`（version 升序·反序列化经注册表）；+`append` 签名扩展 `expectedVersion?: number`（缺省不校验=现行为逐字节不变·向后兼容）。
- `libs/core/.../tenants/lifecycle/tenant-lifecycle-fold.ts`（**裁①乙**轻量溯源聚合·非 AggregateRoot 管道）：纯函数 `applyEvent(state, event) → state` + `replayTenantLifecycle(events)`（起点=bootstrap 快照事件·终态=治理态+slug/name 存在性）；复用既有 `canTransition` 语义校验。
- `apps/api/database/eventing/mikro-event-store.ts`：实现 `load`（EM find + 注册表反序列化）与 expectedVersion 冲突 fail-loud。
- **裁⑥甲契约面**：`libs/contracts/src/event/tenant-events.ts` 新增 payload zod（tenant 流两类 + 新 `tenant.bootstrapped`）；`domain-event-names.ts` +`tenantBootstrapped: 'tenant.bootstrapped'`；`EVENT_TYPE_REGISTRY` 登记新事件类（双向锁测随之扩）。**新事件 payload 一律过 zod（R1 起为律）**；既有两类 payload 的 zod 化仅立契约面、类侧不强改（防契约/类双源漂移：一致性测锁 eventType/列名/eventVersion）。
- 测：fold 单测（含乱序/未知事件 fail-loud）+ `load` gated 测（登记新文件见 §5）。

### R1b bootstrap（存量行成流·数据动作=高危#1·dev 库先行）
- `scripts/es-bootstrap-tenants.ts`（沿 `mikro-migrate.ts`/seed 的 tsx 自载 env 惯例）：对 `tenant` 表每行产 `tenant.bootstrapped` v1（payload=name/slug/status/occurredAt·**PII 边界=户籍表既有列·不含密钥**）落 event 流 version 续位（既有治理事件之后？否——**version 从流现有 max+1 续**，fold 定义「快照事件覆盖此前一切」，避免历史重排）。
- **幂等律**：以「该流已含 bootstrapped 事件」判重跳过（可安全重跑）。
- 验收（dev 真库）：bootstrap → 全量 `replay` fold ⇄ `tenant` 表现存行**逐字段相等**（一次性对拍测·gated e2e 常驻化=§5 文件之「存量对拍」段）。
- **prod 库 bootstrap 不在本案执行授权内**：脚本入库后，生产 apply 另行高危亲签。
- 裁②丙（双写收敛窗）：R1b 期间写路径仍为旧语义（表为真相源·事件照发），窗内新迁移先事件后投影皆同源，无分叉；收敛点=R1c 切换。

### R1c 写切换（真相源翻转·高危#1）
- 新 env 键 `ES_TRUTH_SOURCE_TENANTS`（zod boolean·缺省 **false**=现状逐字节不变）：走 `verify-config-contract` 四角对拍全套（config zod + envs 分层 + `.env.example` + 文档）。
- `TenantStatusService.transition` + reject handler 写路径（旋钮开时）：UoW 内序改为 `load(取 max version 与 fold 校验前置态) → append(expectedVersion=max+1·同事务) → 投影 upsert（fold 结果写 tenant 行）`；`canTransition` 裁决输入改自 **fold 重放态**而非表行（真相源实义）。旋钮关=原路径原样。
- `rebuildTenantProjection(aggregateId)`：replay→upsert 单流重建（service 方法 + 诊断面不新增 HTTP 端点，避免契约面扩）。
- delete-permanently（PIPL）：现 `deleteByAggregate` 语义升格为「真相源擦除」——保持（裁④丙起步下 tenant 流 PII 极薄可接受硬删；crypto-shredding 属 R2）。
- **守卫/对拍改锁**（裁⑤甲登记项）：`tenant-table.e2e` 读写语义、entity-column-law/表所有权对 tenant 的断言加「投影地位」注记（断言本体不放宽）；`tenant-hard-delete` gated 期望版本序列随 bootstrap 续位更新。

## 4. 明确不做（防越界）
user 流事件化（裁④丙·待 R2 crypto-shredding）；异步投影/端到端 ack（R3）；快照/upcast/第二上下文（R4）；`EventBus` 三态旋钮语义改动（复用不动）；任何 DDL/迁移文件（预期零·若实施中拓出需 DDL，**停下回案改裁**）；broker 线。

## 5. 验收与门禁（每子片交付时逐条核）
- 新 gated e2e `apps/api/src/modules/tenants/tenant-replay-truth.e2e.test.ts`（R1b 起建段·R1c 补全）：① 存量 bootstrap 对拍；② 治理动作后 `replay fold == 投影行` 逐字段；③ 崩溃模拟（append 后提交前抛→事务整体回滚·无半写）；④ expectedVersion 并发冲突 fail-loud 不覆盖。**必须登记 `scripts/ci-fullstack.ts` GATED_E2E_FILES**（恒等校验会红）。
- 每片：`pnpm run ci` 绿 + R1b/R1c 加 `pnpm run ci:db` 全链；旋钮缺省 false 时**全量既有测零红**（行为等价证明）。
- 逐片独立 commit（header 标 R1a/b/c）；文档单源同步（README + 母案演变挂链）。

## 6. 高危清单（归人逐次亲签·Agent 不自行执行）
- R1b：bootstrap 写 dev 真库（数据 backfill）；prod apply 另签。
- R1c：写路径切换 + tenant 表地位翻转（守卫改锁）+ 新 env 键。
- 全程：无 schema 迁移预期；触 `.env` 仅示例键非凭证。

## 7. 判据与回滚
- 母案 §5-1/2/4 判据在本试点兑现（§5 测①②③④即其载体）。
- 回滚窗：R1c 后旋钮切回 false 即回 shadow 语义（event 表数据保留·不回退）；R1b 可 revert（bootstrap 事件行留存无害——fold 起点定义在 R1a 已容「无快照=全治理事件」空流语义）；R1a 纯增量可独立 revert。

## 8. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 母案签发后按令细化 | 首版呈审案：现状取证（load 零存在/事件面三种/gated 10 文件/预期零 DDL）+ 目标态四定义 + R1a/b/c 分片（各带文件级改动面/幂等律/改锁清单）+ 旋钮回退窗 + 判据测四点 + 高危清单 ·零实现 |
| 2026-10-21 | 0.2.0 | 审计门通过 | 人按案 GO：分片框架/改锁清单/env 键位签发；R1a 授权开工（load gated 测落既有已登记 event-store.mikro.e2e.test.ts·免新文件登记）；R1b/R1c 高危另次亲签 |
| 2026-10-21 | 0.3.0 | R1a 实现落地 | §3-R1a 全件交付：端口 +`load`/+`append expectedVersion?`、`tenant-lifecycle-fold` 纯函数（裁①乙·快照起点/from 漂移/canTransition 复验/rejected tombstone/未知 fail-loud）、`TenantBootstrappedEvent` 类+事件名登记、contracts `event/tenant-events.ts` zod 契约面（裁⑥甲）+对拍测、`MikroEventStore` load/hydrate+乐观锁（`byStream` 收敛使该文件 type-escape 3→2 合规下降）、e2e 三新测。**实核订正 §3-R1b 表述**：tenant 户籍表实列=id/status/createdAt/updatedAt，**无 name/slug**——bootstrapped payload 定为 `{status, actorId?}`（以事件类 doc 为准）。验收：`pnpm run ci` PASSED（717 passed · 棘轮降 · fallow 零违规）+ `test:fullstack` 真库链绿（gated 恒等 11+1 · event-store e2e 8/8）；R1b/R1c 未动 |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.3.0 修订（R1a 实现落地留痕 + R1b payload 范围实核订正）。状态以 README 索引表为单源。
