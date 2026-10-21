# posts 领域实体与数据实体分离（充血样板 + 修宪）

> 适用范围: `模块(posts)` + `全局(修宪·实体教义)` ← 代码落点仅 posts 单上下文；教义入宪为全局规范
> 关联: `specs/architecture.md`（Entity Doctrine · L42/L129/L141 · 中英双份）· `specs/architecture-zh.md`
> 性质: 重写型（posts 数据面由「贫血·端口返回裸记录」改「充血领域实体 ↔ 独立数据实体 ↔ 映射器」）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

Clean Architecture 锥体的 Entities 层在本仓此前**没有物化**：所有上下文只有一份
住 `infrastructure/entities/` 的 MikroORM 数据实体，领域层仅有端口 + 值对象 + 策略，层间
用端口裸记录（如 `PostRecord`）流动——贫血。目标：以 posts 为参考样板建立**充血领域实体**
（`domain/entities/Post`：工厂 + 不变量 + 生命周期），与**物理数据实体**（`PostEntity`）分离，
仓储适配器双向映射；并把「持久化上下文须分离领域实体与数据实体」立为宪法教义。

**非目标**：不新增生命周期端点（如 `POST /posts/:id/publish`）·不给 posts 引领域事件/ES
（聚合事件管道 S1 已移除）·本轮不改其余 7 个持久化上下文（宪法标注「待跟进」）。

## 2. 方案

- **垂直切片**（单上下文穿透四层·零外部 HTTP 行为变化）：
  1. 切片 0（修宪）—— architecture.md/zh 加「Entity Doctrine」段 + L141 指针；状态单源登记。
  2. 切片 1（domain）—— 新建 `domain/entities/post.ts`：`Post.draft()`（title 不变量·对齐
     `createPostSchema.title`=`reqString`=非空串，只防御不收紧）/`Post.restore()`（复原不重复校验）/
     `publish()`/`unpublish()`；getter 只读；零框架 import。
  3. 切片 2（数据实体改名）—— `Post` → `PostEntity`（`defineEntity` 的 `name:'Post'`/`tableName:'post'`
     不变）；同步引用点 `sys-entities.ts`/`seed.ts`/`mikro-post.repository.ts`(+test)/e2e。
  4. 切片 3（端口+适配器）—— `PostRepository` 三方法流动 `Post`、删 `PostRecord`；`MikroPostRepository`
     `toDomain`/`fromDomain` 双向映射，谓词/fail-closed/keyset 游标逐行不动。
  5. 切片 4（application）—— `PostReadModel` 改显式传输接口；create handler 经 `Post.draft()`+
     （published 时）`publish()`→`repository.create(post)`→`toReadModel`；list handler 映射 `Post`→
     `PostReadModel`（不再裸 cast）。
  6. 切片 5（测试）—— 新增领域实体纯测；改仓储/handler 测；e2e 仅改名 + 读 getter（文件名/GATED 登记不变）。
- 单上下文小重构，不走 expand–contract（无并存期）。

## 3. 影响面与风险

- **blast radius**：posts 目录 + `database/{mikro/sys-entities,seed}`（改名 4 处）+ 契约词汇对拍不受影响。
- **可逆性**：可逆（纯代码/文档·零 DDL·零迁移）。
- **高危命中**：改 `docs/specs` 宪法（高危#5）——经人签核（本窗授权同步修宪）。**不命中** DB 迁移/删依赖/改门禁/DI 形态（token 不变）。
- **不变量**：HTTP 面对拍（`POST/GET /posts` 请求·响应·错误码·游标逐字节不变）；`postViewSchema`/`postCursorPageSchema`↔`PostReadModel` 双向锁仍绿；领域实体不出现在 `api/`；表名 `post`/元数据名 `Post`/`migration-entities.ts`/`entity-column-law.ts` 均不改；`POST_REPOSITORY` token 不变。
- **回滚**：`git revert` 即可（无 schema/无外部产物）。

## 4. 审计记录

> 无已审方案不写码。

- 结论：经 AskUserQuestion 三裁——落点=先 posts 单上下文样板·丰富度=充血实体·修宪=授权同步。计划经用户批准。
- 未决项：其余 7 上下文各自另立切片；是否补真实生命周期端点（本窗取「HTTP 面冻结」）。
- 审计人 / 日期：人（用户）2026-10-21

## 5. 完成判据（可核验 + 穷尽）

- [ ] 领域实体 `Post` 落地且 `domain/entities/post.ts` 零 `@nestjs`/`@mikro-orm`/HTTP import
- [ ] 数据实体改名 `PostEntity` 全引用点对齐·元数据名/表名不变
- [ ] 端口流动领域实体·适配器双向映射·隔离谓词/fail-closed/游标逐行不动
- [ ] `api/` 传输仍走 `PostReadModel`·领域实体不越界
- [ ] `pnpm run check` → `pnpm run build`（TSC 零新增错）→ `pnpm run test`（posts 全链 + 契约词汇对拍）全绿
- [ ] e2e 按 env-gated（无库跳过·登记不变）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 起草（承 CA 锥体对齐·posts 样板） | 首版 |
