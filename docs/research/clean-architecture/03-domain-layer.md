# 03 · Domain 层落地：一个零依赖类库

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）

> 覆盖原文: Part 7（2024-08-26）

| 篇 | 原标题 | 链接 |
|---|---|---|
| P7 | What is Clean Architecture: Part 7 - Create Domain Project | https://dev.to/moh_moh701/clean-architecture-p7create-domain-project-eca |

---

## 1. 核心论点

按 P4 规划好的领域，创建 **Domain 项目**承载核心实体。作者的三条纪律表述得很清楚：

1. Domain 归属 **Core** 侧（与 Application 同区），不属 Infrastructure；
2. Domain 里放"定义应用业务逻辑的核心实体"；
3. **保持领域独立于外部依赖**（数据访问、UI 框架一概不进这个项目）。

## 2. 操作步骤（原文动线）

1. 在 Solution Explorer 里右键 `Core` 文件夹 → Add → New Project → 搜 "Class Library"（C# 版）→ 命名 `GloboTicket.TicketManagement.Domain`。
2. 删掉模板生成的 `Class1.cs`。
3. 建两个文件夹：
   - `Entities`：放 `Event`、`Category`、`Order`；
   - `Common`：放其他实体要继承的公共类，如 `AuditableEntity`。
4. 写实体（见下），并让三个实体都继承 `AuditableEntity`。

## 3. 关键代码（原文原貌）

初版实体（不继承前）：

```csharp
public class Category
{
    public Guid CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public ICollection<Event>? Events { get; set; }
}

public class Event
{
    public Guid EventId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Price { get; set; }
    public string? Artist { get; set; }
    public DateTime Date { get; set; }
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    public Guid CategoryId { get; set; }
    public Category Category { get; set; } = default!;
}

public class Order
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public int OrderTotal { get; set; }
    public DateTime OrderPlaced { get; set; }
    public bool OrderPaid { get; set; }
}
```

公共审计基类（`Common/AuditableEntity.cs`）：

```csharp
public class AuditableEntity
{
    public string? CreatedBy { get; set; }
    public DateTime CreatedDate { get; set; }
    public string? LastModifiedBy { get; set; }
    public DateTime? LastModifiedDate { get; set; }
}
```

继承后的形态（原文以 Category 为例）：

```csharp
public class Category : AuditableEntity
{
    public Guid CategoryId { get; set; }
    public string Name { get; set; } = string.Empty;
    public ICollection<Event>? Events { get; set; }
}
```

作者给继承的理由：**方便追踪"谁创建/谁修改了记录"**（CreatedBy/CreatedDate/LastModifiedBy/LastModifiedDate 四个字段由 P16 的 `SaveChangesAsync` 覆写自动填充）。

结论句：*"这样我们就搭好了核心领域项目，后续可扩展更多业务逻辑并连接基础设施与 UI 层。保持 domain 项目干净专注，应用才可维护、可扩展。"*

## 4. 判读：这一层实际做对了什么、没做什么

**做对的（值得照搬的纪律）**：

- Domain 项目**零 NuGet 依赖、零项目引用**（原文全程没给 Domain 加任何包/引用）——这就是"最内层不认外层"的物理体现。
- 关系表达放在实体上（`Category.Events` 集合 + `Event.Category` 导航属性 + `CategoryId` 外键），但**不写任何映射特性**（无 `[Key]`/`[ForeignKey]`/`[MaxLength]`），映射留给 P16 的 `IEntityTypeConfiguration<T>`。这与 P2 的 Persistence Ignorance 自洽。
- 审计字段抽到基类，一处声明、全部实体受益。

**没做的（与 P1 自述的落差）**：

1. **无行为、无不变式**：三个实体是纯数据袋（anemic model）。P4 提炼的规则（活动名+日期唯一、名称 ≤50、日期须未来）**一条都没进实体**，全部外置到 P13 校验器与 P16 仓储方法。作者 P1 声称"Entities 通常是含业务规则的富领域对象"，实操与之相反（详见 [01 §4-5](./01-foundations-and-principles.md)）。
2. **无聚合边界**：`Event` 与 `Category` 双向可达，`Order` 与 `Event` 之间甚至没有建模关系（P4 提到的"按活动看销售"在实体层没有支撑，Order 只有 `UserId`）；没有聚合根、没有不变式守护点，因此也没有"只能通过聚合根修改"的约束。
3. **无值对象**：`Price` 是 `int`（P4 说"价格必填且大于 0"，类型层无保护）、日期是裸 `DateTime`。DDD 战术模式（VO/聚合/领域事件）一概缺席。
4. **`AuditableEntity` 作为继承基类是权衡而非免费午餐**：它把"审计"这一基础设施关注点写进了领域模型形状里（每个实体白得四个字段），另一派做法（本仓与许多 DDD 实现）是把审计列交给 ORM 层/数据库触发器/事件元数据。原文选了继承，代价是领域模型被横切关注点污染一点，收益是简单可见。
5. **`Order` 只以 `UserId`（GUID）指代购买者**——用户/身份建模原文从未展开（无 User 实体、无身份模块），属遗留空白：后续各篇里 `Order` 再未被写过，P4 承诺的"按月份看销售"界面也没实现，只在 P17 以活动 CSV 导出替代。

> 结论：P7 交付的是**"CA 最小可用版 Domain"**——目录干净、依赖为零、形状由需求对话得出，但仅此而已。把它当 DDD 的领域层来读会高估它；把它当"分层的内层怎么不起依赖"的示范来读是准确的。

## 5. 与本仓对照

| P7 的做法 | 本仓实态 | 差异判断 |
|---|---|---|
| Domain 是零依赖类库 | `apps/api/src/modules/<ctx>/domain/` + `libs/core/src/modules/<ctx>`（跨上下文共享的领域层：subscriptions/tenants/workspaces）；`libs/core/src/shared-kernel/domain` 提供基类与 `AggregateRoot.recordEvent/pullDomainEvents`（"record then pull"） | 本仓领域层**有共享内核依赖**（这是有意的：跨上下文契约与聚合根协议），比 P7 的"绝对零依赖"更现实 |
| 实体 = POCO + 审计基类继承 | 本仓实体走**零装饰器 + `defineEntity`（Mikro）+ 列元数据单一源**（`database/mikro/four-tables.ts` 工厂，见 [global-entity-column-law](../../plans/global-entity-column-law.md)），审计/时间戳由持久层机制处理 | 本仓把"列形状"与"领域形状"分层治理，避免 P7 那种字段散落 |
| 无聚合、无不变式 | 本仓明确要求聚合根与领域事件派发点，领域规则内聚（`domain/` 目录存在的首要理由） | 本仓路线是 Rich Domain，与 P7 相反 |
| 关系靠导航属性双向声明 | 本仓仓储 port 不暴露 `tenantId`，租户隔离在 adapter 侧从 ALS 注入（S2 卡点决策） | 跨租户约束在 P7 完全不存在（无多租户概念） |
| 无领域事件 | 本仓 ES 路线已有 roadmap（[event-sourcing-roadmap](../../plans/event-sourcing-roadmap.md)），事件是上下文间通信的唯一通道 | 本仓比 P7 多一整层机制 |

## 6. 本篇可带走的事实

- **Domain 层的硬指标只有一个**：不引用任何外层、不引任何基础设施包。P7 做到了，这一条可直接沿用作检查项。
- 其余（审计基类、导航属性、POCO 还是富模型）都是**可辩论的实现选择**，不是 CA 的要求。
- 若照 P7 的样子建 Domain 就以为得到了 DDD，是本系列最容易误导的地方——**分层的 Domain ≠ 领域建模**。
