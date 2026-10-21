# Part 12：用 Command 创建、更新、删除实体（CUD）

> 用途: 调研参考（非开发依据）· 逐篇忠实对译，主题串读见 [05](05-application-layer-cqrs.md)，横向判读见 [09](09-critique-and-repo-mapping.md)

## 原文信息

| 项 | 值 |
| --- | --- |
| 原标题 | What is Clean Architecture: Part 12-Creating, Updating, and Deleting Entities Using Commands |
| 链接 | https://dev.to/moh_moh701/what-is-clean-architecture-part-12-creating-updating-and-deleting-entities-using-commands-5f1c |
| 作者 | mohamed Tayel（`moh_moh701`） |
| 发布时间 | 2024-09-05T13:15:42Z（与 P11 同日发布，相隔 47 分钟） |
| 系列 | Clean Architecture（collection 28557）第 12 篇 |
| 平台标注阅读时长 | 未标注（`reading_time: null`） |
| 反应数 / 评论数 | 1 / 0 |
| 标签 | `architecture` `softwareengineering` |
| AI 披露状态 | `not_disclosed` |
| dev.to 文章 id | 1988062 |
| 本篇原图 | 0 张（全系列少数无截图篇目，正文纯代码） |

---

## 逐段对译（正文与代码**全量照录**）

### Introduction

> In modern application development, querying data is essential, but equally important is the ability to create, update, and delete entities. This article will focus on how to handle these operations using **commands** within a **feature-based architecture**, leveraging **MediatR** and **AutoMapper**. We will walk through the code for creating an event and extend that to updating and deleting events.

现代应用开发中，查数据不可或缺， equally 重要的是**创建、更新、删除实体**的能力。本文聚焦如何在 feature-based 架构里用 **command** 处理这些操作，继续使用 MediatR 与 AutoMapper；先走一遍创建活动的代码，再扩展到更新与删除。

