# 02 · 动手之前：从业务需求到工程骨架

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 覆盖原文: Part 4（2024-08-26）· Part 5（2024-08-26）· Part 6（2024-08-26）

| 篇 | 原标题 | 链接 |
|---|---|---|
| P4 | Clean Architecture P4: Aligning Application Setup with Business Needs | https://dev.to/moh_moh701/establishing-the-core-aligning-application-setup-with-business-needs-3kjf |
| P5 | Clean Architecture P5: Establishing the Core Foundation | https://dev.to/moh_moh701/setting-up-the-application-core-and-architecture-for-aspnet-core-8-hcb |
| P6 | What is Clean Architecture: Part 6 - Structuring the Application Core with Visual Studio | https://dev.to/moh_moh701/getting-started-structuring-the-application-core-with-visual-studio-4bk8 |

> **系列史实**：P1–P3 于 2024-07 初发布后中断约 7 周，2024-08-26 起 P4–P9 连发，实操部分自此开始；期间读者 HlexNC 在 P1 下催更要求"给个真实项目例子"，作者回 "soon"，两个月后确实补上了示例仓库与实操篇——**本系列前 3 篇是概念，后 16 篇是对一个真实仓库的逐层讲解**。

---

## 1. P4 · 第一个动作不是写码，是搞清楚要造什么

作者立场：**任何开发项目最关键的第一步是理解到底要造什么**。开发者常直接跳进编码，但没有清晰的业务理解，应用很容易跑偏——尤其当你作为顾问被请去帮客户建/升级系统时，交付的不是代码而是**对齐客户需求的价值**。

### 1.1 案例设定：GloboTicket 票务系统

贯穿全系列的案例。作者把需求获取写成一段可复用的流程：

1. **找关键干系人**：内部每天用系统的成员是主要信息来源。案例中的关键联系人是账户经理 **Mary Goodsale**，她熟悉现有系统，通过讨论与访谈提炼出必备需求。
2. **高层功能清单（第一版必须支持）**：
   - **活动（Event）管理**：创建、更新、删除活动；
   - **分类（Category）**：给活动分类，可按分类查看活动；
   - **订单（Order）**：票务销售是系统核心目的，所以第一版必须包含订单管理界面。
3. **由功能清单识别关键实体** → **Event / Category / Order**，这三个即应用的**领域模型雏形**。
4. **抽出实体规则与约束（后续落到校验层）**：
   - 建活动必须有**名称、价格、日期**；且**名称 + 日期组合必须唯一**；
   - 分类名称必填，**长度不超过 50 字符**。
5. **与干系人一起做线框图（wireframes）**：线框图的价值是"尽早可视化、尽快拿反馈"，并作为 UI/UX 讨论的抓手。案例线框包含：
   - 进入应用：左侧菜单 + 欢迎语；
   - 活动管理区：活动列表置于主视区显眼位置，内建新增/删除等操作，追求顺滑直观；
   - 分类管理区：查看与新建分类；
   - 销售视图：按月份筛选、跨全部活动的订单销售汇总，需能处理长列表。

### 1.2 P4 的方法论要点（与 CA 的关系）

- **领域模型来自需求对话，不来自技术分层**：Event/Category/Order 是被"要管活动、要分类、要卖票"这三句话逼出来的，先有它们再谈层怎么放。
- **不变式在需求阶段就已出现**（名称+日期唯一、名称 ≤50 字符、日期必须是未来）——但看后面几篇会发现：这些规则**最终没有落在实体里**，而是落在 FluentValidation（P13）+ 仓储查询（P16 的 `IsEventNameAndDateUnique`）上。这是本系列架构立场的具体体现（贫血 + 规则外置），在 [01 §4-5](./01-foundations-and-principles.md) 已标注为分歧点。
- **P4 是全系列唯一一篇"非技术"文章**，作者的排序本身即主张：**架构决策的输入是业务，不是模式偏好**。

## 2. P5 · 划定边界：只做后端，技术栈站队

有清晰业务理解后，进入架构搭建。P5 内容很短，实质是三件事：

1. **范围声明**：本系列**只聚焦后端**，用 Clean Architecture + ASP.NET Core 8；客户端实现（Blazor / MAUI / Angular / React）**不在范围内**，但 API 设计要能支撑将来接任意客户端。
2. **架构枢纽**：后端以 **ASP.NET Core API 为中枢**，承载全部业务逻辑与数据访问；API 连 **SQL Server**——理由很务实："GloboTicket 现有基础设施就是 SQL Server"（选型由客户存量决定，不是因为 CA 需要它）。
3. **技术栈三件**：
   - ASP.NET Core 8（云原生现代应用）；
   - Entity Framework Core 8（数据访问，对接 SQL Server）；
   - Clean Architecture（保证核心业务逻辑独立于数据库与客户端等外部关切）。

