# Part 2：软件开发中的设计原则

> 用途: 调研参考（非开发依据）· 逐篇忠实对译，主题串读见 [01](01-foundations-and-principles.md)，横向判读见 [09](09-critique-and-repo-mapping.md)

## 原文信息

| 项 | 值 |
| --- | --- |
| 原标题 | Part 2 :Design Principles in Software Development（注意原标题把本篇写成 "Part 2"，但内容序号上它是 CA 系列的第 2 篇；系列标题错位见 [09 §1](09-critique-and-repo-mapping.md)） |
| 链接 | https://dev.to/moh_moh701/part-1-design-principles-in-software-development-4mgp（slug 仍写着 `part-1`，与标题 `Part 2` 不一致——原文的一处实存笔误） |
| 作者 | mohamed Tayel（`moh_moh701`） |
| 发布时间 | 2024-07-03T22:35:26Z |
| 系列 | Clean Architecture（collection 28557）第 2 篇 |
| 平台标注阅读时长 | 3 分钟 |
| 反应数 / 评论数 | 90 / 4（API 与 JSON-LD 均为 4 条，无隐藏） |
| 标签 | `architecture` `dotnet` |
| AI 披露状态 | `not_disclosed` |
| dev.to 文章 id | 1910872 |
| 本篇原图 | 0 张 |

---

## 逐段对译

### 开篇

> In software development, adhering to design principles is crucial for creating robust, maintainable, and scalable applications. Here, we'll explore five fundamental design principles: Dependency Inversion, Separation of Concerns, Single Responsibility, DRY (Don't Repeat Yourself), and Persistence Ignorance. Each principle helps to ensure that your codebase remains clean and efficient.

在软件开发中，遵守设计原则对构建健壮、可维护、可伸缩的应用至关重要。本篇将探讨五条基础设计原则：**依赖倒置（DIP）、关注点分离（SoC）、单一职责（SRP）、DRY（不要重复自己）、持久化无知（PI）**。每条原则都能帮助代码库保持干净与高效。

> 注记：作者说「五条基础设计原则」，但其中只有 DIP 与 SRP 属于 SOLID；SoC / DRY / PI 是另外的谱系。同时 P1 曾预告下一篇讲 microservices，本篇实际换成了设计原则——**预告与兑现第二次错位**。

### 1. Dependency Inversion Principle（DIP，依赖倒置原则）

> The Dependency Inversion Principle is the last of the SOLID principles. It states that high-level modules should not depend on low-level modules; both should depend on abstractions. Additionally, abstractions should not depend on details. Details should depend on abstractions.

DIP 是 SOLID 的最后一条。它主张：**高层模块不应依赖低层模块，两者都应依赖抽象；抽象不应依赖细节，细节应依赖抽象。**

原文示例（逐字照录，未做任何整理）：

```csharp
public interface IMessageService
{
    void SendMessage(string message);
}

public class EmailService : IMessageService
{
    public void SendMessage(string message)
    {
        // Send email
    }
}

public class Notification
{
    private readonly IMessageService _messageService;

    public Notification(IMessageService messageService)
    {
        _messageService = messageService;
    }

    public void Notify(string message)
    {
        _messageService.SendMessage(message);
    }
}
```

对译收尾说明：`Notification` 依赖抽象 `IMessageService`，而非 `EmailService` 这样的具体实现，因此可以随意替换消息服务而不必改动 `Notification`。

### 2. Separation of Concerns（SoC，关注点分离）

> Separation of Concerns involves organizing code into distinct sections, each responsible for a specific functionality. This principle helps to reduce code complexity and improve maintainability. In a typical web application, you might separate concerns into layers such as: Presentation Layer / Business Logic Layer / Data Access Layer

SoC 指把代码组织成互不相同的区块，每块负责一项具体功能，用以降低复杂度、提升可维护性。典型 Web 应用可按 **表现层（处理 UI 与用户交互）/ 业务逻辑层（核心应用逻辑）/ 数据访问层（数据的取出与存储）** 分层。

原文示例（注意：这是**三段式经典分层**示例，与 CA 的依赖方向并不等价，作者在此把 SoC 直接讲成了三层架构）：

```csharp
// Presentation Layer
public class UserController
{
    private readonly IUserService _userService;

    public UserController(IUserService userService)
    {
        _userService = userService;
    }

    public IActionResult GetUser(int id)
    {
        var user = _userService.GetUserById(id);
        return Ok(user);
    }
}

// Business Logic Layer
public interface IUserService
{
    User GetUserById(int id);
}

public class UserService : IUserService
{
    private readonly IUserRepository _userRepository;

    public UserService(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    public User GetUserById(int id)
    {
        return _userRepository.GetById(id);
    }
}

// Data Access Layer
public interface IUserRepository
{
    User GetById(int id);
}

public class UserRepository : IUserRepository
{
    public User GetById(int id)
    {
        // Retrieve user from database
    }
}
```

