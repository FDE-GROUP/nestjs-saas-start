# Part 13：用 FluentValidation 加校验（含 DB 唯一性检查与自定义响应）

> 用途: 调研参考（非开发依据）· 逐篇忠实对译，主题串读见 [06](06-validation-and-di-composition.md)，横向判读见 [09](09-critique-and-repo-mapping.md)

## 原文信息

| 项 | 值 |
| --- | --- |
| 原标题 | What is Clean Architecture: Part 13-Adding Validation Using Fluent Validation |
| 链接 | https://dev.to/moh_moh701/what-is-clean-architecture-part-13-adding-validation-using-fluent-validation-11dl |
| 作者 | mohamed Tayel（`moh_moh701`） |
| 发布时间 | 2024-09-05T14:10:42Z（**当日第 3 篇**：P11 12:28 / P12 13:15 / P13 14:10，批量存稿释放） |
| 系列 | Clean Architecture（collection 28557）第 13 篇 |
| 平台标注阅读时长 | 未标注（`reading_time: null`） |
| 反应数 / 评论数 | 1 / 0 |
| 标签 | **无**（`tag_list` 为空——全系列唯一未打标签的一篇，侧面印证"批量发布时疏于收尾"） |
| AI 披露状态 | `not_disclosed` |
| dev.to 文章 id | 1988120 |
| 本篇原图 | 0 张 |

---

## 逐段对译（正文与代码**全量照录**）

### 开篇

> In modern application development, ensuring that data is valid before processing is crucial to maintain application integrity. Whether you're creating, updating, or deleting entities, it is important to verify that the data adheres to business rules. In this article, we will focus on how to add **validation** using **Fluent Validation** in a **feature-based architecture**, specifically within a command handler for creating events. Additionally, we'll explore how to return custom responses and handle validation errors cleanly.

处理前确保数据合法对应用完整性至关重要；无论增删改，都要验证数据是否**遵守业务规则**。本文讲在 feature-based 架构里用 **FluentValidation** 加校验（聚焦创建活动的命令 handler），并演示如何返回**自定义响应**、干净地处理校验错误。

### Why Not Use Data Annotations?（为什么不用数据注解）

> In many projects, **data annotations** are used for basic validation on entities. While this works for simple validation scenarios, it tightly couples validation logic to the domain, violating the **persistence ignorance** principle. Additionally, data annotations cannot handle more complex validation logic, such as cross-field validation or querying the database to check for uniqueness.
>
> By using **Fluent Validation**, we keep the validation logic separate from the domain entities, making the system more maintainable, flexible, and easier to extend.

很多项目用**数据注解**（`[Required]`/`[MaxLength]` 等）给实体做基础校验；简单场景可行，但它把校验逻辑**死死耦合到领域上，违反 persistence ignorance（持久化无知）原则**，而且注解处理不了跨字段校验或**查数据库判唯一**这类复杂逻辑。用 FluentValidation 可把校验逻辑与领域实体分离，系统更易维护、灵活、可扩展。

> **判读（本篇唯一一段像样的架构论证，但埋了一个未自察的矛盾）**：
> 1. "校验放实体注解会耦合领域"的论证成立且与 P1 的层次独立精神一致；但注意作者的替代方案是把校验放 **Application 层的 validator**——于是"活动名 ≤50 字符、日期必须将来"这些**业务规则从此住在应用层而不是领域层**。在 CA/Uncle Bob 的原始同心圆里，业务规则应当属于**最内圈（Entity 层）**；把领域不变式外包给应用层的 FluentValidation，只是把耦合从"领域↔持久化"换成了"领域规则↔应用框架"。本仓立场：不变式在 Rich Domain 方法内断言，zod 契约只做**入站格式防线**（两者职责不同，不互替）。
> 2. 顺带说明：P13 引用的 "persistence ignorance" 一词源自 Cleancoder/常见 .NET 教程话语，与本篇标题里的 Clean Architecture 并非同一套术语体系——原文没有解释这一点。

### Step 1: Adding Fluent Validation NuGet Packages（加包，原文逐字）

```xml
<PackageReference Include="FluentValidation" Version="11.9.0" />
<PackageReference Include="FluentValidation.DependencyInjectionExtensions" Version="11.9.0" />
```

> Alternatively, you can install the packages via the NuGet Package Manager in Visual Studio:

