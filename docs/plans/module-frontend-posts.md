# 前端 B1 · Posts 参考业务面：apps/web 租户内游标列表 + 创建（已审·实施稿）

> 适用范围: `模块(apps/web · 前端 Posts 参考业务面)` | 受众: 人（审计/裁点）
> 关联: `global-frontend-adoption` §2.2（F2→F3 串行） · `module-frontend-tenant-console`（F2a/F2b） · `module-frontend-rbac-admin`（F3·本片续接） · `specs/vision.md` §4 第 7 支柱「人的界面」 · `specs/tooling-standards.md` §4.12
> 性质: 首版（续 F3 择下一片·不改已批措辞）
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**起因·续 F3 择片的对拍再校（2026-10-18 代码取证）**：F3（RBAC）落地后，剩余「未消费前端面」经取证逐个证伪其体量：A4 订阅面**实际只剩 1 个未消费 op**（`GET /subscriptions` 列表根本不存在·仅 `/current` 已消费），且 `POST /subscriptions` guarded by `@Can('update','Organization')` + **无支付通道即 503**——1 op 且多数环境跑不绿，不值一个审计门。故据证据改裁 **B1 Posts**：posts 是 `posts.controller.ts` 注释自认的「**模板 future business features copy 它**」参考资源，且用**游标分页**（前端此前仅消费 offset·游标为新模式），provider 无关、可 demo、自洽成垂直切片。

**Posts 面勘察实据（代码实存）**：

- 后端 `PostsController`（`apps/api/src/modules/posts/api/posts.controller.ts`）**仅 2 op**·`@UseGuards(TenantScopeGuard)`（无活跃租户 403）：
  - `GET /posts`（`ListCursorDto{limit?=20 (1..100), cursor?}`）→ `CursorPage<PostReadModel>` = `ApiEnvelope & { data?: { items: PostResponse[], hasMore: boolean, nextCursor?: string } }`（`CursorPage` 无 `meta` 键 → 拦截器不提升，取 `data.data`）。
  - `POST /posts`（`CreatePostDto{title, content?, published?}`）→ `PostResponse`。
  - **无 PATCH/DELETE**——呈「B1 Posts 全套 GET/POST/PATCH/DELETE」系基线漂移虚项，本片诚实只做 list+create（未做改删是后端未暴露，非前端漏做）。
- 全 2 op 已在 `packages/api-client/src/schema.d.ts` typed（`PostResponse` L1028 / `PostCursorPageResponse` L1043 / `CreatePostDto` L1050 / paths `/api/v1/posts` L316）→ **后端零改动**。
- 可复用基建（F2/F3 已趟通·均随 F3 入库）：`lib/api.ts`・`lib/mutation.ts`（`useAction`·成功 `router.invalidate()`）・`lib/session.ts`（`requireSession` deny-by-default）・`lib/format.ts`（`describeApiError`）・`lib/log.ts`（`logApiError`）・`components/{forms,panels}.tsx`・raw Tailwind 无整库・无 react-query。

**目标**：租户用户可在 web 上**看见并新建**本租户 posts（游标「加载更多」+ 创建表单），全程经 `@saas/api-client` typed 消费，deny-by-default 与后端租户边界同向。

**非目标**：不做 posts 编辑/删除（后端无 op·如需另开后端 plan 补 PATCH/DELETE 独立审计）；不做平台运营面（D 面·另片）；不做 storage/payment/订阅变更/租户申请（各另片）；不改后端运行时/schema/迁移；不引整组件库。

## 2. 方案

### 2.1 切片策略

单片全包（列表 + 创建·裁点①甲）：二者共享同一 typed 资源与路由，体量 1 页 + 1 测 ~250 行，一个审计窗口可吃完。

### 2.2 路由与页

| 路由 | 功能 | 消费 op | 形态 |
|---|---|---|---|
| `/posts`（`posts.tsx`） | posts 列表 + 游标加载更多 + 新建 | GET posts·POST posts | 表格（标题·摘要·状态徽标·创建时间）+「加载更多」+ 顶部创建表单 |

- loader 首行 `requireSession()`（deny-by-default）→ 取首页 `GET posts?limit=20`。
- 导航：`__root.tsx` 顶栏加「文章」Link（与既有 Workspaces/成员/角色权限 同排）。

### 2.3 数据流（复用既有基建 + 游标增量）

- 读侧首页：router loader → `api.GET('/api/v1/posts',{params:{query:{limit:20}}})` → 取 `data?.data`（`{items,hasMore,nextCursor?}`）。
- 游标「加载更多」：**无 react-query → 本地 `useState` 累积**。首屏 `items` 由 loader 灌；按钮（`hasMore && cursor` 才显）触发 `api.GET(...,{query:{limit,cursor}})` → append `items`·更新 `cursor/hasMore`·`loadingMore` 灰态防连点。
- 写侧创建：`useAction.run` → thunk `api.POST('/api/v1/posts',{body:{title,content:content||undefined,published}})` → 成功 `router.invalidate()` 重跑 loader·`firstPage` 换新引用 → `useEffect([firstPage])` 把游标态重置回首屏（新建置顶可见·见 §Assumptions「创建后整表回首页可接受」）·失败 `describeApiError` + `logApiError`。
- 契约单源：`Post` 类型取 `components['schemas']['PostResponse']`；`PostsView` 导出纯展示供测。

