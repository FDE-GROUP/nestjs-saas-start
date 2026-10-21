# Part 8：Application 工程的设计论证（Contracts / Messaging / 仓储之辩）

> 用途: 调研参考（非开发依据）· 逐篇忠实对译，主题串读见 [04](04-application-layer-ports.md)，横向判读见 [09](09-critique-and-repo-mapping.md)

## 原文信息

| 项 | 值 |
| --- | --- |
| 原标题 | What is Clean Architecture: Part 8 - Designing the Application Project |
| 链接 | https://dev.to/moh_moh701/clean-architecture-p8-designing-the-application-project-596n |
| 作者 | mohamed Tayel（`moh_moh701`） |
| 发布时间 | 2024-08-29T13:44:18Z |
| 系列 | Clean Architecture（collection 28557）第 8 篇 |
| 平台标注阅读时长 | 3 分钟 |
| 反应数 / 评论数 | 1 / 0 |
| 标签 | `architecture` `dotnetcore` `softwareengineering` `softwaredevelopment` |
| AI 披露状态 | `not_disclosed` |
| dev.to 文章 id | 1979023 |
| 本篇原图 | 0 张；**本篇全系列唯一一篇"零代码零图"的纯论证文** |

---

## 逐段对译

### 开篇

> In our previous article, we laid the groundwork by creating the Domain Project, setting the stage for a clean and maintainable architecture. Now, it's time to tackle the next big piece of the puzzle: the Application Project. This is where the rubber meets the road, as we begin to structure the core of our architecture. Fasten your seatbelts—this journey will involve several key concepts that are critical to achieving a loosely coupled, scalable application.

上一篇通过创建 Domain 工程打好了地基；现在处理拼图的下一大块：**Application 工程**。这是"车轮落地"的地方，我们开始搭建架构的核心。系好安全带——这段旅程涉及若干对达成**松耦合、可伸缩应用**至关重要的概念。

### The Role of the Application Project（Application 工程的角色）

> The Application Project is a fundamental part of our architecture's core. ... The Application Project is where we implement the core business logic while keeping the code decoupled from the infrastructure. This ensures that our application remains flexible and easy to maintain as it grows.
>
> In our architectural schema, the Application Project is clearly highlighted as part of the core. It's where we handle the flow of data and the execution of business rules, but without direct dependencies on the infrastructure or UI layers. This separation is key to achieving the clean architecture we're striving for.

Application 工程是架构核心的基本组成部分，遵循 clean architecture 原则；**它是实现核心业务逻辑的地方，同时让代码与基础设施解耦**，从而保证应用随规模增长仍灵活易维护。在作者的架构示意图中，Application 被明确划入 core：这里处理数据流与业务规则的执行，但**不直接依赖 infrastructure 或 UI 层**——这种分离是达成 CA 的关键。

> 注记：「这里执行业务规则」的声明与实操不符：P9–P14 真正写出来的业务规则全部是 **Handler 里的流程编排 + FluentValidation 的字段校验**，领域侧零规则。作者对 "core business logic" 的定位其实更接近用例（use case）而非领域逻辑，但文中没有区分这两个概念。

### Key Concepts: Contracts and Messaging（两大关键概念：契约与消息）

> To maintain this separation and achieve loose coupling, we rely heavily on two concepts: **contracts** (interfaces) and **messaging**.

要维持这种分离、达成松耦合，主要依靠两个概念：**契约（接口）**与**消息（messaging）**。

#### Contracts (Interfaces)

> Contracts, or interfaces, are the backbone of our Application Project. They allow us to define the operations and services that our application will rely on, without tying those definitions to specific implementations. This abstraction is critical for maintaining flexibility and enabling easy swapping of implementations when needed.
>
> In our Application Project, you'll notice that we create a large number of interfaces. This is intentional and essential for building a robust architecture. Most of these interfaces will eventually be implemented in the infrastructure layer, allowing the application core to remain independent and implementation-agnostic.

契约/接口是 Application 工程的脊梁：它们让我们**定义应用要依赖的操作与服务，而不把定义绑定到具体实现**；这一抽象对保持灵活性、便于按需替换实现至关重要。你会注意到 Application 工程里**创建了非常多接口**——这是有意为之，且是构建健壮架构所必需的；**其中大多数最终在 infrastructure 层实现**，从而让应用核心保持独立、与实现无关。

> 注记：这一段是全系列**对 Dependency Rule 最清楚的口头表述**（"接口在内层、实现在外层"）。可惜它没有配任何图示或代码，且原文把基础设施层与持久化层混为一谈（P15 才拆成 `Infrastructure` 与 `Persistence` 两个工程）。