```bash
Install-Package FluentValidation
Install-Package FluentValidation.DependencyInjectionExtensions
```

> These packages will allow us to define validation logic using Fluent Validation and register validators within the dependency injection container.

加这两个包以定义校验逻辑并**在 DI 容器里注册 validator**。

> 注记：本篇工程归属没写清——包加到 **Application** 工程（validator 住 Application），但原文这一步没有像 P10 那样展示 `.csproj` 上下文。且 `DependencyInjectionExtensions` 的作用是把 validator **注册进容器**，可 Step 4 的 handler 却**手动 `new` validator**（见下文判读）——引了 DI 扩展包又绕开 DI，自相矛盾（P14 的注册代码里是否真注册了 validator 需对照 [part-14](part-14-di-registration.md)：P14 实际只注册了 MediatR/AutoMapper/仓储，`RegisterValidatorsFromAssembly` 全系列未出现——**推断依据为 P14/P15 文本核对**）。

### Step 2: Creating a Base Response Class（基础响应类，原文逐字）

```csharp
namespace GloboTicket.TicketManagement.Application.Responses
{
    public class BaseResponse
    {
        public BaseResponse()
        {
            Success = true;
        }

        public BaseResponse(string message)
        {
            Success = true;
            Message = message;
        }

        public BaseResponse(string message, bool success)
        {
            Success = success;
            Message = message;
        }

        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public List<string>? ValidationErrors { get; set; }
    }
}
```

> 判读（"200 OK 里埋错误"的响应模型）：
> 1. `Success` 是**负载内的布尔状态位**：校验失败时 HTTP 仍是 200，错误信息装在 `ValidationErrors` 里随体返回（P18/P19 的控制器确实原样透出 `Ok(response)`）。这让**错误通路脱离 HTTP 语义**——客户端必须解析业务体才知道失败，网关/监控/重试策略全部看不到错误。本仓路线：错误以异常上浮、全局过滤器映射到非 2xx + 统一 envelope（对照 [09 §5](09-critique-and-repo-mapping.md)）。
> 2. `ValidationErrors` 是 `List<string>?`——**拍扁成消息字符串数组，丢失字段名关联**（FluentValidation 本可给出 `PropertyName → errors` 结构）。前端无法把错误定位到输入框，这是 P18/P19 前端表单只能整体弹错误列表的根因。
> 3. 三个构造器重载里 `BaseResponse(string message)` 强制 `Success=true`、要失败必须用双参版——重载语义不一致，容易误用（小疵）。

### Step 3: Adding Fluent Validation for Event Creation（创建活动校验器，原文逐字）

```csharp
using FluentValidation;
using GloboTicket.TicketManagement.Application.Contracts.Persistence;

namespace GloboTicket.TicketManagement.Application.Features.Events.Commands.CreateEvent
{
    public class CreateEventCommandValidator : AbstractValidator<CreateEventCommand>
    {
        private readonly IEventRepository _eventRepository;

        public CreateEventCommandValidator(IEventRepository eventRepository)
        {
            _eventRepository = eventRepository;

            RuleFor(p => p.Name)
                .NotEmpty().WithMessage("{PropertyName} is required.")
                .NotNull()
                .MaximumLength(50).WithMessage("{PropertyName} must not exceed 50 characters.");

            RuleFor(p => p.Date)
                .NotEmpty().WithMessage("{PropertyName} is required.")
                .GreaterThan(DateTime.Now).WithMessage("{PropertyName} must be a future date.");

            RuleFor(e => e)
                .MustAsync(EventNameAndDateUnique)
                .WithMessage("An event with the same name and date already exists.");

            RuleFor(p => p.Price)
                .NotEmpty().WithMessage("{PropertyName} is required.")
                .GreaterThan(0).WithMessage("{PropertyName} must be greater than zero.");
        }

        private async Task<bool> EventNameAndDateUnique(CreateEventCommand e, CancellationToken token)
        {
            return !await _eventRepository.IsEventNameAndDateUnique(e.Name, e.Date);
        }
    }
}
```

