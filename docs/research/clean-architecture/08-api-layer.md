# 08 · API 层：组合根与瘦控制器

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 覆盖原文: Part 18（2024-09-17）· Part 19（2024-10-15）

| 篇 | 原标题 | 链接 |
|---|---|---|
| P18 | What is Clean Architecture: Part 18 - Adding API | https://dev.to/moh_moh701/what-is-clean-architecture-part-18-adding-api-23l2 |
| P19 | What is Clean Architecture: Part 19 - Add Controllers | https://dev.to/moh_moh701/what-is-clean-architecture-part-19-add-controllers-152h |

---

## 1. P18 · API 是"通往核心功能的大门"

作者的开场判断值得留意：前序各篇把层都建好了、**代码能编译通过，但还没有任何可供消费方使用的功能**——"这一步要改变了"。P18 的任务就是把 API 层装上，作为**应用核心功能的大门（gateway）**。

### 1.1 三条定位陈述

1. API 项目**是外界与核心逻辑之间的界面**；Core 与 Infrastructure 已建好，API 是架构的最后一块。
2. 与传统 UI（ASP.NET Core MVC / Razor Pages）不同，**本例以 API 作为唯一交互面**，因此可支持多种客户端类型，甚至**系统对系统**的集成。
3. API 打开后端服务，让 Web 应用、移动应用等各种客户端消费核心业务逻辑与数据。

### 1.2 引用装配

`.csproj` 里 API 同时引用三层：

```xml
<ProjectReference Include="..\GloboTicket.TicketManagement.Application\GloboTicket.TicketManagement.Application.csproj" />
<ProjectReference Include="..\GloboTicket.TicketManagement.Infrastructure\GloboTicket.TicketManagement.Infrastructure.csproj" />
<ProjectReference Include="..\GloboTicket.TicketManagement.Persistence\GloboTicket.TicketManagement.Persistence.csproj" />
```

> **整理注记**：这一小段是全套 CA 落地里**最容易被忽略却最关键的一步**——只有最外层（组合根）才允许同时看见所有层，因为它负责装配。反过来验证：若 Domain/Application 项目里出现了对 Infrastructure 的引用，架构就已经破了。本仓对应物是 `apps/api` 引 `libs/core` + Mikro adapter 在 infrastructure 侧装配，`libs/core` 绝不反向依赖 apps。

### 1.3 用扩展方法保持 `Program.cs` 干净（本篇主旨）

作者明确反对把服务与管道配置堆在 `Program.cs`，改用两个扩展方法：

```csharp
namespace GloboTicket.TicketManagement.Api
{
    public static class StartupExtensions
    {
        public static WebApplication ConfigureServices(this WebApplicationBuilder builder)
        {
            builder.Services.AddApplicationServices();
            builder.Services.AddInfrastructureServices(builder.Configuration);
            builder.Services.AddPersistenceServices(builder.Configuration);
            builder.Services.AddControllers();

            builder.Services.AddCors(options => options.AddPolicy(
                "open",
                policy => policy.WithOrigins(builder.Configuration["ApiUrl"] ?? "https://localhost:7020")
                    .AllowAnyMethod()
                    .AllowAnyHeader()
                    .SetIsOriginAllowed(origin => true)
                    .AllowCredentials()));

            // Optional: Enable Swagger for API documentation
            // builder.Services.AddSwaggerGen();

            return builder.Build();
        }

        public static WebApplication ConfigurePipeline(this WebApplication app)
        {
            app.UseCors("open");
            app.UseHttpsRedirection();
            app.MapControllers();
            return app;
        }
    }
}
```

入口因此缩成四行：

```csharp
using GloboTicket.TicketManagement.Api;

var builder = WebApplication.CreateBuilder(args);

var app = builder
    .ConfigureServices()
    .ConfigurePipeline();

app.Run();
```

作者的说明：`ConfigureServices` 登记三层服务 + 控制器支持 + CORS（允许指定前端来源）+ 可选 Swagger；`ConfigurePipeline` 施加 CORS、HTTP→HTTPS 重定向、映射控制器到路由。

