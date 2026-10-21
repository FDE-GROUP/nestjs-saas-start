# 05 · Application 层（下）：CQRS 用例写法与 Features 垂直切片

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 覆盖原文: Part 10（2024-09-03）· Part 11（2024-09-05）· Part 12（2024-09-05）

| 篇 | 原标题 | 链接 |
|---|---|---|
| P10 | What is Clean Architecture: Part 10 - Writing the Application Logic in the Request Handler | https://dev.to/moh_moh701/what-is-clean-architecture-part-10-writing-the-application-logic-in-the-request-handler-2a1o |
| P11 | What is Clean Architecture: Part 11 - Organizing the Code Using Features | https://dev.to/moh_moh701/what-is-clean-architecture-part-11-organizing-the-code-using-features-3jcn |
| P12 | What is Clean Architecture: Part 12 - Creating, Updating, and Deleting Entities Using Commands | https://dev.to/moh_moh701/what-is-clean-architecture-part-12-creating-updating-and-deleting-entities-using-commands-5f1c |

---

## 1. P10 · 把契约变成实现：请求处理器登场

P10 是"契约 → 实现"的转换点：引入 **MediatR**（中介）+ **AutoMapper**（映射），创建 query / handler / ViewModel 三件套，为注册进 `IServiceCollection` 做好准备。作者称此为"把契约变成有意义的实现代码"。

### 1.1 目录动线（原文步骤 1–4）

```
Application/
├── Features/
│   └── Events/
│       └── Queries/
│           ├── GetEventDetail/   （query + handler + Vm + Dto）
│           └── GetEventsList/    （query + handler + Vm）
└── Profiles/
    └── MappingProfile.cs         （实体 ↔ ViewModel 映射集中处）
```

- `GetEventDetail` 文件夹内四件：`GetEventDetailQuery.cs` / `GetEventDetailQueryHandler.cs` / `EventDetailVm.cs` / `CategoryDto.cs`；
- `GetEventsList` 文件夹内三件：`GetEventsListQuery.cs` / `GetEventsListQueryHandler.cs` / `EventListVm.cs`。

> **注意时间顺序**：P10 直接从 `Features/Events/...` 建起，而"为什么按 Feature 组织"要到 P11 才解释，P11 的示例（Categories）又反过来引用 P10 未讲过的仓储方法。原文的编排是**先照做、后讲理**，读时应倒过来理解。

### 1.2 依赖包（原文步骤 5）

```xml
<PackageReference Include="MediatR" Version="12.3.0" />
<PackageReference Include="AutoMapper" Version="12.0.0" />
<PackageReference Include="AutoMapper.Extensions.Microsoft.DependencyInjection" Version="12.0.0" />
```

### 1.3 列表查询三件套（原文原貌）

```csharp
// EventListVm.cs
public class EventListVm
{
    public Guid EventId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public string ImageUrl { get; set; } = string.Empty;
}

// GetEventsListQuery.cs
public class GetEventsListQuery : IRequest<List<EventListVm>> { }

// GetEventsListQueryHandler.cs
public class GetEventsListQueryHandler : IRequestHandler<GetEventsListQuery, List<EventListVm>>
{
    private readonly IAsyncRepository<Event> _eventRepository;
    private readonly IMapper _mapper;

    public GetEventsListQueryHandler(IMapper mapper, IAsyncRepository<Event> eventRepository)
    {
        _mapper = mapper;
        _eventRepository = eventRepository;
    }

    public async Task<List<EventListVm>> Handle(GetEventsListQuery request, CancellationToken cancellationToken)
    {
        var allEvents = (await _eventRepository.ListAllAsync()).OrderBy(x => x.Date);
        return _mapper.Map<List<EventListVm>>(allEvents);
    }
}
```

要点提炼（原文口径）：**Query 只声明返回类型（`IRequest<TResponse>`），Handler 只依赖抽象（`IAsyncRepository<Event>` + `IMapper`）**，用例逻辑 = 取数 → 排序 → 投影。这正是 P1"业务规则可脱离 UI/数据库独立测试"的物理形态：new 一个 handler、塞进假仓储，即可测。

> **整理注记**：`(await ListAllAsync()).OrderBy(...)` 是**内存排序全表**（`IReadOnlyList` 上 `OrderBy` = LINQ-to-Objects），把 P9 泛型仓储"无排序/无分页"的形状缺陷暴露成了实际行为。作者在此未察觉。