> **判读（五条）**：
> 1. **`IsEventNameAndDateUnique` 此时仍未在 `IEventRepository` 上定义**（P9 建的是空接口；本篇直接调用），接口补码同样迟到（P16 才给实现）——与 P11 的 `GetAllCategoriesAsync` 一模一样的"先调用、后（也许）补定义"断链模式。
> 2. **双重否定致校验逻辑整体取反（与 P16 对拍确认，见 [part-16](part-16-ef-core-persistence.md) §7）**：P16 的实现 `_dbContext.Events.Any(...); return Task.FromResult(!matches);` 注释明说"Return true if no match is found (i.e. unique)"——即仓储方法名实相符（返回"是否唯一"）。而本篇 validator 写的是 `return !await _eventRepository.IsEventNameAndDateUnique(...)`：`MustAsync` 要求 true=合法，于是 **名字日期真的唯一 → `Is`=true → `!Is`=false → 校验失败报 "An event with the same name and date already exists."；真有重复 → 反而放行**。错误消息与触发条件完全对调。若两段代码都照原文落地，创建任何新活动都会先被误拦。这是全系列唯一一处"跨篇对拍才能发现"的业务逻辑级 bug，也是零测试、零运行验证的终局性证据——任何一次真跑都会当场暴露。
> 3. **唯一性校验有 TOCTOU 竞态**：validator 查库 → handler `AddAsync` 插入，两步之间另一个请求可以插队；补救只能是数据库唯一索引，而原文通篇未提唯一索引（P16 的 DbContext 配置里也未见，见 part-16 判读）。**校验写成"防君子不防并发"**。
> 4. `RuleFor(p => p.Date).NotEmpty()` 对 `DateTime` 值类型语义可疑（FluentValidation 对非空值类型的 NotEmpty 近似 no-op）；真正起作用的是 `GreaterThan(DateTime.Now)`。`Price` 同理（`int` 的 NotEmpty + GreaterThan(0)，前者冗余）。**`DateTime.Now` 还是本地时钟**——服务器时区改变会改变"未来"的定义，教程级细节失控。
> 5. 校验规则集缺 `Artist/Description/ImageUrl/CategoryId` 任何一条——**CategoryId 连"是不是合法分类"都不查**（不存在的外键值到 P16 FK 约束才炸）。

### Step 4: Handling Validation in the Command Handler（handler 内手动校验，原文逐字）

> Now that we've defined our validation rules, we can use the `CreateEventCommandValidator` in the command handler for creating events. The handler will validate the request before processing it, and if validation fails, it will return a response that includes the validation errors.

```csharp
using AutoMapper;
using GloboTicket.TicketManagement.Application.Contracts.Persistence;
using GloboTicket.TicketManagement.Domain.Entities;
using MediatR;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace GloboTicket.TicketManagement.Application.Features.Events.Commands.CreateEvent
{
    public class CreateEventCommandHandler : IRequestHandler<CreateEventCommand, CreateEventCommandResponse>
    {
        private readonly IEventRepository _eventRepository;
        private readonly IMapper _mapper;

        public CreateEventCommandHandler(IMapper mapper, IEventRepository eventRepository)
        {
            _mapper = mapper;
            _eventRepository = eventRepository;
        }

        public async Task<CreateEventCommandResponse> Handle(CreateEventCommand request, CancellationToken cancellationToken)
        {
            var theEvent = _mapper.Map<Event>(request);            
            var createEventCommandResponse = new CreateEventCommandResponse();
            var validator = new CreateEventCommandValidator(_eventRepository);
            var validationResult = await validator.ValidateAsync(request);

            if (validationResult.Errors.Count > 0)
            {
                createEventCommandResponse.Success = false;
                createEventCommandResponse.ValidationErrors = new List<string>();
                foreach (var error in validationResult.Errors)
                {
                    createEventCommandResponse.ValidationErrors.Add(error.ErrorMessage);
                }
            }

            if (createEventCommandResponse.Success)
            {
                theEvent = await _eventRepository.AddAsync(theEvent);
                createEventCommandResponse.EventDto = _mapper.Map<CreateEventDto>(theEvent);
            }

            return createEventCommandResponse;
        }
    }
}
```

