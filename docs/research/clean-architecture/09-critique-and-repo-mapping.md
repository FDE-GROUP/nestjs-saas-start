# 09 · 批判性判读与本仓对照（收口篇）

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 性质：本篇不是某几篇原文的整理，而是**全系列 19 篇 + 评论区的横向判读**，以及在**本仓（NestJS + MikroORM + 多租户 SaaS 参考应用）**语境下的取舍结论。
> 纪律：所有"原文事实"均来自 19 篇正文实读；所有"本仓事实"来自仓库目录/文档实存；推断与未验证处已显式标注。

---

## 1. 系列史实（先把它的身份搞清楚）

| 事实 | 依据 |
|---|---|
| 系列名 **「Building Applications with ASP.NET Core Clean Architecture」**，共 **19 篇**，dev.to 用户 mohamed Tayel（.NET Technical Lead，SURE Egypt，20+ 年经验，主攻 .NET + SQL Server） | dev.to series/28557 全量目录核对 |
| 发布跨度 **2024-07-03 → 2024-10-15**；P1–P3（7 月初）后中断约 7 周，P4–P9（8/26–8/29）连发，P10–P14（9/3–9/5），P15–P18（9/9–9/17），P19（10/15） | 各篇页脚日期 |
| 思想来源：Pluralsight **Gill Cleeren** 的 ASP.NET Core Clean Architecture 课程（P1 明示致谢，P4/P5 末尾再次指向该课程） | P1 / P4 / P5 |
| 示例代码仓库：`github.com/mohamedtayel1980/clean-architecture`（P7 起每篇文末附链） | 各篇 |
| 贯穿案例：GloboTicket 票务管理（Event/Category/Order），**只做后端**（P5 明确排除客户端） | P4 / P5 |
| 读者在 P1 就要求"给个真实项目例子"，作者答 "soon"，两个月后以 P6–P19 兑现 | P1 评论区 |
| **系列在 P19 后未继续**（本仓 2026-10-21 抓取时该 series 仍为 19 篇），承诺的 pipeline behaviors / 日志 / 错误处理 / Identity 均未出现 | series 页 + P15、P19 结语 |
| 标题序号有错位：P2 的 URL 与部分入口写作 "part-1"；P4/P5 用 "P4/P5" 而非 "Part 4"；P6–P19 又回到 "Part N" | 各篇 URL |
| 有读者（z2lai）质疑内容为 AI 辅助生成（dev.to 的 AI 披露规范），作者未回应 | P1 评论区 |

**定位结论**：这是一份**合格的入门级落地示范**（概念 → 骨架 → 逐层代码），但**不是权威参考**——理论是二手转述（Uncle Bob + 一门 Pluralsight 课），实操是教学级简化项目，且完整性有明确缺口（零测试、零鉴权、零多租户、承诺未兑现）。在本仓语境下它的正确用法是**印证材料 + 差异清单**。

## 2. 十二处可疑/过时/自相矛盾点（带篇号与证据）