> To understand the core principles behind the structure of our system, you may want to explore the following foundational concepts:
>
> - **CQRS and SOLID Principles**: My article on [Enhancing .NET Applications with CQRS and SOLID Principles](https://dev.to/moh_moh701/enhancing-net-applications-with-cqrs-and-solid-principles-30i8) explains the benefits of CQRS and how it aligns with SOLID principles.
> - **The Mediator Pattern**: For a deeper dive into how the Mediator pattern simplifies communication between components, refer to my post on [Understanding the Mediator Pattern in .NET](https://dev.to/moh_moh701/understanding-the-mediator-pattern-in-net-52do).
> - **AutoMapper**: Finally, if you are curious about how and when to use AutoMapper, take a look at [AutoMapper in .NET: When to Use It and When to Avoid It](https://dev.to/moh_moh701/automapper-in-net-when-to-use-it-16b4).

想理解系统结构背后的核心原则，可延伸阅读作者自己的三篇旧文（CQRS+SOLID / Mediator / AutoMapper）。

> **取证注记（死链，已实测）**：本篇第 3 条外链写作 `.../automapper-in-net-when-to-use-it-16b4`，curl 实测返回 **404**；P10 里同一篇文章的链接（`.../automapper-in-net-when-to-use-it-and-when-to-avoid-it-16b4`）实测 200。即 P12 的 slug 被抄短了一截、是**原稿实存死链**（dev.to 不会自动纠正该形态）。顺带提醒：该文标题本身是 "**When to Use It and When to Avoid It**"——而本篇的实践（见下文判读）恰好落在作者自己说的"该避免"一侧。

### Creating an Event with `CreateEventCommand`

#### Step 1: Define the `CreateEventCommand`（定义命令，原文逐字）

> The first step is to define a command class. The command is a **message** that encapsulates all the data needed to create the event. We use MediatR's `IRequest` interface to wrap this command.

第一步定义 command 类。command 是一条**消息（message）**，封装创建事件所需的**全部数据**；用 MediatR 的 `IRequest` 包裹它。

```csharp
 public class CreateEventCommand : IRequest<Guid>
 {
     public string Name { get; set; }
     public int Price { get; set; }
     public string Artist { get; set; }
     public DateTime Date { get; set; }
     public string Description { get; set; }
     public string ImageUrl { get; set; }
     public Guid CategoryId { get; set; }
     public override string ToString()
     {
         return $"Event name: {Name}; Price: {Price}; By: {Artist}; On: {Date.ToShortDateString()}; Description: {Description}";
     }
 }
```

> Here, `CreateEventCommand` contains the properties for the new event. It implements `IRequest<Guid>`, which indicates that the command will return the **GUID** of the newly created event.

`CreateEventCommand` 含新活动的全部属性；实现 `IRequest<Guid>` 表示命令将返回新建活动的 GUID。

> 注记：
> 1. command 字段与 P7 `Event` 实体几乎一一对应（含 `int Price`——P4/P7 沿用至今的"票价用 int"粗糙建模，无货币类型/分值约定）。
> 2. `ToString()` 重写刻意**不含 ImageUrl/CategoryId**，P13 会解释其用途（日志脱敏/摘要），此处先埋笔。
> 3. 与全系列贴码惯例一致：无 `namespace`、无 `using`，`IRequest` 直接裸引用。
> 4. 无 `EventId` 字段——创建时由数据库/EF 生成，`Handle` 里返回的 `eventEntity.EventId` 依赖 `AddAsync` 内部 `SaveChangesAsync`（P16 才可见）真把 Guid 物化回来；契约层面 `AddAsync(T entity)` 返回 `Task<T>` 但没人用它，返回值被丢弃。

#### Step 2: Handle the Command with `CreateEventCommandHandler`（原文逐字）

```csharp
public class CreateEventCommandHandler : IRequestHandler<CreateEventCommand, Guid>
{
    private readonly IEventRepository _eventRepository;
    private readonly IMapper _mapper;

    public CreateEventCommandHandler(IEventRepository eventRepository, IMapper mapper)
    {
        _eventRepository = eventRepository;
        _mapper = mapper;
    }

    public async Task<Guid> Handle(CreateEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = _mapper.Map<Event>(request);
        await _eventRepository.AddAsync(eventEntity);
        return eventEntity.EventId;
    }
}
```

> In this handler: The incoming command is mapped to an `Event` entity using **AutoMapper**. The event is saved to the repository using the `AddAsync` method. Finally, the handler returns the `GUID` of the newly created event.

 handler 三步：命令 → AutoMapper 映射成 `Event` 实体 → `AddAsync` 落库 → 返回新实体 `EventId`。

> **判读**：
> 1. **专用仓储终于上场**：注入 `IEventRepository`（P10 读侧用的还是泛型 `IAsyncRepository<Event>`），与 P11 的 `ICategoryRepository` 一起构成"写侧/复杂读侧用专用口"的落地。但此刻 `IEventRepository` 仍是 P9 的空接口（`IsEventNameAndDateUnique` 要到 P13 才加），本篇只用继承来的 `AddAsync`——**专用接口在本篇依旧空转**。
> 2. **DTO 直映射实体 = 授权客户端碰实体一切可写字段**：`CreateMap<CreateEventCommand, Event>()` 按约定把命令字段全部灌进实体。今天命令字段恰好与实体重合所以"看起来没事"，但一旦实体加了敏感字段（如 P7 `AuditableEntity` 的创建时间、或未来的库存/状态机字段），任何忘改 Profile 的扩展都会让 API 输入**默认值覆盖或直接注入**这些字段。没有校验、没有不变式调用——`Event` 在这里只是数据袋（贫血模型在写侧的确证，与 P1 评论区作者主张的富模型相悖，见 [part-01](part-01-what-is-clean-architecture.md) 评论实录）。
> 3. **`cancellationToken` 从头到尾没被传递**（`AddAsync` 签名里就没有它，P9 契约所致）——MediatR 认真传入的取消信号在仓储边界被扔掉，形同虚设。
> 4. 无 CategoryId 存在性校验：创建挂在不存在的分类上，要到数据库外键违约才炸（P16 之后才有 FK 配置），错误信息将是驱动级异常而非业务错误。

#### Step 3: Mapping with AutoMapper（原文逐字）

```csharp
public class MappingProfile : Profile
{
    public MappingProfile()
    {
        CreateMap<CreateEventCommand, Event>();
    }
}
```

> This ensures that AutoMapper knows how to translate between the command and the entity.

这确保 AutoMapper 知道命令与实体之间怎么翻译。

> **判读（三份同名 `MappingProfile` 的漂移至此集齐）**：P10 版本含 3 条 `CreateMap(...).ReverseMap()`（Event↔Vm），P11 版本换成 3 条 Categories 映射（无 ReverseMap），本篇版本**只剩 1 条**命令映射。同一个类名、同一段"完整代码"的姿态，三篇三个互不兼容的版本，任何一篇都没说"追加到既有 Profile"。读者按任一版本覆盖，都会把其他篇的映射弄丢——**教程没有单一事实源**的最直接证据（推测：作者各篇贴码时贴的是当时工作区的片段版本；标注**推断/未验证**，因 GitHub 仓未逐 commit 对拍）。

### Updating an Event with `UpdateEventCommand`

#### Step 1: Define the `UpdateEventCommand`（原文逐字）

```csharp
 public class UpdateEventCommand : IRequest
 {
     public Guid EventId { get; set; }
     public string Name { get; set; }
     public int Price { get; set; }
     public string Artist { get; set; }
     public DateTime Date { get; set; }
     public string Description { get; set; }
     public string ImageUrl { get; set; }
     public Guid CategoryId { get; set; }
 }
```

> Unlike the creation command, this command includes the **EventId** of the event that needs to be updated. In this case, no return type is needed since updates typically do not return a value.

与创建命令不同，本命令带上待更新活动的 `EventId`；更新通常无返回值，所以用无泛型的 `IRequest`（即 `IRequest<Unit>`）。

#### Step 2: Handle the Command with `UpdateEventCommandHandler`（原文逐字）

```csharp
public class UpdateEventCommandHandler : IRequestHandler<UpdateEventCommand>
{
    private readonly IEventRepository _eventRepository;
    private readonly IMapper _mapper;

    public UpdateEventCommandHandler(IEventRepository eventRepository, IMapper mapper)
    {
        _eventRepository = eventRepository;
        _mapper = mapper;
    }

    public async Task<Unit> Handle(UpdateEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = await _eventRepository.GetByIdAsync(request.EventId);
        if (eventEntity == null) throw new NotFoundException(nameof(Event), request.EventId);

        _mapper.Map(request, eventEntity);
        await _eventRepository.UpdateAsync(eventEntity);

        return Unit.Value;
    }
}
```

> In this handler: The event is fetched from the repository by its `EventId`. The command is mapped onto the existing event entity using AutoMapper. The updated event is saved back to the repository using `UpdateAsync`.

Handler 三步：按 `EventId` 取实体 → 命令**映射覆盖到既有实体**上 → `UpdateAsync` 保存。

> **判读（本篇信息密度最高的一段）**：
> 1. **`NotFoundException` 全系列从未定义**——`throw new NotFoundException(nameof(Event), request.EventId)` 使用的类型在 19 篇中没有出处（无类定义、无 import 说明，也无 ASP.NET 内置同名类型可用：`System.Web.Http` 的 `NotFoundException` 不属于 .NET 8 / ASP.NET Core 世界）。照抄即编译错误。（注：真实世界该项目里通常另有同名自定义类，但**教程文本没有交付它**——以原文为口径，属断链；GitHub 仓实存性标注**未验证**。）
> 2. **先判 null 与 P9 契约的暧昧形成互证**：P9 `Task<T> GetByIdAsync(Guid id)` 从未声明可空，P10 的同类读 handler **不判空**，P12 判空——同一作者对同一契约给出两种互相矛盾的用法，说明契约是事后补的、不是设计出来的。
> 3. **全字段覆盖更新 + 无并发令牌**：`_mapper.Map(request, eventEntity)` 把命令的全部同名字段盖进实体（含 `EventId` 自己盖自己）。两个管理员并发编辑同一活动：后提交者**静默吞掉**先提交者的修改，系统毫无察觉。根因在 P9 契约第 4 缺陷（无 `rowversion`/并发令牌），本篇是后果现场。
> 4. **取实体→改→`UpdateAsync` 三连在 EF 语义下是可疑配方**：若 `GetByIdAsync` 返回的是**追踪实体**（P16 将证实走 `FindAsync`/`DbContext` 追踪），则实体被 AutoMapper 改动后变更已被 CLR 感知，`UpdateAsync` 里再 `Attach`/`Update` 一个已追踪实体属多余甚至有害（P16 的 `UpdateAsync` 用 `DbContext.Update` 会把 `Added` 之外状态强标 `Modified`，连带把未加载导航也按主键处理）；若返回的是**非追踪/投影实体**，`Update` 才必要。原文两种语境都没讲，读者无法判断——这是"仓储抽象泄漏 EF 语义"的具体案例（承 P8 的论证、P10 的手工 join，同一病灶第三次出现）。
> 5. `Price/Date/...` 全部直接可写：更新命令允许把**已售出票的活动**的日期改到过去、价格清零——没有任何业务不变式把关，因为实体没有行为（贫血）。

### Deleting an Event with `DeleteEventCommand`

#### Step 1: Define the `DeleteEventCommand`（原文逐字）

```csharp
public class DeleteEventCommand : IRequest
{
    public Guid EventId { get; set; }
}
```

> We only need to pass the `EventId` of the event to be deleted.

只需传待删除活动的 `EventId`。

#### Step 2: Handle the Command with `DeleteEventCommandHandler`（原文逐字）

```csharp
public class DeleteEventCommandHandler : IRequestHandler<DeleteEventCommand>
{
    private readonly IEventRepository _eventRepository;

    public DeleteEventCommandHandler(IEventRepository eventRepository)
    {
        _eventRepository = eventRepository;
    }

    public async Task<Unit> Handle(DeleteEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = await _eventRepository.GetByIdAsync(request.EventId);
        if (eventEntity == null) throw new NotFoundException(nameof(Event), request.EventId);

        await _eventRepository.DeleteAsync(eventEntity);

        return Unit.Value;
    }
}
```

> This handler: Retrieves the event by its `EventId`. Deletes the event using `DeleteAsync` if found.

Handler：按 Id 取实体，找到即 `DeleteAsync` 删除。

> **判读**：
> 1. **硬删除，无级联策略讨论**：P7 的 `Order` 通过 `OrderDetail`（实际 P7 连 OrderDetail 都没建全，见 [part-07](part-07-domain-project.md)）引用活动。删除一个**已售出门票**的活动会发生什么？原文零讨论——外键拒绝？级联删单？孤儿订单？业务上"活动可下架不可抹除"的常识性规则在教程里不存在。
> 2. **删除前多取一次实体是纯开销**：若已知 Id，EF 里 `Remove` 只需一个带主键的桩实体；这里 `GetByIdAsync` 拉全实体只为了判存在性——又一次"仓储抽象限制真实数据访问需求"（P8 论点）的现场，但原文未察觉。
> 3. 与 Update 共用 `NotFoundException`（未定义类型，同上）。

### Validation and Return Types（校验与返回类型，原文逐字）

> While we focused on the core logic, it's important to note that **validation** is a crucial part of handling commands. You can easily integrate **FluentValidation** to validate incoming commands before processing them.
>
> In terms of **return types**, you can choose to return a simple `boolean` for success, or more detailed information, such as the `GUID` of a newly created entity. For updates and deletions, returning nothing (`Unit`) is common practice when the operation is successful.

本篇聚焦核心逻辑，但**校验**是处理命令的关键部分，可以"很容易地集成 FluentValidation"在处理器之前校验入站命令；**返回类型**可选布尔成功位，或更详细的信息（如新建实体的 GUID），更新/删除成功时返回 `Unit`（无值）是常见做法。

> 注记：整段只是**预告**——"可以很容易集成"没有伴随任何代码，校验真正落地在下一篇 P13（FluentValidation + MediatR 管道行为）。`boolean` 成功位的建议则从未在系列中被采用（Update/Delete 全部 `Unit` + 抛异常），属于随口的备选方案。

### Conclusion（原文逐字）

> In this article, we walked through how to create, update, and delete entities using commands in a feature-based architecture. By organizing our code into distinct features, and leveraging MediatR for command handling, we achieve a clean, modular structure that is easy to maintain and extend.
>
> With these patterns in place, your application will be well-structured and scalable, capable of handling more complex business logic as it evolves.

本文走完了在 feature-based 架构中用 command 增删改实体；把代码组织进独立 feature、用 MediatR 处理命令，即可得到干净、模块化、易维护易扩展的结构。有了这些模式，应用将结构良好、可伸缩，足以应对未来更复杂的业务逻辑。

> 注记：结尾没有下篇预告、没有 GitHub 链接（与 P9/P10 收尾物料不一致）；"capable of handling more complex business logic as it evolves"恰是全系列最大的空头支票——19 篇里**没有一条业务规则**写在实体或领域服务里，所有"业务逻辑"就是 CRUD 透传。

---

## 整理注记（本篇结构性小结）

| 维度 | 事实 |
| --- | --- |
| CA 得分点 | 写侧用例全部住 Application 内层，只依赖 port（`IEventRepository`）与 `IMapper`；读写分离为 P13 的"查询带校验/命令带校验"铺路；Update 前判存在性比 P10 读侧无判空进步 |
| CA 失分点 | 命令 DTO 直通实体全字段映射（无不变式）；实体无行为可调用（贫血写侧确证）；删除无领域策略（硬删）|
| 正确性风险 | 无并发令牌的全字段覆盖更新（静默丢失修改）；`NotFoundException` 未定义（编译断链）；`CancellationToken` 在仓储边界被丢弃 |
| 系列内部一致性 | 第三份互不兼容的同名 `MappingProfile`；`GetByIdAsync` 可空语义与 P9 契约、P10 用法三方矛盾 |
| 社区检验 | 1 反应 / **0 评论**——死链（404 实测）、未定义类型、并发缺陷均无人指出并保留至今 |

## 与本仓对照（本篇）

| 本篇做法 | 本仓实态 |
| --- | --- |
| `_mapper.Map(request, eventEntity)` 全字段覆盖 | 写侧走命令 → 聚合根**显式行为方法**（如 `event.renameTo(...)`），敏感/审计字段不经 DTO 通路 |
| `NotFoundException` 抛出未定义类型 | NestJS 内置 `NotFoundException` + 全局异常过滤器统一 envelope（error-handling 体系，见 [09 §5](09-critique-and-repo-mapping.md)） |
| 无并发控制 | MikroORM `@Property({ version: true })` 乐观并发版本列，冲突显式抛 `OptimisticLockException` |
| 硬删除活动 | 业务实体删除须过领域策略（下架/软删/禁止有订单删除），不可裸 `DELETE` |
| 校验仅口头预告 → P13 补丁 | zod 契约单源：入站 schema 即校验即类型（`@Body({ schema })` 官方路径），无需事后管道 |
| `IRequest`/`IRequestHandler<T>` 消息壳 | 本仓不强制中介者壳；用例类直接 `execute()`，跨上下文通信留给领域事件（ES 路线，仅"发而不存"钩子阶段） |

## 评论区实录

**本篇评论数为 0**（API `comments_count: 0`，`/api/comments?a_id=1988062` 空数组；P11/P12 同日发布，可视为"批量存稿释放"段，无任何读者互动）。

---

## 附：原文英文全稿（逐字保留）

> 来源：dev.to 官方 API `body_markdown` 字段（作者原始稿），抓取于 2026-10-21；除把图片链接改为本地 `./imges/` 副本（原始 URL 保留在链接 title 中）外，未作任何增删改。
>
> 呈现口径：以下英文全稿**不做代码块包裹、直接按 Markdown 渲染**（保留作者原始标题层级、粗体、列表、代码块与图片）；逐字性以上述 body_markdown 抓取为准，本区未增删改任何文字。

### Introduction

In modern application development, querying data is essential, but equally important is the ability to create, update, and delete entities. This article will focus on how to handle these operations using **commands** within a **feature-based architecture**, leveraging **MediatR** and **AutoMapper**. We will walk through the code for creating an event and extend that to updating and deleting events.

To understand the core principles behind the structure of our system, you may want to explore the following foundational concepts:
- **CQRS and SOLID Principles**: My article on [Enhancing .NET Applications with CQRS and SOLID Principles](https://dev.to/moh_moh701/enhancing-net-applications-with-cqrs-and-solid-principles-30i8) explains the benefits of CQRS and how it aligns with SOLID principles.

- **The Mediator Pattern**: For a deeper dive into how the Mediator pattern simplifies communication between components, refer to my post on [Understanding the Mediator Pattern in .NET](https://dev.to/moh_moh701/understanding-the-mediator-pattern-in-net-52do).

- **AutoMapper**: Finally, if you are curious about how and when to use AutoMapper, take a look at [AutoMapper in .NET: When to Use It and When to Avoid It](https://dev.to/moh_moh701/automapper-in-net-when-to-use-it-16b4).

---

### Creating an Event with `CreateEventCommand`

Let’s begin by looking at how to create an event in our application.

#### Step 1: Define the `CreateEventCommand`

The first step is to define a command class. The command is a **message** that encapsulates all the data needed to create the event. We use MediatR's `IRequest` interface to wrap this command.

```csharp
 public class CreateEventCommand : IRequest<Guid>
 {
     public string Name { get; set; }
     public int Price { get; set; }
     public string Artist { get; set; }
     public DateTime Date { get; set; }
     public string Description { get; set; }
     public string ImageUrl { get; set; }
     public Guid CategoryId { get; set; }
     public override string ToString()
     {
         return $"Event name: {Name}; Price: {Price}; By: {Artist}; On: {Date.ToShortDateString()}; Description: {Description}";
     }
 }
```

Here, `CreateEventCommand` contains the properties for the new event. It implements `IRequest<Guid>`, which indicates that the command will return the **GUID** of the newly created event.

#### Step 2: Handle the Command with `CreateEventCommandHandler`

Next, we need a **handler** to process the command and create the event in the data store. The handler implements `IRequestHandler<CreateEventCommand, Guid>`:

```csharp
public class CreateEventCommandHandler : IRequestHandler<CreateEventCommand, Guid>
{
    private readonly IEventRepository _eventRepository;
    private readonly IMapper _mapper;

    public CreateEventCommandHandler(IEventRepository eventRepository, IMapper mapper)
    {
        _eventRepository = eventRepository;
        _mapper = mapper;
    }

    public async Task<Guid> Handle(CreateEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = _mapper.Map<Event>(request);
        await _eventRepository.AddAsync(eventEntity);
        return eventEntity.EventId;
    }
}
```

In this handler:
- The incoming command is mapped to an `Event` entity using **AutoMapper**.
- The event is saved to the repository using the `AddAsync` method.
- Finally, the handler returns the `GUID` of the newly created event.

#### Step 3: Mapping with AutoMapper

Since we are mapping from the `CreateEventCommand` to an `Event` entity, we need to define the mapping in our **AutoMapper** profile:

```csharp
public class MappingProfile : Profile
{
    public MappingProfile()
    {
        CreateMap<CreateEventCommand, Event>();
    }
}
```

This ensures that AutoMapper knows how to translate between the command and the entity.

---

### Updating an Event with `UpdateEventCommand`

Next, let's look at how we can update an event.

#### Step 1: Define the `UpdateEventCommand`

For updating an event, we create another command:

```csharp
 public class UpdateEventCommand : IRequest
 {
     public Guid EventId { get; set; }
     public string Name { get; set; }
     public int Price { get; set; }
     public string Artist { get; set; }
     public DateTime Date { get; set; }
     public string Description { get; set; }
     public string ImageUrl { get; set; }
     public Guid CategoryId { get; set; }
 }
```

Unlike the creation command, this command includes the **EventId** of the event that needs to be updated. In this case, no return type is needed since updates typically do not return a value.

#### Step 2: Handle the Command with `UpdateEventCommandHandler`

Here’s how we implement the handler for updating an event:

```csharp
public class UpdateEventCommandHandler : IRequestHandler<UpdateEventCommand>
{
    private readonly IEventRepository _eventRepository;
    private readonly IMapper _mapper;

    public UpdateEventCommandHandler(IEventRepository eventRepository, IMapper mapper)
    {
        _eventRepository = eventRepository;
        _mapper = mapper;
    }

    public async Task<Unit> Handle(UpdateEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = await _eventRepository.GetByIdAsync(request.EventId);
        if (eventEntity == null) throw new NotFoundException(nameof(Event), request.EventId);

        _mapper.Map(request, eventEntity);
        await _eventRepository.UpdateAsync(eventEntity);

        return Unit.Value;
    }
}
```

In this handler:
- The event is fetched from the repository by its `EventId`.
- The command is mapped onto the existing event entity using AutoMapper.
- The updated event is saved back to the repository using `UpdateAsync`.

---

### Deleting an Event with `DeleteEventCommand`

Finally, let’s implement the logic to delete an event.

#### Step 1: Define the `DeleteEventCommand`

We only need to pass the `EventId` of the event to be deleted:

```csharp
public class DeleteEventCommand : IRequest
{
    public Guid EventId { get; set; }
}
```

#### Step 2: Handle the Command with `DeleteEventCommandHandler`

The handler for deleting an event is simple:

```csharp
public class DeleteEventCommandHandler : IRequestHandler<DeleteEventCommand>
{
    private readonly IEventRepository _eventRepository;

    public DeleteEventCommandHandler(IEventRepository eventRepository)
    {
        _eventRepository = eventRepository;
    }

    public async Task<Unit> Handle(DeleteEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = await _eventRepository.GetByIdAsync(request.EventId);
        if (eventEntity == null) throw new NotFoundException(nameof(Event), request.EventId);

        await _eventRepository.DeleteAsync(eventEntity);

        return Unit.Value;
    }
}
```

This handler:
- Retrieves the event by its `EventId`.
- Deletes the event using `DeleteAsync` if found.

---

### Validation and Return Types

While we focused on the core logic, it’s important to note that **validation** is a crucial part of handling commands. You can easily integrate **FluentValidation** to validate incoming commands before processing them.

In terms of **return types**, you can choose to return a simple `boolean` for success, or more detailed information, such as the `GUID` of a newly created entity. For updates and deletions, returning nothing (`Unit`) is common practice when the operation is successful.

---

### Conclusion

In this article, we walked through how to create, update, and delete entities using commands in a feature-based architecture. By organizing our code into distinct features, and leveraging MediatR for command handling, we achieve a clean, modular structure that is easy to maintain and extend.

With these patterns in place, your application will be well-structured and scalable, capable of handling more complex business logic as it evolves.

---
