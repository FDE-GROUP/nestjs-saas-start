# Part 19：加控制器（MediatR 薄控制器，系列终篇）

> 用途: 调研参考（非开发依据）· 逐篇忠实对译，主题串读见 [08](08-api-layer.md)，横向判读见 [09](09-critique-and-repo-mapping.md)

## 原文信息

| 项 | 值 |
| --- | --- |
| 原标题 | What is Clean Architecture: Part 19 -Add Controllers |
| 链接 | https://dev.to/moh_moh701/what-is-clean-architecture-part-19-add-controllers-152h |
| 作者 | mohamed Tayel（`moh_moh701`） |
| 发布时间 | 2024-10-15T19:06:23Z（距 P18 的 2024-09-17 **近一个月**——连载节奏彻底停摆后的收尾） |
| 系列 | Clean Architecture（collection 28557）第 19 篇（**终篇**） |
| 平台标注阅读时长 | 未标注（`reading_time: null`） |
| 反应数 / 评论数 | 3 / 2 |
| 标签 | `api` `dotnetcore` `programming` `tutorial` |
| AI 披露状态 | `not_disclosed` |
| dev.to 文章 id | 2039587 |
| 本篇原图 | 0 张 |

---

## 逐段对译（正文与代码**全量照录**）

### 开篇

> In this article, we'll see how to build lightweight and loosely coupled API controllers using **MediatR** in an **ASP.NET Core 8** application. We've already set up the essential layers—Application, Infrastructure, and Persistence—and now it's time to expose functionality through an API that communicates with the core of our application using the MediatR pattern.

本篇演示在 ASP.NET Core 8 应用里用 MediatR 构建**轻量、松耦合**的 API 控制器；Application/Infrastructure/Persistence 层已就位，现在通过 API 暴露功能、用 MediatR 模式与应用核心通信。

#### Why Use MediatR?

> **MediatR** is a powerful library that helps decouple the application's layers by acting as a mediator between the controllers and the business logic (commands and queries). It promotes the **Single Responsibility Principle (SRP)** by separating the concerns of business logic from HTTP request handling, making our code easier to maintain, test, and extend.

MediatR 在控制器与业务逻辑（command/query）之间充当中介者，帮应用各层解耦；把业务逻辑从 HTTP 收发中分离，促进 **SRP**，代码更易维护、测试、扩展。

> 注记：本篇层清单又换一套词："Application, Infrastructure, and Persistence"（P18 说 "Core and Infrastructure"，P15 说三层，P1-P3 说四层）——第 N 套。"easier to **test**"第六次口头出现，依然零测试。

### Setting Up the API Project（"回顾版" StartupExtensions——本篇头条判读点）

> In our project, we have already registered **MediatR** in the **Application Layer** via the `AddApplicationServices()` method, so there's no need to add it again directly in the **Program.cs** file. Here's a reminder of how we set it up in the **StartupExtensions.cs**:

MediatR 已在 Application 层经 `AddApplicationServices()` 注册，Program.cs 无需重复。**"提醒一下我们在 StartupExtensions.cs 里是怎么配的"**：

```csharp
using GloboTicket.TicketManagement.Application;
using GloboTicket.TicketManagement.Infrastructure;
using GloboTicket.TicketManagement.Persistence;
namespace GloboTicket.TicketManagement.Api
{
    public static class StartupExtensions
    {
        public static WebApplication ConfigureServices(
           this WebApplicationBuilder builder)
        {
            builder.Services.AddApplicationServices();
            builder.Services.AddInfrastructureServices(builder.Configuration);
            builder.Services.AddPersistenceServices(builder.Configuration);
            builder.Services.AddControllers();

            builder.Services.AddCors(
                options => options.AddPolicy(
                    "open",
                    policy => policy.WithOrigins([builder.Configuration["ApiUrl"] ?? "https://localhost:7020",
                        builder.Configuration["BlazorUrl"] ?? "https://localhost:7080"])
            .AllowAnyMethod()
            .SetIsOriginAllowed(pol => true)
            .AllowAnyHeader()
            .AllowCredentials()));

            builder.Services.AddSwaggerGen();
            return builder.Build();
        }

        public static WebApplication ConfigurePipeline(this WebApplication app)
        {
            app.UseCors("open");

            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            app.UseHttpsRedirection();
            app.MapControllers();

            return app;
        }
    }
}
```