| # | 问题 | 出处 | 判读 |
|---|---|---|---|
| 1 | 四层被重命名为 "Entities / Application Core / infrastructure / User interface"，其中把最外层（Frameworks & Drivers）说成 "User interface"，把 Interface Adapters 与外部机制混在 "infrastructure" 里 | P1（读者 Top Developers 当场指出） | 二手失真。做架构判断须回原著四层口径；本仓用的是 domain/application/infrastructure/api，恰与原著更贴 |
| 2 | P1 宣称实体是"含业务规则的富领域对象"，P7 实际产出纯 POCO（无行为、无不变式），P4 提炼的规则全落在校验器与仓储方法 | P1 vs P7 vs P13/P16 | **主张与实操相反**（贫血模型）。这是 DDD 阵营的真分歧，作者未声明立场属哪派 |
| 3 | P3 的对比表把 Layered 与 Clean 的差异写成"复杂度三档阶梯"，未点出分水岭是**依赖方向（DIP）** | P3 | 易误导成"项目大了就升级 CA"；选型判据应是"是否值得为可替换性/可测性付结构成本" |
| 4 | 配图用矩形而非同心圆，且未解释二者语义差别 | P1（读者 z2lai 提出） | 矩形图会把 CA 读成普通三层；圆的语义是"包含 + 依赖只向内" |
| 5 | 承诺与六边形架构做对比，全系列从未做 | P1 评论区（Michal Kunikowski） | 内容缺口，见 §4 的家族对照补上 |
| 6 | `test` 文件夹在 P6 建好，**19 篇没写一行测试**，而 P1/P3 把可测试性列为 CA 头号收益 | P6 / P1 / P3 | 系列最大完整性缺口：结构可测 ≠ 有测试 |
| 7 | 泛型基接口 `IAsyncRepository<T>` 四处形状缺陷：主键钉死 `Guid`、`Task<T>` 无可空语义、`ListAllAsync` 全表无分页、`Update/Delete` 无并发令牌 | P9 | 直接导致 P10 内存排序全表、P12 事后 null 检查、P16 整行覆盖更新 |
| 8 | 前向引用未定义物：P11 用 `GetAllCategoriesAsync/GetCategoriesWithEventsAsync`（当时接口是空体）、P12 用未介绍的 `NotFoundException`、P19 控制器引用四个系列中从未实现的类型、P16 注册了未定义 `OrderRepository` 类 | P11/P12/P16/P19 | 片段不可直接编译；照抄博客代码必须逐行核验（本仓借鉴纪律的另一例证） |
| 9 | 实现级 bug：`allCategories.ForEach(p => p.Events.ToList().RemoveAll(...))` 对副本操作，`includePassedEvents=false` 实际未生效；`IsEventNameAndDateUnique` 用同步 `Any` + `Task.FromResult` 假异步；`EmailService` 在判状态码前就 `LogInformation("Email sent")` | P16 / P17 | 三处都是"看起来对、实际错"，属人工审查易漏、测试才能抓的类型（呼应 #6） |
| 10 | 每仓储方法各自 `SaveChangesAsync()`，同时 P8 宣布"不做 Unit of Work" ⇒ **跨仓储写操作结构上无法原子** | P8 + P16 | 系列最实际的架构裂缝；本仓以显式事务/flush 时机 + Outbox 类机制补位 |
| 11 | 错误处理通路在两篇之间翻转：P13 返回 `BaseResponse{Success=false, ValidationErrors}`，P17 同一 handler 改回 `throw ValidationException` 且返回类型从 `CreateEventCommandResponse` 变 `Guid`，正文未交代；P19 控制器返回类型跟着变 | P13 vs P17 vs P19 | 教学系列里少见的**自我不一致**；也说明"返回值式错误"与"异常式错误"混用的代价 |
| 12 | CORS 用 `WithOrigins(...) + SetIsOriginAllowed(origin => true) + AllowCredentials()`（策略名 "open"），P18/P19 两篇重复；写侧无鉴权、无租户、无幂等，通知失败被 `catch` 静默吞掉 | P18/P19/P12/P17 | **安全缺陷，不可照搬**。本仓对可信代理/CSRF/限流/租户卡点/出站弹性均有专门方案与 fail-closed 立场 |

### 2.1 另外两处"过时"提醒（不是作者的错，但引用时要知道）

- **MediatR 的处境已变**：本系列用 MediatR 12.3（`RegisterServicesFromAssemblies`）。MediatR 作者 Jimmy Bogard 已将其转为付费商业许可（.NET 8 原生 `System.Web.HttpResults`/`IServiceCollection` 扩展与"端点即处理器"路线成为官方推荐方向）——**2026 年新建 .NET 项目照抄 P10/P14/P19 的 MediatR 装配方式需先核可许可与官方姿态**（此为业界通识性变化，本仓未在 .NET 侧实机验证，标注为**推断/未在本仓取证**）。
- **AutoMapper `ReverseMap()`（P10）与 `AppDomain.CurrentDomain.GetAssemblies()` 扫描注册（P14）** 均非当代推荐做法（前者生成无用的反向配置，后者受程序集惰性加载影响会静默漏注册；同篇内 P13 已用了更稳的 `AddValidatorsFromAssemblyContaining<T>`）。

## 3. 全系列的正资产（值得保留的十条）

批判之外，这 19 篇里有十条是**可以直接进本仓检查单**的：

