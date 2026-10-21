# 07 · 外围两圈：Infrastructure 与 Persistence

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 覆盖原文: Part 15（2024-09-09）· Part 16（2024-09-11）· Part 17（2024-09-12）

| 篇 | 原标题 | 链接 |
|---|---|---|
| P15 | What is Clean Architecture: Part 15 - Understanding the Infrastructure and Persistence Layers | https://dev.to/moh_moh701/what-is-clean-architecture-understanding-the-infrastructure-and-persistence-layers-2pca |
| P16 | What is Clean Architecture: Part 16 - Adding Data Persistence with Entity Framework Core | https://dev.to/moh_moh701/what-is-clean-architecture-part-16-adding-data-persistence-with-entity-framework-core-1kih |
| P17 | What is Clean Architecture: Part 17 - Implementing the Infrastructure Layer with CSV Export and Email Service | https://dev.to/moh_moh701/what-is-clean-architecture-part-17-implementing-the-infrastructure-layer-with-csv-export-and-email-service-f8e |

---

## 1. P15 · 先把两个外圈讲清楚（职责分界）

P15 是一篇纯概念切分文，价值在于把常被混为一谈的 "Infrastructure" 拆成两块：

### 1.1 Infrastructure Layer（具体设施层）

为应用依赖的**各种外部服务与机制**提供实现：文件处理、邮件发送、日志、第三方 API 交互。CA 下**核心项目只定义抽象（接口），实现细节一律放基础设施层**。原文列举的三个组件：

| 组件 | 职责 | 原文给的端口/实现配对 |
|---|---|---|
| `FileExport/CsvExporter.cs` | 把数据导出为 CSV 文件（导出是外部操作故属基础设施） | 实现核心侧定义的 `IFileExporter`，"核心不知道文件格式与导出细节" |
| `Mail/EmailService.cs` | 邮件相关操作（发通知），SMTP 或 SendGrid 等外部服务皆可 | 实现核心侧定义的 `IEmailService` |
| `InfrastructureServiceRegistration.cs` | 把基础设施层的服务登记进 DI 容器，使 `CsvExporter`/`EmailService` 可被注入到全应用 | — |

原文结论：这层保证核心逻辑对外部系统实现保持灵活解耦——**改邮件怎么发、换导出格式，都在基础设施层内完成，不影响核心**。

### 1.2 Persistence Layer（持久层）

**基础设施中专管数据库访问的那一块**：查询、保存、取回。CA 下核心定义仓储接口，持久层用 EF Core 之类的工具给出具体实现。原文列举的三个组件：

| 组件 | 职责（原文口径） |
|---|---|
| `Configurations` | EF Core 实体配置：表映射、关系、约束，让数据库 schema 对齐领域模型（如 `EventConfiguration` 用 Fluent API 定义属性与关系） |
| `Migrations` | 记录 schema 随时间的变更，保持库结构与领域模型同步 |
| `Repositories` | 仓储实现：实现核心定义的数据访问契约（如 `IAsyncRepository`），在这里才真正用 EF Core 打交道 |

### 1.3 P15 的"三者如何协作"总结（原文）

- Core Layer：定义业务逻辑与外部交互的接口和抽象；
- Infrastructure Layer：实现与文件、邮件、日志等外部系统打交道的服务；
- Persistence Layer：用 EF Core 之类的工具实现数据访问；
- **运行时由 DI 把基础设施/持久层的具体实现供给核心层的抽象**——这套分离使应用易维护、易测试、易扩展。

> **整理注记**：这段是全套系列对"端口—适配器—容器"最完整的一次陈述。值得注意的是作者的层级用词与 P6 的 solution folder 略有出入（P6 只给了 `Infrastructure` 一个文件夹，P15 把它拆成 Infrastructure + Persistence 两个项目，实际落在 `src/Infrastructure` 下），属"概念细化后结构跟着变"的正常演化，但也说明 **P6 的骨架三分类并不等价于 CA 的四层**。

### 1.4 评论区增量（本篇评论区质量最高）

