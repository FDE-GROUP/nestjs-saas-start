# 06 · 校验与组合根：FluentValidation 与集中式服务注册

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 覆盖原文: Part 13（2024-09-05）· Part 14（2024-09-05）

| 篇 | 原标题 | 链接 |
|---|---|---|
| P13 | What is Clean Architecture: Part 13 - Adding Validation Using Fluent Validation | https://dev.to/moh_moh701/what-is-clean-architecture-part-13-adding-validation-using-fluent-validation-11dl |
| P14 | What is Clean Architecture: Part 14 - last step in Application Core Layer | https://dev.to/moh_moh701/what-is-clean-architecture-part-14-last-step-in-application-core-layer-435o |

---

## 1. P13 · 为什么不用 Data Annotations（本篇的论证核心）

作者的开场是常识："创建/更新/删除实体前确保数据合法，对维持应用完整性至关重要"。真正的论点在**为什么把校验放在应用层而不是实体上**：

> **Data Annotations 的两个问题**：
> 1. 它把校验逻辑**与领域耦合**，**违反持久化无知（PI）原则**（实体上挂 `[Required]`/`[MaxLength]` 等特性 = 领域模型携带与技术机制绑定的元数据）；
> 2. 它**处理不了复杂校验**——例如跨字段校验，或**查数据库做唯一性检查**。
>
> 用 FluentValidation 则把校验逻辑与领域实体分离，系统更可维护、更灵活、更易扩展。

> **整理注记（这是全系列论证最漂亮的一段，但有一处概念滑移）**：
> - 第 2 条理由（跨字段/查库唯一性）**成立且无可辩**——Data Annotations 确实做不到。
> - 第 1 条理由（挂特性 = 违 PI）**是滑移**：`[MaxLength]` 是**表示层/持久层的元数据**，把它说成"业务规则进实体所以破坏 PI"逻辑方向反了——正解是"**校验不是领域不变式的家**，领域不变式应在实体/聚合内守护；把校验写在 FluentValidation 里，实体的不变式就只剩约定、无人强制"。作者用"避开一个坏选择（注解进实体）"论证了"另一个坏选择（规则全外置、实体裸奔）"的正当性，中间的第三条路（Rich Domain + 实体构造/行为守护不变式）没有被讨论。
> - 结果就是本系列的规则分布：**同一规则被拆到三处**——P4 需求对话（说出规则）、P13 校验器（Name 必填 ≤50、Date 未来、Price > 0、Name+Date 唯一）、P16 数据库配置（`HasMaxLength(50)`）+ P16 仓储方法（`IsEventNameAndDateUnique`）。**三处需人肉保持同步，无任何机制保证**。这是本仓"契约单源（zod 居 `@saas/contracts`）+ 列元数据单一源（`four-tables.ts` 工厂）"要解决的正是同一类漂移（见 [global-entity-column-law](../../plans/global-entity-column-law.md)）。

## 2. P13 · 落地四步

### 2.1 依赖包

```xml
<PackageReference Include="FluentValidation" Version="11.9.0" />
<PackageReference Include="FluentValidation.DependencyInjectionExtensions" Version="11.9.0" />
```

（后者用于把校验器注册进 DI 容器。）

### 2.2 统一响应基类 `BaseResponse`

目的：**标准化命令处理器的返回形状**，让 API 消费方无论做哪种操作都拿到一致的结构。

```csharp
public class BaseResponse
{
    public BaseResponse() { Success = true; }
    public BaseResponse(string message) { Success = true; Message = message; }
    public BaseResponse(string message, bool success) { Success = success; Message = message; }

    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public List<string>? ValidationErrors { get; set; }
}
```

默认构造即 `Success = true`（**成功是缺省态，失败要显式赋值**——与 fail-fast 直觉相反，见 §4 注记）。

### 2.3 命令校验器（含查库唯一性）

```csharp
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
        => !await _eventRepository.IsEventNameAndDateUnique(e.Name, e.Date);
}
```

