# 项目架构

## 核心设计原则

- **六边形架构 / 整洁架构（Hexagonal = Clean Architecture·同一依赖规则）**：端口-适配器 + 依赖方向严格向内（`api → application → domain ← infrastructure`）；domain 除共享内核外零框架依赖（core 纯度守卫测试可执行化锁定）。
- **函数式领域内核（functional core, imperative shell·架构精度修宪 2026-10-20）**：领域裁决 = 纯函数 + 不可变数据 + result-union（基准样例 `canTransition`）；**不采用聚合优先的战术 DDD**（唯一天然聚合 User 的生命周期归 Better Auth·死管道已删），值对象按需（本域仅 `Quota`）。
- **CQRS 按需（P4 判据）**：存在跨聚合编排/事务边界/事件发布的上下文走 `Command/Query → Handler`（`@nestjs/cqrs`）；简单上下文（controller + service + repository）是**合法终态**而非「没做完」。能力基线必含、实施逐模块裁（ES/EDA 同此规则，见下条）；handler 实证示例：tenants 治理命令、users delete/export。
- **垂直切片（Vertical Slice）**：按功能而非技术分层组织（`apps/api/src/modules/<context>`；共享契约侧居 `libs/core/src/modules/<context>`）。上下文之间只能通过领域事件耦合，禁止 import 另一个上下文的 `domain/` 或 `infrastructure/`。
- **Event Sourcing（能力基线·逐模块按需·分期递进）**：确定的架构目标（人澄清 2026-10-14；2026-10-20 人再定向「回放即真相」+ 能力/实施分离，**supersede** 同日精度修宪的「Phase C 可选·终态缺省=审计日志」口径——见 [module-es-truth-source-amendment.md](../plans/module-es-truth-source-amendment.md)）。架构必须**完备提供** CQRS/ES/EDA 能力（端口、机制、参考示范）；**实施按业务模块实际需求逐模块裁**——被事件化的聚合以 event store 为唯一真相源（「回放即真相」·读表降为可重建投影）；简单 CRUD / 无状态数据（sessions、verification、成员关系等）**可依法永远不事件化**。已落地：shadow-append + 同事务 outbox + relay（`EVENT_PUBLISH_MODE: inproc|shadow|outbox`·缺省 inproc）；事件由 service/handler 层发布（P3·「操作记录」语义·聚合事件管道已于精度修宪 S1 删除）。回放即真相以试点先行实证（tenants 治理状态机·R1）。详见 [event-sourcing-roadmap.md](../plans/event-sourcing-roadmap.md)。
- **EDA（事件驱动架构·确定采纳）**：领域事件是上下文间**唯一**集成机制；演进路径 = 进程内派发（已落地）→ 同事务 outbox 耐久发布（Phase B）→ 跨进程 broker 订阅（仅微服务触发器成立后，见 [microservice-readiness.md](../plans/microservice-readiness.md)）。

### 函数式内核件清单（P1 的物理地图·架构精度修宪补笔）

P1 不是目录而是模式——内核件散布各上下文，判据 = **纯度可证**（零 import 或仅词表/自家 VO）+ **被外壳驱动**（load → 裁决 → write 全程 UoW）。纯度由 `libs/core/src/core-purity.test.ts` 双锁强制（`@nestjs/common` import ⊆ DI 最小面 + `HttpException/HttpStatus` 零出现）。新裁决一律以此为形：

| 内部件 | 职责 | 纯度 |
|---|---|---|
| `core/modules/tenants/lifecycle/tenant-lifecycle.ts` | 租户/用户**共用**状态机迁移表 + `canTransition`（result-union·旗舰样例） | 零 import |
| `core/authorization/instance-predicate.ts` | RBAC 查询级谓词语法 → DB 谓词编译 | 零 import |
| `apps/api …/authorization/domain/tenant-rbac-policy.ts` | 角色 key/conditions 策略闸 | 仅词表常量 |
| `core/modules/subscriptions/quota/tenant-plans.ts` | 档位目录 + `resolvePlanDef` | 仅自家 VO |
| `core/modules/subscriptions/quota/quota.vo.ts` | Quota 非负整数不变量（P2 唯一认定 VO） | 零 import |

> 概念/判据/配方/FAQ 的完整展开见 [函数式领域内核指南](../functional-core.md)（讲解性·非规范）。
> 体积小（合计约数百行）是**域的真相**而非缺陷：复杂度在隔离/治理/配额的技术架构，不在业务规则密度——多数代码是外壳（端口/适配器/守卫/UoW）。内核的可复用性见 `user-status.service` 对 `canTransition` 的直接复用（一表服务两条生命周期）。

## 目录结构

> **逻辑视图。** 下方目录树是**合并后的分层视图**，**并非**单个 `apps/api/src` 目录：其中若干目录（`shared-kernel/`、`tenancy/`、`authorization/`、`platform/`，以及 `subscriptions`/`workspaces`/`tenants` 的 `domain/`+`application/`）实际位于 `libs/core`。它们在两个后端包之间的精确归属见下方 **§两包物理布局**。

