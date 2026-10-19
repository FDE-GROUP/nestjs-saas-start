# core 定位裁决：saas-kit（非 DDD shared-kernel）

> 适用范围: `全局（架构定位 · 宪法表述）` ← 定性 `libs/core` 身份；连带指出 `docs/specs/architecture.md` 目录图与实存漂移
> 关联: 外部评审「core 层位移」（triage §2 之深化）· `docs/specs/architecture.md` line 20/50/55 · `AGENTS.md` §5 · `research/nestjs-fastify-nx-review`
> 性质: **架构定位裁决**（非质量缺陷）；本 plan = 裁定留痕，**代码零改动**；宪法对齐属高危#5 待签
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 问题（评审实质 vs 我先前驳回的口径）

- 先前 triage §2 驳回的是 **apps↔core 依赖方向**（实测 `libs/core→apps` 反向 0、apps→core 单向 366、fallow 0 违规——那条确实干净）。
- 评审**真正的分歧**是 **core 内部「层位移」**：`libs/core` 里同时出现一个叫 `shared-kernel/` 的目录、一个包名 `@core/saas-kit`、以及 `modules/{subscriptions,workspaces,tenants}` **业务域模块**。三者叠加引发定位疑问：**core 到底是 DDD 意义上的 shared kernel，还是一个 saas-kit？**

## 2. 取证（实存结构）

- 包名/别名：`libs/core/package.json` = `@core/saas-kit`；tsconfig `@core/saas-kit/* → libs/core/src/*`。
- `libs/core/src` 顶层：`shared-kernel/{domain,cqrs,context,errors,util}` + `tenancy/session` + `authorization/` + `platform/` + `modules/{subscriptions,workspaces,tenants}`。
- `libs/core/src/modules/*` 只含 **`domain/`（实体·仓储**端口**·ports）+ `application/`（commands/queries/handlers/read-models）+ quota/**；**grep 全仓 core 无 `infrastructure/` 目录、无 `@Entity`/`@mikro-orm` 实体、无 controller/HTTP**（命中项皆为名为 `*.repository.ts` 的**端口接口**与 `*.port.ts`）。
- 互补面在 `apps/api/src/modules/{subscriptions,workspaces}`：只含 **`infrastructure/`（MikroORM 适配）+ `api/`（controller/DTO）+ 模块装配**，绑定 core 的端口。
- 宪法现状：`architecture.md` line 55 已把 core 写作「private shared: **@core/saas-kit domain/contracts**」（已倾向 kit）；但 line 16-46 的目录树（line 50 声明「该树在 `apps/api/src`」）仍把 `shared-kernel/ tenancy/ modules/* authorization/ platform/` 画在 apps/api 下——**与两包实存失同步**。

## 3. 裁决（明确）

**`libs/core` 是 saas-kit——一个分层的、可复用的 SaaS 域工具箱；其身份不是、也不应被理解为 DDD 战术意义上的 shared kernel。**

分三层（这才是「层位移」的正解——它是 kit 的分层，不是越界）：
- **L0 `shared-kernel/`** = 框架无关战术原语（AggregateRoot/DomainEvent/CQRS 基元/错误码/上下文）。**它是 kit 的一个子层，恰是其名所指的 shared kernel，而非整包身份。**
- **L1 `tenancy/ authorization/ platform/`** = 跨上下文机制 + 已发布契约/端口（多租户机制、CASL 裁决端口、平台治理门面端口）。
- **L2 `modules/{subscriptions,workspaces,tenants}`** = 随 kit 发售的 SaaS 上下文的**领域层 + 应用层**（**仅端口**，零 infrastructure），供任意消费 app 复用。

**使其合法、并真正界定「何为越界」的不变式**（= 应当被 fallow/评审持续核验的红线）：
1. **core 任一层都不含 infrastructure/ORM/HTTP 具体物**——端口在 core、适配器在 apps；
2. **依赖方向恒为 apps→core**（core 不反向 import apps）；
3. 消费方（apps/api）只做 `ports→adapters` 绑定 + HTTP/装配。

当前三条不变式**全部满足**（fallow 0 违规 · 反向依赖 0 · core 无 infra）。故所谓「层位移」**不是缺陷，是 kit 的本征设计**；只有当有人把 MikroORM 实体/controller 塞进 core 时，才构成真正的层位移。

**命名结论**：保留现状、不重命名。包名 `@core/saas-kit` 已把真相说清（kit *内含* 一个 kernel），`shared-kernel/` 作子层名实相符。把 `shared-kernel/` 目录改名或整包再抽层属高 blast radius（触 366 入站 import 的公共契约）且**无收益**——歧义在「包级身份」，而包级身份已由 `saas-kit` 定名。

## 4. 唯一待办：宪法对齐（高危#5 · 待签）

真正该修的是**文档漂移**，非代码：`architecture.md` 需
- 把 §Directory Structure 的两包切分画准（core=L0 kernel+L1 契约+L2 域/应用端口；apps/api=infrastructure+api+装配），消除「树全在 apps/api」的旧表述；
- 在 line 55 之外补一句 **core 身份 = 分层 saas-kit（内含 shared-kernel 子层）· 非纯 DDD kernel** 的定位声明，并写入 §3 的三不变式作为边界红线。

改 `docs/specs/architecture.md`（含中英双份）= **高危#5 改宪法**，须人签核，本 plan 只出裁定与改动方案，**不自动落宪法**。

## 5. 审计记录

- 结论：**core = saas-kit（分层工具箱，内含 shared-kernel 子层）**——裁决明确；「层位移」经取证为 kit 本征设计、三不变式当前全守；唯一真问题 = 宪法目录图漂移，修法为文档对齐（高危#5 待签）。
- 未决项：① 是否签核落 architecture.md 对齐（高危#5·我可直接执行改法）；② 是否将 §3 三不变式补进 fallow/CI 作机制红线（当前 fallow 已覆盖方向与边界，不变式①「core 无 infra」可选加一条 grep 闸）。
- 审计人 / 日期：用户提请「明确裁决」· Agent 取证裁定 · 2026-10-20

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 裁决 | 首版：core=saas-kit 分层定位裁决 + 三不变式 + 宪法漂移待签对齐 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.0 变更，以当前正文内容为准。