1. **动线顺序**：业务理解 → 范围与栈 → 骨架 → 逐层实现（P4/P5/P6）。
2. **Domain 零依赖的硬指标**（P7）：不引基础设施包、不引外层项目。
3. **接口数量是显性成本**（P8）："Application 项目里会有大量接口，多数在基础设施实现"——作者没把 CA 说成免费的。
4. **仓储的理由只能是边界**（P8）：并诚实记下 EF Core 下仓储的争议与"不手写 UoW"的取舍。
5. **映射外置的配置类**（P16 `IEntityTypeConfiguration`）：持久化无知的正确兑现形态。
6. **审计集中在 `SaveChangesAsync` 覆写**（P16）：横切关注点收在一处。
7. **ISP 姿态**（P9）：泛型基接口保持五方法不动，业务专属查询落派生接口。
8. **具体设施端口的外部实现形状**（P17 `ICsvExporter`/`IEmailService`）：用例只知"能变成字节数组/能发信"，是 P1 承诺的最佳示范。
9. **垂直切片按 Feature 组织**（P11）：明说"这是穿过功能的垂直切片，对齐 DDD 限界上下文"。
10. **瘦控制器的三行式**（P19）：一个 mediator 依赖 + 组装请求 + 显式状态码契约（`ProducesResponseType` 204/404）。

## 4. 架构家族对照（补上原文没做的对比）

评论区要求的六边形对照，本仓视角下可以这样摆（**注：本仓 `docs/specs/architecture.md` 才是当前真相，下表仅为阅读本系列用的坐标系**）：

| 维度 | Layered（传统分层） | Hexagonal（端口-适配器） | Clean Architecture | 本仓实态 |
|---|---|---|---|---|
| 核心概念 | 层（layer） | 端口（port）+ 适配器（adapter） | 同心圆 + Dependency Rule | 限界上下文 + 垂直切片四层 + CQRS |
| 依赖方向约束 | 上层依赖下层（**内层依赖外层**，不稳定在内） | 应用核心只依赖端口（驱动侧与被驱动侧都是抽象） | **源码依赖只能向内** | 目录 + DI token + 门禁纪律（port 在 domain/application，adapter 在 infrastructure） |
| 驱动侧（入站） | 表现层 | driving adapters + port | Interface Adapters（controllers） | `api/` 目录的 Controller + zod 契约 |
| 被驱动侧（出站） | 数据访问层 | driven adapters + port | Interface Adapters（presenters/repos） | `infrastructure/repositories` 等 adapter |
| 对"框架"的态度 | 不特别处理 | 核心不含框架类型 | 显式"Independent of Frameworks" | 承认框架耦合，把不可解耦部分集中在 adapter；端口追求框架机制无关 |
| 典型弱项 | 数据层最不稳定却在最内被依赖 | 术语两套（driving/driven）易混 | 层名易被二手转述扭曲（本系列即例） | NestJS 装饰器/DI 元数据约束强（ESM 铁律） |
| 与本系列的关系 | P3 的中间档 | 原文未做（P1 评论区要求） | 原文主线（但层名失真，见 §2-1） | 与 P11 的"feature 含仓储"理想最接近 |

> 一句话：**本系列讲的 CA，其"外圈实现内圈端口"的内核就是六边形的端口-适配器**；差别主要在叙事（圆 vs 六边形、层名 vs 端口名）。因此读 P17/P16 时，把它们当"驱动侧适配器（Controller）+ 被驱动侧适配器（Repository/Email/Csv）"来理解比按层名理解更准确。

## 5. 与本仓总对照（一张表收口）

