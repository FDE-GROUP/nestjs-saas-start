# Part 14：Application Core 层的集中式服务注册（DI 收尾）

> 用途: 调研参考（非开发依据）· 逐篇忠实对译，主题串读见 [06](06-validation-and-di-composition.md)，横向判读见 [09](09-critique-and-repo-mapping.md)

## 原文信息

| 项 | 值 |
| --- | --- |
| 原标题 | What is Clean Architecture: Part 14-last step in Application Core Layer |
| 链接 | https://dev.to/moh_moh701/what-is-clean-architecture-part-14-last-step-in-application-core-layer-435o |
| 作者 | mohamed Tayel（`moh_moh701`） |
| 发布时间 | 2024-09-05T14:16:32Z（**当日第 4 篇**：P11 12:28 / P12 13:15 / P13 14:10 / P14 14:16，P13→P14 仅隔 6 分钟） |
| 系列 | Clean Architecture（collection 28557）第 14 篇 |
| 平台标注阅读时长 | 未标注（`reading_time: null`） |
| 反应数 / 评论数 | 1 / 0 |
| 标签 | `architecture` `softwareengineering` |
| AI 披露状态 | `not_disclosed` |
| dev.to 文章 id | 1988123 |
| 本篇原图 | 0 张 |

---

## 逐段对译（正文与代码**全量照录**）

### 开篇

> When building applications with clean architecture, it's essential to register the services that your application depends on in a clean and centralized manner. This is typically done in the **application core layer**. In this article, we will look at how to create a centralized service registration for core services such as **AutoMapper**, **MediatR**, and any other service needed, like Fluent Validation.

用干净架构构建应用时，把应用依赖的服务以**干净、集中**的方式注册至关重要；这通常发生在 **application core layer**。本文演示如何为 AutoMapper、MediatR、以及 FluentValidation 等核心服务建立集中式注册。

> 注记：术语警报——"**application core layer**"既不是 P1-P3 四层图里的任何一层名（Domain/App/Infra/Presentation），也不是 Clean Architecture 原图的 "Use Cases"；读者容易把它与 P6 解决方案里的 `...Application` 工程混为一谈。本篇实际做的是 **Application 工程提供一个 DI 扩展方法**，"core layer" 只是口头称谓。全系列层名漂移（P1 层名失真 → P9 "Contracts" → 本篇 "application core layer"）至此再添一例。

### The Purpose of Application Core Service Registration（集中注册的目的）

> A centralized service registration ensures that:
> - All necessary services are registered in one place.
> - The application layer is decoupled from the infrastructure or external concerns.
> - It's easier to add or remove services as the application evolves.

集中式服务注册保证：所需服务一处注册；**应用层与基础设施或外部关注点解耦**；应用演进时增删服务更容易。

> **判读**：第二条与本篇代码**直接冲突**——下面第一行 `AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies())` 扫描的是**进程内全部已加载程序集**（届时会包含 Infrastructure、甚至框架程序集），也就是说 Application 的组合代码在**运行时反射手扫基础设施**。"解耦"的论证恰恰被示范代码推翻（组合根本应住在最外的 composition root，见 P15/P16 的 `AddInfrastructureServices` 与本仓对照表）。

### Step 1: Creating the `ApplicationServiceRegistration` Class（原文逐字）

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

> In this class, we define a method `AddApplicationServices` that extends the `IServiceCollection` interface and registers the core services required by the application.
>
> - **AutoMapper**: This is a library that helps map objects from one type to another. By using `AddAutoMapper`, we automatically register all mapping profiles in the application domain.
> - **MediatR**: This library helps implement the **Mediator pattern** for handling requests (commands and queries) without tight coupling between components. The call to `AddMediatR` registers the handlers for the requests.

定义 `IServiceCollection` 扩展方法 `AddApplicationServices`，注册应用所需核心服务：`AddAutoMapper` 自动注册全部 mapping profile；`AddMediatR` 注册全部 request handler。

> **判读（`AppDomain.CurrentDomain.GetAssemblies()` 是本篇最值得警惕的一行）**：
> 1. **DI 配置时刻并不保证所有程序集已加载**——CLR 惰性加载程序集，只有其中类型被首次引用时才进进程。若某 handler/profile 所在程序集此刻未加载，它就**静默漏注册**，症状是运行期 `IRequestHandler<,>` 解析失败（"No service for type ..."），且**随启动路径变化而随机复现**。.NET 社区的通行纠正是按约定扫描显式引用的程序集（如 `cfg.RegisterServicesFromAssembly(typeof(ApplicationServiceRegistration).Assembly)`），以类型锚点代替全进程扫射。原稿连 `using Microsoft.Extensions.DependencyInjection`/`using System` 也未给出（全系列贴码通病依旧）。
> 2. `AddAutoMapper(...)` 的写法对应 AutoMapper **12.x 时代 API**（P10 已注记 12.0.0 的许可时效问题），13.x 起该扩展签名与扫描方式均已改变——照抄版本清单前须重新核事实。