四条规则对应 P4 需求里的约束原文（名称必填 ≤50、日期必填且为未来、名称+日期组合唯一、价格 > 0）——**这是 P4 的不变式唯一真正的落地点**。

### 2.4 处理器里执行校验 + 自定义响应对象

```csharp
public class CreateEventCommandResponse : BaseResponse
{
    public CreateEventCommandResponse() : base() { }
    public CreateEventDto EventDto { get; set; } = default!;
}

public class CreateEventCommandHandler : IRequestHandler<CreateEventCommand, CreateEventCommandResponse>
{
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
                createEventCommandResponse.ValidationErrors.Add(error.ErrorMessage);
        }

        if (createEventCommandResponse.Success)
        {
            theEvent = await _eventRepository.AddAsync(theEvent);
            createEventCommandResponse.EventDto = _mapper.Map<CreateEventDto>(theEvent);
        }
        return createEventCommandResponse;
    }
}
```

作者的理由：与其只返回一个成功标志，**返回自定义响应对象**可以把详细信息（新实体详情、或校验错误列表）交付消费方。

### 2.5 判读：本篇写法四处代价（原文未提）

1. **手动 `new Validator(...)`，绕过了 DI**：P13 一边安装 `DependencyInjectionExtensions`、P14 一边写 `AddValidatorsFromAssemblyContaining<...>`，但 P13 的 handler 里却是 `new CreateEventCommandValidator(_eventRepository)` ——**校验器没被注入，DI 注册形同虚设**；更规范的做法是注入 `IValidator<CreateEventCommand>`，或用 MediatR 的 `ValidationBehavior` 管道行为让校验与业务代码彻底分离（作者直到 P19 结语才提"未来讲 pipeline behaviors"）。
2. **`Success` 布尔 + `ValidationErrors` 列表 = 把异常语义降级成返回值**：调用方**必须**记得检查 `Success`，否则拿着 `EventDto = default!` 继续跑。这与 P12 的"抛 `NotFoundException`"风格互相矛盾（同一项目里两种错误通路：校验走返回值、找不到走异常）。
3. **校验错误压成 `List<string>`**：丢失字段名/错误码结构，前端无法定点标红（本仓走 zod → 结构化错误 + 错误响应契约，见本仓错误过滤体系与 [global-readiness-error-pagination](../../plans/global-readiness-error-pagination.md)）。
4. **唯一性校验有竞态**：`IsEventNameAndDateUnique` 查库后插入，两个并发请求可同时通过校验（无唯一索引兜底；P16 的配置类里也没建组合唯一索引）。

## 3. P14 · Application 核心的最后一步：集中式服务注册

论点：CA 要求"应用依赖的服务以**干净、集中**的方式注册"，这件事应在应用核心层完成。集中注册保证：所需服务一处登记 / 应用层与基础设施及外部关切保持解耦 / 服务增减随演化更容易。

### 3.1 `ApplicationServiceRegistration`

```csharp
namespace GloboTicket.TicketManagement.Application
{
    public static class ApplicationServiceRegistration
    {
        public static IServiceCollection AddApplicationServices(this IServiceCollection services)
        {
            services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());
            services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblies(AppDomain.CurrentDomain.GetAssemblies()));
            return services;
        }
    }
}
```

- `AddAutoMapper(...)`：按程序集自动登记所有 MappingProfile；
- `AddMediatR(cfg => cfg.RegisterServicesFromAssemblies(...))`：按程序集登记请求处理器（MediatR 12 的新 API 形态）。

### 3.2 扩到 FluentValidation

```csharp
public static IServiceCollection AddApplicationServices(this IServiceCollection services)
{
    services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());
    services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblies(AppDomain.CurrentDomain.GetAssemblies()));
    services.AddValidatorsFromAssemblyContaining<CreateEventCommandValidator>();
    return services;
}
```

（借一个校验器类型定位程序集，FluentValidation 自动收拢同程序集全部校验器。）

### 3.3 调用点

```csharp
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddApplicationServices();   // 登记应用核心层的全部服务
    }
}
```

作者结语：把服务注册集中在应用核心层，"我们遵守了 CA 原则，确保应用核心逻辑与外部关切保持隔离"，服务增多时代码更干净易维护。

