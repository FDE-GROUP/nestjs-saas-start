# 01 · 地基：Clean Architecture 是什么、凭什么、比谁好

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 覆盖原文: Part 1（2024-07-03）· Part 2（2024-07-03）· Part 3（2024-07-05）

| 篇 | 原标题 | 链接 |
|---|---|---|
| P1 | Part 1: What is Clean Architecture? | https://dev.to/moh_moh701/part-1-what-is-clean-architecture-4bn1 |
| P2 | Part 2: Design Principles in Software Development（原文 URL/标题误标 "Part 1"） | https://dev.to/moh_moh701/part-1-design-principles-in-software-development-4mgp |
| P3 | Part 3: Comparing All-in-One Architecture, Layered Architecture, and Clean Architecture | https://dev.to/moh_moh701/comparing-all-in-one-architecture-layered-architecture-and-clean-architecture-e28 |

---

## 1. P1 · 定义与四条层次

**出处致谢**：作者明示本系列思想来自 Pluralsight 作者 Gill Cleeren 的 ASP.NET Core Clean Architecture 课程；理论本体是 Robert C. Martin（Uncle Bob）提出的"易于理解、灵活、可维护"的软件设计哲学，强调**关注点分离**，让业务逻辑与框架、数据库、UI 等依赖解耦。

**定义（原文口径）**：Clean Architecture 是把代码组织成**一组同心圆**的分层架构，圆环由内到外为 Entities → Application Core（Use Cases）→ Interface Adapters → Frameworks & Drivers。核心思想：**内层独立于外层**，因而系统更模块化、更易测试。

**原文列出的五条原则**：

1. **Separation of Concerns**：每层职责唯一，用于控复杂度、提可读性。
2. **Dependency Rule**：源码依赖只能**指向内侧**；内圈的任何东西不得知道外圈的任何东西。
3. **Independent of Frameworks**：架构不依赖外部框架，框架变了核心仍稳定。
4. **Testability**：业务规则可脱离 UI/数据库等外部依赖独立测试。
5. **Flexibility & Maintainability**：系统演化不需要动整体结构。

**原文列出的五条收益**：可测性提升（业务逻辑与外部依赖解耦→单测易写、覆盖率高）、灵活性（换数据库/换 Web 框架冲击面小）、可维护性（分层清晰）、可复用性（业务逻辑跨项目复用）、可扩展性（既利于承载增长也利于加新功能）。

**原文的四层划分（注意：这是作者自己的表述，与 Uncle Bob 原图有出入）**：

| 作者的层名 | 作者职责描述 | 与原著的对应 |
|---|---|---|
| Entities | 核心业务对象，封装最通用、最高层的规则，"通常是含业务规则与逻辑的富领域对象" | Enterprise Business Rules |
| Application Core | 应用专属业务规则，定义应用要干的"活儿"，封装实现系统全部用例 | Application Business Rules / Use Cases |
| infrastructure | 把"对用例和实体最方便的格式"转换成"对外部机构最方便的格式"（数据库、Web、UI、外部服务） | Interface Adapters + 部分 Frameworks |
| User interface | UI、数据库、Web 框架及一切外部工具/投递机制，最外层、代码量最少 | Frameworks & Drivers（但作者把它命名成了 UI） |

> **整理注记（存疑点先亮，详见 [09 §批判点](./09-critique-and-repo-mapping.md)）**：作者把第三、四层重新命名为 "infrastructure / User interface"，与原著四层（Entities / Use Cases / Interface Adapters / Frameworks & Drivers）并非一一对应——原著的 Interface Adapters 是"控制器 / Presenter / 仓储实现 / 外部服务网关"这一圈**适配器**，而作者的 "infrastructure" 描述混入了原著最外层的职责；"User interface" 又把最外层（框架与驱动）窄化成了 UI。评论区读者 Top Developers 直接指出："the user interface layer is just part of the framework & drivers layer"（UI 只是 frameworks & drivers 层的一部分，该层还应含 DB/设备/Web/外部接口）。这属于二手解读的失真，做架构判断时应回 Uncle Bob 原文口径。

## 2. P2 · 五条设计原则（Clean Architecture 的地基）

作者认为 CA 立在其上的是五条原则（**注意：他这里列的不是 SOLID 五条，而是精挑的 SOLID 子集 + 两条额外原则**）。

### 2.1 Dependency Inversion Principle（DIP）

SOLID 的最后一条：**高层模块不该依赖低层模块，两者都应依赖抽象；抽象不该依赖细节，细节应依赖抽象。**

原文示例（C# 原貌）：`IMessageService`（抽象）← `EmailService`（细节实现）；`Notification` 构造注入 `IMessageService`，`Notify()` 只调抽象——换消息通道不动 `Notification`。

```csharp
public interface IMessageService { void SendMessage(string message); }

public class EmailService : IMessageService { /* 发邮件 */ }

public class Notification
{
    private readonly IMessageService _messageService;
    public Notification(IMessageService messageService) => _messageService = messageService;
    public void Notify(string message) => _messageService.SendMessage(message);
}
```