> **整理注记（一处必须点名的安全缺陷）**：
> ```csharp
> .WithOrigins(...)      // 声明了具体来源
> .SetIsOriginAllowed(origin => true)   // 又允许任意来源
> .AllowCredentials()                    // 且带凭证
> ```
> **`SetIsOriginAllowed(origin => true)` 与 `AllowCredentials()` 并置 = 任意来源都能带凭证跨域调用**——这是 ASP.NET Core CORS 里已知的高危组合（策略名还叫 "open"）。P19 又重复了同一写法（`SetIsOriginAllowed(pol => true)`）。本仓在可信代理/CORS/CSRF 面上有专门方案（[module-auth-csrf-defense](../../plans/module-auth-csrf-defense.md)、[module-auth-ip-trust](../../plans/module-auth-ip-trust.md)、可信代理 env + 限流桶决策），对照之下原文这一段属于**不可照搬的示例代码**。此外 `AddSwaggerGen()` 在 P18 被注释掉、在 P19 又打开，两篇不一致。

## 2. P19 · 瘦控制器：只做 HTTP，其余交给 MediatR

### 2.1 为什么用 MediatR（原文论证）

> "MediatR 通过在控制器与业务逻辑（commands 和 queries）之间充当中介，帮助**解耦应用各层**。它用分离'业务逻辑'与'HTTP 请求处理'这两份关注点来促进 **SRP**，使代码更易维护、可测试、可扩展。"

并且 MediatR **已在应用层通过 `AddApplicationServices()` 登记**（P14 的功劳），所以 `Program.cs` 里不需要再单独注册——这是"每层自己负责装配自己的能力"的一次示范。

### 2.2 P19 修正版的 StartupExtensions

P19 把 P18 里注释掉的 Swagger 打开，并加了环境判断：

```csharp
builder.Services.AddSwaggerGen();
...
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

（CORS 仍保留 §1.3 的问题写法，仅把 origins 改为数组 `[ApiUrl, BlazorUrl]`。）

### 2.3 CategoryController（原文原貌）

```csharp
[ApiController]
[Route("api/[controller]")]
public class CategoryController : Controller
{
    private readonly IMediator _mediator;
    public CategoryController(IMediator mediator) => _mediator = mediator;

    [HttpGet("all", Name = "GetAllCategories")]
    public async Task<ActionResult<List<CategoryListVm>>> GetAllCategories()
        => Ok(await _mediator.Send(new GetCategoriesListQuery()));

    [HttpGet("allwithevents", Name = "GetCategoriesWithEvents")]
    public async Task<ActionResult<List<CategoryEventListVm>>> GetCategoriesWithEvents(bool includeHistory)
        => Ok(await _mediator.Send(new GetCategoriesListWithEventsQuery { IncludeHistory = includeHistory }));

    [HttpPost(Name = "AddCategory")]
    public async Task<ActionResult<CreateCategoryCommandResponse>> Create([FromBody] CreateCategoryCommand command)
        => Ok(await _mediator.Send(command));
}
```

作者逐条解释：`GetAllCategories` 发查询 → handler 处理 → 200 返回；`GetCategoriesWithEvents` 多一个 `includeHistory` 布尔参；`Create` 把命令交给 MediatR，返回 handler 的响应。

> **整理注记**：控制器里出现的 `CategoryListVm` / `GetCategoriesListWithEventsQuery` / `CreateCategoryCommand` / `CreateCategoryCommandResponse` **四个类型在系列前文都不存在**（P11 建的是 `CategoriesListVm` 与 `GetCategoriesWithEventsQuery`；分类的 Command 从未写过）。也就是说 P19 的 Category 控制器**引用了未实现的 feature**，与 P11/P16 的命名互相错位——照抄会直接编译失败。这是本系列"讲解顺序 vs 代码一致性"问题最集中的一篇。

### 2.4 EventsController（与 P10/P12 对得上，是可用的一半）

```csharp
[ApiController]
[Route("api/[controller]")]
public class EventsController : Controller
{
    private readonly IMediator _mediator;
    public EventsController(IMediator mediator) => _mediator = mediator;

    [HttpGet(Name = "GetAllEvents")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesDefaultResponseType]
    public async Task<ActionResult<List<EventListVm>>> GetAllEvents()
        => Ok(await _mediator.Send(new GetEventsListQuery()));

    [HttpGet("{id}", Name = "GetEventById")]
    public async Task<ActionResult<EventDetailVm>> GetEventById(Guid id)
        => Ok(await _mediator.Send(new GetEventDetailQuery { Id = id }));

    [HttpPost(Name = "AddEvent")]
    public async Task<ActionResult<Guid>> Create([FromBody] CreateEventCommand command)
        => Ok(await _mediator.Send(command));

    [HttpPut(Name = "UpdateEvent")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesDefaultResponseType]
    public async Task<ActionResult> Update([FromBody] UpdateEventCommand command)
    {
        await _mediator.Send(command);
        return NoContent();
    }

