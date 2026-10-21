# 04 · Application 层（上）：Contracts 与仓储端口

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 覆盖原文: Part 8（2024-08-29）· Part 9（2024-08-29）

| 篇 | 原标题 | 链接 |
|---|---|---|
| P8 | What is Clean Architecture: Part 8 - Designing the Application Project | https://dev.to/moh_moh701/clean-architecture-p8-designing-the-application-project-596n |
| P9 | What is Clean Architecture: Part 9 - Setting Up the Application Project in Visual Studio | https://dev.to/moh_moh701/clean-architecture-part-9-setting-up-the-application-project-in-visual-studio-3dj0 |

---

## 1. P8 · Application 层的定位与两大支柱

**定位（原文）**：Application 项目是架构核心的基本组成部分——在这里实现核心业务逻辑，同时**与基础设施保持解耦**，不管基础设施层或 UI 层的直接依赖；数据流与业务规则执行都发生在这里。作者称之为"the rubber meets the road"（真正落地的地方）。

为维持这种分离与松耦合，作者倚重两个概念：

### 1.1 Contracts（接口/契约）

契约是 Application 项目的骨架：它定义应用将依赖的操作与服务，**而不把这些定义绑定到具体实现**。作者明确说：

> "在 Application 项目里你会创建**大量接口**。这是有意为之，也是健壮架构的必需。这些接口中的大多数最终会在基础设施层被实现，从而让应用核心保持独立、与实现无关。"

这句是本系列对"依赖倒置如何物理落地"最直白的表述：**接口数量是设计成本的显性账单**，作者不回避。

### 1.2 Messaging（消息/中介）

第二个支柱：组件之间不直接引用彼此，而是**通过一个中介（mediator）通信**，交互由中间人转发。原文表述："这进一步强化松耦合，确保组件彼此隔离、只通过定义良好的通道交互。"（中介的具体件——MediatR——直到 P10 才登场，P8 只立概念。）

## 2. P8 · 仓储模式：作者怎么陈述理由，以及那场"存废之辩"

原文给仓储模式三条理由：

1. 仓储在业务逻辑与数据访问代码之间造了一层抽象；
2. 让应用代码不被数据访问细节塞满，所有存取操作统一经仓储走；
3. 集中这些操作符合 **DRY**。

**并且作者诚实记录了争议**：

> "在使用 EF Core 时，是否需要仓储模式存在争议，因为 EF Core 的 `DbContext` 本身已经提供了很多仓储-like 的功能。但我仍然认为使用仓储有价值，尤其是在保持应用逻辑与数据访问代码的清晰分离上——这也是我们架构里包含仓储的原因。"

同时他划了一条**不做**的线：

> "我决定**不实现手写的 Unit of Work 模式**，因为 EF Core 的 `DbContext` 已足够处理它。这符合'不重造轮子、只 focus 在真正给架构带来价值的东西'的哲学。"

> **整理注记（这段是本系列最有价值的判断题之一）**：
> - 作者把仓储的存废之辩**摆出来了却没论证透**——只说"我认为仍有价值，因为要保持分离"。反方论点（EF Core 的 `DbContext` + `DbSet` 已是仓储 + UoW，再包一层只是把 LINQ 能力削成 `GetByIdAsync/ListAllAsync`，导致要么泄漏 `IQueryable` 破坏抽象、要么为每个查询加一个专用方法）在原文没有正面处理。
> - 而他"不手写 UoW"的取舍恰恰**自证了反方逻辑的一半**：既然 `DbContext` 已经承担 UoW，为何还要额外一层承担仓储？作者的答复实际上是"为了端口属于应用侧"（DIP 需要），这个理由成立但需要写清——**采仓储是为了架构边界，不是为了封装 EF**。
> - 这个辩题在本仓有直接对应物：本仓的仓储 port 是**领域/应用侧的抽象**，adapter 用 MikroORM 实现，且 port **不暴露 `tenantId`**（隔离卡点在 adapter 从 ALS 注入）——即本仓同样选择"端口为边界服务"的立场，与本仓 [mikro-orm-ddd-feasibility](../mikro-orm-ddd-feasibility.md) §3.2「端口倒置已划好爆炸半径」一致。

## 3. P8 · 泛型仓储与专用仓储的分工

- **泛型仓储**（`Add`、`Remove`、`GetByIdAsync` 等基本方法）：这一阶段**只定义契约，不写实现**，实现留给基础设施层。
- **专用仓储**：当出现泛型覆盖不到的、特定业务需要的数据访问时（原文举例："取某个月全部票务销售"这种不通用但业务必需的方法），为其单独建仓储。

## 4. P9 · 落地：建项目、摆目录、写契约

### 4.1 项目与目录

新建类库 `GloboTicket.TicketManagement.ApplicationProject`（原文命名带 "Project" 后缀，与 P7 的 `...Domain` 命名风格不一致，属原文瑕疵）。组织方式：

- 建 `Contracts` 文件夹，存放定义应用所执行操作的全部接口；
- `Contracts` 内再建子文件夹分类，例如 `Persistence` 存数据库交互相关契约——"即使项目长大，结构仍然干净可导航"。

作者的说明：**即使应用不大，也按能扩展到企业级的方式来组织**（这是 CA 的典型投资姿态：结构先于规模）。

### 4.2 泛型异步仓储契约（原文原貌）