### Step 2: Extending the Core with Fluent Validation（挂上校验器，原文逐字）

> If you're using **Fluent Validation** for your validation needs, you can extend the service registration to include validation by adding the following:

```csharp
services.AddValidatorsFromAssemblyContaining<CreateEventCommandValidator>();
```

> This registers all validators in the assembly, making them available throughout the application.

```csharp
public static IServiceCollection AddApplicationServices(this IServiceCollection services)
{
    services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());
    services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblies(AppDomain.CurrentDomain.GetAssemblies()));
    services.AddValidatorsFromAssemblyContaining<CreateEventCommandValidator>();
    
    return services;
}
```

> In this example, we've registered validators by referencing one of the validators (`CreateEventCommandValidator`). Fluent Validation will automatically pick up all validators in the same assembly.

以引用某个校验器为锚，注册同程序集内全部 validator。

> **判读（P13↔P14 的死注册）**：这一行把 validator 注册进了容器，**但 P13 的 handler 是手动 `new CreateEventCommandValidator(_eventRepository)`**——全系列没有任何地方从容器解析 validator，也没有 MediatR `ValidationBehavior` 管道消费它们。也就是说 **Step 2 注册的这批服务是死代码**：注册了、没人注入、永远用不到。两篇相隔仅 6 分钟发布（14:10→14:16），互不对拍的痕迹非常明显。这是"批量存稿 + 零运行验证"证据链上最整齐的一环——若作者真跑过带 `validator` DI 化的版本，P13 的手动 new 早该被替换掉。
> 另注：引用 `CreateEventCommandValidator` 需要 `using ...Features.Events.Commands.CreateEvent;`，原稿同样没写。

### Step 3: Using the Service Registration（在组合根调用，原文逐字）

> Once the `ApplicationServiceRegistration` class is set up, you need to call the `AddApplicationServices` method from the **Startup.cs** or **Program.cs** (depending on your .NET version) to register all these services at the application level. For example, in **ASP.NET Core**, this might look like:

```csharp
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddApplicationServices();  // Registers all services from the application core layer
    }
}
```

> This call ensures that all necessary services, like AutoMapper, MediatR, and Fluent Validation, are registered and available throughout the application.

在 Startup.cs 或 Program.cs（视 .NET 版本）调用 `AddApplicationServices()`，确保 AutoMapper / MediatR / FluentValidation 全部注册可用。

> **注记**：P5 已把 API 工程定为 **.NET 8 + Minimal Hosting**（只有 `Program.cs`），本篇却给了一段**Startup 类风格**的"示例"（`public class Startup`），且用"might look like"含糊带过——既没有真正展示本项目 `Program.cs` 里的实际调用点（那要到 P18 才出现），也没提 Minimal Hosting 下写法就一行 `builder.Services.AddApplicationServices();`。教程收尾与 P15/P18 的组合根之间存在**两个篇目的空窗**。

### Conclusion（原文逐字）

> By centralizing service registration in the **application core layer**, we adhere to the principles of **clean architecture** and ensure that the core logic of the application remains isolated from external concerns. This approach makes it easier to maintain and extend the application as the number of services grows.
>
> Using the `ApplicationServiceRegistration` class, you can register essential services like AutoMapper, MediatR, and Fluent Validation in one place, making your code cleaner and more maintainable.
>
> For the complete source code, you can visit the GitHub repository: https://github.com/mohamedtayel1980/clean-architecture

把服务注册集中在 application core layer 即"恪守干净架构原则"、保证核心逻辑与外部关注点隔离；用 `ApplicationServiceRegistration` 一处注册 AutoMapper/MediatR/FluentValidation，代码更干净易维护。完整源码见 GitHub。

> 注记：标题 "last step in Application Core Layer" 兑现属实（本篇后 P15 转入 Infrastructure），但结尾**无下篇预告**；"adhere to the principles of clean architecture"这句自我认证与正文的实况（Application 扫全程序集、死注册）相悖——**宣称的解耦 ≠ 代码里的耦合方向**，这正是 P2 "依赖规则"要抓的反例。

---

## 整理注记（本篇结构性小结）

| 维度 | 事实 |
| --- | --- |
| CA 得分点 | 扩展方法集中注册的形态正确（每层一个 `AddXxxServices`，P15 延续）；组合调用点留在最外层（Step 3 姿态正确） |
| CA 失分点 | Application 的组合代码扫**全部已加载程序集**（含基础设施），与声称的"解耦"相悖；"application core layer" 再造一个层名歧义词 |
| 工程风险 | `AppDomain.CurrentDomain.GetAssemblies()` 惰性加载漏注册（运行期随机解析失败）；Step 2 死注册（P13 手动 new，容器 validator 无人消费） |
| 系列一致性 | 与 P13 相隔 6 分钟仍互不对拍；Startup.cs 示例与 P5 的 Minimal Hosting 选型不符 |
| 社区检验 | 1 反应 / 0 评论 |