> **整理注记（两处值得推敲）**：
> 1. **"应用核心层做 DI 注册"这个说法本身有争议**：集中登记"本层的实现类"是常规做法，但把 `IServiceCollection` 的扩展方法放进 Application 项目 = **Application 项目引用了 `Microsoft.Extensions.DependencyInjection.Abstractions`**，内层由此染上容器知识，与 P1"独立于框架"存在张力。更严格的形态是：应用层零 DI 知识，由最外层（API/组合根）完成装配。原文选择方便的一边，但未承认这是取舍。
> 2. **`AppDomain.CurrentDomain.GetAssemblies()` 是脆弱写法**：它只拿到**已被加载的程序集**，惰性加载场景下会漏扫（AutoMapper/MediatR 静默少注册，属"配置静默失效"类风险）。官方推荐按显式类型/显式程序集登记（如 `typeof(AssemblyMarker)`），P13 的 `AddValidatorsFromAssemblyContaining<T>` 恰好就是更稳的形态——同篇内前后不一致。
> 3. 另外注意作者用 `Startup.cs` 举例，而 P5/P18 用的是 .NET 8 的最小托管（`Program.cs` + 扩展方法）——P14 属"旧形态示例混用"。

## 4. 与本仓对照

| 原文（P13/P14） | 本仓实态 | 判断 |
|---|---|---|
| FluentValidation 类式校验器 + 手动 new | **zod 单源**（AGENTS.md 铁律：请求/响应/env 一律 zod，禁 class-validator/Joi/自研 pipe），Controller 走官方 standard-schema 路径 `@Body({ schema })`，且 **zod schema 必须值导入**否则装饰器拿不到 schema、校验静默跳过 | 本仓把"校验"从代码类变成数据 schema，因此可跨端复用（`libs/contracts`）；原文的"错误压成字符串列表"在本仓由结构化错误响应规避 |
| `BaseResponse{Success,Message,ValidationErrors}` 返回值式错误 | 本仓抛异常 + 全局 `HttpExceptionFilter` 统一转结构化错误响应（含 requestId/errorCode 面），另有 `Page<T>` 等响应契约单源 | 两条相反路线；本仓避免"调用方忘记检查 Success"这一整类缺陷 |
| 校验规则与 DB 约束、实体三处手工同步 | 契约单源 + 列元数据单一源工厂（`database/mikro/four-tables.ts`）+ DDL 恒等对拍闸（24/24 PASS 实录） | 本仓以机制消漂移；原文纯靠人纪律，是其最脆弱处 |
| 集中式 `AddApplicationServices` 扩展方法 | NestJS 模块即装配单元（`@Module` + providers/exports + `useClass` 改指做双轨切换），且 DI 受 ESM/装饰器元数据约束（构造函数注入的类**必须值导入 + 显式 `@Inject`**） | 同目标不同机制；本仓的"注册在框架内"由 Nest 容器承担，无需把容器 API 引进入内层 |
| 按程序集扫描注册 | 本仓显式登记（gated e2e 也要登记进 `scripts/ci-fullstack.ts` 的 `GATED_E2E_FILES`，漏登即 fail-loud） | 本仓刻意不靠扫描：扫描会静默漏项，显式清单可被门禁校验 |

## 5. 本篇可带走的事实

- **"校验放哪"是 CA 落地的必答题**，原文给了一个可辩护但不完整的答案（外置到应用层校验器）；完整答案需要同时说清"实体不变式由谁守"与"规则如何单源"，这两点原文缺位。
- **统一响应形状 + 集中服务注册**是两条能直接搬的实践；搬的时候要修掉 §2.5 与 §3 注记里的 6 处问题（DI 绕过、错误通路二元化、错误无结构、唯一性竞态、内层引容器、程序集扫描脆弱）。
- 本仓的 zod 单源 + 结构化错误 + 显式装配恰好逐条补上了原文的缺口，可反过来说明：**这些不是"我们的偏好"，而是这条路子的已知坑位**。
