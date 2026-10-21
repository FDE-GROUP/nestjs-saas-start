# Part 4：让应用立项与业务需求对齐（GloboTicket 案例）

> 用途: 调研参考（非开发依据）· 逐篇忠实对译，主题串读见 [02](02-from-business-need-to-skeleton.md)，横向判读见 [09](09-critique-and-repo-mapping.md)

## 原文信息

| 项 | 值 |
| --- | --- |
| 原标题 | Clean Architecture P4: Aligning Application Setup with Business Needs（标题写作 "P4"，slug 无 part 前缀） |
| 链接 | https://dev.to/moh_moh701/establishing-the-core-aligning-application-setup-with-business-needs-3kjf |
| 作者 | mohamed Tayel（`moh_moh701`） |
| 发布时间 | 2024-08-26T17:50:00Z |
| 系列 | Clean Architecture（collection 28557）第 4 篇 |
| 平台标注阅读时长 | 3 分钟 |
| 反应数 / 评论数 | **1** / 0（对比 P1 的 415——断更后系列流量塔落，见下方注记） |
| 标签 | `architecture` `dotnetcore` `softwareengineering` |
| AI 披露状态 | `not_disclosed`（dev.to 元数据，直至本次整理仍未打标） |
| dev.to 文章 id | 1974205 |
| 本篇原图 | 0 张 |
| 本篇性质 | **系列断更 52 天后的第一篇实操文**（P1–P3 于 2024-07-03~05 发布；P4 起进入案例实现，是对 P1 评论区 HlexNC「给个真实项目例子」的回应，见 [part-01 评论区实录](part-01-what-is-clean-architecture.md)） |

---

## 逐段对译（本篇无小标题，原文为连续 9 段散文，逐段落译）

**第 1 段**

> When embarking on any software development project, the first and most critical step is understanding what exactly needs to be built. As developers, we often jump straight into coding, but without a clear understanding of the business requirements, the application can easily miss the mark. This is particularly true when you're brought in as a consultant to help a client build or upgrade their system. In this context, it's not just about writing code; it's about delivering value that aligns with the client's needs.

任何软件开发项目的第一步、也是最关键的一步，是**搞清楚到底要建什么**。开发者常常直接开始编码，但在缺乏明确业务需求理解的情况下，应用很容易偏离目标。当你作为**顾问**被请去帮客户构建或升级系统时尤其如此——此时不只是写代码，而是交付与客户需求对齐的价值。

**第 2 段**

> Let's imagine we're working with GloboTicket, a company that needs a new Ticket Management system. ... This process starts with gathering information from key stakeholders, such as the internal team members who will be using the system daily.

设想客户是 **GloboTicket**，它需要一套新的 **Ticket Management（票务管理）系统**。为确保开发出符合期望的系统，要先彻底理解需求；虽然直接写代码很诱人，但必须先弄清系统要做什么。**这一步从向关键干系人收集信息开始**，例如每天会使用系统的内部团队成员。

**第 3 段**

> One of our primary contacts at GloboTicket is Mary Goodsale, an account manager who frequently interacts with the current system. ...

GloboTicket 的主要联系人之一是 **Mary Goodsale**，一位经常与现行系统打交道的客户经理（account manager）。她提供了新系统应当完成之事的宝贵洞见；通过讨论与访谈，我们提炼出系统的 essential requirements。

> 注记：**"Mary Goodsale" 这个名字是刻意的谐音梗**（good sale = 好销售），说明整段"需求勘察"是为教学虚构的对话，不是真实调研记录。作者没有给出任何访谈问题清单、需求表或验收标准——**"理解需求"这一步在本系列里只以叙事方式出现，没有可复用的工程产物**。

**第 4 段**

> At a high level, the new system must support event management. This includes the ability for users to create, update, and delete events. Additionally, there must be a feature to categorize events, allowing users to view events by category. Since ticket sales are central to the system's purpose, a screen for managing orders must also be included in the first release. These core functionalities form the foundation of the application's domain.

高层次上，新系统必须支持**活动管理（event management）**：用户可创建、更新、删除 event；此外必须有**活动分类**功能，让用户按 category 查看活动。由于售票是系统的核心目的，**首版（first release）就必须包含一个管理订单的界面**。这些核心功能构成应用领域的基础。

**第 5 段（不变式来源）**

> Identifying these key entities—events, categories, and orders—helps us shape the domain model for the application. Each of these entities has specific rules and constraints. For example, when creating an event, the system must require a name, price, and date. Moreover, the combination of the event's name and date must be unique. Similarly, categories need to be defined with a name that cannot exceed 50 characters.

识别出 **event / category / order** 这几个关键实体，帮助我们塑造应用的领域模型。**每个实体都有具体的规则与约束**：