### 2.4 待裁点（本稿附推荐档·呈审时逐条裁·未裁不动）

- **① 范围切法**：甲 = 单片全包（列表+创建·推荐）；乙 = 拆两片。
- **② 路由位置**：甲 = 顶层 `/posts`（参考业务资源·非租户设置·推荐）；乙 = `/settings/posts`。
- **③ 翻页交互**：甲 = 「加载更多」append（游标语义天然增量·推荐）；乙 = 页码替换。
- **④ limit**：甲 = 20（后端默认·推荐）。
- **⑤ published 呈现**：甲 = 列表状态徽标 + 创建可勾选（推荐）；乙 = 列表不显。
- **⑥ 改/删**：甲 = 本片不做（后端无 op·推荐）；乙 = 另开后端 plan 补 PATCH/DELETE。

## 3. 影响面与风险

- **blast radius**：仅 `apps/web/src`——新增 `routes/posts.tsx`（+ `routes/posts.test.tsx`）+ `routeTree.gen.ts`（插件自动重生·加 `/posts`）+ `__root.tsx` 导航加一行 Link。**不改**后端运行时/schema/迁移/Dockerfile/compose/husky/commitlint/docs/specs。
- **命中高危清单**：无（前端模块面·非宪法/非门禁/非 schema）。
- **主要风险**：① 游标态与 invalidate 的重置时序——用 `useEffect([firstPage])` 在 loader 数据换引用时回首页，避免创建后 `items` 停留在旧累积；② 新租户首屏 posts 空 → 走空态（非缺陷）。
- **回滚**：全可逆——删 2 新文件 + 还原 `routeTree.gen.ts`/`__root.tsx` 即净；后端与 api-client 制品零触动。

## 4. 审计记录

> 无已审方案不写码。跨前后端消费面 → 人签核。

- 结论：**已审计·放行**——人经 CreatePlan 批准本方案（2026-10-18），即刻实施。待裁点①–⑥ **按方案内推荐档（甲）全采**；诚实标注：批准为整体「同意」，非 §2.4 逐条 AskUserQuestion 单独裁（若需逐条重裁，撤回本行按未裁处理）。
- 未决项：无（改/删按裁⑥甲排除本片外·如需另开后端 plan；平台面 D 维持另片）。
- 审计人 / 日期：人 / 2026-10-18。

## 5. 完成判据（可核验 + 穷尽）

- [x] §2.4 待裁点按推荐档获人批准（CreatePlan 整体同意·2026-10-18）
- [x] `/posts` typed 游标列表（首屏 loader +「加载更多」本地累积·`hasMore && cursor` 才显按钮）落地
- [x] `/posts` 创建表单（title/content/published）→ `POST /posts`·成功 invalidate 重载·失败 describeApiError 反馈
- [x] 组件测覆盖：`posts.test.tsx`（PostsView typed 渲染 / content=null 摘要占位 / 空态 / 缺省 undefined）= **+4 测**
- [x] `pnpm run ci` L1 全绿（Biome 净·**567 → 571 passed / 31 skip / 100+9 files** 基线只增不减·fallow 无越界）
- [x] 后端零改动（`git status` 无 `apps/api`·`libs/core`·`packages`·`openapi` 变更）·契约锁测仍绿
- [ ] dev 反代真跑端到端（起 DB+后端+登录态·列表→加载更多→创建刷新·**归人类验收执行**·非 DB-free 组件测所能覆盖·操作手册见 [docs/frontend-dev-proxy-runbook.md](../../frontend-dev-proxy-runbook.md)）
- [ ] 提交（高危归人·Agent 未自 commit·建议见交付说明）
- [ ] 人类验收

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-18 | 0.1.0 | 续 F3 择下一片：A4 订阅面经取证证伪（仅剩 1 op·provider 503 脆）→ 据证据改裁自洽可 demo 的 B1 Posts → 起草呈审 | 首版呈审：后端 2 op typed 实据（无 PATCH/DELETE 坐实虚项）+ 游标前端首消费设计 + 六待裁点 |
| 2026-10-18 | 0.2.0 | 人 CreatePlan 批准（推荐档全采）→ 即刻实施 | 落 B1 全片：posts.tsx（loader+游标加载更多+创建表单+PostsView）+ posts.test.tsx + __root 导航 + routeTree 重生；L1 567→571 绿；§4 翻「已审计·放行」（诚实标注整体同意非逐条裁）。 |

---

<!-- 变更戳 -->
正文已于 2026-10-18 / v0.2.0 更新（**B1 已实施·待人类验收**——typed 接线+游标列表+创建表单+4 测落·L1 571/31 只增不减·后端/契约制品零触动；dev 反代真跑 + 提交 + 人类验收待下环）；发现登 §6 不入正文。