**Muhammad Ovais** 提出常被忽略的一点：

> "CA 讨论中常被忽略的重要一点是**横切关注点（cross-cutting concerns）的管理**——日志、缓存、错误处理等。它们很容易散落到不同层，造成重复与纠缠。用 **middleware 或 AOP** 来实现它们，能让这些关注点保持集中，进一步支撑架构的关注点分离目标；这不仅提升可维护性，也让业务逻辑与技术细节保持隔离，守住 CA 的原则。"

作者回复：

> "完全同意……我会在后续继续覆盖这些主题，并补上日志、错误处理、API 层与 Identity 管理的实现细节。"

> **事实核对**：作者后续只兑现了 **API 层**（P18/P19）；**日志、错误处理、Identity、缓存、AOP/pipeline behavior 均未在本系列出现**（19 篇截止于控制器）。承诺未兑现属系列完整性缺口，与 [02 §3 注记](./02-from-business-need-to-skeleton.md) 的"无测试"并列。

## 2. P16 · Persistence 落地（EF Core）

作者先给四步总纲（并强调"和平时启用 EF Core 没任何不同"）：① 装包 → ② 建 `DbContext`（为要管的实体声明 `DbSet`）→ ③ 建迁移反映 schema → ④ 把 EF Core 注册进 Services Collection。

### 2.1 项目与引用

- 新建类库 `GloboTicket.TicketManagement.Persistence`；
- **引用 Application 项目**（以拿到仓储契约与领域实体）：

```xml
<ProjectReference Include="..\GloboTicket.TicketManagement.Application\GloboTicket.TicketManagement.Application.csproj" />
<PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.0" />
<PackageReference Include="Microsoft.Extensions.Options.ConfigurationExtensions" Version="8.0.0" />
```

> **关键结构事实（依赖方向的实证）**：Persistence（外圈）**引用** Application + Domain（内圈，经 Application 传递），反向不成立——`IAsyncRepository` 在内层、EF 在外层，这正是 DIP 的物理形状。作者没点破，但引用方向自己说了话。

### 2.2 DbContext 与种子数据

`GloboTicketDbContext`：构造收 `DbContextOptions<T>`，声明 `DbSet<Event> Events` / `DbSet<Category> Categories` / `DbSet<Order> Orders`；`OnModelCreating` 里先 `ApplyConfigurationsFromAssembly(...)` 收配置类，再用 `HasData(...)` **经迁移播种**：4 个分类（Concerts/Musicals/Plays/Conferences，硬编码 GUID）、6 个活动（含价格、艺人、`DateTime.Now.AddMonths(n)` 日期、图片 URL 指向作者课程.blob 存储）、7 条订单（`OrderPaid=true`、`UserId` 硬编码 GUID）。

> **整理注记**：
> 1. **种子写在 `OnModelCreating` 里 = 种子进了迁移历史**（作者的注释也承认 "seed data, added through migrations"）。后果：改一条种子会产生一次 schema 迁移，且历史迁移被永久污染——这是 EF/任何 ORM 都有的老问题，本仓的做法是推式初始化脚本（`db:setup` / seed 脚本自载 env、幂等），与迁移链分离。
> 2. 种子里的 `DateTime.Now.AddMonths(6)` 是**反模式**：`HasData` 要求确定性值，用运行时时间会使每次生成的迁移都不同（EF 官方明确警告）。原文照写未警示。
> 3. 硬编码 GUID 作主键是 `HasData` 的必需（迁移需稳定标识），可接受；但 `ImageUrl` 直连外部课程存储，数据与作者课程账号耦合。

### 2.3 实体配置类（映射外置）

作者的理由表述得很干净：**CA 下领域实体应保持自由、不带基础设施特有关注点（如数据库映射）**，所以映射用配置类声明，在建模时应用。

```csharp
public class EventConfiguration : IEntityTypeConfiguration<Event>
{
    public void Configure(EntityTypeBuilder<Event> builder)
    {
        builder.Property(e => e.Name).IsRequired().HasMaxLength(50);
        builder.Property(e => e.Date).IsRequired();
    }
}
```