> This ensures that MediatR is available throughout the application via dependency injection. Now, let's move on to creating the controllers.

这保证 MediatR 经 DI 全应用可用。接着创建控制器。

> **判读（头条："reminder" 名不副实——与 P18 同文件存在 4 处静默差异）**：
> 1. CORS 数组化并**新增 `BlazorUrl`（默认 `https://localhost:7080`）**——P18 代码里没有此键，只有正文提到过（当时已判为血缘残留，现在连默认端口 7080 都写死进来了，Blazor 模板工程默认端口的既视感极强，与 [part-18](part-18-api-layer.md) 判读、part-16 seed 同源证据三处咬合，**推断口径不变**）；
> 2. `AddSwaggerGen()` **取消注释**（P18 版是注释行，P18 承诺至此兑现）；
> 3. 管道新增 `if (app.Environment.IsDevelopment()) { UseSwagger/UseSwaggerUI }`（P18 版整段不存在；dev-only 门是本次唯一"新增得对"的细节）；
> 4. `SetIsOriginAllowed(pol => true)` **原样保留**——P18 判读的危险配置（任意源+凭证）在"修订版"里依然危险，而且**该行使 `WithOrigins([...])` 白名单形同虚设**：数组里认真配的两个 origin 默认值被下一行全部作废。
> 一段以"我们上次就是这么写的"（Here's a reminder）面目出现的代码，实际与 P18 交付的版本存在 4 处差异。补一个对拍后的口径修正：P18 的 `edited_at` 就在本篇发布前 3 分钟（见 [part-18](part-18-api-layer.md) 注记），故这段更可能是"作者发终篇前回改了 P18，P19 照抄回改版"——但这恰好是更重的治理问题：**同一段代码在两个时间点的两篇文章里以"同一份"面目出现却无法同时为真**，P18 正文的说明文字（specified clients）也没随回改更新，读者无从分辨"提醒"与"新改动"。教程级"多版本同文件"漂移（`MappingProfile`×3、`CreateEventCommandHandler`×3 之后）在此连"回顾"段落都不例外，这正是无单一事实源文本的固有病灶。

### Creating the CategoryController（原文逐字，含原稿的占位命名空间）

```csharp
using GloboTicket.TicketManagement.Application.Features.Categories.Commands.CreateCategory;
using GloboTicket.TicketManagement.Application.Features.Categories.Queries.GetCategoriesList;
using GloboTicket.TicketManagement.Application.Features.Categories.Queries.GetCategoriesListWithEvents;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace YourApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CategoryController : Controller
    {
        private readonly IMediator _mediator;

        public CategoryController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet("all", Name = "GetAllCategories")]
        public async Task<ActionResult<List<CategoryListVm>>> GetAllCategories()
        {
            var dtos = await _mediator.Send(new GetCategoriesListQuery());
            return Ok(dtos);
        }

        [HttpGet("allwithevents", Name = "GetCategoriesWithEvents")]
        public async Task<ActionResult<List<CategoryEventListVm>>> GetCategoriesWithEvents(bool includeHistory)
        {
            var query = new GetCategoriesListWithEventsQuery { IncludeHistory = includeHistory };
            var dtos = await _mediator.Send(query);
            return Ok(dtos);
        }

        [HttpPost(Name = "AddCategory")]
        public async Task<ActionResult<CreateCategoryCommandResponse>> Create([FromBody] CreateCategoryCommand command)
        {
            var response = await _mediator.Send(command);
            return Ok(response);
        }
    }
}
```

