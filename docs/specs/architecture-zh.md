# 项目架构

## 核心设计原则

> **定位——四支柱（宪法定位 · 2026-10-21 人澄清并成文；每句均映射到既有强制机制，不作姿态性宣称）：**
> 1. **Clean Architecture 为底**——依赖规则已是可执行设施而非口号：core 纯度守卫（DI 最小面 + core 内 HTTP 零出现）、表所有权守卫（台账↔路径全量一致）、fallow 0 边界违规、OpenAPI 三向漂移闸、实体列定律恒等。细则见下方各条与 §附录。
> 2. **DDD 量力而行**——战略层（限界上下文、经领域事件跨上下文集成）全程保留；战术层按已在案的成本/收益判据逐案裁剪（聚合优先 + 全覆盖 CQRS 已减；状态机 / `Quota` VO / 投影教义按裁回流）。判据在案——见 `functional-core.md` 与下方 P2/P4 各条。
> 3. **函数式内核的三映射为突破点**——一致性目标是**投影** `领域态 ⊆ (数据实体 ≡ 表)`（非朴素 1:1），由三件套强制（迁移 diff + 列律 / 纯全函数 `fromRow` 唯一缝 / `PostState↔PostEntity` 编译期结构锁落 `infrastructure/`）。单件皆有业界先例；受守卫强制、并与函数式内核互锁的**统一**是本仓的**工程综合贡献**（非学术新颖）。详见下方投影镜射教义。
> 4. **CQRS/ES/EDA 按需但备能**——能力基线完备在位（逐上下文旋钮、乐观锁、bootstrap + `--verify` 对拍、回放读侧、真相源翻面 runbook）；启用与否逐模块裁。定律为**「启用即承诺、缺省即影子」**——「非强制」不得与已 committed 的真相源上下文混读。详见下方 CQRS / ES / EDA 各条。

> 下方为可执行的细则条文；本块是身份摘要、只作指针（单一真源仍在各条 + 链接的守卫/方案）。