`ApplyConfigurationsFromAssembly` 自动收拢项目内所有配置类。

> **整理注记**：这是"持久化无知"的正确兑现形态（实体无特性、映射在旁置配置）。两条遗留缺陷：① P4/P13 的"名称+日期组合唯一"在这里**没有对应唯一索引**（`HasIndex(e => new { e.Name, e.Date }).IsUnique()` 缺失），唯一性只靠应用层查询，即 [06 §2.5-4](./06-validation-and-di-composition.md) 的竞态无兜底；② 只有 `EventConfiguration` 一个配置类，Category/Order 的约束（分类名 ≤50 等）未落实。

### 2.4 审计字段的自动维护（`SaveChangesAsync` 覆写）

```csharp
public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = new CancellationToken())
{
    foreach (var entry in ChangeTracker.Entries<AuditableEntity>())
    {
        switch (entry.State)
        {
            case EntityState.Added:   entry.Entity.CreatedDate = DateTime.Now; break;
            case EntityState.Modified: entry.Entity.LastModifiedDate = DateTime.Now; break;
        }
    }
    return base.SaveChangesAsync(cancellationToken);
}
```

> **整理注记**：审计集中在持久层的这一处覆写，是本系列少见的"横切关注点被收在一个地方"的正例（恰是 P15 评论区 Ovais 所倡导的方向）。但三点不完整：① **`CreatedBy` / `LastModifiedBy` 从未被赋值**（需要当前用户上下文，原文没有身份/IIdentity 服务，字段形同虚设）；② 只覆写 `SaveChangesAsync`，**未覆写同步 `SaveChanges`**（走同步路径时审计丢失）；③ `DateTime.Now` 是本地时钟（本仓/现代做法用注入的 `IClock` 或 UTC，见本仓对 `forceUtcTimezone` 一类时钟议题的关注）。

### 2.5 泛型仓储实现（P9 契约的兑现）

```csharp
public class BaseRepository<T> : IAsyncRepository<T> where T : class
{
    protected readonly GloboTicketDbContext _dbContext;
    public BaseRepository(GloboTicketDbContext dbContext) => _dbContext = dbContext;

    public async Task<T> GetByIdAsync(Guid id) => await _dbContext.Set<T>().FindAsync(id);
    public async Task<IReadOnlyList<T>> ListAllAsync() => await _dbContext.Set<T>().ToListAsync();

    public async Task<T> AddAsync(T entity)
    {
        await _dbContext.Set<T>().AddAsync(entity);
        await _dbContext.SaveChangesAsync();
        return entity;
    }
    public async Task UpdateAsync(T entity)
    {
        _dbContext.Entry(entity).State = EntityState.Modified;
        await _dbContext.SaveChangesAsync();
    }
    public async Task DeleteAsync(T entity)
    {
        _dbContext.Set<T>().Remove(entity);
        await _dbContext.SaveChangesAsync();
    }
}
```

> **整理注记（本篇最重要的一段批判）**：
> - **每个仓储方法各自 `SaveChangesAsync()`** ⇒ **一次用例多次提交**：P12 的 Update（先 `GetByIdAsync` 后 `UpdateAsync`）尚可，但任何"写两笔"的场景（例如建活动同时要落订单/关联数据）在结构上**无法原子**——因为作者又在 P8 宣布"不做 Unit of Work"。这是本系列最实际的一处架构裂缝：**抽象层不暴露事务，实现层每方法自提交**，两者叠加导致跨仓储的一致性只能靠调用方运气。本仓的对应解法是显式事务端口/flush 时机与 Outbox 类机制（见本仓 `EventStore`/`DomainEventPublisher` 双模序与 [mikro-orm-ddd-feasibility](../mikro-orm-ddd-feasibility.md) §3.1）。
> - `FindAsync` 会先查 **identity map/一级缓存**，与 `ToListAsync` 的查询语义不一致（同一实体可能拿到已跟踪实例），这在长生命周期 `DbContext` 下是隐蔽坑（本仓 e2e/脚本要求 per-request fork 的顾虑即同一类）。
> - `UpdateAsync` 用 `Entry(...).State = Modified`（**整行全字段更新**，未加载的字段被覆盖为默认值风险），且无并发令牌 → 乐观锁无从谈起（呼应 [05 §3.5-2](./05-application-layer-cqrs.md)）。
> - 无软删除、无租户过滤（原文无多租户概念）。

