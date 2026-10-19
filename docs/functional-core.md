# 函数式领域内核（Functional Core, Imperative Shell）——概念、判据与实践

> 定位: **讲解性指南**（非规范）| 规范性单源: [`docs/specs/architecture.md`](./specs/architecture.md) §核心设计原则（P1–P4）——本文是 P1 的展开阐述，与规范冲突时以规范为准
> 缘起: 架构精度修宪（2026-10-20 · [`global-architecture-functional-core-amendment`](./plans/global-architecture-functional-core-amendment.md)）——本文沉淀其论证、判据与常见问答，供模板使用者在自己的上下文里复制该范式
> 受众: 人 + Agent | 版本: 0.1.0（2026-10-20）

---

## 1. 一句话与一个样例

**把所有业务裁决写成纯函数（同输入恒同输出、零 I/O、不抛框架异常、返回判别联合），把全部副作用（读库、写库、发事件、抛 HTTP）推到外壳。** 内核回答"允许吗/是多少"，外壳负责"去读、去写、去发布"。

本仓库的旗舰样例（91 行、零 import、同时服务租户与用户两条生命周期）：

```ts
// libs/core/src/modules/tenants/lifecycle/tenant-lifecycle.ts
const TRANSITIONS: Record<TenantStatus, readonly TenantStatus[]> = {
  pending_approval: ['active', 'deleted'],
  active: ['active', 'suspended', 'deleted'],
  suspended: ['active', 'deleted'],
  deleted: [],                                  // 终态
};

export function canTransition(from: TenantStatus, to: TenantStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
```

驱动它的外壳（`tenant-status.service.ts` · load → 裁决 → 写回 → 发事件，全程 UoW）：

```ts
const result = await this.uow.run(async () => {
  const row = await store.load(tenantId);           // 副作用：读
  if (!row) return { kind: 'not-found' };
  if (!canTransition(row.status, target))           // 纯：裁决
    return { kind: 'illegal', from: row.status, to: target };
  await store.save(withTenantStatus(row, target));  // 副作用：写
  await events.publishAll([new TenantStatusTransitionedEvent(...)]); // 副作用：发布
  return { kind: 'ok', previous: row.status, status: target };
});
// HTTP 翻译（409/404）在 handler 层，见 governedTenantTransition
```

## 2. 它解决什么问题

传统分层里业务逻辑与数据库/HTTP 调用交织，导致：**测试必须 mock 一串依赖**、规则散落在 service 与 controller 之间难以复用、逻辑无法在不同入口（HTTP/CLI/定时任务）间搬运。函数式内核用一条硬边界分开"纯的计算"与"不纯的交互"——内核测试**直接传对象、断言返回值，零 mock**（见 §9 的状态机矩阵测试）。

该模式的公开表述通常归于 Gary Bernhardt（《Boundaries》· 2012）；它与 Clean Architecture / 六边形架构**同族**——依赖规则都指向内，差异只在内核的写作风格（函数 + 不可变数据，而非实体类）。

## 3. 为什么是本仓库的正确选择

架构精度修宪（2026-10-20）的论证链，三步：

1. **域的复杂度画像**：多租户 SaaS 脚手架的复杂度在**隔离、治理、配额、计费的技术架构与策略规则**，不在千条业务不变量的业务密度。规则形态是"状态迁移表 + 策略闸 + 不变量"，天然是函数形状，不是实体形状。
2. **代码自己投过票**：仓内质量最高的领域代码（tenants 生命周期状态机）**自发采用**了纯函数 + result-union + 服务编排，从未采用聚合风格。
3. **唯一按战术 DDD 建的实体是死代码**：User 聚合的 `register`/`pullDomainEvents`/`changeEmail` 生产零调用（注册走 Better Auth），连同其事件管道、no-op dispatcher、孤儿 Email VO 与 AggregateRoot 基类一并删除（修宪 S1）。

结论：**不是放弃纪律，是停止表演**——宣称从「Clean Architecture + DDD + CQRS」精度化为「六边形（= Clean 同族依赖规则）+ 函数式内核 + CQRS 按需」。

## 4. 结构：内核/外壳分工