- 创建活动时，系统必须要求 **name（名称）、price（价格）、date（日期）**；
- 活动的 **name + date 组合必须唯一**；
- category 的 **name 长度不得超过 50 个字符**。

> 注记：这是全系列**不变式（invariants）的唯一权威出处**，务必注意原文写的是"创建 event 需要 name / price / date 三个字段"（price 也在必填之列）。而后续实现里：`Event` 实体的 price 属于 `EventPrice` 明细、校验只覆盖了 name+date 唯一与 category 名称长度（P13），**event 的 price/date 必填并未在 FluentValidation 中完整落地**。原文此处还提到一条"日期必须在未来"的约束在本篇**并未出现**——它只在别处被隐含提及，属本系列的需求→校验断层之一（对照 [02](02-from-business-need-to-skeleton.md) 的注记）。

**第 6 段**

> To further refine our understanding, we work with Mary to create wireframes. Wireframes are invaluable tools that allow us to visualize the system early on and receive feedback quickly. They guide our conversations about the user interface and user experience, ensuring that what we build aligns with the client's vision.

为进一步澄清理解，我们与 Mary 一起画**线框图（wireframes）**。线框图让我们得以早期可视化系统并快速获得反馈，并引导关于 UI/UX 的讨论，确保所建之物与客户的愿景对齐。

**第 7 段**

> For instance, the wireframes outline a simple yet effective user interface. When users access the application, they'll be greeted by a menu on the left and a welcome message. The event management section will prominently display a list of events, allowing users to manage them easily. Key features such as adding and deleting events are built into this interface...

例如，线框图勾勒出一个简单而有效的界面：用户进入应用后，看到的是**左侧菜单 + 欢迎信息**；活动管理区会**以列表为主视觉**展示活动，便于管理；新增与删除活动等关键功能内置于该界面，保证顺畅直观的交互。

**第 8 段**

> Additionally, the application will include a section for managing categories, where users can view and create new categories. Finally, the wireframes highlight a screen for reviewing sales across all events, filtered by month. This screen is designed to handle potentially long lists of orders...

此外，应用会包含一个**分类管理区**，用户可查看并新建 category。最后，线框图还标出一个**按月份筛选、查看所有活动销售情况**的界面，该界面需要能承载**可能很长的订单列表**。

> 注记：原文在这里明确提出了**分页/长列表**这一非功能需求，但 P10–P19 的实现里 `GetEventsList` / `GetOrdersByMonth` 全是**一次性返回全表**（无分页、无排序、无过滤条件传递），这一需求在实现阶段被丢弃。对照本仓：分页是平台级能力（见 `docs/plans/global-readiness-error-pagination.md`）。

**第 9 段（总结）**

> By thoroughly understanding the business requirements and visualizing the system through wireframes, we set the stage for building an application that not only meets but exceeds the client's expectations. ... In conclusion, before diving into development, it's essential to have a clear and shared understanding of what needs to be built. Engaging with stakeholders, defining the core entities, and using tools like wireframes are all part of this crucial planning phase.

通过彻底理解业务需求并用线框图把系统可视化，我们为构建"不仅满足而且超越客户期望"的应用搭好舞台；这样我们就不是盲目编码，而是在创造真正为业务服务的方案。结论是：**进入开发之前，必须对"要建什么"有清晰且共享的理解**——与干系人互动、定义核心实体、使用线框图，同属这个关键规划阶段。

原文链接（文末）：`[For more detailed insights on this approach, you can refer to the ASP.NET Core 6 Clean Architecture course on Pluralsight.](https://app.pluralsight.com/library/courses/asp-dot-net-core-6-clean-architecture/table-of-contents)`

---

## 整理注记（本篇在全系列中的作用）

- **本篇是"需求 → 领域模型"的唯一一次显式推导**：全文只做三件事——找干系人、列功能（活动/分类/订单）、列规则（三必填、name+date 唯一、category ≤ 50 字符）。
- **推导结果没有被后续代码继承**：这三条不变式最终只部分落在 P13 的 `CreateEventCommandValidator` / `CreateCategoryCommandValidator`；而 P7 的实体类**一个校验都没有**（纯 POCO），也就是"规则住在应用服务而非领域"——**贫血路线在需求篇就已经埋定**。
- **本篇 0 条评论、仅 1 个反应**：需求勘察这种"无代码"章节在 dev.to 上反应最低；更关键的是全系列流量拐点——**P1  415 反应 → P2 90 → P3 64 → P4–P19 全部落在 1–7**。断更 52 天 + 转为 Visual Studio 截图教程后，推荐算法不再分发。**读这套系列时要意识到：后 16 篇的示例代码事实上几乎没经过社区检验**（无 issue、无纠错评论）。（以上反应数均取自 dev.to 文章 API `positive_reactions_count`，2026-10-21 抓取）
- 与本仓方法论的一致性：本仓要求"先有已审方案再写码"（AGENTS.md §2「无已审方案不写码」）与本篇主张同向；差别在于本仓把需求写成 `docs/plans/*` 的可审计文档，而本篇只有一段虚构对话。