```csharp
public interface IAsyncRepository<T> where T : class
{
    Task<T> GetByIdAsync(Guid id);
    Task<IReadOnlyList<T>> ListAllAsync();
    Task<T> AddAsync(T entity);
    Task UpdateAsync(T entity);
    Task DeleteAsync(T entity);
}
```

作者要点：泛型（`where T : class`）→ 一套接口服务所有仓储、保证一致性；五个方法覆盖多数实体的基本操作。

> **整理注记（四条可直接当评审 checklist 的问题）**：
> 1. `GetByIdAsync(Guid id)` 把 **主键类型钉死为 Guid** 进了应用侧契约——业务契约里出现物理标识类型，属轻度泄漏（本仓 port 用 `ItemId`/值对象一类抽象更稳）。
> 2. **返回 `T` 非空但 EF 找不到时返回 null**，类型层无保护（`Task<T>` 而非 `Task<T?>`），P12 的 handler 里就出现 `if (eventEntity == null) throw` 的事后补救——契约与实现语义不一致。
> 3. **`ListAllAsync` 返回全表**：无分页、无投影、无排序参数。这个形状在 P10 被 `GetEventsListQueryHandler` 直接消费（取全部再内存 `OrderBy`），是**可预见的性能陷阱**，也是"泛型仓储把能力削平"的典型症状。
> 4. `UpdateAsync`/`DeleteAsync` 无返回值、无并发令牌（无 `RowVersion`/乐观锁参数），多实例下的更新丢失风险结构上无人管。

### 4.3 专用仓储契约（派生 + 扩展点）

```csharp
public interface IEventRepository : IAsyncRepository<Event>
{
    // 定义 Event 专属的额外方法
}

public interface IOrderRepository : IAsyncRepository<Order> { }
public interface ICategoryRepository : IAsyncRepository<Category> { }
```

原文说明：各接口继承 `IAsyncRepository<T>`，再补各自独有的方法（例如 `IEventRepository` 可能有按日期范围取活动的方法）。**注意 P9 里这三个接口都是空体**，真正补方法在 P13/P16（`IsEventNameAndDateUnique`、`GetCategoriesWithEvents`）。

> 这里隐含一个符合 ISP 的姿态：**派生接口只加必需的方法，不往泛型基接口堆**——泛型基接口保持五个方法不动，业务专属查询落在派生接口，避免"一个接口服务所有场景"的胖接口。

### 4.4 项目引用与后续预告

Application 项目需**引用 Domain 项目**（才能用 `Event/Order/Category`）——这是本系列依赖方向的一个具体样本：**外层（Application）引用内层（Domain）**，与 P1 的 Dependency Rule 相符。

作者结语：契约就位后，"我们大部分业务逻辑将对着这些契约来写，确保应用核心与实现细节保持解耦"；下一模块会在持久层实现这些仓储并连上数据库（实际在 P15/P16 兑现）。

## 5. 评论区增量

- P9 收到 Facundo Paez 的正面反馈（"非常有用"），无实质质疑；P8 无评论。**这两篇是全系列讨论热度最低的部分**，与它们内容最"标准"相符——没有争议点自然没有对话。

## 6. 与本仓对照

| 原文（P8/P9） | 本仓实态 | 判断 |
|---|---|---|
| 契约居 `Contracts/Persistence`，实现在基础设施 | `modules/<ctx>/domain/repositories/`（port）+ `modules/<ctx>/infrastructure/repositories/`（adapter），如当前打开的 [mikro-tenant-rbac.repository.ts](../../../apps/api/src/modules/authorization/infrastructure/repositories/mikro-tenant-rbac.repository.ts) | 同构；本仓把 port 放 domain 侧（更贴 DDD），原文放 application 侧（更贴原著 CA） |
| 泛型 `IAsyncRepository<T>` + 派生专用仓储 | 本仓以每上下文具体 port 为主（不做通用 CRUD 基接口），CRUD 交由 MikroORM `EntityRepository`/UoW 在 adapter 内部使用 | **本仓刻意不采泛型 CRUD 基接口**：避免把聚合根退化成表行，也避免 `ListAllAsync` 那种削平能力 |
| Messaging（中介）为第二支柱 | 本仓 `shared-kernel/cqrs` + NestJS CQRS 模块（`@CommandHandler/@QueryHandler`），跨上下文走领域事件 | 一致，且本仓把"中介"与"事件总线"分成两条通道 |
| "不手写 UoW（EF 已提供）" | 本仓 `EventStore/DomainEventPublisher` 端口 + Mikro flush 时机作为派发点（见 [mikro-orm-ddd-feasibility](../mikro-orm-ddd-feasibility.md) §3.1） | 同一哲学：框架已提供的机制不重造，但要显式指出挂载点 |

## 7. 本篇可带走的事实

- **CA 的物理实现 = 大量接口 + 明确归属**：接口写在应用/领域侧、实现写在基础设施侧，这两处不能同时出现在一个项目里。
- **仓储是边界手段而非 EF 封装**：若要论证仓储的必要性，理由只能是"DIP 需要属于内层的端口"，"避免重复 SQL"这类理由 EF/ORM 自己就能满足。
- P9 的泛型基接口是**可复现的起步形状**，但它同时带来四处真实缺陷（Guid 钉死、可空性、全表返回、无并发控制），照抄时至少要修这四点。