| | 内核（functional core） | 外壳（imperative shell） |
|---|---|---|
| 内容 | 纯函数、不可变 record、值对象、result-union | 服务编排、仓储适配器、守卫、UoW、事件发布、HTTP 翻译 |
| 依赖 | 零框架（或仅词表/自家 VO） | 依赖内核（方向恒定：外壳知内核，内核不知外壳） |
| 异常 | 不抛框架异常；不变量违约以**原生 Error** fail-loud | 消费 result-union 后翻译 402/409/404 |
| 时间/随机 | **不做** `Date.now()`/`Math.random()`（经参数注入） | 负责取 now、生成 id，显式传入内核 |
| 测试 | 传对象断言返回值，零 mock | 集成/gated e2e |

接缝的固定形状：**load → 裁决 → write → publish，全程一个 UoW**。`TenantStatusService.transition`、`UserStatusService.transition`（复用同一个 `canTransition`）、`suspend-user`（S3 起状态写与 session 删同事务）都是这个形状的实例。

## 5. 两条纯度硬约束（最常见的假纯度误区）

**约束一：效果是返回值，不是回调参数。**

```ts
// ✗ 假纯度：效果被参数化 ≠ 效果被消除——内核调用了 save 就已不纯，测试退回 mock
function decide(order: Order, save: (o: Order) => Promise<void>): Promise<...>

// ✓ 真纯度：内核返回「新状态 + 待发布事件」，落库/发布由外壳执行
function decide(order: Order): { kind: 'ok'; next: Order; events: DomainEvent[] } | { kind: 'invalid' }
```

**约束二：时钟与随机源经参数注入。** 内核函数签名里 `now: Date` 是显式入参；保证同输入恒同输出、可重放、可测试。违反它的时间规则（"试用期是否过期"）会成为不可测的隐形依赖。

## 6. 判据清单：一段逻辑进内核还是留外壳

依次自问，全部"是"才进内核：

1. 同样的输入是否**恒**产生同样的输出？（无 I/O、无时钟、无随机、无环境变量）
2. 裁决是否可表达为**数据进、数据出**？（不需要中途查库——需要的外部状态由外壳**预先凑齐**作为入参）
3. 失败是否可用**返回值**表达（result-union），而非抛异常控制流？
4. 它是否是**规则**（允许吗/是多少/迁移到哪），而非**编排**（先做什么再做什么）？

反之，凡涉及"读取、写入、发布、翻译 HTTP、开事务"的都是外壳。经验比例：本仓库内核约数百行、外壳数万行——**内核小是这个域的真相，不是缺陷**（见 §12 FAQ）。

## 7. 物理地图：内核件清单

P1 不是目录而是模式，内核件散布各上下文（判据 = 纯度可证 + 被外壳驱动）：

| 内部件 | 职责 | 纯度 |
|---|---|---|
| `libs/core/src/modules/tenants/lifecycle/tenant-lifecycle.ts` | 租户/用户**共用**状态机迁移表 + `canTransition`（旗舰样例） | 零 import |
| `libs/core/src/authorization/instance-predicate.ts` | RBAC 查询级谓词语法 → DB 谓词编译 | 零 import |
| `apps/api/src/modules/authorization/domain/tenant-rbac-policy.ts` | 角色 key/conditions 策略闸 | 仅词表常量 |
| `libs/core/src/modules/subscriptions/quota/tenant-plans.ts` | 档位目录 + `resolvePlanDef` | 仅自家 VO |
| `libs/core/src/modules/subscriptions/quota/quota.vo.ts` | Quota 非负整数不变量（P2 唯一认定 VO） | 零 import |

外围微纯函数：`parseCorsOrigins`、`pathSegmentMatch`、`joinIssuePath`、`entityToRecord` 映射、`checkSeats` 的裁决算术等。

## 8. 与相邻概念的关系（四问四答）

**Q：放弃了 Clean Architecture 吗？** 没有。六边形与 Clean 是同一依赖规则的两个名字（Uncle Bob 自述 Clean = Hexagonal + Onion 的综合重述）；端口-适配器、依赖规则、纯度守卫全保留，改的只是措辞与本仓库代码词汇（port/adapter）的对齐。

**Q：放弃了 DDD 吗？** 放弃的是**聚合优先的战术 DDD 与全覆盖 CQRS 两个宣称**（二者均非 Clean Architecture 的要求）；保留的是战略层——限界上下文、上下文间经领域事件集成（P3）、 ubiquitous language 在治理域的体现。实体的三个职责被拆走：数据形状 → 不可变 record；业务规则 → 纯函数；不变量防护 → 按需 VO（P2）。

**Q：领域事件还算"领域"事件吗？** 算，语义正名为**操作记录**（operation record）：由 service/handler 层发布是**正式模式**（P3），不再视作对"聚合事件"的妥协。event store 定位 = 审计 + 集成，非事件溯源真相源；投影/saga（Phase C）是触发判据驱动的可选项。