### 2.6 专用仓储（两处业务查询）

```csharp
public class CategoryRepository : BaseRepository<Category>, ICategoryRepository
{
    public async Task<List<Category>> GetCategoriesWithEvents(bool includePassedEvents)
    {
        var allCategories = await _dbContext.Categories.Include(x => x.Events).ToListAsync();
        if (!includePassedEvents)
            allCategories.ForEach(p => p.Events.ToList().RemoveAll(c => c.Date < DateTime.Today));
        return allCategories;
    }
}

public class EventRepository : BaseRepository<Event>, IEventRepository
{
    public Task<bool> IsEventNameAndDateUnique(string name, DateTime eventDate)
    {
        var matches = _dbContext.Events.Any(e => e.Name.Equals(name) && e.Date.Date.Equals(eventDate.Date));
        return Task.FromResult(!matches);   // 无匹配 → true（唯一）
    }
}
```

> **整理注记（三条实锤）**：
> 1. `GetCategoriesWithEvents` **先把全部活动载入内存再 `RemoveAll` 过滤过去活动**——正确但浪费：应把日期条件下推进 SQL（`Include(..., e => e.Where(...))` 或 EF Core 8 的 Auto-Includes/过滤 Include）。这是 P11 `IncludeHistory` 语义的实现，规模化后就是内存与带宽事故。
> 2. `p.Events.ToList().RemoveAll(...)` **对副本操作**：`ToList()` 新建列表，移除动作不反映到导航集合本身，因此 `includePassedEvents=false` 实际上**根本没生效**（返回的 Category 仍带全部 Events）。**这是一处真 bug**，原文与示例仓库均未察觉。
> 3. `IsEventNameAndDateUnique` 用**同步 LINQ `Any` + `Task.FromResult` 假装异步**——EF Core 下这会在同步阻塞上再包一层假异步（有死锁/线程池压力风险），且方法签名是 `Task<bool>` 却没有 `await`；应写 `AnyAsync`。（另外 P13 的校验器调用它、P11 的 handler 调用 `GetAllCategoriesAsync`——**契约命名与实际实现对不齐**，系列内三处契约/实现漂移。）

### 2.7 注册进容器

```csharp
public static class PersistenceServiceRegistration
{
    public static IServiceCollection AddPersistenceServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<GloboTicketDbContext>(options =>
            options.UseSqlServer(configuration.GetConnectionString("GloboTicketTicketManagementConnectionString")));

        services.AddScoped(typeof(IAsyncRepository<>), typeof(BaseRepository<>));   // 开放泛型注册
        services.AddScoped<ICategoryRepository, CategoryRepository>();
        services.AddScoped<IEventRepository, EventRepository>();
        services.AddScoped<IOrderRepository, OrderRepository>();
        return services;
    }
}
```

要点：**开放泛型注册**（`typeof(IAsyncRepository<>) → typeof(BaseRepository<>)`，Scoped 生命周期）让任何未被专用仓储覆盖的 `IAsyncRepository<T>` 请求自动落到基类实现——这是 P10 详情处理器能注入 `IAsyncRepository<Category>` 的机制原因（尽管专用接口也已注册，二者**同时可解析**，实际取决于请求的接口类型；这类"泛型与派生接口并存"的解析歧义作者未讨论）。
另注：`OrderRepository` 被注册，但原文从未给出它的类定义（P16 只写了 Category/Event 两个），**示例代码在此不可编译**。

## 3. P17 · Infrastructure 落地（CSV 导出 + 邮件）

范围声明：基础设施层处理外部系统交互——① 用 SendGrid 发邮件；② 导出 CSV 供报表/分析。原则仍是**契约在 Application 层、实现在 Infrastructure 层**。

