# Clean Architecture 系列整理 · 总览与索引

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）
> 来源: dev.to 作者 mohamed Tayel 的 19 篇系列 **「Building Applications with ASP.NET Core Clean Architecture」**（2024-07 ~ 2024-10），原系列致谢 Pluralsight 作者 Gill Cleeren 的 ASP.NET Core Clean Architecture 课程；示例工程源码 github.com/mohamedtayel1980/clean-architecture
> 日期: 2026-10-21 | 取证方式: 19 篇经 dev.to 官方 API 逐篇抓取 `body_markdown` 原稿实读 + 评论 JSON 对拍；本仓对照部分以仓库目录实态为证
> 本文只作制定 plan 的**参考**，**不裁决、不写生产代码**；结论须经人二次核验后方可写入方案（`workflow.md` §3）
> 受众: **Agent 可参考（非依据）· 人主导判读**

---

## 1. 这套系列在讲什么

原作者以「GloboTicket 票务管理系统」为贯穿案例，从**概念→原则→需求→搭骨架→Domain 层→Application 层→Infrastructure/Persistence 层→API 层**逐篇推进，完整走了一遍教科书式的 Clean Architecture 落地（.NET 8 + EF Core + MediatR + AutoMapper + FluentValidation）。

它的价值不在于提出新理论（理论本体是 Robert C. Martin 的 Clean Architecture + DDD 战术模式 + CQRS），而在于：

1. **给出一条可复述的落地动线**——先讲清"为什么分层"，再一层面一层面地用具体包结构、具体代码把它垒起来；
2. **暴露了落地时反复出现的判断题**——仓储模式在 EF Core 下是否多余（P8）、Data Annotations 为何破坏持久化无知（P13）、API 层为什么该"薄到只剩 HTTP"（P19）；
3. **评论区的质量反馈**——与正文同等重要：六边形架构对照（P1）、圆形图与矩形图的差异（P1）、实体是否该含业务逻辑（P1）、横切关注点应走 middleware/AOP（P15）。这些质疑恰是 Clean Architecture 常被误用的位置。
4. **作为"教程文本不可信"的标本**——逐篇对拍后发现大量幽灵类型/从未安装的包/零兑现的迁移与测试承诺/行为级 bug（唯一性校验双重否定取反、历史过滤 no-op、CORS 任意源+凭证），详见各 part 文档判读与 [09](./09-critique-and-repo-mapping.md)。

## 2. 双轨索引

本目录两套读法，内容互不重复：

- **轨道 A（逐篇忠实对译，19 份 `part-NN-*.md`）**：与原文一一对应，严格按原文章节顺序逐段对译，**全部代码与图片照录**；判读以注记内嵌于对应章节；文末固定附「原文信息 → 整理注记小结 → 与本仓对照 → 评论区实录 → 英文全稿」。适合回原文核对、引用举证。
- **轨道 B（主题串读，9 份 `0N-*.md`）**：跨篇合并成一条学习动线（约当原文 2 篇合一），只留结构与决策点。适合快速通读。

### 轨道 A · 19 篇逐篇忠实对译