对译收尾：每层各有具体职责，代码库因此更易管理与扩展。

> 注记：这段代码**同时示范了 SoC 与 DIP**（`UserService` 依赖 `IUserRepository` 抽象），但作者只用它讲"分层"。另外 `UserRepository.GetById` 的方法体只有注释、没有 `return`，在 C# 里编译不过——原文示例代码存在不可编译的片段，引用时须知。

### 3. Single Responsibility Principle（SRP，单一职责原则）

> The Single Responsibility Principle asserts that a class should have only one reason to change, meaning it should have only one job or responsibility.

SRP 主张一个类**只有一个变化的理由**，即只有一个职责。

```csharp
public class User
{
    public string Name { get; set; }
    public string Email { get; set; }
}

public class UserRepository
{
    public void Save(User user)
    {
        // Save user to database
    }
}

public class UserValidator
{
    public bool Validate(User user)
    {
        // Validate user data
    }
}
```

对译收尾：`User`、`UserRepository`、`UserValidator` 各承担单一职责，符合 SRP。

> 注记：请注意这里的 `User` 是**只有两个字段的纯数据袋**。作者在本节把"实体只有数据"当成 SRP 的正面示例，与 P1「实体是富领域对象、封装业务规则」相矛盾，也与他在 P1 评论区主张的 `private set + SetQuantity()` 相矛盾。这是全系列贫血立场的第一处实锤。

### 4. DRY (Don't Repeat Yourself)

> The DRY principle emphasizes reducing the repetition of code by abstracting out common functionality into reusable components.

DRY 强调通过把公共功能抽成可复用组件来减少重复代码。

```csharp
public class EmailService
{
    public void SendEmail(string to, string subject, string body)
    {
        // Send email
    }
}

public class NotificationService
{
    private readonly EmailService _emailService;

    public NotificationService(EmailService emailService)
    {
        _emailService = emailService;
    }

    public void NotifyUser(string email, string message)
    {
        _emailService.SendEmail(email, "Notification", message);
    }
}
```

对译收尾：`NotificationService` 复用 `EmailService`，避免了重复实现发信逻辑。

> 注记：本例的构造函数签名是 `NotificationService(EmailService emailService)`——**依赖具体类而非抽象**，恰好违反第 1 节的 DIP；且全程未提 DI 容器（要等 P14 才注册）。作者用 DIP 反例来讲 DRY。

### 5. Persistence Ignorance（持久化无知）

> Persistence Ignorance means that the business logic of an application should not be aware of how data is persisted. This principle ensures that the core logic remains independent of the data access technology used.

PI 指业务逻辑不应知晓数据如何被持久化，从而确保核心逻辑与所选数据访问技术无关。

```csharp
public class Product
{
    public string Name { get; set; }
    public decimal Price { get; set; }
}

public interface IProductRepository
{
    void Save(Product product);
}

public class ProductService
{
    private readonly IProductRepository _productRepository;

    public ProductService(IProductRepository productRepository)
    {
        _productRepository = productRepository;
    }

    public void AddProduct(Product product)
    {
        _productRepository.Save(product);
    }
}
```

对译收尾：`ProductService` 不知道也不关心 `ProductRepository` 如何落数据，符合持久化无知。

> 注记：这段是五条原则里最接近 CA 精神的一处（领域类零 ORM 特性 + 仓储抽象居内层），本仓 `libs/core` 的 domain 层与之同构。但作者在此没有点出 PI 与 SoC/DIP 的关系（PI 本质是 DIP 在持久化维度的推论），也没有提到"ORM 映射外置"这一实现手段——要等 P16 才用 `IEntityTypeBuilder` 配置类补上。

### Conclusion（结语）

> Understanding and applying these design principles can significantly enhance the quality of your software. By following Dependency Inversion, Separation of Concerns, Single Responsibility, DRY, and Persistence Ignorance, you can create applications that are easier to understand, maintain, and extend.

理解并应用这些设计原则能显著提升软件质量；遵循 DIP、SoC、SRP、DRY、PI，可构建更易理解、维护与扩展的应用。

> 注记：本篇是**纯原则科普，与 Clean Architecture 无直接绑定**（通篇没有出现同心圆、Dependency Rule、用例等 CA 术语）。放在系列第 2 篇的位置，起的是"术语铺垫"作用；这也是后来读者质疑"前 3 篇与后 16 篇像两个系列"的根源。