### 1.4 详情查询（组合两个仓储）

```csharp
// CategoryDto.cs / EventDetailVm.cs（略字段，见原文：EventDetailVm 含 CategoryDto Category 导航）

public class GetEventDetailQuery : IRequest<EventDetailVm> { public Guid Id { get; set; } }

public class GetEventDetailQueryHandler : IRequestHandler<GetEventDetailQuery, EventDetailVm>
{
    private readonly IAsyncRepository<Event> _eventRepository;
    private readonly IAsyncRepository<Category> _categoryRepository;
    private readonly IMapper _mapper;

    public async Task<EventDetailVm> Handle(GetEventDetailQuery request, CancellationToken cancellationToken)
    {
        var eventEntity = await _eventRepository.GetByIdAsync(request.Id);
        var eventDetailVm = _mapper.Map<EventDetailVm>(eventEntity);

        var categoryEntity = await _categoryRepository.GetByIdAsync(eventEntity.CategoryId);
        eventDetailVm.Category = _mapper.Map<CategoryDto>(categoryEntity);
        return eventDetailVm;
    }
}
```

> **整理注记（三处可议）**：
> 1. **N+1 的手工版**：详情用例发两次仓储往返（活动 + 分类），本可由 `Event` 的导航属性一次载入（P7 已有 `Event.Category`）。用泛型仓储 + 专用方法缺位的直接后果。
> 2. 依赖 `IAsyncRepository<Event>` 而非 `IEventRepository`——**派生专用接口在 P9 建了却在这里没被用**，说明"泛型 vs 专用"的分工作者自己也没贯彻。
> 3. `eventEntity` 可能为 null（同 §注记），此处直接解引用 `eventEntity.CategoryId`，运行时会 NRE。**用例层缺少"找不到"这一业务语义的统一处理**（P12 才有 `NotFoundException`）。

### 1.5 AutoMapper 配置（原文步骤 7）

```csharp
public class MappingProfile : Profile
{
    public MappingProfile()
    {
        CreateMap<Event, EventListVm>().ReverseMap();
        CreateMap<Event, EventDetailVm>().ReverseMap();
        CreateMap<Category, CategoryDto>().ReverseMap();
    }
}
```

> **整理注记**：`ReverseMap()` 在这里基本是**多余的**——读路径只需 Entity → Vm；`Vm → Entity` 的反向映射凭空扩大了映射面（AutoMapper 的 ReverseMap 会生成反向配置，若误用会把展示字段写回实体）。这是原文代码的一处"惯性写法"，不宜照抄（作者自己在 P11/P12 的 MappingProfile 里也没再写 ReverseMap，前后不一致）。

## 2. P11 · Features 组织法：垂直切片（本系列最接近本仓结构的一篇）

### 2.1 作者的论证

应用成长、功能增多后，**把所有 command 和 request handler 堆在一个文件夹里会迅速脏乱**。解法是 **feature-based organization**：

> "基于特性的组织是**穿过应用功能的一条垂直切片**。每个 feature 代表一个独立的功能单元。它紧密对齐 DDD 的**限界上下文（bounded context）**概念——每个 feature 囊括实现该功能所需的一切，包括 commands、queries、view models，甚至 repositories。"

即：不按技术类型平铺（models 一堆、controllers 一堆、services 一堆），而按功能聚合到一处，收益是**模块化**（改动局限在 feature 内）、**可扩展**（加功能不脏整体）、**封装**（一个 feature 的改动不易波及其他，降低回归风险）。

### 2.2 结构约定

```
Features/
├── Events/     { Commands/, Queries/ }
├── Categories/ { Commands/, Queries/ }
└── Orders/     { Commands/, Queries/ }
```

- **Commands**：负责创建/更新/删除等动作；
- **Queries**：负责取数据或数据视图。

### 2.3 Categories 示例（原文完整走了一遍）

两个 query：`GetCategoriesListQuery`（取分类列表）、`GetCategoriesWithEventsQuery`（取分类及其活动，带 `IncludeHistory` 开关）。