### 2.2 Separation of Concerns（SoC）

把代码切成各司其职的段落以降复杂度、提可维护性。原文用典型 Web 应用三层举例：Presentation（`UserController`）/ Business Logic（`IUserService`+`UserService`）/ Data Access（`IUserRepository`+`UserRepository`），每层只通过抽象触达下一层。

### 2.3 Single Responsibility Principle（SRP）

**一个类只有一个变更理由**（一份职责）。原文示例把 `User`（数据）、`UserRepository`（存取）、`UserValidator`（校验）拆成三个类，而不是塞进一个。

### 2.4 DRY（Don't Repeat Yourself）

把公共能力抽成可复用组件避免重复。原文示例：`NotificationService` 不自己写发信逻辑，而是组合 `EmailService.SendEmail`。

### 2.5 Persistence Ignorance（PI）

**业务逻辑不知道数据怎么被持久化**，核心逻辑与数据访问技术彼此独立。原文示例：`Product` 是裸 POCO（无基类、无特性），`ProductService` 只依赖 `IProductRepository.Save(Product)`——仓储如何落库它既不知也不关心。

> **整理注记**：这五条里，DIP + PI 是 CA "依赖指向内侧"与"框架无关"两条的直接来源；SoC/SRP 是分层合理性的来源；DRY 与 CA 关系最弱（重复消除本身不产生依赖方向约束）。作者把它们并列陈列是对的，但**未提 SOLID 的 OCP/LSP/ISP**，也未提分层与依赖倒置的因果次序，读者容易误以为 CA = 建三层目录。

## 3. P3 · 三种架构形态对比（All-in-One / Layered / Clean）

作者给的是"选型视角"的对照，结论是"各有其位，按需求与约束选"。

### 3.1 All-in-One（单工程一把梭）

- 形态：通常一个（巨大的）Visual Studio 工程；"层"只是工程内的文件夹；从 File → New Project 起步。
- 优点：部署简单；起步开发快（一切在一处）；无服务间通信开销，性能更易优化。
- 缺点：应用变大后难维护；扩展受限（要扩一部分只能整体扩）；单个 bug 可能拖垮整个应用。
- 适用：小而直白的应用 / 早期初创（快速开发权重高于长期可维护性）。

### 3.2 Layered（传统分层）

- 形态：按关注点切分——表现层、业务逻辑层、数据访问层（可再多）；每层职责固定，**只与相邻层交互**。
- 优点：层可跨应用复用；关注点分离清晰故易维护；可插拔（层能独立替换升级）。
- 缺点：**层间仍存耦合**并产生依赖；整体仍是一个应用，一层出问题会波及全局；层间通信有性能开销。
- 适用：中到大型、分离关注点对可维护性/可扩展性至关重要的应用。

### 3.3 Clean Architecture

- 形态：设计哲学，强调关注点分离与"框架/数据库/其他外部机构"的独立；把业务逻辑从基础设施与 UI 中分离出来组织代码。
- 优点：分离清晰 → 高可维护 + 高可测；独立于框架技术 → 组件易替换；利于扩展与应对需求变化。
- 缺点：初期实现比简单架构更复杂；要求更深的设计原则与模式理解；小应用上这种严谨会带来多余开销。
- 适用：长期可维护性、可测性、灵活性至关重要的大型复杂应用。

### 3.4 原文对比表

| 维度 | All-in-One | Layered | Clean |
|---|---|---|---|
| 部署 | 简单 | 分层 | 模块化 |
| 可扩展性 | 受限 | 中等 | 高 |
| 可维护性 | 低 | 中等 | 高 |
| 复杂度 | 低 | 中等 | 高 |
| 适用 | 小应用 | 中大应用 | 大型复杂应用 |

> **整理注记**：这张表把 Layered 与 Clean 的差异描述得**过轻**（只写了"耦合还是存在"一句）。真正的分水岭是**依赖方向**：传统分层里上层依赖下层（表现层 → 业务层 → 数据层，数据层是最不稳定的东西却在最内侧被依赖），CA 则通过 DIP 把"数据访问抽象"放进应用核心、把"数据库实现"甩到外围，于是**最内层反而最稳定、最外层最可替换**。作者的表格读起来像"三档复杂度阶梯"，容易误导成"项目大了就升级到 CA"，而忽略"是否值得为可替换性与可测性付出结构成本"这个真正的判据。

## 4. 评论区增量（P1）

信息量高于正文的部分，逐条存照：