> **判读（五处，本篇密度最高）**：
> 1. **`namespace YourApp.Api.Controllers`**——两个控制器都顶着这个**占位符命名空间**（全系列其他代码都用 `GloboTicket.TicketManagement.*`）。"YourApp" 是模板/教程惯用手未清理的痕迹：若 P18 的 `Program.cs`（`using GloboTicket.TicketManagement.Api;`）与本篇控制器真在同一工程，**控制器不在该命名空间下，路由发现与 using 都对不上**。这与 [part-15](part-15-infrastructure-persistence-layers.md) 的"你的图片"人称错位同属"文稿非手写"形态证据（推断口径同前）。
> 2. **引用的整个 CreateCategory feature 是全系列幽灵**（grep 实测：`CreateCategory` 仅本篇出现）：`CreateCategoryCommand`/`CreateCategoryCommandResponse` 从未定义，对应 handler/validator 更不存在——分类**新增功能只有控制器壳**。P11 精心重组的 Categories 文件夹里只有两个查询。
> 3. **与 P11 的名字又对不上（第三次命名漂移打在 Categories 上）**：P11 的 Vm 叫 `CategoriesListVm`，本篇用 `CategoryListVm`；P11 查询叫 `GetCategoriesWithEventsQuery`，本篇叫 `GetCategoriesListWithEventsQuery`（命名空间 `...Queries.GetCategoriesListWithEvents` P11 也没建过）。P11↔P19 无法同时编译，且 P19 没有回头修订 P11。
> 4. **`includeHistory` 的下游是 P16 的 no-op 过滤 bug**：控制器把查询参数认真传下去，P16 实现里 `ToList().RemoveAll` 静默无效——**API 契约承诺"可排除历史"，实现永远返回全量**。三层各自"看起来对"，端到端是错的，这是零测试系列最好的端到端标本。
> 5. `Create` 返回 `Ok(response)`：创建成功给 **200 而非 201**（无 CreatedAtAction/Location 头，与 REST 惯例相悖；同篇 GET 都规范命名了 route，POST 却丢状态码语义）。

### Creating the EventsController（原文逐字）

```csharp
using GloboTicket.TicketManagement.Application.Features.Events.Commands.CreateEvent;
using GloboTicket.TicketManagement.Application.Features.Events.Commands.DeleteEvent;
using GloboTicket.TicketManagement.Application.Features.Events.Commands.UpdateEvent;
using GloboTicket.TicketManagement.Application.Features.Events.Queries.GetEventDetail;
using GloboTicket.TicketManagement.Application.Features.Events.Queries.GetEventsList;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace YourApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EventsController : Controller
    {
        private readonly IMediator _mediator;

        public EventsController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet(Name = "GetAllEvents")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesDefaultResponseType]
        public async Task<ActionResult<List<EventListVm>>> GetAllEvents()
        {
            var result = await _mediator.Send(new GetEventsListQuery());
            return Ok(result);
        }

        [HttpGet("{id}", Name = "GetEventById")]
        public async Task<ActionResult<EventDetailVm>> GetEventById(Guid id)
        {
            var query = new GetEventDetailQuery { Id = id };
            return Ok(await _mediator.Send(query));
        }

        [HttpPost(Name = "AddEvent")]
        public async Task<ActionResult<Guid>> Create([FromBody] CreateEventCommand command)
        {
            var id = await _mediator.Send(command);
            return Ok(id);
        }

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
            var command = new DeleteEventCommand { EventId = id };
            await _mediator.Send(command);
            return NoContent();
        }
    }
}
```

> **判读**：
> 1. **`Create` 声明 `ActionResult<Guid>` 是"P13 路线被无声废弃"的最终盖章**：与 P12/P17 的 `IRequest<Guid>` 握手（P13 的 `CreateEventCommandResponse`+200-埋错模式被本篇绕开）——但同篇的 CategoryController.Create 用的偏偏是 `...CommandResponse` 壳（幽灵版 P13 模式）。**两个控制器各奉主**，错误响应哲学在 API 层没有统一。
> 2. **`Status404NotFound` 属性是装饰品**：Update/Delete 的 handler（P12）抛 `NotFoundException`——该类型全系列未定义（幽灵 #1），且 P18/P19 管道**没有任何异常映射中间件**（P15 承诺的 error handling 至完结未补）：假想编译通过后，未找到的请求实际会得到 **500**，`ProducesResponseType(404)` 与 Swagger 文档一起对外撒"我们返回 404"的谎。**契约声明与运行时行为脱钩，无集成测试兜底**——本类问题的通用标本。
> 3. Update 用 PUT 全量语义配全字段覆盖 handler（P12 判读 3 的无并发令牌风险在动词层面再次坐实）；GetAllEvents 无分页（P4"长列表"终点）。
> 4. `GetEventById` 无任何判空/404（直通 P10 不判空的 handler）；路由风格不统一（`HttpGet("all")` vs `HttpGet()`、`HttpGet("{id}")` vs PUT 无 id 走 body）。

#### Key Points（原文逐字）