```csharp
public class CategoriesListVm { public int CategoryId { get; set; } public string Name { get; set; } }

public class CategoryEventListVm
{
    public int CategoryId { get; set; }
    public string Name { get; set; }
    public List<CategoryEventDto> Events { get; set; }
}
public class CategoryEventDto
{
    public int EventId { get; set; }
    public string EventName { get; set; }
    public DateTime EventDate { get; set; }
}

public class GetCategoriesListQuery : IRequest<List<CategoriesListVm>> { }
public class GetCategoriesWithEventsQuery : IRequest<List<CategoryEventListVm>>
{
    public bool IncludeHistory { get; set; }
}
```

Handler 各一（构造注入 `ICategoryRepository` + `IMapper`）：

```csharp
public class GetCategoriesListQueryHandler : IRequestHandler<GetCategoriesListQuery, List<CategoriesListVm>>
{
    public async Task<List<CategoriesListVm>> Handle(GetCategoriesListQuery request, CancellationToken ct)
    {
        var categories = await _categoryRepository.GetAllCategoriesAsync();
        return _mapper.Map<List<CategoriesListVm>>(categories);
    }
}

public class GetCategoriesWithEventsQueryHandler : IRequestHandler<GetCategoriesWithEventsQuery, List<CategoryEventListVm>>
{
    public async Task<List<CategoryEventListVm>> Handle(GetCategoriesWithEventsQuery request, CancellationToken ct)
    {
        var categories = await _categoryRepository.GetCategoriesWithEventsAsync(request.IncludeHistory);
        return _mapper.Map<List<CategoryEventListVm>>(categories);
    }
}
```

映射补进 `MappingProfile`：`Category→CategoriesListVm`、`Category→CategoryEventListVm`、`Event→CategoryEventDto`（此处无 ReverseMap，与 P10 不一致）。

> **整理注记（四处实锤不一致，照抄前须知道）**：
> 1. **类型漂移**：P7 里 `CategoryId`/`EventId` 是 `Guid`，P11 的 Vm 全写成 `int`。
> 2. **幽灵方法**：`GetAllCategoriesAsync()` / `GetCategoriesWithEventsAsync()` 此时在 `ICategoryRepository` 上**尚不存在**（P9 该接口是空体；真正实现要到 P16 的 `GetCategoriesWithEvents`，且名字对不上 `GetAllCategoriesAsync`）。P11 属于"前向引用未定义契约"，代码片段并不能编译。
> 3. **命名与前文不齐**：P10 的 `EventListVm` 有 `ImageUrl`，P11 的 Category 系列 Vm 无任何审计/图片字段；`CategoryEventListVm.Events` 用 `List<>` 而领域用 `ICollection<>?`。
> 4. **"feature 含 repositories"这句与本系列的实现相反**：作者宣称 feature 囊括一切（含仓储），但仓储契约在 P9 是放在 `Contracts/Persistence` 全局目录下、实现在 P16 的独立 Persistence 项目，**并不按 feature 分**。即：作者描述的垂直切片理想（本仓做法）比他的实现更彻底。
> 5. `IncludeHistory` 参数被 `GetCategoriesWithEventsAsync` 消费，但"包含历史"的实现（P16）是**先 Include 全部再在内存里 `RemoveAll(日期 < 今天)`**——语义正确、代价巨大（详见 [07](./07-infrastructure-and-persistence.md) §3）。

### 2.4 与本仓的关键呼应

P11 是本系列与本仓结构最同频的一篇：本仓 `modules/<上下文>/{domain,application,infrastructure,api}` + `application/{commands,queries,read-models}` 正是"垂直切片 + 用例分类"的实现，且本仓把仓储 port 也收进上下文内（`domain/repositories`），落实了作者只是"宣称"的那句"每个 feature 囊括包括仓储在内的一切"。

## 3. P12 · Commands：CUD 的三段式

P12 补齐写侧。作者的路线：先 `CreateEventCommand`，再扩到 Update / Delete，并声明依赖的三个前置概念（CQRS 与 SOLID、中介模式、AutoMapper 使用时机——均引其自述文章）。

### 3.1 创建（返回新 id）

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
    public override string ToString() => $"Event name: {Name}; Price: {Price}; By: {Artist}; On: {Date.ToShortDateString()}; Description: {Description}";
}

public class CreateEventCommandHandler : IRequestHandler<CreateEventCommand, Guid>
{
    public async Task<Guid> Handle(CreateEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = _mapper.Map<Event>(request);
        await _eventRepository.AddAsync(eventEntity);
        return eventEntity.EventId;
    }
}