---

## 整理注记（本篇结构性小结）

| 维度 | 事实 |
| --- | --- |
| 内容定位 | 纯原则科普（DIP/SoC/SRP/DRY/PI 各配一段静态类型示例），无 CA 术语、无工程落地——与后 16 篇几乎无依赖关系，单独阅读即可 |
| 示例自洽性 | 三处硬伤：DIP 节示例完整但 `UserRepository.GetById` 无 return 编译不过（SoC 节）；DRY 节 `NotificationService(EmailService)` 依赖具体类，恰是第 1 节 DIP 的反例；SRP 节把"实体只有数据"当正面示例 |
| 贫血立场实锤 | SRP 节只有两个字段的纯数据袋 `User` 与 P1「rich domain objects」、与作者在 P1 评论区主张的 `private set + SetQuantity()` 三方互斥——全系列实体立场分裂的起点 |
| 谱系混装 | "五条基础设计原则"里只有 DIP/SRP 属 SOLID；SoC/DRY/PI 另属谱系；且 PI 本质是 DIP 在持久化维度的推论，作者未点破 |
| 预告-兑现 | P1 预告下一篇讲 microservices，实际发了设计原则——系列早期规划 loose 的第一例 |
| 社区检验 | 90 反应 / 4 评论全为鼓励类（含 Lin Pengcheng 补充的"另 10 条原则"链接）——本篇无争议内容，也无信息量 |

## 与本仓对照（本篇）

| 本篇做法 | 本仓实态 |
| --- | --- |
| DIP：接口 + 手写构造注入（无容器，直到 P14 才注册） | NestJS DI 容器 + 令牌解析；接口居 `application/`（port）、实现居 `infrastructure/`（adapter），如会话/支付端口的三段式倒置 |
| SRP：`UserService` 按方法分职责 | 用例即类：CQRS handler 一对一切片；Controller 只负责 HTTP 收发（对照 P19 薄控制器） |
| PI：领域类零 ORM 特性 + 仓储抽象 | MikroORM 映射元数据外置（`libs/mikro-adapter` 侧配置），`libs/core` 域实体零 ORM 依赖（对照 [09 §3](09-critique-and-repo-mapping.md) 仓储模式取舍） |
| DRY：抽象基类消重（注：其示例本身违反 DIP） | shared-kernel 只放真正跨上下文不变量；本仓对过度 DRY 持警惕（拷贝优于错误抽象） |
| 全篇未提横切关注点落地手段 | 日志（Pino LoggerService）/异常（HttpExceptionFilter）/响应转换（Interceptor）均有管道化落位——恰是 P15 评论区被追问的空白 |

---

## 评论区实录（4 条，无隐藏、无作者回复）

| 评论者 | 时间 | 原话（逐字） | 👍 |
| --- | --- | --- | --- |
| Syed Muhammad Ali Raza | 2024-07-04 | 「very well explained」 | 2 |
| arifrafik | 2024-07-04 | 「Excellent. Thanks」 | 2 |
| Lin Pengcheng | 2024-07-06 | 「[Another 10 Principles](https://github.com/linpengcheng/PurefunctionPipelineDataflow#Principles-of-the-model)」——推荐另一份"十条原则"资料 | 2 |
| Alex Pliutau | 2024-07-09 | 「Great write-up! Also wrote some thoughts about it but in context of Go. Although Golang is not a purely object-oriented language, we can still apply SOLID principles to improve our Go code - packagemain.tech/p/mastering-solid...」 | 2 |

> 取证口径：dev.to comments API（`?a_id=1910872`）4 条 + 文章页 JSON-LD 4 条，完全一致；`comments_count: 4` 吻合。本篇评论区无人质疑正文——因为全是鼓励类短评论，与 P1 被质疑 5 次的待遇差别明显。

---

## 附：原文英文全稿（逐字保留）

> 来源：dev.to 官方 API `body_markdown` 字段（作者原始稿），抓取于 2026-10-21；除把图片链接改为本地 `./imges/` 副本（原始 URL 保留在链接 title 中）外，未作任何增删改。
>
> 呈现口径：以下英文全稿**不做代码块包裹、直接按 Markdown 渲染**（保留作者原始标题层级、粗体、列表、代码块与图片）；逐字性以上述 body_markdown 抓取为准，本区未增删改任何文字。

In software development, adhering to design principles is crucial for creating robust, maintainable, and scalable applications. Here, we'll explore five fundamental design principles: Dependency Inversion, Separation of Concerns, Single Responsibility, DRY (Don't Repeat Yourself), and Persistence Ignorance. Each principle helps to ensure that your codebase remains clean and efficient.