| # | 文档 | 原文标题（dev.to） | 发布 | 反应/评论 | 原图 |
| --- | --- | --- | --- | --- | --- |
| 1 | [part-01-what-is-clean-architecture.md](./part-01-what-is-clean-architecture.md) | Part 1: What is Clean Architecture? | 2024-07-03 | 415 / 19 | 1 |
| 2 | [part-02-design-principles.md](./part-02-design-principles.md) | Part 2: Design Principles in Software Development | 2024-07-03 | 90 / 4 | 0 |
| 3 | [part-03-architecture-comparison.md](./part-03-architecture-comparison.md) | Part 3: Comparing All-in-One / Layered / Clean Architecture | 2024-07-05 | 64 / 0 | 2 |
| 4 | [part-04-business-need-globoticket.md](./part-04-business-need-globoticket.md) | Clean Architecture P4: Aligning Application Setup with Business Needs | 2024-08-26 | 1 / 0 | 0 |
| 5 | [part-05-backend-and-tech-stack.md](./part-05-backend-and-tech-stack.md) | Clean Architecture P5: Establishing the Core Foundation | 2024-08-26 | 2 / 0 | 2 |
| 6 | [part-06-solution-skeleton.md](./part-06-solution-skeleton.md) | Part 6 - Structuring the Application Core with Visual Studio | 2024-08-26 | 1 / 0 | 5 |
| 7 | [part-07-domain-project.md](./part-07-domain-project.md) | Part 7 - Create Domain Project | 2024-08-26 | 5 / 0 | 8 |
| 8 | [part-08-application-design-rationale.md](./part-08-application-design-rationale.md) | Part 8 - Designing the Application Project | 2024-08-29 | 1 / 0 | 0 |
| 9 | [part-09-application-project-setup.md](./part-09-application-project-setup.md) | Part 9 - Setting Up the Application Project in Visual Studio | 2024-08-29 | 2 / 1 | 4 |
| 10 | [part-10-request-handler.md](./part-10-request-handler.md) | Part 10 - Writing the Application Logic in the Request Handler | 2024-09-03 | 3 / 0 | 10 |
| 11 | [part-11-feature-organization.md](./part-11-feature-organization.md) | Part 11 - Organizing the Code Using Features | 2024-09-05 | 2 / 0 | 4 |
| 12 | [part-12-commands-cud.md](./part-12-commands-cud.md) | Part 12 - Creating, Updating, and Deleting Entities Using Commands | 2024-09-05 | 1 / 0 | 0 |
| 13 | [part-13-fluent-validation.md](./part-13-fluent-validation.md) | Part 13 - Adding Validation Using Fluent Validation | 2024-09-05 | 1 / 0 | 0 |
| 14 | [part-14-di-registration.md](./part-14-di-registration.md) | Part 14 - last step in Application Core Layer | 2024-09-05 | 1 / 0 | 0 |
| 15 | [part-15-infrastructure-persistence-layers.md](./part-15-infrastructure-persistence-layers.md) | Part 15 - Understanding the Infrastructure and Persistence Layers | 2024-09-09 | 7 / 2 | 3 |
| 16 | [part-16-ef-core-persistence.md](./part-16-ef-core-persistence.md) | Part 16 - Adding Data Persistence with Entity Framework Core | 2024-09-11 | 2 / 0 | 2 |
| 17 | [part-17-csv-export-email.md](./part-17-csv-export-email.md) | Part 17 - Implementing the Infrastructure Layer with CSV Export and Email Service | 2024-09-12 | 3 / 0 | 7 |
| 18 | [part-18-api-layer.md](./part-18-api-layer.md) | Part 18 - Adding API | 2024-09-17 | 2 / 0 | 1 |
| 19 | [part-19-controllers.md](./part-19-controllers.md) | Part 19 - Add Controllers（**终篇**） | 2024-10-15 | 3 / 2 | 0 |

元数据口径：反应/评论为 2026-10-21 经 dev.to API 抓取时点值；原图计 49 张（`!\[\]` 实测），全部下载至 `./imges/`（原始 URL 保留在每处图片链接的 title 中）。流量断崖清晰可见：P1-P3 共 569 反应/23 评论，P4 起再未超过个位数反应。

### 轨道 B · 9 篇主题串读

| 文档 | 覆盖原文 | 主题 |
|---|---|---|
| [01-foundations-and-principles.md](./01-foundations-and-principles.md) | Part 1 / 2 / 3 | 定义、concentric circles、依赖规则、五大设计原则（DIP/SoC/SRP/DRY/PI）、三种架构形态对比 |
| [02-from-business-need-to-skeleton.md](./02-from-business-need-to-skeleton.md) | Part 4 / 5 / 6 | 需求勘察先行（干系人访谈→实体识别→线框图）、技术栈站队、Solution 骨架（src/test × api/core/infrastructure） |
| [03-domain-layer.md](./03-domain-layer.md) | Part 7 | Domain 项目落地：Entities + Common（AuditableEntity）、零依赖类库的纪律 |
| [04-application-layer-ports.md](./04-application-layer-ports.md) | Part 8 / 9 | Contracts（接口）+ Messaging 两大支柱、仓储模式的存废之辩、泛型 `IAsyncRepository<T>` 与专用仓储派生、目录组织 |
| [05-application-layer-cqrs.md](./05-application-layer-cqrs.md) | Part 10 / 11 / 12 | MediatR + AutoMapper 的请求处理器写法、Features 垂直切片组织法、Command（CUD）三段式 |
| [06-validation-and-di-composition.md](./06-validation-and-di-composition.md) | Part 13 / 14 | FluentValidation 取代 Data Annotations 的理由与写法、BaseResponse 契约、应用核心的集中式服务注册 |
| [07-infrastructure-and-persistence.md](./07-infrastructure-and-persistence.md) | Part 15 / 16 / 17 | Infrastructure 与 Persistence 的职责分界、DbContext/配置类/审计覆写/迁移、具体设施端口的外部服务实现（CSV 导出、邮件） |
| [08-api-layer.md](./08-api-layer.md) | Part 18 / 19 | API 作为组合根、扩展方法拆解 `Program.cs`、瘦控制器 + `IMediator.Send`、CORS/Swagger 装配 |
| [09-critique-and-repo-mapping.md](./09-critique-and-repo-mapping.md) | 全系列 + 评论区 | 批判性判读（12 处可疑/过时点）+ 与本仓（NestJS 垂直切片 + DDD + CQRS + MikroORM）逐项对照 |