### 3.1 CSV 导出的四件配套

新建类库 `GloboTicket.TicketManagement.Infrastructure`（放在 Infrastructure 文件夹下）。

**① 应用侧端口**（`Contracts/Infrastructure/ICsvExporter.cs`）：

```csharp
public interface ICsvExporter
{
    byte[] ExportEventsToCsv(List<EventExportDto> eventExportDtos);
}
```

**② 基础设施侧实现**（`FileExport/CsvExporter.cs`，用 CsvHelper）：

```csharp
public class CsvExporter : ICsvExporter
{
    public byte[] ExportEventsToCsv(List<EventExportDto> eventExportDtos)
    {
        using var memoryStream = new MemoryStream();
        using (var streamWriter = new StreamWriter(memoryStream, Encoding.UTF8))
        {
            using var csvWriter = new CsvWriter(streamWriter);
            csvWriter.WriteRecords(eventExportDtos);   // 将活动记录写入 CSV
        }
        return memoryStream.ToArray();
    }
}
```

**③ 导出用例**（`Features/Events/Queries/GetEventsExport/`）：`EventExportDto`（EventId/Name/Date）、`EventExportFileVm`（文件名/ContentType/`byte[]? Data`）、`GetEventsExportQuery : IRequest<EventExportFileVm>`，Handler：

```csharp
public class GetEventsExportQueryHandler : IRequestHandler<GetEventsExportQuery, EventExportFileVm>
{
    // 注入 IAsyncRepository<Event> + IMapper + ICsvExporter
    public async Task<EventExportFileVm> Handle(GetEventsExportQuery request, CancellationToken ct)
    {
        var allEvents = _mapper.Map<List<EventExportDto>>((await _eventRepository.ListAllAsync()).OrderBy(x => x.Date));
        var fileData = _csvExporter.ExportEventsToCsv(allEvents);
        return new EventExportFileVm
        {
            ContentType = "text/csv",
            Data = fileData,
            EventExportFileName = $"{Guid.NewGuid()}.csv",
        };
    }
}
```

> **整理注记**：这**正是"端口倒置"的教科书写法**——用例只知道"能把 DTO 列表变成一个字节数组"，不知道 CSV、不知道 CsvHelper；换格式（Excel/JSON）只改基础设施实现。同时它也**再次兑现了 P1 的承诺**：业务用例可脱离 Web/文件机制单测（假 `ICsvExporter` 即可）。两处小瑕疵：① 端口签名 `ExportEventsToCsv(List<EventExportDto>)` **让基础设施端口依赖了某个具体 feature 的 DTO**（`GetEventsExport` 下的类型），端口与用例耦合方向被打断一次（更干净的做法是端口用通用形状或独立 DTO 归属 Contracts）；② 文件名用 `Guid.NewGuid()`、全表导出、无权限（同 P12 的无授权问题）。

### 3.2 邮件的三件配套

**① 应用侧端口**：

```csharp
public interface IEmailService
{
    Task<bool> SendEmail(Email email);
}
```

（`Email` 模型放 `Application/Models/Mail`，含 To/Subject/Body；`EmailSettings` 含 ApiKey/FromAddress/FromName。）

**② 基础设施侧实现**（`Mail/EmailService.cs`，SendGrid + `IOptions<EmailSettings>` + `ILogger`）：

```csharp
public class EmailService : IEmailService
{
    public EmailService(IOptions<EmailSettings> mailSettings, ILogger<EmailService> logger) { ... }

    public async Task<bool> SendEmail(Email email)
    {
        var client = new SendGridClient(_emailSettings.ApiKey);
        var msg = MailHelper.CreateSingleEmail(
            new EmailAddress(_emailSettings.FromAddress, _emailSettings.FromName),
            new EmailAddress(email.To), email.Subject, email.Body, email.Body);
        var response = await client.SendEmailAsync(msg);
        _logger.LogInformation("Email sent");
        return response.StatusCode == HttpStatusCode.Accepted || response.StatusCode == HttpStatusCode.OK;
    }
}
```