#### Messaging

> The second concept we'll leverage is messaging. This allows different components of our application to communicate without direct references to each other. Instead, communication happens through an intermediate or mediator, which facilitates the interaction. This pattern further enforces loose coupling by ensuring that components remain isolated and only interact through well-defined channels.

第二个概念是 messaging：它让不同组件**无需直接相互引用**即可通信——通信经由一个中间人/中介者（mediator）促动。该模式通过"组件保持隔离、只经明确定义的通道交互"进一步强化松耦合。

> 注记：此处只给了概念，**没有解释 mediator 与 CA 原著"接口适配器/用例"的对应关系**；到 P10 才落地为 MediatR 的 `IRequest/IRequestHandler`。另外"消息（messaging）"这个词在分布式语境里通常指队列/事件总线，本文用它指代**进程内中介者**，术语选择容易误导（本仓的领域事件/ES 路线才是真正的 messaging，见 `docs/plans/event-sourcing-roadmap.md`）。

### Implementing the Repository Pattern（仓储模式）

> One of the first areas where we'll see the power of contracts in action is in the **repository pattern**. In our application architecture, the repository pattern serves as a mediator between the application code and the data access layer.

契约发挥作用的第一处领域是**仓储模式**：在本文架构里，仓储充作应用代码与数据访问层之间的中介。

#### Why Use the Repository Pattern?