> - **GetAllEvents**: Retrieves all events using `GetEventsListQuery` and returns them to the client.
> - **GetEventById**: Fetches the details of a specific event by sending an `id` in the `GetEventDetailQuery`.
> - **Create**: Handles the creation of new events. A `CreateEventCommand` is passed from the client, and MediatR forwards it to the handler responsible for event creation.
> - **Update**: Updates an existing event by sending an `UpdateEventCommand`. The handler processes the update logic, and a 204 No Content response is returned.
> - **Delete**: Deletes an event based on its `id` using `DeleteEventCommand`.

（五个动作逐条复述：取全列表、按 id 取详情、创建、更新返 204、删除返 204。）

### Conclusion（原文逐字）

> By leveraging MediatR, we have created lightweight, loosely coupled controllers for handling categories and events in an ASP.NET Core 8 application. The key advantage of using MediatR is the separation of concerns: the controllers focus solely on handling HTTP requests and responses, while business logic is handled by specific handlers in the application layer.
>
> This approach ensures that our API remains maintainable, scalable, and easy to extend as the application grows. **In future articles, we'll explore advanced MediatR features, such as pipeline behaviors, validation, and more complex business logic.**
>
> For the complete source code, feel free to visit the GitHub repository [here](https://github.com/mohamedtayel1980/clean-architecture).

借 MediatR 建成轻量松耦合控制器：控制器只管 HTTP 收发、业务逻辑归应用层 handler。**未来文章将探索 pipeline behaviors、校验与更复杂业务逻辑**。完整源码见 GitHub。
> 1. **系列至此完结（第 19 篇为 collection 末篇），上述"In future articles"再度落空**——与 P10"下篇就测试"、P15"日志/错误处理/Identity"同列承诺废单；且本篇自己承认"validation"还没做管道化（变相确认 P13 的手动 new 是临时工）。
> 2. 控制器"薄"的成色客观上成立（无业务逻辑泄漏进 Action，每个方法 2-3 行 Send+返回）——这是 P19 在 CA 口径下的真实得分点，代价是上述所有"契约-实现脱钩"都要靠**并不存在**的测试在别处拦截。

---

## 整理注记（本篇结构性小结）

| 维度 | 事实 |
| --- | --- |
| CA 得分点 | 控制器保持精瘦（SRP 姿态兑现）；读写动词与 MediatR 的分派关系清晰；dev-only Swagger 门是系列后段少见的正确工程直觉 |
| CA 失分点 | 无认证授权即"API 层完成"；异常→状态码无中间件映射，ProducesResponseType 成谎言注解 |
| 版本漂移 | "reminder" 代码与 P18 版 4 处不同却以原样面目出现（第 N 例同文件多版本）；P11↔P19 Categories 命名三度不合 |
| 可编译性 | 幽灵 feature（CreateCategory 全家）、占位命名空间 YourApp、Vm/Query 名对不上 P11——终篇仍延续"照抄即坏"传统 |
| 端到端标本 | includeHistory 参数：控制器(对)→P16 实现(no-op bug)→契约撒谎；404 声明：属性(对)→handler 抛幽灵类型→管道无映射(500) |
| 社区检验 | 3 反应 / 2 条互动（1 根评论 + 1 作者回复，均无技术内容） |

## 与本仓对照（本篇）

| 本篇做法 | 本仓实态 |
| --- | --- |
| 控制器 Action 2-3 行 Send（薄） | 本仓 Controller 同样只做 HTTP↔用例转接（`@Controller` + `@Body({ schema })`），方向一致；本篇真正的对照组 |
| `ProducesResponseType(404)` 但运行时 500 | 状态码由异常类型经 `HttpExceptionFilter` 真实映射，契约（OpenAPI 产物）与行为有 `verify:*` + e2e 对拍 |
| 创建返 200 无 Location | REST 语义在契约层定义（201/204 按动词与产物返回） |
| "future articles" 式口头路线图 | 路线图居 `docs/plans/`（审计门 + 状态单源 README），发布即承诺、承诺即留痕 |
| 占位命名空间 YourApp / 幽灵 feature | TS 编译 + Biome + CI 门禁使"未定义引用"活不过 merge |

## 评论区实录

**1 根评论 + 1 作者回复（`comments_count: 2` 即此两条；API 与 JSON-LD 对拍一致，无隐藏条目）**：

| # | 谁 | 时间 | 内容（逐字） |
| --- | --- | --- | --- |
| 1 | Miguel David González del Toro | 2024-10-24 | "Thanks man for getting to this point! I've been following the series and it's very awesome. Keep it up!"（感谢更到这一步，一路追更，系列很棒，继续！） | 
| 1.1 | **作者回复** mohamed Tayel | 2024-10-27 | "Thank you so much! I'm really glad you're finding the series helpful. Your support means a lot, and it motivates me to keep going. **Stay tuned for more content coming soon!**"（很快还有更多内容） |

> 注记：终篇的读者互动仍为零技术反馈；作者"more content coming soon"与 Conclusion 的"future articles"构成双份未兑现承诺（全系列以 2024-10-15 的 P19 为实际终点，collection 无后续篇目）。追更者存在（"I've been following"），但 415→个位数塌陷后（P4 起，见 [part-04](part-04-business-need-globoticket.md) 取证表），技术质询缺位，终篇 bug 密度与首篇无异。

---

## 附：原文英文全稿（逐字保留）

> 来源：dev.to 官方 API `body_markdown` 字段（作者原始稿），抓取于 2026-10-21；除把图片链接改为本地 `./imges/` 副本（原始 URL 保留在链接 title 中）外，未作任何增删改。
>
> 呈现口径：以下英文全稿**不做代码块包裹、直接按 Markdown 渲染**（保留作者原始标题层级、粗体、列表、代码块与图片）；逐字性以上述 body_markdown 抓取为准，本区未增删改任何文字。

In this article, we’ll see how to build lightweight and loosely coupled API controllers using **MediatR** in an **ASP.NET Core 8** application. We’ve already set up the essential layers—Application, Infrastructure, and Persistence—and now it’s time to expose functionality through an API that communicates with the core of our application using the MediatR pattern.

#### Why Use MediatR?

**MediatR** is a powerful library that helps decouple the application’s layers by acting as a mediator between the controllers and the business logic (commands and queries). It promotes the **Single Responsibility Principle (SRP)** by separating the concerns of business logic from HTTP request handling, making our code easier to maintain, test, and extend.

### Setting Up the API Project

In our project, we have already registered **MediatR** in the **Application Layer** via the `AddApplicationServices()` method, so there’s no need to add it again directly in the **Program.cs** file. Here's a reminder of how we set it up in the **StartupExtensions.cs**:

```csharp
using GloboTicket.TicketManagement.Application;
using GloboTicket.TicketManagement.Infrastructure;
using GloboTicket.TicketManagement.Persistence;
namespace GloboTicket.TicketManagement.Api
{
    public static class StartupExtensions
    {
        public static WebApplication ConfigureServices(
           this WebApplicationBuilder builder)
        {
            builder.Services.AddApplicationServices();
            builder.Services.AddInfrastructureServices(builder.Configuration);
            builder.Services.AddPersistenceServices(builder.Configuration);
            builder.Services.AddControllers();

            builder.Services.AddCors(
                options => options.AddPolicy(
                    "open",
                    policy => policy.WithOrigins([builder.Configuration["ApiUrl"] ?? "https://localhost:7020",
                        builder.Configuration["BlazorUrl"] ?? "https://localhost:7080"])
            .AllowAnyMethod()
            .SetIsOriginAllowed(pol => true)
            .AllowAnyHeader()
            .AllowCredentials()));

            builder.Services.AddSwaggerGen();
            return builder.Build();
        }

        public static WebApplication ConfigurePipeline(this WebApplication app)
        {
            app.UseCors("open");

            if (app.Environment.IsDevelopment())
            {
                app.UseSwagger();
                app.UseSwaggerUI();
            }

            app.UseHttpsRedirection();
            app.MapControllers();

            return app;
        }
    }
}

```

This ensures that MediatR is available throughout the application via dependency injection. Now, let’s move on to creating the controllers.

### Creating the CategoryController

The **CategoryController** will expose endpoints to handle various category-related API requests, like fetching all categories or adding a new category. Each request will be handled by sending the appropriate query or command to MediatR, which in turn delegates the logic to the correct handler.

```csharp
using GloboTicket.TicketManagement.Application.Features.Categories.Commands.CreateCategory;
using GloboTicket.TicketManagement.Application.Features.Categories.Queries.GetCategoriesList;
using GloboTicket.TicketManagement.Application.Features.Categories.Queries.GetCategoriesListWithEvents;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace YourApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CategoryController : Controller
    {
        private readonly IMediator _mediator;

        public CategoryController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet("all", Name = "GetAllCategories")]
        public async Task<ActionResult<List<CategoryListVm>>> GetAllCategories()
        {
            var dtos = await _mediator.Send(new GetCategoriesListQuery());
            return Ok(dtos);
        }

        [HttpGet("allwithevents", Name = "GetCategoriesWithEvents")]
        public async Task<ActionResult<List<CategoryEventListVm>>> GetCategoriesWithEvents(bool includeHistory)
        {
            var query = new GetCategoriesListWithEventsQuery { IncludeHistory = includeHistory };
            var dtos = await _mediator.Send(query);
            return Ok(dtos);
        }

        [HttpPost(Name = "AddCategory")]
        public async Task<ActionResult<CreateCategoryCommandResponse>> Create([FromBody] CreateCategoryCommand command)
        {
            var response = await _mediator.Send(command);
            return Ok(response);
        }
    }
}
```

#### Key Points of CategoryController:

- **GetAllCategories**: Sends a `GetCategoriesListQuery` to MediatR. The query handler processes the logic and returns the result, which is sent back as an HTTP 200 response.
- **GetCategoriesWithEvents**: Similar to `GetAllCategories`, this query includes an additional Boolean parameter (`includeHistory`) to determine whether historical data should be included.
- **Create**: Handles `POST` requests to create a new category. The `CreateCategoryCommand` is passed to MediatR, which sends it to the appropriate handler, returning the response from the handler.

### Creating the EventsController

Similarly, the **EventsController** will handle event-related API requests such as fetching all events, retrieving event details, creating, updating, and deleting events. Each action is decoupled from the controller logic by using MediatR.

```csharp
using GloboTicket.TicketManagement.Application.Features.Events.Commands.CreateEvent;
using GloboTicket.TicketManagement.Application.Features.Events.Commands.DeleteEvent;
using GloboTicket.TicketManagement.Application.Features.Events.Commands.UpdateEvent;
using GloboTicket.TicketManagement.Application.Features.Events.Queries.GetEventDetail;
using GloboTicket.TicketManagement.Application.Features.Events.Queries.GetEventsList;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace YourApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class EventsController : Controller
    {
        private readonly IMediator _mediator;

        public EventsController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpGet(Name = "GetAllEvents")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesDefaultResponseType]
        public async Task<ActionResult<List<EventListVm>>> GetAllEvents()
        {
            var result = await _mediator.Send(new GetEventsListQuery());
            return Ok(result);
        }

        [HttpGet("{id}", Name = "GetEventById")]
        public async Task<ActionResult<EventDetailVm>> GetEventById(Guid id)
        {
            var query = new GetEventDetailQuery { Id = id };
            return Ok(await _mediator.Send(query));
        }

        [HttpPost(Name = "AddEvent")]
        public async Task<ActionResult<Guid>> Create([FromBody] CreateEventCommand command)
        {
            var id = await _mediator.Send(command);
            return Ok(id);
        }

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
            var command = new DeleteEventCommand { EventId = id };
            await _mediator.Send(command);
            return NoContent();
        }
    }
}
```

#### Key Points of EventsController:

- **GetAllEvents**: Retrieves all events using `GetEventsListQuery` and returns them to the client.
- **GetEventById**: Fetches the details of a specific event by sending an `id` in the `GetEventDetailQuery`.
- **Create**: Handles the creation of new events. A `CreateEventCommand` is passed from the client, and MediatR forwards it to the handler responsible for event creation.
- **Update**: Updates an existing event by sending an `UpdateEventCommand`. The handler processes the update logic, and a 204 No Content response is returned.
- **Delete**: Deletes an event based on its `id` using `DeleteEventCommand`.

### Conclusion

By leveraging MediatR, we have created lightweight, loosely coupled controllers for handling categories and events in an ASP.NET Core 8 application. The key advantage of using MediatR is the separation of concerns: the controllers focus solely on handling HTTP requests and responses, while business logic is handled by specific handlers in the application layer.

This approach ensures that our API remains maintainable, scalable, and easy to extend as the application grows. In future articles, we’ll explore advanced MediatR features, such as pipeline behaviors, validation, and more complex business logic.

For the complete source code, feel free to visit the GitHub repository [here](https://github.com/mohamedtayel1980/clean-architecture).