> **整理注记**：P5 里"CA 保证核心独立于基础设施，因此便于测试/维护/将来增强"这句话，是全套系列"为什么值得付出结构成本"的正式答案；同时"专注 API + 数据层，随时可接多种客户端"正是 CA 的 **UI 无关**收益在项目范围上的一次显式表态。值得注意的是作者**没有把 MediatR/AutoMapper/FluentValidation 放进 P5 的栈声明**（它们在 P10/P13 才空降），这在方法论上其实是好事——CA 本身不要求它们——但读者容易把它们当成 CA 的必需件，[09 §批判点](./09-critique-and-repo-mapping.md) 对此有专门辨析。

## 3. P6 · Solution 骨架：先摆文件夹，再写代码

P6 是纯实操演示（Visual Studio），落地"骨架先行"：

1. **从空白 Solution 开始**：选 Blank Solution 模板，命名 `GloboTicket.TicketManagement`，选好存放目录。
2. **顶层两分**：加两个 solution folder —— `src`（源码）与 `test`（测试）。
3. **src 内三分**：按 CA 的关注点加 `API`、`Core`、`Infrastructure` 三个文件夹，"让解决方案的布局从第一天就体现 Clean Architecture 原则"。
4. 结论句：*"这样就打下了一个干净、条理清晰的工程地基，后续把实际项目放进这些文件夹即可。"*

### 骨架 → 层的映射（后续各篇兑现）

| P6 的 solution folder | 后续放的项目 | 出自 |
|---|---|---|
| `src/Core` | `GloboTicket.TicketManagement.Domain`（P7）、`...Application`（P9） | 领域 + 应用核心同属 Core |
| `src/Infrastructure` | `...Persistence`（P16）、`...Infrastructure`（P17） | 数据库与外部服务实现 |
| `src/API` | `...Api`（P18/P19） | 组合根 + HTTP 边界 |
| `test` | 全系列实际未展开（仅留位） | — |

> **整理注记（两处值得警惕）**：
> 1. **P6 的"三分法"把 Core 与 Infrastructure 并列为顶级文件夹，但没有 API 之外的依赖方向说明**——文件夹摆放本身不产生 Dependency Rule，真正把关靠后续项目引用（P16 里 Persistence 引用 Application、P18 里 API 引用三层全部）。**看目录结构判断架构是 CA 最常见的误读**，本仓同样需要靠门禁（而非目录名）守住方向。
> 2. **`test` 文件夹建了但整个 19 篇系列没有写过一行测试**。这与 P1/P3 把"可测试性"列为 CA 头号收益直接矛盾——结构上"可测"不等于有测试。这是本系列最大的完整性缺口（详见 [09 §批判点](./09-critique-and-repo-mapping.md)）。

## 4. 与本仓对照

| 原文动线 | 本仓实态 | 判断 |
|---|---|---|
| P4 需求对话 → 识别实体 → 提炼不变式 | 本仓走 `docs/plans/`（已审方案）+ `docs/specs/`（宪法）+ 用户故事（`docs/stories/`），实体与不变式在方案里先写死后实现 | 同构，但本仓把"P4"机制化为审计门（无已审方案不写码），比原文的"找 Mary 聊天"更强约束 |
| P5 技术栈站队（ASP.NET/EF Core/SQL Server，由客户存量决定） | 本仓技术栈由 `docs/specs/tooling-standards.md` §3 工具红线钉死（NestJS + MikroORM + PostgreSQL + zod + Biome + Vitest + pnpm），换栈需修宪 | 本仓更硬：栈是宪法而非项目自由选择 |
| P6 src/test + api/core/infrastructure 三分 | pnpm workspace 四包：`libs/core`（shared-kernel + tenancy/authorization/platform 契约 + 领域层）、`libs/contracts`（跨端 zod 契约）、`apps/api`（`modules/<上下文>/{domain,application,infrastructure,api}`）、`apps/web`；测试与源码同层共置（`*.test.ts`/`*.e2e.test.ts`）而非独立 test 树 | 差异：本仓用**包边界 + 垂直切片**替代原文的**横向 solution folder**；测试不做独立目录，按门禁分级（默认 `ci` / `ci:db` gated e2e） |
| P5 "只做后端，将来可接多客户端" | 本仓已有 `apps/web`（React + Vite + 反代 7009）+ `packages/api-client`（OpenAPI 生成） | 本仓已越过该阶段 |

## 5. 本篇可带走的事实

- **动线顺序本身就是结论**：业务理解（P4）→ 范围与栈（P5）→ 骨架（P6）→ 再谈层内代码。跳过 P4 直接搭四层目录，是 CA 落地失败的头号路径。
- **骨架不产生架构**：目录只是承诺，方向约束要靠引用规则/门禁/测试来兑现。
- **本系列留下的两个坑**（无测试、不变式不入实体）在此处已埋下，后文只是把它们放大。