    [HttpDelete("{id}", Name = "DeleteEvent")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesDefaultResponseType]
    public async Task<ActionResult> Delete(Guid id)
    {
        await _mediator.Send(new DeleteEventCommand { EventId = id });
        return NoContent();
    }
}
```

四条可提炼的做法：

1. **控制器只有一个依赖：`IMediator`**——不注入仓储、不注入服务，业务零触碰；
2. **动作方法 = 组装请求 + `Send` + 包 HTTP 状态**（2–3 行）；
3. **更新/删除返回 `204 No Content`**，并用 `[ProducesResponseType]` 把 204/404 显式写进契约（Swagger 可见）；
4. **`Create` 返回 `Ok(id)`**（而非 `CreatedAt`，尽管命名里写了 "AddEvent"）——**REST 语义上有瑕疵**：创建成功更合适的响应是 `201 Created` + Location（作者未提）。

另外注意：`Create` 的返回类型写 `ActionResult<Guid>`，但 P13 的 handler 返回的是 `CreateEventCommandResponse`（P17 又改回 `Guid`）——**两篇之间控制器的返回类型跟着翻转**，正是 [07 §3.2 注记](./07-infrastructure-and-persistence.md) 那条"错误通路未定"矛盾的下游表现。

### 2.5 P19 结语（作者自己对整系列的收束）

> "借助 MediatR，我们造出了轻量、松耦合的控制器……关键优势是**关注点分离**：控制器只负责处理 HTTP 请求与响应，业务逻辑由应用层的专门 handler 处理。……未来的文章里我们会探索 MediatR 的高级特性，例如 **pipeline behaviors**、校验，以及更复杂的业务逻辑。"

（**pipeline behaviors 与校验在本系列始终未出现**，同 P15 的日志/Identity 承诺一起悬空。）

## 3. 与本仓对照

| 原文（P18/P19） | 本仓实态 | 判断 |
|---|---|---|
| API 同时引用三层作组合根 | NestJS 模块图：`apps/api` 根模块装配各上下文模块，`libs/core`/adapter 在 infrastructure 侧提供实现；`@Global` 模块与 token 导出控制可见面 | 同目标；本仓用模块 + DI token 而非 csproj 引用表达"谁看见谁" |
| 扩展方法拆 `ConfigureServices/ConfigurePipeline` | 本仓 `main.ts` 收敛 + 配置模块（`@nestjs/config` + Joi/**zod** 校验，见 `verify-config-contract.ts` 对拍）；Fastify 接线与守卫/拦截器注册有专门纪律 | 一致取向（入口不堆细节），本仓额外有"配置契约对拍"防静默失效 |
| 控制器只注入 `IMediator`，动作 2–3 行 | 本仓 controller 走 `@Inject` 显式 + 命令/查询总线，校验/序列化经官方 standard-schema 路径（`@Body({ schema })`），zod **值导入**否则装饰器拿不到 schema | 同构；本仓把"输入校验"也放进控制器声明面，原文完全没有 |
| `[ProducesResponseType]` 手写状态码 | 本仓响应契约单源在 `libs/contracts`（zod envelope + `Page<T>`），OpenAPI 由构建产出（`openapi/openapi.yaml`）+ api-client 生成 | 本仓以契约生成取代手写注解，避免文档与实现漂移 |
| CORS `SetIsOriginAllowed(true)` + `AllowCredentials` | 本仓可信代理/CORS/CSRF 有显式方案与 fail-closed 倾向（AGENTS.md 铁律 + 相关 module-* plan） | **原文写法属安全缺陷，不可照搬** |
| 无鉴权、无租户、无幂等 | 本仓全局会话墙 + `TenantScopeGuard`/`TenantPermissionGuard` + CASL RBAC + 限流 | 原文是单租户无授权教学项目，差距即本仓的增量价值 |

## 4. 本篇可带走的事实

- **CA 的 API 层唯一职责是"翻译"**：HTTP ⇄ 用例请求，别的都不做。P19 的控制器形状（一个 mediator 依赖 + 三行动作 + 显式状态码契约）是这套理念最干净的可见成果。
- **组合根的可见性是架构正确的检验器**：只有最外层被允许同时引用所有层；反过来，任何内层出现对外层的引用即破功。
- P18/P19 也证明了一件事：**概念正确不等于代码正确**——两篇里的 CORS、Swagger 反复、以及大量引用未实现类型的问题，说明"照着博客搭 CA"必须逐行核验，不能把示例当依据（本仓铁律"外部借鉴须实机核验"的另一例证）。