#### 1. Dependency Inversion Principle (DIP)
The Dependency Inversion Principle is the last of the SOLID principles. It states that high-level modules should not depend on low-level modules; both should depend on abstractions. Additionally, abstractions should not depend on details. Details should depend on abstractions.

**Example:**
```csharp
public interface IMessageService
{
    void SendMessage(string message);
}

public class EmailService : IMessageService
{
    public void SendMessage(string message)
    {
        // Send email
    }
}

public class Notification
{
    private readonly IMessageService _messageService;

    public Notification(IMessageService messageService)
    {
        _messageService = messageService;
    }

    public void Notify(string message)
    {
        _messageService.SendMessage(message);
    }
}
```
In this example, the `Notification` class depends on the abstraction `IMessageService` rather than a concrete implementation like `EmailService`. This allows for easy swapping of different message services without modifying the `Notification` class.

#### 2. Separation of Concerns (SoC)
Separation of Concerns involves organizing code into distinct sections, each responsible for a specific functionality. This principle helps to reduce code complexity and improve maintainability.

**Example:**
In a typical web application, you might separate concerns into layers such as:
- Presentation Layer: Handles the UI and user interaction.
- Business Logic Layer: Contains the core application logic.
- Data Access Layer: Manages data retrieval and storage.

```csharp
// Presentation Layer
public class UserController
{
    private readonly IUserService _userService;

    public UserController(IUserService userService)
    {
        _userService = userService;
    }

    public IActionResult GetUser(int id)
    {
        var user = _userService.GetUserById(id);
        return Ok(user);
    }
}

// Business Logic Layer
public interface IUserService
{
    User GetUserById(int id);
}

public class UserService : IUserService
{
    private readonly IUserRepository _userRepository;

    public UserService(IUserRepository userRepository)
    {
        _userRepository = userRepository;
    }

    public User GetUserById(int id)
    {
        return _userRepository.GetById(id);
    }
}

// Data Access Layer
public interface IUserRepository
{
    User GetById(int id);
}

public class UserRepository : IUserRepository
{
    public User GetById(int id)
    {
        // Retrieve user from database
    }
}
```
Each layer has a specific responsibility, making the codebase easier to manage and extend.

#### 3. Single Responsibility Principle (SRP)
The Single Responsibility Principle asserts that a class should have only one reason to change, meaning it should have only one job or responsibility.

**Example:**
```csharp
public class User
{
    public string Name { get; set; }
    public string Email { get; set; }
}

public class UserRepository
{
    public void Save(User user)
    {
        // Save user to database
    }
}

public class UserValidator
{
    public bool Validate(User user)
    {
        // Validate user data
    }
}
```
Here, `User`, `UserRepository`, and `UserValidator` each have a single responsibility, adhering to the SRP.

#### 4. DRY (Don't Repeat Yourself)
The DRY principle emphasizes reducing the repetition of code by abstracting out common functionality into reusable components.

**Example:**
```csharp
public class EmailService
{
    public void SendEmail(string to, string subject, string body)
    {
        // Send email
    }
}

public class NotificationService
{
    private readonly EmailService _emailService;

    public NotificationService(EmailService emailService)
    {
        _emailService = emailService;
    }

    public void NotifyUser(string email, string message)
    {
        _emailService.SendEmail(email, "Notification", message);
    }
}
```
By using the `EmailService` in `NotificationService`, we avoid duplicating email sending logic.

#### 5. Persistence Ignorance
Persistence Ignorance means that the business logic of an application should not be aware of how data is persisted. This principle ensures that the core logic remains independent of the data access technology used.

**Example:**
```csharp
public class Product
{
    public string Name { get; set; }
    public decimal Price { get; set; }
}

public interface IProductRepository
{
    void Save(Product product);
}

public class ProductService
{
    private readonly IProductRepository _productRepository;

    public ProductService(IProductRepository productRepository)
    {
        _productRepository = productRepository;
    }

    public void AddProduct(Product product)
    {
        _productRepository.Save(product);
    }
}
```
The `ProductService` class does not know or care about how the `ProductRepository` class persists data, adhering to the principle of persistence ignorance.

### Conclusion
Understanding and applying these design principles can significantly enhance the quality of your software. By following Dependency Inversion, Separation of Concerns, Single Responsibility, DRY, and Persistence Ignorance, you can create applications that are easier to understand, maintain, and extend.