> The repository pattern creates a layer of abstraction between the business logic and the data access code. This is a common and effective way to ensure that your application code is not cluttered with data access details. Instead, all data access operations are channeled through repositories, which adhere to the **DRY** (Don't Repeat Yourself) principle by centralizing these operations.

仓储在业务逻辑与数据访问代码之间建立一层抽象，这是防止应用代码被数据访问细节塞满的常用有效手段；所有数据访问操作都经由仓储这条通道，而"集中这些操作"符合 **DRY**。

#### The Debate: Repository vs. Entity Framework Core

> There is some debate around the necessity of using a repository pattern when working with Entity Framework Core, as EF Core's DbContext already provides many repository-like functionalities. However, I believe that using repositories still holds value, especially in maintaining a clean separation between your application logic and data access code. This is why repositories are included in our architecture.
>
> That said, I've decided not to implement a manual unit of work pattern, as EF Core's DbContext handles this sufficiently. This decision aligns with the philosophy of not reinventing the wheel and focusing on what truly adds value to the architecture.

围绕"用 EF Core 时是否还需要仓储"存在争议，因为 **EF Core 的 `DbContext` 已经提供了许多类仓储的能力**。但作者认为仓储仍有价值，尤其在"保持应用逻辑与数据访问代码干净分离"方面——因此本架构包含仓储。**另一方面，作者决定不手写 Unit of Work 模式，因为 `DbContext` 已足够处理它**；这个决定符合"不重复造轮子、只聚焦真正为架构增值之物"的哲学。

> 注记：这是原文最诚实的一段（公开承认争议并给出取舍）。但要指出一个**作者自己没发现的自相矛盾**：他一面以"`DbContext` 已提供 UoW，故不手写"为由省掉 Unit Of Work，一面在 P9 的仓储接口里**不放任何提交/事务方法**（只有 `AddAsync/UpdateAsync/DeleteAsync`），结果 P16 的实现让**每个仓储方法各自调用 `SaveChangesAsync()`**——一次用例里的多次写操作因此被切成多个独立事务。"不手写 UoW"本身是正当取舍，但它的**前提是让调用方直接掌握 `DbContext` 的提交时机**；本文既隐藏了 `DbContext`（用仓储）、又隐藏了提交（没有 `SaveChanges` 契约），于是**没人拥有事务边界**。详见 [part-16 注记](part-16-ef-core-persistence.md)。

### Creating a Generic Repository（通用仓储）

> In the demo that follows, we'll start by creating a **generic repository**. This will include basic methods like `Add`, `Remove`, and `GetByIdAsync`. However, it's important to note that at this stage, we are only defining the contracts—not the implementations. The actual implementation of these repositories will be handled later, likely in the infrastructure layer.

接下来的演示先创建**通用仓储**，包含 `Add`、`Remove`、`GetByIdAsync` 等基本方法。重要说明：**本阶段只定义契约、不写实现**；真正实现稍后处理，"大概率在 infrastructure 层"。

> 注记：方法名 `Add / Remove / GetByIdAsync` 与 P9 实际写出的契约（`AddAsync / DeleteAsync / GetByIdAsync`）**不一致**（P8 说的 `Add`、`Remove` 从未存在）。另外"likely in the infrastructure layer"这个不确定语气，最终落地时被拆成 `Persistence` 工程实现仓储、`Infrastructure` 工程实现 CSV/邮件（P15–P17）——与这里的说法不同。

#### Specific Repositories

> In addition to a generic repository, there will be situations where we need more specialized repositories. These specific repositories will cater to unique data access needs that aren't covered by the generic repository. For example, we might need a repository with a method to retrieve all ticket sales for a particular month—something that isn't generic but is essential for certain business operations.

除通用仓储外，某些场景需要更专门的仓储，用于满足通用仓储覆盖不到的独特数据访问需求。例如可能需要一个"取某个月全部门票销售"的方法——它不通用，但对某些业务操作不可或缺。

> 注记：这正是 P16 `IOrderRepository.GetTicketTypesSold(month)` 的预告；从 ISP（接口隔离）角度看，"通用 + 专用派生"是正确姿态。

### Conclusion

> Designing the Application Project is a crucial step in building a clean, maintainable architecture. By relying on contracts and messaging, we ensure that our application core remains loosely coupled and independent from the implementation details of the infrastructure. The repository pattern further enforces this separation, providing a clean interface for data access operations.
>
> In the next article, we'll delve deeper into implementing these concepts and bringing our Application Project to life. Stay tuned as we continue building our clean architecture!
> For the complete source code, you can visit the GitHub repository: https://github.com/mohamedtayel1980/clean-architecture

Application 工程的设计是构建干净可维护架构的关键一步；依靠契约与 messaging，应用核心得以松耦合、独立于基础设施的实现细节；仓储模式进一步强化这一分离，为数据访问提供干净接口。下一篇将深入实现。文末给出仓库地址（此处为纯文本 URL，未做超链接——原稿格式不统一，P7 用了 markdown 链接）。

---

## 整理注记（本篇值得肯定的三点 + 缺陷三点）

**值得肯定**

1. **公开呈现争议并给出可复用的取舍理由**：`DbContext` 已提供仓储/UoW 能力，所以"要不要仓储"必须论证而非默认——这是本系列少见的架构推理，其他各篇几乎全是操作步骤。
2. **明确说出"大多数接口最终在外层实现"**，这是 Dependency Rule 的正确表述。
3. **"不重复造轮子"的克制**是成熟判断：作者没有为了"看起来像 CA"而手写 UoW/事务包装器。

**缺陷**

1. **零代码、零图**，却承担了最抽象的论证任务——与 P1–P3 一样属于"概念篇"，但更关键的是：这一篇的论断（业务逻辑住在这里）**后续没有任何一篇回头验证**。
2. **术语未定义**：messaging、mediator、contracts、generic repository 都只用一句话带过，没有给出与 CA 原著术语（use case / interface adapters / entity）的映射。
3. **命名/方法漂移**：本篇说 `Add/Remove/GetByIdAsync`、实现在 P9 变 `AddAsync/DeleteAsync/GetByIdAsync`、仓储实现位置说 "likely infrastructure" 而最终在 `Persistence`。三处漂移均无说明。

## 与本仓对照（本篇）

| 本篇论点 | 本仓实态 |
| --- | --- |
| 仓储 port 居 Application、实现在外层 | 一致：`modules/<上下文>/application` 定 port，`infrastructure/repositories/*` 实现（例：`apps/api/src/modules/authorization/infrastructure/repositories/mikro-tenant-rbac.repository.ts`） |
| 不手写 Unit of Work（ORM 已提供） | 一致：本仓不引入自建 UoW，事务边界交给 MikroORM `EntityManager`，但**明确由用例/应用服务持有提交时机**，避免本篇"无人拥有事务"的漏洞 |
| mediator 解耦组件 | 本仓未采用 MediatR 式中介者（NestJS 用 CommandBus/QueryBus 时也保留显式 DI），因为**中介者会削弱静态可检查性**；跨上下文通信一律走领域事件（`event-sourcing-roadmap`） |
| 专用仓储（月度销售） | 本仓同样按查询需求增设专用 port，但读侧优先走显式查询对象 + 分页契约（`libs/contracts`） |

---

## 评论区实录

本篇 **0 条评论**（API `?a_id=1979023` 返回空数组，`comments_count: 0`）。讽刺的是：**全系列最需要被质疑的一段论证（仓储之辩 + 不做 UoW）恰好零反馈**，其后果到 P16 才以 bug 形式显现。

---

## 附：原文英文全稿（逐字保留）

> 来源：dev.to 官方 API `body_markdown` 字段（作者原始稿），抓取于 2026-10-21；除把图片链接改为本地 `./imges/` 副本（原始 URL 保留在链接 title 中）外，未作任何增删改。
>
> 呈现口径：以下英文全稿**不做代码块包裹、直接按 Markdown 渲染**（保留作者原始标题层级、粗体、列表、代码块与图片）；逐字性以上述 body_markdown 抓取为准，本区未增删改任何文字。

In our previous article, we laid the groundwork by creating the Domain Project, setting the stage for a clean and maintainable architecture. Now, it's time to tackle the next big piece of the puzzle: the Application Project. This is where the rubber meets the road, as we begin to structure the core of our architecture. Fasten your seatbelts—this journey will involve several key concepts that are critical to achieving a loosely coupled, scalable application.

#### **The Role of the Application Project**

The Application Project is a fundamental part of our architecture's core. If you've been following along, you already know that our architecture is built on the principles of clean architecture. The Application Project is where we implement the core business logic while keeping the code decoupled from the infrastructure. This ensures that our application remains flexible and easy to maintain as it grows.

In our architectural schema, the Application Project is clearly highlighted as part of the core. It's where we handle the flow of data and the execution of business rules, but without direct dependencies on the infrastructure or UI layers. This separation is key to achieving the clean architecture we’re striving for.

#### **Key Concepts: Contracts and Messaging**

To maintain this separation and achieve loose coupling, we rely heavily on two concepts: **contracts** (interfaces) and **messaging**.

##### **Contracts (Interfaces)**

Contracts, or interfaces, are the backbone of our Application Project. They allow us to define the operations and services that our application will rely on, without tying those definitions to specific implementations. This abstraction is critical for maintaining flexibility and enabling easy swapping of implementations when needed.

In our Application Project, you’ll notice that we create a large number of interfaces. This is intentional and essential for building a robust architecture. Most of these interfaces will eventually be implemented in the infrastructure layer, allowing the application core to remain independent and implementation-agnostic.

##### **Messaging**

The second concept we’ll leverage is messaging. This allows different components of our application to communicate without direct references to each other. Instead, communication happens through an intermediate or mediator, which facilitates the interaction. This pattern further enforces loose coupling by ensuring that components remain isolated and only interact through well-defined channels.

#### **Implementing the Repository Pattern**

One of the first areas where we’ll see the power of contracts in action is in the **repository pattern**. In our application architecture, the repository pattern serves as a mediator between the application code and the data access layer.

##### **Why Use the Repository Pattern?**

The repository pattern creates a layer of abstraction between the business logic and the data access code. This is a common and effective way to ensure that your application code is not cluttered with data access details. Instead, all data access operations are channeled through repositories, which adhere to the **DRY** (Don’t Repeat Yourself) principle by centralizing these operations.

##### **The Debate: Repository vs. Entity Framework Core**

There is some debate around the necessity of using a repository pattern when working with Entity Framework Core, as EF Core’s DbContext already provides many repository-like functionalities. However, I believe that using repositories still holds value, especially in maintaining a clean separation between your application logic and data access code. This is why repositories are included in our architecture.

That said, I’ve decided not to implement a manual unit of work pattern, as EF Core’s DbContext handles this sufficiently. This decision aligns with the philosophy of not reinventing the wheel and focusing on what truly adds value to the architecture.

#### **Creating a Generic Repository**

In the demo that follows, we’ll start by creating a **generic repository**. This will include basic methods like `Add`, `Remove`, and `GetByIdAsync`. However, it’s important to note that at this stage, we are only defining the contracts—not the implementations. The actual implementation of these repositories will be handled later, likely in the infrastructure layer.

##### **Specific Repositories**

In addition to a generic repository, there will be situations where we need more specialized repositories. These specific repositories will cater to unique data access needs that aren’t covered by the generic repository. For example, we might need a repository with a method to retrieve all ticket sales for a particular month—something that isn’t generic but is essential for certain business operations.

#### **Conclusion**

Designing the Application Project is a crucial step in building a clean, maintainable architecture. By relying on contracts and messaging, we ensure that our application core remains loosely coupled and independent from the implementation details of the infrastructure. The repository pattern further enforces this separation, providing a clean interface for data access operations.

In the next article, we’ll delve deeper into implementing these concepts and bringing our Application Project to life. Stay tuned as we continue building our clean architecture!
For the complete source code, you can visit the GitHub repository: https://github.com/mohamedtayel1980/clean-architecture