## 3. 一句话总纲

Clean Architecture 的操作化定义可以压缩成三句话（本系列反复兑现的三条）：

- **依赖只指向内侧**：`api → application → domain`，`infrastructure` 实现 `application` 声明的端口，domain 谁都不依赖（P1 依赖规则 / P8 contracts / P17 端口实现分离）。
- **业务逻辑与"怎么存取、怎么传输"无关**：持久化无知（P2-PI）、框架无关（P1）、校验不进实体（P13）。
- **每个用例是一个可独立测试的垂直入口**：Query/Command + Handler 成对，按 Feature 聚类而非按技术类型平铺（P11）。

## 4. 与本仓的关系（指针）

本仓已是 Clean Architecture 的 NestJS 变体落地，**该系列是"印证材料 + 差异清单"，不是迁移蓝本**。详细逐项对照见 [09-critique-and-repo-mapping.md](./09-critique-and-repo-mapping.md)；架构宪法指针：

- 结构现状：[docs/specs/architecture.md](../../specs/architecture.md)（Clean Architecture 端口倒置）
- 重构方案史：[docs/plans/global-domain-context-refactor.md](../../plans/global-domain-context-refactor.md) · [docs/plans/global-entity-column-law.md](../../plans/global-entity-column-law.md)
- ORM/领域贴合：[../mikro-orm-ddd-feasibility.md](../mikro-orm-ddd-feasibility.md)
- 事件溯源路线：[docs/plans/event-sourcing-roadmap.md](../../plans/event-sourcing-roadmap.md)

## 5. 阅读顺序建议

1. 想快速校准概念 → 轨道 B 的 01；
2. 想知道"从零起一个 CA 工程怎么动手" → 轨道 B 02 → 03 → 04 → 05 → 06 → 07 → 08（原文动线的合并整理，保留每篇决策点与代码要点）；
3. 想引用原文某句话/某段代码作举证 → 轨道 A 对应 part 文档（含逐字英文全稿与评论区实录）；
4. 想在本仓做架构判断 → 直接 09（批判点 + 对照表），必要时回轨道 A 核对原文。

## 6. 整理口径说明

- **轨道 A 各篇统一结构**：`原文信息表（标题/链接/发布日期/反应/评论/标签/AI 披露状态/dev.to id/原图数）→ 逐段对译（严格按原文节次，代码与图片全量照录，判读以注记内嵌）→ 整理注记小结表 → 与本仓对照 → 评论区实录 → 附：原文英文全稿`；
- **英文全稿呈现口径**：附录为 dev.to 官方 API `body_markdown` 字段的逐字抓取，**不包代码围栏、直接按 Markdown 渲染**（保留作者原始标题层级/粗体/代码块），唯一加工是把图片链接改指 `./imges/` 本地副本（原始 URL 保留在链接 title 中）；
- 原文代码为 C#，对译时**保留 C# 原貌**（不擅自译成 TS，避免失真）；
- 一切"全系列从未 X"式论断均以对 19 份本地原稿 grep 实测为证；取不到证的观点（如素材源自 Pluralsight 课程、疑似未披露的 AI 辅助写作）在文中显式标注**推断/未验证**；
- 原文自身的时间线瑕疵（Part 2 标题误写 "Part 1"、P18 在 P19 发布前 3 分钟被回改等）记录于各 part 文档注记与 09 §「系列史实」。