> **函数式领域内核（P1）— 阅读地图（导航索引·只作指针、不新增规则）：** P1 教义有意分散于本文多处，请合读（每一面的单一真源仍留在原处）：
> - **身份** — 上方「定位——四支柱」第 3 条。
> - **核心陈述（P1）** — 下方「函数式领域内核」条。
> - **实体一致性** — 下方「投影镜射教义」条 + [实体教义](#实体教义领域实体-vs-数据实体)。
> - **物理地图** — 下方「函数式内核件清单」小节。
> - **完整展开（讲解性·非规范）** — [functional-core.md](../functional-core.md)。

- **整洁架构（Clean Architecture·依赖规则向内；同族亦称六边形架构 Hexagonal）**：依赖方向严格向内（`api → application → domain ← infrastructure`），在领域边界以**端口-适配器（ports & adapters）**落地；domain 除共享内核外零框架依赖（core 纯度守卫测试可执行化锁定）。
- **函数式领域内核（functional core, imperative shell·架构精度修宪 2026-10-20）**：领域裁决 = 纯函数 + 不可变数据 + result-union（基准样例 `canTransition`）；**不采用聚合优先的战术 DDD**（唯一天然聚合 User 的生命周期归 Better Auth·死管道已删），值对象按需（本域仅 `Quota`）。
- **投影镜射教义（FC 实体一致性·核心原则·2026-10-21 固化·人签核）**：**领域实体** ↔ 其 **数据实体** ↔ 物理 **表** 之间的一致性目标**不是**朴素的 1:1 全等——Evans 式聚合根天生破坏之（对象图、值对象、存储专用列、局部身份）。函数式内核下目标是**投影**：`领域态 ⊆ (数据实体 ≡ 表)`，由三件套强制——（1）*数据实体 ≡ 表* 经 `migration:generate` diff + schema/元数据一致性 e2e + 实体列定律守卫（已在位）；（2）**纯全函数 mapper** `fromRow`（数据实体 → 领域复原）作仓储适配器的唯一映射缝；（3）**编译期结构锁** 焊领域持久态契约（`PostState`）与数据实体接口（`PostEntity`），落 `infrastructure/`——**绝不落 `domain/`**（domain 不得 import infrastructure）。存储专用列（乐观锁 `version`、FK、discriminator）走白名单：mapper 读之，**不**镜射进领域态。真聚合同一定律按粒度成立（table-per-aggregate 或 table-per-entity——每实体 ↔ 自己的表、值对象嵌入）。参考实现：`posts`；其余持久化上下文**待跟进**，各自经已审方案落地。详见下方[实体教义](#实体教义领域实体-vs-数据实体)与 [module-posts-fc-projection-doctrine.md](../plans/module-posts-fc-projection-doctrine.md)。
- **CQRS 按需（P4 判据）**：存在跨聚合编排/事务边界/事件发布的上下文走 `Command/Query → Handler`（`@nestjs/cqrs`）；简单上下文可直接调 `application/*.service.ts` 而不加 handler——**「合法终态」仅指 CQRS handler 可省，绝不指可跳过分层本身**。每个限界上下文仍**必须**呈现 `domain/application/infrastructure/api` 四层垂直切片；`domain/` 承载真实业务规则（策略 / 值对象 / 端口），出站网关型上下文亦然（通道选择与降级、上传校验、金额与货币、对象键命名等策略须下沉 domain）。能力基线必含、实施逐模块裁（ES/EDA 同此规则，见下条）；handler 实证示例：tenants 治理命令、users delete/export。
- **Use Cases 层 = `application/`**（术语坐标·2026-10-21 成文）：Clean Architecture 锥体第二环 "Use Cases" 在本仓**不是**一个独立的 `usecases/` 目录，也**不是** `XxxUseCase`/`XxxInteractor` 后缀——它**就是**每个垂直切片的 `application/` 层，经两种业界主流惯例物化、且**都是 P4 所述的合法终态**：（a）**一用例一 CQRS handler**（`Command/Query → Handler`·`@nestjs/cqrs`·用于 `posts`/`tenants`/`users`·与 NestJS 生态对齐的主流形态）；（b）**命令式应用服务**（`application/<context>.service.ts` 的每个公开方法即一个用例·用于出站网关型上下文 `payment`/`storage`·DDD/Vernon 应用服务形态）。有意**不**新增第三种 `usecases/` 目录或 `XxxUseCase` 命名：会与 handler/service 语义重复、偏离 `@nestjs/cqrs` 惯例。分层（存在 Use Cases 层）强制、把每个用例物化为独立 handler 类逐上下文可选。
- **Handler vs service——选择判据**（P4 细化·每上下文保持**单一 spine**、不按调用混用——8 个上下文已全部核实）：当用例需跨聚合编排、显式事务/UoW 边界、领域事件发布、或逐消息管道/钩子点（守卫、幂等、回放），或命令/查询契约值得分别派发时，走 **CQRS handler spine**——当前：`users`/`posts`/`tenants`/`workspaces`/`subscriptions`。当上下文是薄编排或**出站网关**——单一副作用路径、无聚合图、逐用例 command+handler+registrar 的仪式徒增无值时，走**命令式应用服务 spine**——当前：`payment`/`storage`（+ 命令稀少的支撑上下文 `authorization`）。两者皆合法终态；service spine 在 handler 型需求出现时可**升为 handler**（能力基线强制、实施逐模块裁）。
- **垂直切片（Vertical Slice）**：按功能而非技术分层组织（`apps/api/src/modules/<context>`；共享契约侧居 `libs/core/src/modules/<context>`）。上下文之间只能通过领域事件耦合，禁止 import 另一个上下文的 `domain/` 或 `infrastructure/`。
- **Event Sourcing（能力基线·逐模块按需·分期递进）**：确定的架构目标（人澄清 2026-10-14；2026-10-20 人再定向「回放即真相」+ 能力/实施分离，**supersede** 同日精度修宪的「Phase C 可选·终态缺省=审计日志」口径——见 [module-es-truth-source-amendment.md](../plans/module-es-truth-source-amendment.md)）。架构必须**完备提供** CQRS/ES/EDA 能力（端口、机制、参考示范）；**实施按业务模块实际需求逐模块裁**——被事件化的聚合以 event store 为唯一真相源（「回放即真相」·读表降为可重建投影）；简单 CRUD / 无状态数据（sessions、verification、成员关系等）**可依法永远不事件化**。已落地：shadow-append + 同事务 outbox + relay（`EVENT_PUBLISH_MODE: inproc|shadow|outbox`·缺省 inproc）；事件由 service/handler 层发布（P3·「操作记录」语义·聚合事件管道已于精度修宪 S1 删除）。回放即真相**逐模块**实证：订阅生命周期为当前唯一真相源翻面示范，而租户/用户治理面已**降为仅审计/集成事件**——`ES_TRUTH_SOURCE_TENANTS` 旋钮随治理面 ES 覆盖层于 2026-10-23 治理生命周期收束案中退役（见 [global-governance-lifecycle-consolidation.md](../plans/global-governance-lifecycle-consolidation.md)）。详见 [event-sourcing-roadmap.md](../plans/event-sourcing-roadmap.md)。
- **EDA（事件驱动架构·确定采纳）**：领域事件是上下文间**唯一**集成机制；演进路径 = 进程内派发（已落地）→ 同事务 outbox 耐久发布（Phase B）→ 跨进程 broker 订阅（仅微服务触发器成立后，见 [microservice-readiness.md](../plans/microservice-readiness.md)）。

### 范式偏移登记册（人确认例外·只作指针）

上方 §核心设计原则 的垂直切片 + DDD/函数式内核范式是**通则**。凡某上下文有意偏离此形状者，在此登记为**开发者已确认的例外**（非结构债）：把已确认例外误读为债、或让未登记的漂移冒用例外之名，正是本登记册要防的。下表**只作指针**：各行权威细节仍在其链接段，本册不新增规则。

| # | 主体 | 相对标准四层的偏移 | 成因（锁定工具） | 状态·权威 |
|---|------|--------------------|------------------|-----------|
| D1 | `auth` | 无自持聚合/policies·**无 `application/` spine**；`domain/` 仅承载已发布 `AUTH_*_STORE` 端口，其余内容按层归位 `infrastructure/` + `api/` | **Better Auth**（永久锁定）拥有认证语义 | 永久·开发者已确认 — §层形 |
| D2 | `platform` | 无 `domain/` 实体——治理门面·**无自有物理表** | 数据归 `tenants`/`users` | 永久·开发者已确认 — §层形 |
| D3 | `authorization` | **四层形状合规（无形状偏移）**——例外在于 RBAC *裁决* 外俱**CASL 引擎**（grant 事实居 DB 行、CASL 规则为运行时投影），且 authorization 双栖（裁决机器=机制、管理面=支撑域） | **CASL(`@casl/ability`)** 供能力语言·*库约束接口、域拥有事实* | 永久·开发者已确认 — §机制层vs业务域 · §技术栈(Authorization) |
| D4 | 战术 DDD（范式级） | 聚合优先战术 DDD **不采用**；唯一天然聚合 User 的生命周期归 Better Auth | Better Auth 拥有 user 生命周期 | 永久 — §核心设计原则（函数式内核条） |

> **非偏移澄清**：`payment`/`storage` 是出站网关型上下文、**仍呈完整四层**（domain policies + application + infrastructure + api）——属范式*变体*、非偏移。同理 `tenants` **非层形偏移、属跨包放置粒度差异**：它是完整 apps 本地垂直切片，仅其共用的纯生命周期内核作为 P1 函数核件上抽至 `libs/core/…/tenants/lifecycle`（区别于 D1–D4 的层形例外）。

### 函数式内核件清单（P1 的物理地图·架构精度修宪补笔）

P1 不是目录而是模式——内核件散布各上下文，判据 = **纯度可证**（零 import 或仅词表/自家 VO）+ **被外壳驱动**（load → 裁决 → write 全程 UoW）。纯度由 `libs/core/src/core-purity.test.ts` 双锁强制（`@nestjs/common` import ⊆ DI 最小面 + `HttpException/HttpStatus` 零出现）。新裁决一律以此为形：

| 内部件 | 职责 | 纯度 |
|---|---|---|
| `core/modules/tenants/lifecycle/tenant-lifecycle.ts` | 租户/用户**共用**状态机迁移表 + `canTransition`（result-union·旗舰样例） | 零 import |
| `core/authorization/instance-predicate.ts` | RBAC 查询级谓词语法 → DB 谓词编译 | 零 import |
| `apps/api …/authorization/domain/policies/tenant-rbac.policy.ts` | 角色 key/conditions 策略闸 | 仅词表常量 |
| `core/modules/subscriptions/quota/tenant-plans.ts` | 档位目录 + `resolvePlanDef` | 仅自家 VO |
| `core/modules/subscriptions/quota/quota.vo.ts` | Quota 非负整数不变量（P2 唯一认定 VO） | 零 import |

> 概念/判据/配方/FAQ 的完整展开见 [函数式领域内核指南](../functional-core.md)（讲解性·非规范）。
> 体积小（合计约数百行）是**域的真相**而非缺陷：复杂度在隔离/治理/配额的技术架构，不在业务规则密度——多数代码是外壳（端口/适配器/守卫/UoW）。内核的可复用性见 `user-status.service` 对 `canTransition` 的直接复用（一表服务两条生命周期）。

## 目录结构

> **逻辑视图。** 下方目录树是**合并后的分层视图**，**并非**单个 `apps/api/src` 目录：其中若干目录（`shared-kernel/`、`tenancy/`、`authorization/`、`platform/`，以及 `subscriptions`/`workspaces` 的 `domain/`+`application/`）实际位于 `libs/core`（`tenants` 则不然——它是**完整 apps 本地垂直切片**，仅其共用的纯状态机内核 `libs/core/modules/tenants/lifecycle/tenant-lifecycle.ts` 作为 P1 函数核件上抽至 kit、**非层拆分**）。它们在两个后端包之间的精确归属见下方 **§两包物理布局**。

```
src/
├── app.module.ts            # 根模块（引入全局基础设施 + 各功能上下文）
├── main.ts                  # 启动：Fastify、StandardSchemaValidationPipe、Swagger、URI 版本化
├── shared-kernel/           # 跨上下文原语
│   ├── domain/              #   AggregateRoot、DomainEvent（纯净，零框架依赖）
│   └── cqrs/types.ts        #   BaseCommand / BaseQuery（封装 @nestjs/cqrs）
├── modules/                 # 限界上下文（垂直切片）
│   ├── users/               # ★ 完整模式的参考实现
│   │   ├── domain/          #   entities/ value-objects/ events/ repositories/ ports/ policies/ constants/
│   │   ├── application/     #   commands/ queries/ read-models/（处理器）· 应用服务 · ＝ CA「Use Cases」层
│   │   ├── infrastructure/  #   MikroORM 仓储适配器、映射器、事件分发器
│   │   ├── api/             #   Controller + DTO（HTTP 传输层）
│   │   └── users.module.ts  #   装配 CqrsModule + 处理器 + 端口→适配器绑定
│   ├── auth/                # 认证（宪法名 authentication·Better Auth 适配层：凭证/会话/因子/OAuth 渠道；仅成员数据面）
│   ├── authorization/       # 授权支撑域：角色/授予/裁决/审计·两作用域层（租户 scope + 平台 scope）
│   ├── tenants/             # 租户/组织核心域：生命周期/成员/邀请 + deny-list 状态机（tenant/user status）+ 治理命令 handlers
│   ├── platform/            # 平台治理门面：operator 闸门/审计/身份+配置端口（无自有表）
│   ├── workspaces/          # 租户内资源分区（是授权的 subject·非第二道隔离墙）
│   ├── posts/               # 内容上下文
│   ├── subscriptions/       # 租户订阅/配额上下文
│   ├── payment/             # 支付上下文
│   └── storage/             # 云存储上下文（S3/OSS/COS）
├── tenancy/                 # 横切多租户隔离机制层（非业务上下文）：ALS 租户上下文 +
│                            #   TenantScopeGuard + middleware + exempt/public；会话适配
│                            #   （deny-list 状态机已归位 `tenants`、席位配额已归位 `subscriptions`·未决项 4 已落地）；
│                            #   消费 authorization 的裁决端口
├── database/                # 全局基础设施：MikroORM 客户端、迁移（DDL SSOT）、seed、eventing/（事件基建）——BA 实体
│                            #   已按域归位（身份机器族→auth·组织容器族→tenants·各居 infrastructure/entities/·形状受
│                            #   BA 接口契约约束·global-ba-entity-domain-placement 归案·`database/ba/` 区已消解）、迁移、seed、
│                            #   eventing/（ES 存储/中继/UoW 基建）；上下文专属表实体随各自上下文落
│                            #   modules/<ctx>/infrastructure/entities（属主 SSOT=database/table-ownership.ts）
├── config/                  # 全局基础设施：类型安全配置 + zod 校验
├── logger/  mailer/  common/  i18n/   # 横切基础设施
```

## 两包物理布局

`libs/core` 是一个**分层的、可复用的 SaaS 域工具箱（`@core/saas-kit`）**——明确**不是** DDD 意义上的「共享内核（shared kernel）」：`shared-kernel/` 目录只是其最内层的原语子层，而该 kit 还额外发售跨上下文契约、以及可复用 SaaS 上下文的领域层 + 应用层。上方逻辑树按两个后端包实际映射如下：

```
libs/core   (@core/saas-kit)                 # kit——轻框架、可移植，**不含任何基础设施**
├── shared-kernel/                           # L0 战术原语（domain/cqrs/context/errors/util）
├── tenancy/  authorization/  platform/      # L1 跨上下文机制 + 已发布契约/端口
└── modules/{subscriptions,workspaces}       # L2 随 kit 发售的上下文：domain/（实体 + 仓储**端口**）+ application/（CQRS 处理器）——仅端口
    modules/tenants/lifecycle/               # 非发售切片——仅共用的纯租户/用户状态机内核（P1 函数核件）；tenants 自身的 domain/application 在 apps/api（见下）

apps/api                                     # 参考应用——所有具体实现物均在此
├── modules/<ctx>/{api,infrastructure}       # HTTP controller + MikroORM 适配器，**绑定** core 端口（端口→适配器）
├── database/  config/  main.ts  app.module.ts   # 全局基础设施 + DI 装配根
├── modules/{tenants,users,posts,payment,storage}  # 完整本地垂直切片（domain→application→infrastructure→api）；`tenants` 与 `libs/core/modules/tenants/lifecycle` 共用其纯生命周期内核
└── modules/auth                             # 系统机制上下文——层形见 §层形：`domain/ports/`（已发布 AUTH_*_STORE 端口）+ `infrastructure/`（BA 适配）+ `api/`（守卫/装饰器）；无 application spine（认证不变量归 BA）

apps/web            # 可部署前端壳（React + Vite）· F0
packages/api-client # 由 openapi.yaml 生成的可交换类型化客户端· F1
```

**边界不变式（真正的红线——由 `fallow` + 下方逐层 import 矩阵共同守护）：**
1. `libs/core` 任一层都**不含**基础设施 / ORM（`@mikro-orm`）/ HTTP（controller、DTO）具体物——端口在 core，适配器在 apps。
2. 依赖方向恒为 `apps → core`；`libs/core` 绝不 import `apps/*`。
3. 消费方（apps/api）只做 `端口 → 适配器` 绑定 + HTTP/装配。

所谓「层位移」**仅当**具体实现物被塞进 `libs/core`（如 `modules/*/domain` 下出现 MikroORM 实体）时才构成违规；在 kit 内发售领域 + 应用层是本征设计、非违规。命名冻结：`@core/saas-kit` 包与 `shared-kernel/` 子层**均不重命名**（对入站 import blast radius 大、结构收益为零——kit/kernel 之辨现由文档界定、不再编码进目录名）。裁决详见：[module-core-position-kernel-vs-kit](../plans/module-core-position-kernel-vs-kit.md)。

## `users` 上下文（写路径只有 Command → CommandHandler）

Controller 从不直接改状态。以真实落地流示范——tenants 治理（`POST /tenants/:id/approve`·CQRS handler spine + 审计/集成事件发布·非回放真相源）：

```
POST /tenants/:id/approve
  → Tenants/Platform controller（api 层）  # 由已校验的 DTO 构造 ApproveTenantCommand
  → CommandBus.execute                     # @nestjs/cqrs
  → ApproveTenantCommandHandler（application）
        governedTenantTransition 辅助 → canTransition 纯裁决（函数式内核）
        TenantStatusService.transition     # 状态行经仓储（端口 → infrastructure 适配器）
        EventBus.publishAll([...])         # P3 操作记录事件；UoW 使事件行业务行同事务原子
                                           # （outbox 模式）；shadow 下影子追加落 event 表
  → 返回只读投影
```

（原示例 `POST /users` → `CreateUserCommandHandler` → `User.register(...)` →
`pullDomainEvents()` 系幻影：码中无此 handler/聚合——由 2026-10-20 R0 修宪 sweep 移除。）

读接口（如 `GET /users`、`GET /users/:id`）的 `Query` 处理器直接经 `MikroOrmService` 读写库
（务实的 CQRS 读侧，绕过 domain）。

## 分层依赖规则

| 层 | 允许 import | 禁止 import |
|---|---|---|
| `domain/` | `shared-kernel/domain`、同域内其他文件 | Nest、MikroORM、DTO、HTTP、其他上下文 |
| `application/` | `domain`、`shared-kernel/cqrs`、`@nestjs/cqrs`/common | 其他上下文的 `domain`/`infrastructure` |
| `infrastructure/` | `domain`（端口）、MikroORM、Nest | —（它是适配器边界） |
| `api/` | `application`（命令/查询）、DTO | 把 `domain` 实体当传输对象 |

Domain 纯净性由 `pnpm run ci` 里的 **fallow 架构边界佐证**守住（`scripts/ci.ts`，advisory 不
阻断；其结论需二次人工核验，见 [tooling-standards.md §4.7](./tooling-standards.md)）。**不存在**
任何扫描 `apps/api/src/modules/users/domain/**` 检查 `@nestjs/*`、`@mikro-orm/*`、
`@app/database` import 的测试——层级方向另由上表逐层 import 矩阵与代码评审守住。

### Domain 子目录法与命名

一个上下文 `domain/` 内的文件**必须**落在下列 canonical 子目录之一——**任何业务/契约/常量件都不得躺在 `domain/` 根**。命名走点分式（`<name>.<kind>.ts`），与 `.command.ts` / `.query.ts` / `.event.ts` 同族：

| 子目录 | 承载 | 文件后缀 |
|---|---|---|
| `entities/` | 不可变领域实体（数据载体 + 纯转移） | 按名 |
| `value-objects/` | 值对象（构造期不变量） | 按名 |
| `events/` | 领域事件 | `.event.ts` |
| `repositories/` | 聚合持久化端口 | `.repository.ts` |
| `ports/` | 其它出站端口（网关/服务） | `.port.ts` |
| `policies/` | 纯策略/裁决函数 | `.policy.ts` |
| `constants/` | seed / 词表 / 纯常量表 | 按名 |

测试与被测件共位（同子目录、`<name>.test.ts`）。某子目录仅当上下文有其内容时才存在（见 §层形）。本法则纯为上下文内之事：把文件在其自身 `domain/` 内搬移绝不改变垂直切片边界，且 `domain/` 仍绝不 import `infrastructure/`。本法则由 `verify:domain-layout` 恒等闸机制强制（接入 `pnpm run ci` full+quick 与 `pre-push`）：任何躺在 `domain/` 根或落在非规范子目录的 `.ts` 即 fail-loud。范围仅 `apps/api/*/domain`——`libs/core` 自有布局、不纳入。

### 实体教义：领域实体 vs 数据实体

每个有持久化的限界上下文 **必须** 区分两样东西：

- `domain/entities/` 下的**领域实体**——**不可变数据载体**，持构造期不变量与**返回新实例的纯转移函数**（按 P1 对齐函数内核·*非*可变行为盒），零框架依赖（受上表 `domain/` 行约束）；
- `infrastructure/entities/` 下的**物理数据实体**——映射到表的 MikroORM `defineEntity`（见实体列定律附录）。

仓储适配器是二者**唯一映射点**；**仓储端口流动领域实体**，传输形状仍是 application 的
`read-model`——领域实体绝不越界进 `api/`（受上表 `api/` 行约束）。二者一致性
（`领域态 ⊆ 数据实体 ≡ 表`）受上方**投影镜射教义**约束——纯 mapper 与编译期结构锁落
`infrastructure/`，绝不落 `domain/`。参考实现：`posts`。
其余持久化上下文（`tenants`/`users`/`subscriptions`/`workspaces`/`authorization`/`auth`）**待跟进**
本教义，各自经已审方案落地——非即时违宪。

### 层形：「层有内容才存在」——auth / platform 两例

四目录垂直切片（`domain/application/infrastructure/api`）作为**形制**强制，但某一层仅在上下文确有该内容时才在场。两个已登记、非违宪的残余例外（把四目录规则留白的残余情形成文化）：

- **`auth`** 持有 BA 面向的写面（session/bootstrap 适配）与身份台账，但认证语义下沉 Better Auth。故它**无自持聚合/policies、也无 `application/` spine**；其 `domain/` **仅承载已发布端口**（`domain/ports/`——即 `AUTH_*_STORE` 契约），与各上下文放端口的位置一致（P4/CQRS 条：`domain/` 承载 policies/值对象/**端口**）。其余内容**必须按层归位**、绝不得平铺在模块根——BA 面向的适配/挂载（`auth.implement`、`auth.bootstrap`、oauth-channels、social-provider-registration、seats-quota-hook、session-resolver）归 `infrastructure/`，呈现层守卫/装饰器归 `api/`。此为*层形归位*、非臆造领域：一旦出现真正的 auth 本地不变量，须即刻物化为 `domain/` 下的 policy/rule——而非仅当作一个端口存放、更不得内联散落。
- **`platform`** 是治理门面（跨上下文读/命令面），**无自有物理表**；其 `infrastructure/` 只放外部存储适配，规则活在属主上下文（tenants/users）经 CQRS/事件触达。无自持持久化的门面，无 `domain/` 实体可放。

此即 P4/CQRS 条中「层有内容才存在」的具体读法：只放行省略*空*层，绝不放行跳过分层纪律本身，也绝不压制一个已有（或将得）内容的层。

## 限界上下文地图与多租户机制层

### 机制层 vs 业务域：归属判据（2026-10-21 人裁成文·总纲）

上方术语纪律（租户≠多租户）是本判据的特例；总纲判据**不是"话题"**（是否关于认证/租户），
**而是"谁定义规则、为谁服务"**——同一主题可以两分，归属由此定：

| 归属 | 仓库落位 | 判据特征（四维） |
|---|---|---|
| **系统机制** | `modules/auth`（身份机器 + `AUTH_*_STORE` 端口）· authorization 的**裁决机器**（core 守卫/CASL 投影/谓词编译内核件）· `tenancy/` 横切层（ALS 传播/隔离守卫/deny-list 失能）· **窄义**基础设施（database/config/common/logger/mailer/i18n + 各 provider 通道适配） | 变更动因**技术性**（框架升级/BA 换代/性能）；CA 依赖规则最严处（core 纯度守卫·端口倒置·表所有权台账）；测试以矩阵/wiring 恒等闸为主；**工具（BA/CASL/MikroORM）住在机制里**（库约束接口·域拥有事实） |
| **业务域** | 各限界上下文：`tenants`（生命周期/治理）· `workspaces` · `posts` · `subscriptions` · `payment` · `storage` · `users`（PIPL 合规）· `platform`（运营门面）· authorization 的**管理面**（三表/角色 CRUD/`domain/policies`——支撑域） | 变更动因**业务性**；FC 内核 + 投影教义 + 实体分离的主战场；测试以内核零 mock + 编译期结构锁 + gated e2e 为主；**只经端口消费机制能力** |

**三处易切错的刀口**：
1. **同一主题两分**：多租户**机制**（`tenancy/`·不关心"租户是什么"）≠ 租户**业务域**（`modules/tenants`·定义"租户如何存在与消亡"）；认证**机制**（`auth`·身份机器）≠ 用户**合规域**（`users`·PIPL 导出/硬删）——同批 user 表两个视角，经 `AUTH_USER_STORE` 端口缝合（global-ba-entity-domain-placement 裁①先例）。
2. **authorization 双栖**：裁决机器=机制（core 内部件·零 import·受纯度守卫）；授权事实与管理面=支撑域（自有三表 + 四层切片 + 角色管理用例）——这是它作为**限界上下文**而非横切层存在的成文理由（形态与 `tenancy/` 有别的根因）。
3. **基础设施取窄义**：`storage`/`payment` 是**有领域策略的出站网关上下文**（通道降级/上传校验/金额货币/对象键命名策略已下沉 `domain/`——四支柱 2「DDD 量力」的回流例证），**不是**基础设施；真正的设施是其身后的 providers（S3/OSS/COS、Stripe 通道）与 database/config 层。

> 操作后果：新能力落位时先过本表四维（动因/范式/测试/工具归属）判归属——机制面变更走横切与守卫评审面（fallow/纯度/恒等闸），业务面变更走垂直切片与已审方案面（实体教义/投影/内核判据）。判错归属（如把网关上下文当设施、或把机制策略当业务规则散入上下文）即结构债。

术语纪律：**租户（Tenant）**是业务概念（`tenants` 核心域·**存储实体·非 DDD 聚合回归**——内核采函数式三件套 record `TENANT_STATUS` + port `TenantStatusStore` + function `canTransition`·与 glossary §1 同源·有生命周期/不变量/语言）；
其物理实体为 **`organization` 行上的 `status` 治理列**（真列 + DB CHECK·`tenants` 上下文属主·系加于 BA **共享**表 `organization` 上的自撰域列·遵下方「BA 表共享」条·与 organization 同主键 1:1·通则见上方实体教义 + 投影镜射教义：领域实体 ↔ 数据实体由仓储适配器映射）；
旧 1:1 自有户籍表 `tenant`（含 2026-10-20 首立该表的 global-tenant-entity-reclamation 收权案）已被 **global-governance-lifecycle-consolidation 2026-10-23 反悔并 DROP**——其两根承重柱（BA 可替换→schema 隔离、ES「回放即真相」试点宿主）被新约束抽掉，治理生命周期不需回放真相，故租户身份塌缩回 `organization`、态归其自有 `status` 列；`organization` 自此一身兼认证/成员面投影与租户生命周期载体）；
**多租户（Multi-tenancy）**是隔离机制（基础设施·无聚合无生命周期：请求识别 → ALS 传播 →
边界执行 → 豁免轴）。两者不可混住：`tenancy/` 不住租户生命周期的业务写面，业务上下文也不得
自实现隔离。`tenancy/` **消费** `authorization` 的裁决端口；经重构 A 片不再自住 CASL
checker、经 D 片不再自住平台治理。

用户面译名纪律（**presentation-layer naming**·global-userfacing-tenant-naming 2026-10-23 人裁成文）：上述「租户 / Tenant」是**内部领域与机制词**（代码/守卫/ALS/`organization.status`/错误码 `TENANCY_*`/路由 slug `/tenants` 沿用·不属用户面）；**用户可见面（前端渲染文案、导航标签、面向终端用户的提示）一律称「组织」（顶层单元）/「工作区」（二级分组）**，「租户」不得外泄至用户文案。二者一一对应、翻译只发生在呈现层（**不改模型/存储/API 契约**）。

领域细化重构（global-domain-context-refactor）定型的上下文身份：`authorization` 是
**独立支撑域**，同时服务 `tenants`（成员挂角色 key）与 `platform`（经营者闸门）——绝非
租户子域；`platform` 是**无聚合的治理门面**（租户生命周期写能力留 `tenants`·经 CQRS Bus
调用）；workspace 是租户内的分区、授权的 *subject*，不是角色作用域。跨上下文引用保持
弱耦合：角色 key 与外键 id 皆为普通 string 列（不建跨上下文 ORM 实体关系），上下文之间
仅经 published port 相接（如 `ROLE_ASSIGNABILITY_READER`）。

三层权限链：`PlatformOperatorGuard`（平台层）→ `TenantScopeGuard`/ALS（租户隔离）→
`TenantPermissionGuard` + `@Can`（租户层 + 实例层 conditions）。

## 上下文间通信

上下文之间绝不互相 import 内部实现。跨上下文的副作用通过领域事件表达，用
`@EventsHandler` 订阅。`stripe`（payment）与 `storage` 属**出站网关型上下文，仍须走四层垂直切片**
（`domain/` 放 provider 端口 + 真实策略：通道选择与降级、上传校验、金额/货币、对象键命名；
`application/` 编排；`infrastructure/` 放 SDK 适配器；`api/` 放控制器）。`auth` 为**已在案的层形例外**（系统机制面：`domain/ports/` +
`infrastructure/` + `api/`·无 `application/` spine·见 §层形与偏移登记册 D1；其分层已由
global-auth-layering-consistency 完成、非「待专项」）。未来若某上下文
出现真聚合需求，经触发判据立项再引入（不再有「指定预留位」）。

## 上下文边界：认证（authentication）↔ 用户（users）

`authentication`（宪法名·现目录 `modules/auth`）断言**你是谁**：凭证、会话、因子、
OAuth 渠道——Better Auth 适配面，`session-resolver.ts` 为每请求会话唯一解析面。
`users` 持有**身份主体**：资料聚合 + PIPL 自助面——慢变、合规敏感。

表属主（SSOT：`apps/api/src/database/table-ownership.ts`）：`user` → **users**；
`account`/`session`/`verification` → **authentication**。两上下文的接缝是用户↔成员关系：
`member`（user × organization）是 `tenants` 的联结实体——角色挂成员而非全局用户，
同一用户在不同租户可持不同角色。

挂载在认证面上的治理钩子（`seats-quota.hook.ts`）是 Better Auth 挂载点的传送带胶水；
席位裁决本体在订阅上下文的 quota 域策略（core `modules/subscriptions/quota`·`QuotaService`）——挂载位置不得误读为属主。

## 常量契约归属

常量的落点由**资格**决定，不由「复用次数」决定。判据三条：

1. **契约资格**：凡跨上下文通信、进程边界（HTTP 响应/事件信封）、持久化流（outbox/relay）
   所读的常量，必须居契约字典层——事件名进 `DOMAIN_EVENTS`、业务错误码进 `ERROR_CODES`，
   字面量全仓单点，且各以其机制（重建注册表/码表响应测）**双向锁死**防旁逸。新增此类
   常量一律先加字典。
2. **上下文自有枚举**：领域状态机枚举（`TENANT_STATUS`、`SUBSCRIPTION_STATUS`、PLANS 等）
   留驻其**属主上下文**目录；若该枚举是事件 payload 的一部分，则与事件类同栖于 core 侧
   生产上下文目录（消费方 import 的是契约本身，合法）。禁止为「集中」把它们抽入任何全局枢纽。
3. **非常量契约不入册**：结果对象字面量、读模型内部形等实现细节的 `as const`，不因被复用
   而升格为契约，不集中、不上迁。

推论：**不设全局 `constants/` 枢纽**（任何上下文演进都需改枢纽 = 横切 God 模块·违反垂直切片）；
防散落靠机制（字典单点 + 锁测 + relay 拒收未知类型）而非目录集中。

## 技术栈

- **运行时**：Node LTS ≥22（ESM，`"type": "module"`）+ pnpm（包管理）
- **框架**：NestJS 12 + Fastify
- **架构**：Clean Architecture + DDD + CQRS（`@nestjs/cqrs`）
- **数据库**：PostgreSQL + MikroORM（显式迁移）
- **认证**：Better Auth（**auth 域工具库**——global-ba-entity-domain-placement 2026-10-20 人裁再裁决旧「纯认证与成员数据源·契约面存储视图集中」框架，采 CASL 同构原则「库约束接口·域拥有事实」）：身份机器表（user/session/account/verification/consent）归 **auth 域**、组织容器表（organization/member/invitation）归 **tenants 域**——形状受 BA 接口契约约束（列律 `BA_CONTRACT_TABLES` 登账·按下方「BA 表共享」条此系**非专用·共享表**——域可 **additive 增自撰域列**（建模合理性优先），红线仅「不得删减/修改 BA 约定字段及其数据类型」），操作经 `auth.api.*` 工具面（**拥有表 ≠ 接管操作**）；其 org 内置授权 HTTP 面已封堵（module-rbac-casl 甲裁），成员/邀请对外端点由我方门面经服务端直调；租户生命周期态存治理列 `organization.status`（真列 + DB CHECK·系加于 BA 共享表 `organization` 上的自撰域列·global-governance-lifecycle-consolidation 2026-10-23 取代旧自有 `tenant` 旁表），BA `organization.metadata` 不携任何我方寄居键——两条承诺逐字成立）
- **授权**：CASL（`@casl/ability` v7）——租户级 RBAC 唯一裁决引擎。**授权事实 SSOT 在 DB grant 行**（`tenant_role`/`tenant_role_grant`·per-tenant 动态角色·module-rbac-dynamic-roles 丙裁取代旧「`tenant-rules` TS 表是 SSOT」裁），**代码词汇表 `tenant-rules` 是语言 SSOT**（仅编译期 `TenantSubject/TenantAction` 类型域），**CASL rules 是运行时投影**（checker 经仓储端口 per-tenant 懒投影 + 进程内版本缓存·`invalidateTenant` 热改生效）。端点以 `@Can(action, subject)` 声明、`TenantPermissionGuard` 经 ALS 预注入角色判定（无散点特判）；实例级授权走 check 级（`TenantPermissionCheck.resource` + conditions 行按 `{{userId}}` 模板交 CASL mongo 匹配）；query 级列表过滤为其同源延伸（`TenantPermissionChecker.listPredicate` 把受限 grant 下推为列表面实例谓词·与 tenantFilter 固定展开序合并·module-rbac-query-level-filtering）
- **测试**：Vitest（+ `unplugin-swc` 输出装饰器元数据）
- **Lint/格式化**：Biome

## 校验注意事项

Controller 经**官方 standard-schema 路径**校验（`@Body/@Param/@Query({ schema })`）、经
`@SerializeOptions({ schema })` 序列化；zod schema **必须按值导入**（而非 `import type`），
否则参数装饰器读不到 schema、校验/序列化整链静默跳过。跨端共享的请求/响应 schema 居
`@saas/contracts`（单源）。`biome.json` 已对相关文件关闭 `useImportType`，防止 auto-fix 把
这些值导入改回 `import type`。（class-validator / class-transformer / Joi 已由全栈校验换轨 zod
修宪摘除——见 tooling-standards §3。）

## 分页契约

`shared-kernel/domain/pagination.ts`（纯 TS、框架无关）内含两种信封，是列表结果**唯一**
被认可的形式——列表端点基于它们构建，绝不临时自造 `{rows, count}`：

- **`CursorPage<T>`（`items` + `hasMore` + 可选不透明 `nextCursor`）为新列表端点的默认选择。**
  它是基于确定性全序的键集（keyset）分页——参考绑定为 `(createdAt DESC, id DESC)`（`id` 作同刻
  并发行的唯一兜底）——故随数据增长仍保持正确且对索引友好，无 `OFFSET` 扫描。游标是排序键
  的不透明 base64url：隐藏存储内部结构，且**不是**授权的替代品（租户守卫照旧生效）。畸形游标为 400，
  由适配层 `decodeCursor` 报出（DTO 已先把字符集关卡）。
- **`Page<T>`（offset：`items` + `total` + 回显 `limit`/`offset`）为例外**，保留给需要全量计数或
  任意跳页的治理面。它**不**被删除；将 offset 端点迁为游标是一次有意为之、逐端点的破坏性变更。

两者只经 `createPage` / `createCursorPage`（唯一形状纪律点，对 `items` 浅复制）构造。请求在 API 侧经
`ListPageDto` / `ListCursorDto` 进入，到 port 时形为 `PageRequest` / `CursorPageRequest`。

## 部署

- **开发**：Node + pnpm + Docker PostgreSQL（`docker-compose.dev.yml`）
- **生产**：Docker Compose（应用 + PostgreSQL）
- **文档**：Swagger/OpenAPI 自动生成（`/docs`）

## 附录：实体列定律（Entity Column Law）

> 由 global-entity-column-law 引入（2026-10-20·人裁「GO，2 取 (a)」）。
> 机器可读清单（不可变表 / BA 契约表 / 棘轮豁免）单源在
> `apps/api/src/database/entity-column-law.ts`；本附录只陈述语义——**切勿在此复述清单**。
> CI 由 `entity-column-law.guard.test.ts` 强制执行（对声明式列元数据做数据级 inspect；
> 豁免腐烂或新增违例即闸红）。

- **L1 存在性**：每张表必须有 `createdAt`；可变表必须另有 `updatedAt`。缺失必须是
  **显式声明的事实**：append-only 表登记为不可变；Better Auth 契约表仅做表名恒等登账——
  其加列规则见下方「BA 表共享」条。
- **BA 表共享（global-governance-lifecycle-consolidation · 人裁 2026-10-23）**：
  Better Auth 相关表**非专用**——系**共享表**。其他业务/限界上下文可按需 **additive 增
  自撰域列**，**优先数据建模范式合理性**。BA 约束仍在：**不得删减/修改 BA 约定使用的
  字段及其数据类型**（适配器 raw SQL 寻址钉死·改=违契约）。加于 BA 表的自撰域列受 L1/L2
  管辖（新增可变域列遵 `updatedAt nullable`）。
- **L2 口径（人裁 (a)）**：新表 `updatedAt` 一律 `nullable()`——NULL 即「建后未改」，
  不伪造时间。存量 NOT NULL 盖章表入棘轮豁免账，**只减不增**；不为它们做任何 schema 迁移。
- **统一立场**：公共列统一落在**语义 + 规则**层，**不落结构继承层**（拒绝
  BaseEntity/跨上下文共享列 spread——限界上下文间结构相似是巧合非同一概念，共享实现
  会把上下文焊死）。重议触发器：应用内出现真实多态消费点（泛型审计读写器）。