**Q：值对象还要吗？** 按需（P2 判据）：**违反不变量 = 破坏数据正确性**的概念才封类型（本域唯一认定：`Quota`）；格式类校验归边界 zod schema，**不为 VO 而 VO**（Money 已实查裁定不做——金额纯透传 Stripe 零本地运算）。

## 9. 测试形态

- **内核：零 mock。** 直接构造输入、断言输出。范例：状态机矩阵测试（全迁移表逐格断言）、`Quota` VO 不变量测试（负数/小数/NaN/Infinity 全拒）、RBAC 策略闸测试。
- **外壳：时序锁。** 用 fake UoW 记录作用域时序，断言"读→裁决→写在同一关键段"（见 `user-governance.command-handlers.test.ts` 的 `tx-begin → transition → session-delete → tx-end` 断言）。
- **纯度本身也是被测的。** `libs/core/src/core-purity.test.ts` 双锁：`@nestjs/common` import ⊆ DI 最小面 + `HttpException/HttpStatus` 零出现——范式不靠自觉靠门禁。

## 10. 反模式清单

| 反模式 | 为什么错 | 本仓对应约束 |
|---|---|---|
| 给内核注入 `save` 类回调 | 效果被参数化 ≠ 被消除，测试退回 mock | §5 约束一 |
| 内核读 `Date.now()` / `Math.random()` | 同输入不同输出，不可测不可重放 | §5 约束二 |
| core/领域层抛 `HttpException(402)` | HTTP 语义渗入 kit，消费点无法自立翻译 | 纯度守卫第二锁（S2 已清零） |
| handler 绕过端口直捅 `em.nativeDelete` | 跨上下文越界 + 事务外写 | 表所有权守卫（S3 已收编） |
| 为 VO 而 VO（每个字段封类型） | 抽象税；格式校验归边界 zod | P2 判据 |
| CRUD 上下文强上 Command/Handler 三件套 | 仪式感代码，零编排收益 | P4：简单上下文是合法终态 |
| `read-models` 当作物化投影宣传 | 名不副实（实为返回类型） | S5 已头注正名 |

## 11. 新增一个裁决的配方

1. **写内核函数**：`canXxx(input): Verdict`——零 import（或仅词表/VO）、result-union 判别联合、不变量违约抛原生 Error；需要时间就加 `now: Date` 入参。
2. **定 Verdict 类型**：`{ kind: 'ok'; ... } | { kind: 'not-found' } | { kind: 'illegal'; from; to }` 形状，成功失败同构可穷尽 switch。
3. **外壳接线**：service/handler 里 load（凑齐全部决策输入）→ 调内核 → write/publish，关键段包 `uow.run`。
4. **HTTP 翻译归外壳**：`kind: 'illegal'` → 409 + `errorCode`（参照 `governedTenantTransition`）。
5. **测试**：内核矩阵测试（零 mock）+ 外壳时序锁 +（如涉及公共契约）gated e2e。
6. **进守卫**：新文件落在扫描面内即自动受纯度双锁保护——若它真是适配器角色，按 guard/decorator/middleware 后缀命名或留待 http/ 目录演进。

## 12. FAQ（真实问过的问题）

**Q：为什么 domain/ 里没有实体了？** 因为"实体"的职责被三件套取代（record=形状、纯函数=规则、port=契约），且唯一的实体（User 聚合）是死代码已删。DB 行就是实体，领域层描述它的形状与规则。（详见修宪方案 §2.A 取证）

**Q：内核在哪里/这么小正常吗？** 见 §7 地图，约数百行。小是域的真相——复杂度在隔离/治理/配额的**技术架构**，多数代码是外壳。范式值钱的是**放置规则**（新裁决长成 canTransition 的样子），不是存量体积。

**Q：测试里为什么要 stub QuotaService/checkSeats？** 因为你测的是**外壳**（守卫/handler 的翻译行为）；内核自身的裁决另有零 mock 测试。两层测试各管一半，正是该模式的红利。

**Q：未来出现"跨多次修改的密集不变量"怎么办？** 按 P2/P1 升级为函数式聚合：`load → 纯迁移函数 → save`——`TenantStatusService.transition` 已经是这个形态（没有 class 外壳的聚合事务）。不需要回到实体类。

---

## 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 首版 | 架构精度修宪的论证/判据/地图/FAQ 沉淀成讲解指南（规范单源仍居 architecture.md） |