## 与本仓对照（本篇）

| 本篇论点 | 本仓实态 |
| --- | --- |
| 干系人访谈提炼需求 | 本仓以 `docs/specs/vision.md` + `docs/plans/` 作为需求与方案的单源，访谈结论须落文档过审计门 |
| 首版就要含订单管理界面 | 本仓按限界上下文切分（users/auth/subscriptions/workspaces…），首版范围由方案划定而非功能清单 |
| 不变式：name+date 唯一、名称≤50 | 本仓不变式写进 domain（实体/聚合方法内校验），唯一性冲突走 DB 约束 + 结构化错误码，不只靠请求层 validator |
| 线框图需要长列表分页 | 本仓分页为平台级能力，契约居 `libs/contracts`（zod） |

---

## 评论区实录

本篇 **0 条评论**（API `?a_id=1974205` 返回空数组，`comments_count: 0`，页面无隐藏标记）。

---

## 附：原文英文全稿（逐字保留）

> 来源：dev.to 官方 API `body_markdown` 字段（作者原始稿），抓取于 2026-10-21；除把图片链接改为本地 `./imges/` 副本（原始 URL 保留在链接 title 中）外，未作任何增删改。
>
> 呈现口径：以下英文全稿**不做代码块包裹、直接按 Markdown 渲染**（保留作者原始标题层级、粗体、列表、代码块与图片）；逐字性以上述 body_markdown 抓取为准，本区未增删改任何文字。

When embarking on any software development project, the first and most critical step is understanding what exactly needs to be built. As developers, we often jump straight into coding, but without a clear understanding of the business requirements, the application can easily miss the mark. This is particularly true when you’re brought in as a consultant to help a client build or upgrade their system. In this context, it’s not just about writing code; it’s about delivering value that aligns with the client’s needs.

Let’s imagine we’re working with GloboTicket, a company that needs a new Ticket Management system. To ensure we develop a system that meets their expectations, we need to start by thoroughly understanding the requirements. Although it might be tempting to begin coding right away, we must first clarify what the system needs to do. This process starts with gathering information from key stakeholders, such as the internal team members who will be using the system daily.

One of our primary contacts at GloboTicket is Mary Goodsale, an account manager who frequently interacts with the current system. Mary provides us with valuable insights into what the new system should accomplish. Through discussions and interviews, we distill the essential requirements for the system.

At a high level, the new system must support event management. This includes the ability for users to create, update, and delete events. Additionally, there must be a feature to categorize events, allowing users to view events by category. Since ticket sales are central to the system’s purpose, a screen for managing orders must also be included in the first release. These core functionalities form the foundation of the application’s domain.

Identifying these key entities—events, categories, and orders—helps us shape the domain model for the application. Each of these entities has specific rules and constraints. For example, when creating an event, the system must require a name, price, and date. Moreover, the combination of the event’s name and date must be unique. Similarly, categories need to be defined with a name that cannot exceed 50 characters.

To further refine our understanding, we work with Mary to create wireframes. Wireframes are invaluable tools that allow us to visualize the system early on and receive feedback quickly. They guide our conversations about the user interface and user experience, ensuring that what we build aligns with the client’s vision.

For instance, the wireframes outline a simple yet effective user interface. When users access the application, they’ll be greeted by a menu on the left and a welcome message. The event management section will prominently display a list of events, allowing users to manage them easily. Key features such as adding and deleting events are built into this interface, ensuring a smooth and intuitive user experience.

Additionally, the application will include a section for managing categories, where users can view and create new categories. Finally, the wireframes highlight a screen for reviewing sales across all events, filtered by month. This screen is designed to handle potentially long lists of orders, ensuring that users can efficiently manage and analyze sales data.

By thoroughly understanding the business requirements and visualizing the system through wireframes, we set the stage for building an application that not only meets but exceeds the client’s expectations. This approach ensures that we’re not just coding blindly but creating a solution that delivers real value to the business.

In conclusion, before diving into development, it’s essential to have a clear and shared understanding of what needs to be built. Engaging with stakeholders, defining the core entities, and using tools like wireframes are all part of this crucial planning phase. By taking these steps, we lay a strong foundation for a successful project, where the final product aligns perfectly with the client’s needs and goals.

[For more detailed insights on this approach, you can refer to the ASP.NET Core 6 Clean Architecture course on Pluralsight.
](https://app.pluralsight.com/library/courses/asp-dot-net-core-6-clean-architecture/table-of-contents)