| 主题 | 本系列的做法 | 本仓的做法 | 差距方向 |
|---|---|---|---|
| 分层 | 4 项目（Domain/Application/Persistence+Infrastructure/Api） | 每上下文 4 目录（domain/application/infrastructure/api）+ `libs/core` 跨上下文共享内核 + `libs/contracts` 传输契约单源 | 本仓：垂直切片 + 包边界；原文：横向项目 |
| 领域模型 | POCO 贫血 + 审计基类继承 | 零装饰器 `defineEntity`（Mikro）+ 列元数据单一源工厂 + 聚合根与领域事件协议（`shared-kernel/domain`） | 本仓更严格（Rich Domain + 漂移防治） |
| 用例 | MediatR `IRequest/IRequestHandler` + Features 目录 | NestJS CQRS（`shared-kernel/cqrs` + `application/{commands,queries,read-models}`） | 同构，本仓多一层事件通道 |
| 校验 | FluentValidation，规则脱离实体，错误压成字符串列表 | **zod 单源**（请求/响应/env）+ 官方 standard-schema 接线 + 契约居 `@saas/contracts` | 本仓强（schema 可跨端复用 + 结构化错误） |
| 错误处理 | 两篇之间从返回值改回异常，无全局过滤器 | 全局 `ExceptionFilter` + `TransformInterceptor` 统一响应/错误形状 | 本仓成体系，原文缺失 |
| 持久化 | EF Core + 每个仓储方法各自提交 + 迁移 + `HasData` 种子 | MikroORM + 迁移链（`migration:generate/run`）+ 表所有权守卫 + DDL 恒等对拍 + 推式 seed | 本仓机制化程度高得多 |
| 多租户/鉴权 | 无（单租户、端点全开放） | S2 仓储唯一卡点（port 不暴露 tenantId，adapter 从 ALS 注入）+ 全局会话墙 + CASL/RBAC + 租户审批制 | 本仓独有 |
| 事务/一致性 | 每方法自提交，明示不做 UoW | 显式事务/flush 挂载点 + Outbox/事件发而不存的分阶段策略 | 本仓独有（且是 ES roadmap 的前置） |
| 可观测性 | 一句 `LogInformation`（且时序错） | Pino 结构化日志 + correlationId 链路（ALS） | 本仓独有 |
| 测试 | 0 篇 0 行 | Vitest 分层金字塔 + gated e2e 真库 + `GATED_E2E_FILES` 恒等校验 + `ci`/`ci:quick`/`ci:db` 门禁 | 本仓独有 |
| 前端/契约 | 明确排除（P5） | `apps/web`（React+Vite）+ `packages/api-client`（OpenAPI 生成）+ 前端门禁 | 本仓已越过 |
| 安全面 | CORS 任意来源 + 凭证；邮件正文直拼；密钥经配置（这点合规） | 可信代理 env、CSRF 方案、限流桶、数据驻留守卫、密钥不入仓 | 原文不可照搬 |
| 事件溯源 | 无 | `event-sourcing-roadmap` + tenants/subscriptions 试点 | 本仓独有 |

## 6. 如果要给本仓留下的三条建议（供人裁，非依据）

1. **可用作新人心智教材的只有 3 篇**：P1（定义+依赖规则）、P11（垂直切片）、P17（端口倒置最干净的示范）。其余（VS 操作、包版本、C# 语法细节）与本仓技术栈无关，读它们是浪费时间。
2. **P9/P16 的泛型 CRUD 仓储 + per-method save 可作为本仓"反面参照"入档**：本仓为什么拒绝泛型 CRUD 基接口、为什么 port 不暴露 `tenantId`、为什么要事务/flush 挂载点——用这两个反例讲比抽象原则更好懂（**待人类确认后回灌到 `docs/specs/architecture.md` 的讲解材料指针，本仓不自行改写宪法**）。
3. **P13 §1 的"为什么不用 Data Annotations"论证可作本仓 zod 立场的旁证，但需修正其逻辑缺口**：外置校验 ≠ 不变式无家；本仓的回答是"契约层 zod 守输入形状 + 领域实体守不变式 + DB 约束兜底"三层，比原文的"校验器独大"更完整（引用时须带上这一修正）。

## 7. 本篇可带走的事实

- 这套系列的**可信度分布不均**：概念篇（P1–P3）二手转述有失真；结构篇（P8/P9/P11/P15/P17）扎实可复用；实现细节篇（P10/P12/P13/P16/P19）含 9 处以上实错（§2 表 #7–#12）。
- 它的**最大价值是示范了"落地动线的顺序"**，最大缺陷是**没有测试与没有安全面**——而这两项恰是本仓的铁律所在（AGENTS.md §3/§4 + 工具红线）。读它时应始终带着这个问题：**"作者在这里没写测试/没写权限，是因为不需要，还是因为他没写？"** 多数答案是他没写。
- 与本仓的关系是**印证，不是依据**：本仓的架构决策（垂直切片、port 卡点、zod 单源、MikroORM、ES 路线）都有已审 plan 与实跑取证支撑；本系列至多说明"这些选择在业界同类实现里有对应物，且对方的缺陷恰好是我们规避的那些"。