> **判读（本篇最重的三处实存问题）**：
> 1. **与 P12 的命令类型直接冲突且未回填**：P12 的 `CreateEventCommand : IRequest<Guid>`，本篇 handler 声明 `IRequestHandler<CreateEventCommand, CreateEventCommandResponse>`——MediatR 要求 handler 的 `TResult` 与 `IRequest<TResult>` 一致，**这两段代码放进同一工程必然编译失败**。本篇既没有重新定义命令、也没有"把 `IRequest<Guid>` 改为 `IRequest<CreateEventCommandResponse>`"的说明。P10/P11 的命名空间漂移、Profile 漂移之外，这是第三种系列内断裂：**返回契约漂移**。
> 2. **`CreateEventDto` 全系列从未定义**：全文 19 篇中 `CreateEventDto` 只在上面这两个代码块出现（`grep` 对拍全部 `body_markdown` 证实），没有类定义、没有映射配置（Step 4 的 Profile 更新也没有——本篇根本没有再贴 MappingProfile）。运行到这里 AutoMapper 会因"未配置映射"抛异常。**幽灵类型第二例**（第一例是 P12 的 `NotFoundException`）。
> 3. **手动 `new` validator**：`var validator = new CreateEventCommandValidator(_eventRepository);`——Step 1 特意装了 `DependencyInjectionExtensions`（为容器注册 validator），这里却绕开容器手动实例化；校验器不是经 MediatR 管道行为（`ValidationBehavior`）自动触发，而是每个 handler 手写三件套（new → ValidateAsync → 拍扁错误）。**DI 扩展包白装、样板代码扩散**：P15 的 `UpdateEvent` handler 将原样再抄一遍这段（对照串读时验证）。作者另有一篇 Mediator 专文，却没用管道这个最省样板的挂点。
> 4. 小疵：`_mapper.Map<Event>(request)` 在**校验之前**执行（校验失败也白映射一次）；`AddAsync` 的返回值这次被用了（`theEvent = await ...`），但 P9 契约里 `AddAsync` 返回 `Task<T>` 是否返回带生成主键的实体并无承诺——依赖实现细节（P16 才确认返回入参本体）。

### Step 5: Custom Response Objects（自定义响应对象，原文逐字）

> Instead of simply returning a success flag, we return a **custom response object**. This allows us to return detailed information to the consumer, such as the created event's details or a list of validation errors.

```csharp
using GloboTicket.TicketManagement.Application.Responses;

namespace GloboTicket.TicketManagement.Application.Features.Events.Commands.CreateEvent
{
    public class CreateEventCommandResponse : BaseResponse
    {
        public CreateEventCommandResponse() : base()
        {
        }

        public CreateEventDto EventDto { get; set; } = default!;
    }
}
```

> 注记：`EventDto` 属性用 `default!` 压掉可空告警——校验失败路径下它就是 `null`，类型系统被 `!` 手动静音而非被设计澄清。与 P10 判读过的"契约无可空性"同一病灶的另一种表现。

### Conclusion（原文逐字）

> By incorporating **Fluent Validation** into your application, you can maintain clean and flexible validation logic that is decoupled from your domain entities. Using custom exceptions and response objects, you can also handle validation errors elegantly and provide clear, structured feedback to the consumer.
>
> With this approach, your application becomes more maintainable, modular, and flexible, ensuring that as your business rules evolve, your validation logic remains easy to manage.
>
> For the complete source code, you can visit the GitHub repository: https://github.com/mohamedtayel1980/clean-architecture

把 FluentValidation 纳入应用即可获得与领域实体解耦的干净灵活校验；配合**自定义异常**与响应对象能优雅处理校验错误、给消费者清晰结构化反馈。完整源码见 GitHub 仓库。

> 注记："custom exceptions" 本篇根本没出现（全文没有任何 throw）——结尾段与正文内容脱节，疑似模板化收尾残留。

---

## 整理注记（本篇结构性小结）

| 维度 | 事实 |
| --- | --- |
| CA 得分点 | 校验与实体注解解耦的论证成立；"唯一性要查库、注解做不到"是真实痛点；响应对象开始标准化 |
| CA 失分点 | 领域不变式整体迁到 Application 层 validator（内圈被掏空）；校验不经管道、每 handler 手抄样板 |
| 可编译性 | 3 处原稿级硬伤：handler 与 P12 命令的 `IRequest<TResult>` 不匹配（编译炸）、`CreateEventDto` 幽灵类型（编译炸）、`IsEventNameAndDateUnique` 仍未在接口定义（编译炸） |
| 正确性风险 | TOCTOU 竞态无唯一索引兜底；`DateTime.Now` 本地时钟；错误拍扁失字段名；200-OK-埋错模式 |
| 命名卫生 | 无（P16 对拍后洗清：方法名实相符）；真正的病灶是 P13 调用侧的双重否定取反（见 Step 3 判读 2） |
| 社区检验 | 1 反应 / 0 评论 / **0 标签**（全系列唯一空 tag_list）——三连发布（P11-P13 同日）篇篇无人看管 |