1. **HlexNC**：「Can you next time provide an example of project with clean architecture?」（下次能给一个 CA 项目的例子吗？）→ 作者当天只回一个词「soon」，**52 天后（2024-08-26）**才贴出 `github.com/mohamedtayel1980/clean-...`（.NET Core API 示例仓库）——本系列 Part 4 之后的实操部分即对此的回应（P4–P19 全部发布于 08-26 以后）。逐字评论与作者回复见 [part-01 评论区实录](part-01-what-is-clean-architecture.md)。
2. **Antonio（Litlyx CEO）**：CA 是给"非常大且复杂、需要结构的代码库"的标准；他在大厂任职时用过，门槛对"不在巅峰状态的人"很高、会吓到人，但对大规模代码库是最优解。→ 印证 P3 的"适用面"结论，同时点出**学习曲线是真实成本**。
3. **Michal Kunikowski**：还有六边形架构，应该做对比；并给了两篇参考（sSense 的 "Hexagonal Architecture, there are always two sides to every story"、jmgarridopaz 的六边形文章）。→ **本系列全程没有做这个对比**（作者承诺未兑现），是内容缺口；六边形与 CA 在本仓的对应关系另见 [09 §架构家族对照](./09-critique-and-repo-mapping.md)。
4. **z2lai**：「Your diagram looks more like rectangles instead of circles 😀. I've always wondered, is there an actual difference in what the circlular clean architecture diagrams depict vs the non-circular diagrams? FYI, if your article was assisted by AI, you should disclose that or tag it appropriately.」（你的图画的是矩形不是圆😀；圆形图与非圆形图到底有实质差别吗？另：若本文为 AI 辅助创作，应按 dev.to 指南披露或打标）→ **本条已被作者隐藏**（页面标记「Comment hidden by post author – thread only accessible via permalink」，API 不返回正文，只能从文章页 JSON-LD 取到），作者亦未回应；P1 元数据至今为 `ai_disclosure_level: not_disclosed`。这是全系列唯一直接质疑 AI 披露的评论，**其隐身状态本身是史实**。→ 至于问题本身：原作者图确为矩形分层。**答**：圆的语义不是装饰——它表达"层级是包含关系而非并列盒子"，且配合 Dependency Rule 的"只向内"箭头；矩形图容易把 CA 读成普通三层架构（正是 P3 那张表的风险）。
5. **Top Developers 的两问**（重要）：
   - "实体不该含业务逻辑吧？校验规则放用例或 helper 里更合适？"→ 作者**未正面回复这一条**；但他在同一线程回复另一位读者（Marcelloh）时给出了相反立场：用 `private set` + `SetQuantity()` 行为方法「encapsulates the business rule within the entity」。**这是 DDD 阵营内部的真分歧**：Anemic Domain Model（实体只有数据，逻辑在 Service/Use Case）vs Rich Domain Model（实体承载不变式与行为）。原文 P1 说实体是"富领域对象含业务规则"、评论区也这么主张，而 P7 实际建出来的 `Category/Event/Order` 是**纯 POCO 贫血模型**（只有 `{ get; set; }`，无行为、无不变式）——**正文主张与实操不一致**，本系列走的是贫血 + 校验外置于 FluentValidation（P13）的路线。
   - "UI 层只是 frameworks & drivers 层的一部分。"→ 正确，见 §1 注记。

## 5. 与本仓对照

| 原文要点 | 本仓实态 | 一致性判断 |
|---|---|---|
| 四层同心圆 + 依赖只向内 | `apps/api/src/modules/<上下文>/{domain,application,infrastructure,api}` 四层 + `libs/core` 共享内核；仓储 port 在 application/domain 侧、adapter 在 infrastructure 侧 | 一致（本仓用目录结构 + Biome/门禁纪律 + DI token 表达依赖方向） |
| Entities 是富领域对象 | 本仓实体走**零装饰器 defineEntity（Mikro）+ 领域实体自带不变式**路线，且明确"实体不含持久化注解"（见 [global-entity-column-law](../../plans/global-entity-column-law.md)） | 本仓比原文严格：原文 P7 实为 POCO + 外置校验 |
| 框架无关 | 本仓受 NestJS 装饰器/DI 约束（`@Inject` 显式、zod 值导入等，见 AGENTS.md 铁律），追求的是"框架机制无关端口"而非"零框架" | 有意识偏离：本仓承认框架耦合成本，把不可解耦部分集中在 infrastructure adapter |
| 三层 vs CA 的取舍 | 本仓多上下文（users/auth/authorization/tenants/workspaces/platform/payment/storage/subscriptions/posts）+ 单体优先，判据触达才拆包 | 与 P3 "大型复杂应用才值得 CA 严谨度"结论相符 |

## 6. 本篇可带走的事实

- CA 的四条硬信息：**同心圆分层 + Dependency Rule + 框架独立 + 用例可独立测试**；其余（层名、目录名、工具）都是实现细节，允许变体。
- 五条原则中真正承重的是 **DIP + PI**；缺了这两条，"分层"退化回 P3 里的传统 Layered。
- 原文自身存在的两处失真要带防：层名重命名偏离原著（P1）、实体"富 vs 贫血"主张与实操不一致（P1 说富、P7 做贫血）。