```
src/
├── app.module.ts            # 根模块（引入全局基础设施 + 各功能上下文）
├── main.ts                  # 启动：Fastify、StandardSchemaValidationPipe、Swagger、URI 版本化
├── shared-kernel/           # 跨上下文原语
│   ├── domain/              #   AggregateRoot、DomainEvent（纯净，零框架依赖）
│   └── cqrs/types.ts        #   BaseCommand / BaseQuery（封装 @nestjs/cqrs）
├── modules/                 # 限界上下文（垂直切片）
│   ├── users/               # ★ 完整模式的参考实现
│   │   ├── domain/          #   entities/ value-objects/ events/ repositories/（端口）
│   │   ├── application/     #   commands/ queries/ read-models/（处理器）
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
└── modules/{subscriptions,workspaces,tenants}
                                             # L2 随 kit 发售的上下文：domain/（实体 + 仓储**端口**）+ application/（CQRS 处理器）——仅端口

apps/api                                     # 参考应用——所有具体实现物均在此
├── modules/<ctx>/{api,infrastructure}       # HTTP controller + MikroORM 适配器，**绑定** core 端口（端口→适配器）
├── database/  config/  main.ts  app.module.ts   # 全局基础设施 + DI 装配根
└── modules/{users,auth,posts,payment,storage}   # 完整本地垂直切片（domain→application→infrastructure→api）

apps/web            # 可部署前端壳（React + Vite）· F0
packages/api-client # 由 openapi.yaml 生成的可交换类型化客户端· F1
```

**边界不变式（真正的红线——由 `fallow` + 下方逐层 import 矩阵共同守护）：**
1. `libs/core` 任一层都**不含**基础设施 / ORM（`@mikro-orm`）/ HTTP（controller、DTO）具体物——端口在 core，适配器在 apps。
2. 依赖方向恒为 `apps → core`；`libs/core` 绝不 import `apps/*`。
3. 消费方（apps/api）只做 `端口 → 适配器` 绑定 + HTTP/装配。

所谓「层位移」**仅当**具体实现物被塞进 `libs/core`（如 `modules/*/domain` 下出现 MikroORM 实体）时才构成违规；在 kit 内发售领域 + 应用层是本征设计、非违规。命名冻结：`@core/saas-kit` 包与 `shared-kernel/` 子层**均不重命名**（对入站 import blast radius 大、结构收益为零——kit/kernel 之辨现由文档界定、不再编码进目录名）。裁决详见：[module-core-position-kernel-vs-kit](../plans/module-core-position-kernel-vs-kit.md)。

## `users` 上下文（写路径只有 Command → CommandHandler）

Controller 从不直接改状态。以真实落地流示范——tenants 治理（`POST /tenants/:id/approve`·即 R1 回放即真相首试点）：

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

## 限界上下文地图与多租户机制层

术语纪律：**租户（Tenant）**是业务概念（`tenants` 核心域聚合·有生命周期/不变量/语言）；
其物理实体为自有户籍表 `tenant`（`tenants` 上下文属主·`id` = `organization.id` 同值代理键·
`status` 真列 + DB CHECK——global-tenant-entity-reclamation 2026-10-20 改判旧「租户身份=organization·
态寄居 `metadata`」隐含位移；`organization` 为其认证/成员面投影）；
**多租户（Multi-tenancy）**是隔离机制（基础设施·无聚合无生命周期：请求识别 → ALS 传播 →
边界执行 → 豁免轴）。两者不可混住：`tenancy/` 不住租户聚合的业务写面，业务上下文也不得
自实现隔离。`tenancy/` **消费** `authorization` 的裁决端口；经重构 A 片不再自住 CASL
checker、经 D 片不再自住平台治理。

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
`@EventsHandler` 订阅。`auth`、`stripe`、`storage` 保持为薄适配/胶水层（P4 合法终态）；未来若某上下文
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
- **认证**：Better Auth（**auth 域工具库**——global-ba-entity-domain-placement 2026-10-20 人裁再裁决旧「纯认证与成员数据源·契约面存储视图集中」框架，采 CASL 同构原则「库约束接口·域拥有事实」）：身份机器表（user/session/account/verification/consent）归 **auth 域**、组织容器表（organization/member/invitation）归 **tenants 域**——形状受 BA 接口契约约束（列律 `BA_CONTRACT_TABLES` 登账·改列=违契约），操作经 `auth.api.*` 工具面（**拥有表 ≠ 接管操作**）；其 org 内置授权 HTTP 面已封堵（module-rbac-casl 甲裁），成员/邀请对外端点由我方门面经服务端直调；租户生命周期态存自有户籍表 `tenant.status` 真列（global-tenant-entity-reclamation 收权案），BA `organization.metadata` 不携任何我方寄居键——两条承诺逐字成立）
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
  **显式声明的事实**：append-only 表登记为不可变；Better Auth 契约表不在列形覆盖面
  （其列形由适配器 raw SQL 寻址契约钉死），仅做表名恒等登账。
- **L2 口径（人裁 (a)）**：新表 `updatedAt` 一律 `nullable()`——NULL 即「建后未改」，
  不伪造时间。存量 NOT NULL 盖章表入棘轮豁免账，**只减不增**；不为它们做任何 schema 迁移。
- **统一立场**：公共列统一落在**语义 + 规则**层，**不落结构继承层**（拒绝
  BaseEntity/跨上下文共享列 spread——限界上下文间结构相似是巧合非同一概念，共享实现
  会把上下文焊死）。重议触发器：应用内出现真实多态消费点（泛型审计读写器）。