## 与本仓对照（本篇）

| 本篇做法 | 本仓实态 |
| --- | --- |
| FluentValidation validator 住 Application、每 handler 手动 new | zod 契约单源 `libs/contracts` + `@Body({ schema })` 官方路径自动校验（AGENTS.md §2：禁自研 pipe/class-validator）；业务不变式在 Rich Domain 方法内断言，格式校验与不变式**分职不混居** |
| `BaseResponse.Success` 负载内状态位 + HTTP 200 | 异常上浮 → `HttpExceptionFilter` 映射非 2xx + 统一错误 envelope |
| `List<string>? ValidationErrors`（失字段名） | zod 错误含 path，可精确回指字段 |
| DB 唯一性 = validator 查库（TOCTOU） | 唯一性双保险：DB unique index（真约束）+ 用例层预检（友好报错），职责不互换 |
| `default!` 静音可空告警 | TS 严格可空 + `exactOptionalPropertyTypes`；`verify-type-escape-ratchet` 门禁盯类型逃逸 |

## 评论区实录

**本篇评论数为 0**（API `comments_count: 0`，`/api/comments?a_id=1988120` 空数组）。

---

## 附：原文英文全稿（逐字保留）

> 来源：dev.to 官方 API `body_markdown` 字段（作者原始稿），抓取于 2026-10-21；除把图片链接改为本地 `./imges/` 副本（原始 URL 保留在链接 title 中）外，未作任何增删改。
>
> 呈现口径：以下英文全稿**不做代码块包裹、直接按 Markdown 渲染**（保留作者原始标题层级、粗体、列表、代码块与图片）；逐字性以上述 body_markdown 抓取为准，本区未增删改任何文字。

In modern application development, ensuring that data is valid before processing is crucial to maintain application integrity. Whether you're creating, updating, or deleting entities, it is important to verify that the data adheres to business rules. In this article, we will focus on how to add **validation** using **Fluent Validation** in a **feature-based architecture**, specifically within a command handler for creating events. Additionally, we’ll explore how to return custom responses and handle validation errors cleanly.

#### Why Not Use Data Annotations?

In many projects, **data annotations** are used for basic validation on entities. While this works for simple validation scenarios, it tightly couples validation logic to the domain, violating the **persistence ignorance** principle. Additionally, data annotations cannot handle more complex validation logic, such as cross-field validation or querying the database to check for uniqueness.

By using **Fluent Validation**, we keep the validation logic separate from the domain entities, making the system more maintainable, flexible, and easier to extend.

---

### Step 1: Adding Fluent Validation NuGet Packages

Before we dive into the code, we need to add **Fluent Validation** to our project. This can be done by adding the following package references to your project file (`.csproj`):

```xml
<PackageReference Include="FluentValidation" Version="11.9.0" />
<PackageReference Include="FluentValidation.DependencyInjectionExtensions" Version="11.9.0" />
```

Alternatively, you can install the packages via the NuGet Package Manager in Visual Studio:

```bash
Install-Package FluentValidation
Install-Package FluentValidation.DependencyInjectionExtensions
```

These packages will allow us to define validation logic using Fluent Validation and register validators within the dependency injection container.

---

### Step 2: Creating a Base Response Class

To standardize how our command handlers respond to requests, we’ll create a base response class that includes properties for success, a message, and a list of validation errors (if any). This will ensure that consumers of the API receive consistent responses regardless of the operation they are performing.

```csharp
namespace GloboTicket.TicketManagement.Application.Responses
{
    public class BaseResponse
    {
        public BaseResponse()
        {
            Success = true;
        }

        public BaseResponse(string message)
        {
            Success = true;
            Message = message;
        }

        public BaseResponse(string message, bool success)
        {
            Success = success;
            Message = message;
        }

        public bool Success { get; set; }
        public string Message { get; set; } = string.Empty;
        public List<string>? ValidationErrors { get; set; }
    }
}
```

---

### Step 3: Adding Fluent Validation for Event Creation

Now let’s focus on validating the `CreateEventCommand`. Fluent Validation allows us to define business rules in a clean, maintainable manner using **lambda expressions**. In this example, we'll validate that the name, price, and date of the event are provided and ensure the event name and date are unique.