> **整理注记**：`_logger.LogInformation("Email sent")` 在**判断成功之前**就打——失败时也记"Email sent"，日志说谎（应先判状态码再分别 LogInformation/LogError）。密钥经配置注入（`services.Configure<EmailSettings>(configuration.GetSection("EmailSettings"))`），未硬编码，这点符合安全底线。

**③ 用例内发通知**（改造 `CreateEventCommandHandler`）：

```csharp
public async Task<Guid> Handle(CreateEventCommand request, CancellationToken cancellationToken)
{
    var @event = _mapper.Map<Event>(request);
    var validator = new CreateEventCommandValidator(_eventRepository);
    var validationResult = await validator.ValidateAsync(request);
    if (validationResult.Errors.Count > 0)
        throw new Exceptions.ValidationException(validationResult);      // ← 与 P13 的 BaseResponse 路线冲突

    @event = await _eventRepository.AddAsync(@event);

    var email = new Email { To = "admin@example.com", Subject = "A new event was created", Body = $"A new event was created: {request}" };
    try { await _emailService.SendEmail(email); }
    catch (Exception ex) { /* Log the error and continue */ }
    return @event.EventId;
}
```

> **整理注记（本篇最要紧的两处矛盾）**：
> 1. **错误处理路线在同一篇里翻转**：P13 的 handler 返回 `CreateEventCommandResponse{Success=false, ValidationErrors}`，P17 的 handler 改回 `throw new ValidationException(validationResult)` 并返回 `Guid`——**前后两篇的契约不兼容**（返回类型都变了），正文完全没有交代为什么换。读者若跟到最后会得到一个"错误通路未定"的应用。
> 2. **通知失败被静默吞掉**（`catch { /* log and continue */ }`，而注释里的 log 也没真写）。这在业务上是合理取向（活动已建，不该因邮件失败回滚/报错），但**实现方式不对**：应当是"记录 + 可重试的投递机制"（Outbox/重试），而不是吞异常。本仓在出站弹性（C3 挂账：超时/重试/熔断统一设施）与 `publishAll` 不回抛这类决策上有明确立场（见 [external-borrowing-backlog](../external-borrowing-backlog.md) C3 与"Outbox 异常不回抛"相关条目）——**"发而不存/发而不 retries"是两回事**。
> 3. 附带一点：邮件正文用 `request.ToString()`（P12 重写的 ToString）——省代码但把用户可控内容直拼进通知文本，无转义/无模板，属小 insecurity。

### 3.3 基础设施侧注册

```csharp
public static class InfrastructureServiceRegistration
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<EmailSettings>(configuration.GetSection("EmailSettings"));
        services.AddTransient<IEmailService, EmailService>();
        services.AddTransient<ICsvExporter, CsvExporter>();
        return services;
    }
}
```

调用点：`builder.Services.AddInfrastructureServices(builder.Configuration);`

> **整理注记**：两个服务登记为 **Transient**，而持久层仓储是 **Scoped**。此处生命周期选择并无必要（两者皆无状态，Singleton/Scoped 更省），但也没有 bug；真正的教训是**生命周期要有理由**——本仓对 provider 生命周期与 `@Global` 模块边界有显式约定，正可对照。

## 4. 本篇可带走的事实

- P15 是全套"外圈职责"最好的一篇：**Infrastructure（外部服务）与 Persistence（数据访问）应分开**，二者都只实现内层端口，运行时由 DI 拼接。
- P16/P17 给出了两个可直接借鉴的正确形状：**映射外置的配置类**（守住 PI）、**端口在应用侧的 `ICsvExporter`/`IEmailService`**（守住依赖方向），以及审计集中在 `SaveChangesAsync` 覆写的做法。
- 同样给出四个必须避开的裂缝：**每方法自提交 + 不做 UoW**（跨仓储无原子性）、**唯一性无索引兜底**、**过滤在内存且实现有 bug**（`ToList().RemoveAll`）、**错误通路在两篇之间翻转且吞异常**。