## 与本仓对照（本篇）

| 本篇做法 | 本仓实态 |
| --- | --- |
| `AppDomain.CurrentDomain.GetAssemblies()` 全进程扫射 | NestJS 显式 `imports: [...]` 模块图：依赖关系编译期可见、可静态审计（对照 AGENTS.md §2 反射魔法警惕条款） |
| 静态扩展方法 `AddApplicationServices` | `@Module` 即注册单元；组合根在 `app.module.ts`/`main.ts`，层级归属由模块目录物理表达 |
| validator 注册了但没人用（死注册） | zod schema 声明即被 `@Body({ schema })` 消费，不存在"注册而未用"的第二通路；CI 门禁（`verify-config-contract` 等）对拍配置与实存 |
| 组合代码住在 Application 工程内 | 应用层不含任何 DI 装配知识；Infrastructure/API 层各自导出 provider，装配只在 composition root |

## 评论区实录

**本篇评论数为 0**（API `comments_count: 0`，`/api/comments?a_id=1988123` 空数组）。

---

## 附：原文英文全稿（逐字保留）

> 来源：dev.to 官方 API `body_markdown` 字段（作者原始稿），抓取于 2026-10-21；除把图片链接改为本地 `./imges/` 副本（原始 URL 保留在链接 title 中）外，未作任何增删改。
>
> 呈现口径：以下英文全稿**不做代码块包裹、直接按 Markdown 渲染**（保留作者原始标题层级、粗体、列表、代码块与图片）；逐字性以上述 body_markdown 抓取为准，本区未增删改任何文字。

When building applications with clean architecture, it's essential to register the services that your application depends on in a clean and centralized manner. This is typically done in the **application core layer**. In this article, we will look at how to create a centralized service registration for core services such as **AutoMapper**, **MediatR**, and any other service needed, like Fluent Validation.

#### The Purpose of Application Core Service Registration

The **application core layer** is where we handle most of the business logic, and it is crucial that services such as mapping, request handling, and validation are made available to the rest of the application in a systematic way.

A centralized service registration ensures that:
- All necessary services are registered in one place.
- The application layer is decoupled from the infrastructure or external concerns.
- It's easier to add or remove services as the application evolves.

---

### Step 1: Creating the `ApplicationServiceRegistration` Class

The first step in setting up service registration is to create a static class that will contain the method to register services.

Here’s a simple example of the `ApplicationServiceRegistration` class:

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

In this class, we define a method `AddApplicationServices` that extends the `IServiceCollection` interface and registers the core services required by the application. Let's break this down:

- **AutoMapper**: This is a library that helps map objects from one type to another. By using `AddAutoMapper`, we automatically register all mapping profiles in the application domain.
  
  ```csharp
  services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());
  ```

- **MediatR**: This library helps implement the **Mediator pattern** for handling requests (commands and queries) without tight coupling between components. The call to `AddMediatR` registers the handlers for the requests.
  
  ```csharp
  services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblies(AppDomain.CurrentDomain.GetAssemblies()));
  ```

---

### Step 2: Extending the Core with Fluent Validation

If you're using **Fluent Validation** for your validation needs, you can extend the service registration to include validation by adding the following:

```csharp
services.AddValidatorsFromAssemblyContaining<CreateEventCommandValidator>();
```

This registers all validators in the assembly, making them available throughout the application.

Updated `ApplicationServiceRegistration`:

```csharp
public static IServiceCollection AddApplicationServices(this IServiceCollection services)
{
    services.AddAutoMapper(AppDomain.CurrentDomain.GetAssemblies());
    services.AddMediatR(cfg => cfg.RegisterServicesFromAssemblies(AppDomain.CurrentDomain.GetAssemblies()));
    services.AddValidatorsFromAssemblyContaining<CreateEventCommandValidator>();
    
    return services;
}
```

In this example, we’ve registered validators by referencing one of the validators (`CreateEventCommandValidator`). Fluent Validation will automatically pick up all validators in the same assembly.

---

### Step 3: Using the Service Registration

Once the `ApplicationServiceRegistration` class is set up, you need to call the `AddApplicationServices` method from the **Startup.cs** or **Program.cs** (depending on your .NET version) to register all these services at the application level.

For example, in **ASP.NET Core**, this might look like:

```csharp
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddApplicationServices();  // Registers all services from the application core layer
    }
}
```

This call ensures that all necessary services, like AutoMapper, MediatR, and Fluent Validation, are registered and available throughout the application.

---

### Conclusion

By centralizing service registration in the **application core layer**, we adhere to the principles of **clean architecture** and ensure that the core logic of the application remains isolated from external concerns. This approach makes it easier to maintain and extend the application as the number of services grows.

Using the `ApplicationServiceRegistration` class, you can register essential services like AutoMapper, MediatR, and Fluent Validation in one place, making your code cleaner and more maintainable.

For the complete source code, you can visit the GitHub repository: https://github.com/mohamedtayel1980/clean-architecture
---