// MappingProfile 补：CreateMap<CreateEventCommand, Event>();
```

`ToString()` 的重写是为后面（P17）邮件正文复用——用例对象自带可读摘要。

### 3.2 更新（先取后映射再存）

```csharp
public class UpdateEventCommand : IRequest   // 无返回类型 → MediatR 的 Unit
{
    public Guid EventId { get; set; }
    public string Name { get; set; }
    /* ...同上其余字段... */
}

public class UpdateEventCommandHandler : IRequestHandler<UpdateEventCommand>
{
    public async Task<Unit> Handle(UpdateEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = await _eventRepository.GetByIdAsync(request.EventId);
        if (eventEntity == null) throw new NotFoundException(nameof(Event), request.EventId);

        _mapper.Map(request, eventEntity);          // 命令覆盖到已有实体
        await _eventRepository.UpdateAsync(eventEntity);
        return Unit.Value;
    }
}
```

### 3.3 删除（只需 id）

```csharp
public class DeleteEventCommand : IRequest { public Guid EventId { get; set; } }

public class DeleteEventCommandHandler : IRequestHandler<DeleteEventCommand>
{
    public async Task<Unit> Handle(DeleteEventCommand request, CancellationToken cancellationToken)
    {
        var eventEntity = await _eventRepository.GetByIdAsync(request.EventId);
        if (eventEntity == null) throw new NotFoundException(nameof(Event), request.EventId);
        await _eventRepository.DeleteAsync(eventEntity);
        return Unit.Value;
    }
}
```

（注意 `DeleteEventCommandHandler` **只注入仓储、不注入 IMapper**——删除不需要映射，作者保持了最小依赖，这点值得肯定。）

### 3.4 原文自述的两条设计选择

- **返回类型**：可只返回 bool，也可返回更详细信息（创建返回新实体 GUID）；**更新/删除成功时返回 `Unit`（即无值）是常见做法**。
- **校验预告**：核心逻辑之外"校验是处理命令的关键部分"，可"很容易地集成 FluentValidation 在处理前校验命令"（→ P13 兑现）。

### 3.5 判读：这套写侧的三处结构弱点

1. **`NotFoundException` 未经介绍就被使用**：P12 片段里直接 `throw new NotFoundException(...)`（还带 `nameof(Event)` 参数形状），但正文**从未定义该类也未声明它来自哪个包**（示例仓库里它在 Application 侧自定义），同 P11 一样属"前向引用未定义物"——片段不可直接编译。
2. **更新走"读实体 → 命令覆盖 → 全量更新"**：`UpdateAsync` 在 P16 的实现是 `_dbContext.Entry(entity).State = EntityState.Modified`（整行更新），**并发下丢更新**（无乐观锁），且 `_mapper.Map(request, eventEntity)` 会把 `AuditableEntity` 的 `CreatedDate/CreatedBy` 等也按命令覆盖（命令里没这些字段 → AutoMapper 默认置空/默认值风险），P16 的 `SaveChangesAsync` 覆写只补 `LastModifiedDate`，不补 `CreatedBy`。原文没有讨论这个坑。
3. **写侧无权限、无租户、无幂等**：任何拿到端点的人都能删活动；无 `userId`/`tenantId` 参与；创建非幂等。这三项在本仓分别是 `TenantPermissionGuard`/CASL/RBAC 与租户 ALS 卡点的职责（见本仓 `authorization` 上下文与 [global-tenancy](../../plans/global-tenancy.md)），说明 P12 的形状**只适用于单租户、无授权的学习项目**。

## 4. 本篇可带走的事实

- **用例三件套（Request / Handler / ViewModel）是 CA 里最"可复用"的成果物**：与本仓 NestJS CQRS 的 `XxxCommand + XxxHandler + read-models` 形状几乎一一对应，可直接用作对照教材。
- **垂直切片（Features）胜过技术平铺**——这条结论在本仓已被目录结构实践验证；照搬时注意作者自己没贯彻（仓储不在 feature 内）。
- P10/P12 暴露的四类缺陷（全表读、N+1、null 语义、并发覆盖）都不是 CA 的错，而是**泛型 CRUD 仓储 + 贫血命令 + 无门禁**的必然产物；本仓以具体 port + 分页契约（`Page<T>`）+ zod 校验 + 真库 e2e 逐项规避。