```csharp
using FluentValidation;
using GloboTicket.TicketManagement.Application.Contracts.Persistence;

namespace GloboTicket.TicketManagement.Application.Features.Events.Commands.CreateEvent
{
    public class CreateEventCommandValidator : AbstractValidator<CreateEventCommand>
    {
        private readonly IEventRepository _eventRepository;

        public CreateEventCommandValidator(IEventRepository eventRepository)
        {
            _eventRepository = eventRepository;

            RuleFor(p => p.Name)
                .NotEmpty().WithMessage("{PropertyName} is required.")
                .NotNull()
                .MaximumLength(50).WithMessage("{PropertyName} must not exceed 50 characters.");

            RuleFor(p => p.Date)
                .NotEmpty().WithMessage("{PropertyName} is required.")
                .GreaterThan(DateTime.Now).WithMessage("{PropertyName} must be a future date.");

            RuleFor(e => e)
                .MustAsync(EventNameAndDateUnique)
                .WithMessage("An event with the same name and date already exists.");

            RuleFor(p => p.Price)
                .NotEmpty().WithMessage("{PropertyName} is required.")
                .GreaterThan(0).WithMessage("{PropertyName} must be greater than zero.");
        }

        private async Task<bool> EventNameAndDateUnique(CreateEventCommand e, CancellationToken token)
        {
            return !await _eventRepository.IsEventNameAndDateUnique(e.Name, e.Date);
        }
    }
}
```

---

### Step 4: Handling Validation in the Command Handler

Now that we’ve defined our validation rules, we can use the `CreateEventCommandValidator` in the command handler for creating events. The handler will validate the request before processing it, and if validation fails, it will return a response that includes the validation errors.

```csharp
using AutoMapper;
using GloboTicket.TicketManagement.Application.Contracts.Persistence;
using GloboTicket.TicketManagement.Domain.Entities;
using MediatR;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace GloboTicket.TicketManagement.Application.Features.Events.Commands.CreateEvent
{
    public class CreateEventCommandHandler : IRequestHandler<CreateEventCommand, CreateEventCommandResponse>
    {
        private readonly IEventRepository _eventRepository;
        private readonly IMapper _mapper;

        public CreateEventCommandHandler(IMapper mapper, IEventRepository eventRepository)
        {
            _mapper = mapper;
            _eventRepository = eventRepository;
        }

        public async Task<CreateEventCommandResponse> Handle(CreateEventCommand request, CancellationToken cancellationToken)
        {
            var theEvent = _mapper.Map<Event>(request);            
            var createEventCommandResponse = new CreateEventCommandResponse();
            var validator = new CreateEventCommandValidator(_eventRepository);
            var validationResult = await validator.ValidateAsync(request);

            if (validationResult.Errors.Count > 0)
            {
                createEventCommandResponse.Success = false;
                createEventCommandResponse.ValidationErrors = new List<string>();
                foreach (var error in validationResult.Errors)
                {
                    createEventCommandResponse.ValidationErrors.Add(error.ErrorMessage);
                }
            }

            if (createEventCommandResponse.Success)
            {
                theEvent = await _eventRepository.AddAsync(theEvent);
                createEventCommandResponse.EventDto = _mapper.Map<CreateEventDto>(theEvent);
            }

            return createEventCommandResponse;
        }
    }
}
```

---

### Step 5: Custom Response Objects

Instead of simply returning a success flag, we return a **custom response object**. This allows us to return detailed information to the consumer, such as the created event's details or a list of validation errors.

```csharp
using GloboTicket.TicketManagement.Application.Responses;

namespace GloboTicket.TicketManagement.Application.Features.Events.Commands.CreateEvent
{
    public class CreateEventCommandResponse : BaseResponse
    {
        public CreateEventCommandResponse() : base()
        {
        }

        public CreateEventDto EventDto { get; set; } = default!;
    }
}
```

---

### Conclusion

By incorporating **Fluent Validation** into your application, you can maintain clean and flexible validation logic that is decoupled from your domain entities. Using custom exceptions and response objects, you can also handle validation errors elegantly and provide clear, structured feedback to the consumer.

With this approach, your application becomes more maintainable, modular, and flexible, ensuring that as your business rules evolve, your validation logic remains easy to manage.

--- 

For the complete source code, you can visit the GitHub repository: https://github.com/mohamedtayel1980/clean-architecture

---
