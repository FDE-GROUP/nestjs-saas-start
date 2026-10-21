# FC 投影镜射宪法固化 + posts 参考实现 FC 化

> 适用范围: `模块(posts)` + `全局(修宪·投影镜射教义)` ← 代码落点仅 posts 单上下文；教义入宪为全局核心原则
> 关联: `specs/architecture.md`（Projection-Mapping Doctrine + Entity Doctrine 校正 · 中英双份）· `specs/architecture-zh.md` · 承 [module-posts-domain-entity-split.md](./module-posts-domain-entity-split.md)
> 性质: 重写型（把「领域函数内核以投影镜射保证 领域实体≡数据实体≡数据表 一致性」立为核心原则；posts 领域实体由可变行为盒改不可变 + 纯转移 + 编译期类型锁）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

本会话辨析确立：**典型 DDD 聚合根天生破坏「领域态 ≡ 数据实体 ≡ 单表」的严格 1:1**——对象图、值对象、存储专用列（乐观锁 `version`/FK/discriminator）、子实体局部身份都会把领域态与表形状拉开。上一轮（module-posts-domain-entity-split）落地 posts 样板时，把领域实体写成「behavior + invariants + lifecycle」的**可变行为盒**（`publish()` 就地改 `this._published`），与宪法 P1「纯函数 + 不可变数据·函数而非实体类」相抵，埋下一处宪法内部自相矛盾。

目标：
1. 把 **「领域函数内核以投影镜射三件套保证一致性」** 固化为宪法核心原则——一致性目标由**等式**降为**投影** `domain-state ⊆ (data-entity ≡ table)`，三件套强制 = ① `data-entity ≡ table`（`migration:generate` diff + schema/元数据一致性 e2e + 实体列定律守卫·已在位）② 纯全函数 mapper `fromRow` ③ `PostState ⇄ PostEntity` 编译期结构锁（落 `infrastructure/`）；存储专用列走白名单。
2. 同步校正旧 Entity Doctrine 的可变措辞为 FC 口径，消除宪法自打。
3. 让 `posts` 参考实现名实相符：领域实体 FC 化（不可变 + `withX` 纯转移）+ 落地类型锁与纯 mapper，机械证明该原则。

**非目标**：不动幻影（L38 `AggregateRoot` 不实声明、`post.entity.ts`/`migration-entities.ts`/`table-ownership.ts`/`ba-identity.entities.ts` 等仍称「对齐 schema.ts」的陈旧注释——`schema.ts` 已随 Drizzle 删除，本窗按范围 B 保留原样，另立专案）·不推广其余 6 持久化上下文（待跟进）·不引入 `AggregateRoot` 基类 / 不改事件发布机制（仍 P3 从 service/handler 发）·零外部 HTTP 行为变化。

## 2. 方案

- **垂直切片**（单上下文穿透四层·零外部 HTTP 行为变化）：
  1. 切片 0（修宪·文档）—— `architecture.md` 核心原则区紧邻 P1 新增 **Projection-Mapping Doctrine** 条目；校正 Entity Doctrine L140 段「rich/behavior+lifecycle」→「不可变数据载体 + 构造期不变量 + 纯转移函数」并补一致性指针；L158 tenant 段指针同步。`architecture-zh.md` 镜像。
  2. 切片 1（留痕）—— 本方案文档 + README 状态行。
  3. 切片 2（domain·FC 化）—— `domain/entities/post.ts`：全字段 `private readonly`（补 `_published`）；删可变 `publish()/unpublish()`，改 `withPublished()/withUnpublished()` 返回新实例（经 `private cloneWith`）；头注措辞对齐 FC。`draft`/`restore`/getter 不变。
  4. 切片 3（application·调用点）—— `create-post.command-handler.ts` 改不可变重绑定：`const post = command.published ? draft.withPublished() : draft`（`draft` 缺省未发布，行为逐字不变）。
  5. 切片 4（infrastructure·单点映射 + 锁）—— 新建 `infrastructure/repositories/post-mapping.ts`：抽 `toPostDomain(entity: PostEntity): Post`（纯 `fromRow`）+ 双向赋值锁 `_domainToData: PostEntity = {} as PostState` / `_dataToDomain: PostState = {} as PostEntity`（导出的 `__postStateMatchesEntity`/`__entityMatchesPostState` 防「未使用」·build tsc 强制）；适配器 `mikro-post.repository.ts` 删本地 `toDomain`、`list/findById/create` 改调 `toPostDomain`，隔离谓词/fail-closed/游标/ALS 盖章逐行不动。
  6. 切片 5（测试）—— `post.test.ts` 可变断言改不可变（`withPublished` 返新实例·原实例不变·幂等）；关联 handler/仓储测验证。
- 单上下文小重构，不走 expand–contract（无并存期）。

## 3. 影响面与风险

- **blast radius**：posts 目录（domain 实体 + application handler + infrastructure 适配器/新建 post-mapping）+ `docs/specs`（中英）+ 本留痕 + README。零 DDL·零迁移·零契约面。
- **可逆性**：可逆（纯代码/文档）。
- **高危命中**：改 `docs/specs` 宪法（高危#5）——经人签核（本窗明确指示固化 + 范围 B 裁定）。**不命中** DB 迁移/删依赖/改门禁/DI 形态（token 不变）。
- **不变量**：类型锁**必须落 infrastructure**（`domain/` 绝不 import `infrastructure/`·否则依赖倒置违宪）；`PostState` 与 `PostEntity` 字段今日同构→锁即刻编译通过；HTTP 面对拍逐字节不变；`postViewSchema`/`postCursorPageSchema`↔`PostReadModel` 双向锁仍绿；领域实体不出现在 `api/`；表名 `post`/元数据名 `Post` 不改。
- **回滚**：`git revert` 即可。

## 4. 审计记录

> 无已审方案不写码。

- 结论：经会话辨析（聚合根破 1:1 → FC 投影镜射为解）+ AskUserQuestion 范围裁定=**B**（宪法文档 + posts 代码级 FC 化·不动幻影）。计划经用户批准。
- 未决项：幻影清理（L38 `AggregateRoot` + `schema.ts` 陈旧注释）另立专案；其余 6 上下文各自切片。
- 审计人 / 日期：人（用户）2026-10-21

## 5. 完成判据（可核验 + 穷尽）

- [ ] `architecture.md`/`architecture-zh.md` 新增 Projection-Mapping Doctrine 且旧 Entity Doctrine 可变措辞已校正为 FC 口径（二者不再自相矛盾）
- [ ] `domain/entities/post.ts` 不可变（全 `readonly`·`withPublished/withUnpublished` 返新实例·零框架 import）
- [ ] `post-mapping.ts` 落 `infrastructure/`·类型锁 `PostState ⇄ PostEntity` 双向绿·`domain/` 零 `infrastructure` import
- [ ] create handler 行为等价·`api/` 传输仍走 `PostReadModel`·领域实体不越界
- [ ] `pnpm run check` → `pnpm run build`（TSC 零新增错·类型锁在此验）→ `pnpm run test` 全绿
- [ ] e2e 按 env-gated（无库跳过·文件名/GATED 登记不变）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 起草（承 posts 样板·FC 投影镜射固化） | 首版 |
