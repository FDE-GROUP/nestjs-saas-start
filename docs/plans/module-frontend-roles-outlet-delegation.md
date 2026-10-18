# settings.roles 补 Outlet 委托，激活权限矩阵子页（$roleKey）

> 适用范围: `模块(apps/web)` — 单文件行为改动（新激活一个先前不渲染的页面）
> 关联: `module-frontend-rbac-admin`（§2.2·A2 权限矩阵页交付）· `module-frontend-platform`（同仓 `platform.tenants` 已正确 Outlet 委托·范式对标）· `module-frontend-test-completion` §2-3（本缺陷由该切片实证拓出）· `specs/tooling-standards.md` §4.12（前端）· `AGENTS.md` §2（改路由行为须人签核）
> 性质: 重写型（首版起草）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

前端测试完备性切片 A 盘点 L2 loader 分支时，`settings.roles.$roleKey`（权限矩阵页）经**代码 + 实跑双证**确认为运行时功能缺陷：

- **代码实据**：`apps/web/src/routeTree.gen.ts` L101 明列 `$roleKey` 的 `getParentRoute: () => SettingsRolesRoute`（真父子）；`settings.roles.tsx` 的 `RolesPage` 组件全树 `grep Outlet = 0`（无 `<Outlet/>`）。
- **实跑取证**（内存路由探针·导航 `/settings/roles/admin`）：仅渲染父页三个 h1 `[角色 / 新建自定义角色 / 操作]`，子页 h1「权限矩阵」**不挂载**。

**后果**：`RolesPage` 行内 `<Link to="/settings/roles/$roleKey">权限矩阵</Link>`（L137）与深链 `/settings/roles/{key}` 均**回退显示角色列表**，`RbacMatrix` 授权矩阵页永远打不开。这是前端 F3 `module-frontend-rbac-admin` 的核心交付在运行时不可达。

**为何既有测试没抓到**：`rbac-matrix.test.tsx` 测纯展示基元、`settings.roles.test.tsx` 测列表 `RolesView` 基元，**均绕开 router 挂载**，从未覆盖「父子嵌套渲染」这条断链（正是切片 A 拓出的价值）。

**全仓唯此一处孤例**：对照 `platform.tenants.tsx` L54 已正确 `if (matchRoute({ to: '/platform/tenants/$id' })) return <Outlet />;` 委托；`workspaces`/`posts` 无子路由，不需要 Outlet。当初「嵌套子路由 Outlet 委托」纠偏只落 tenants、漏 roles。

**目标**：`settings.roles` 命中子路由时委托 `<Outlet/>` 渲染 `$roleKey`，使权限矩阵页可达。

**非目标**：不改 `platform.tenants`（已正确）；不动 `$roleKey` 页自身 loader/组件逻辑；不引新工具。

## 2. 方案

### 切片 A —— Outlet 委托（单文件·镜像 platform.tenants 既有范式）

1. `settings.roles.tsx`：`import { Outlet, useMatchRoute }`；`RolesPage` 内取 `const matchRoute = useMatchRoute();`，在读取 `result`（loader 数据）后、渲染列表前，加**命中子路由即委托**分支：
   ```tsx
   if (matchRoute({ to: '/settings/roles/$roleKey' })) return <Outlet />;
   ```
   位置与 `platform.tenants.tsx` L54 一致（早于 error/ok 分支前返回，避免子路由命中时父页仍算列表内容）。完成判据：见 §5。

### 切片 B —— 回归锁（同片顺带·可选）

2. `settings.roles.test.tsx`（或新建）补一条**真父子挂载**断言：memory-router 导航 `/settings/roles/{key}`，断言子页 h1「权限矩阵」出现（切片 A 探针手法的在册化）。此项依赖 mock `api.GET('/api/v1/tenants/roles')` 返回含目标 roleKey 的行 + `requireSession`，与切片 A 已验证的 `vi.mock` 范式一致。

## 3. 影响面与风险

- **blast radius / 可逆性**：单文件（+ 可选 1 测试文件）·可逆·零 schema·零后端·零门禁。**但属行为改动**（激活先前 dead 的路由面）→ 命中 `AGENTS.md` §2「改路由行为须人签核」→ **审计门强制·不自行实施**。
- **风险**：子页 loader 依赖 `roleKey` 存在于 `/roles` 列表（不存在→`notFound`·`settings.roles.$roleKey.tsx` L32）；委托仅改渲染归属，不改数据契约。`matchRoute` 命中判据须用完整路径 `/settings/roles/$roleKey`（与 routeTree 一致）。
- **回滚**：单文件 revert 即恢复原「回退到列表」现状（等于承认缺陷保留）。

## 4. 审计记录

> 无已审方案不写码。行为改动 → 人签核。

- 结论：**待审**。建议：切片 A 一行委托 + 切片 B 回归锁一并放行（改动极小·范式已在本仓 `platform.tenants` 验证）。
- 未决项（请裁）：
  1. 是否同片补切片 B 真父子挂载回归测试（防再次退化），或仅修渲染。
  2. `$roleKey` 命中时父页 loader（`settings.roles` 的 `GET /roles`）会与子页 loader 各跑一次 `GET /roles`——是否接受双取（列表 loader 与矩阵 loader 独立），抑或本阶段只修可达性、去重缓行。
- 审计人 / 日期：______

## 5. 完成判据（可核验 + 穷尽）

- [ ] `settings.roles.tsx` `RolesPage` 命中 `/settings/roles/$roleKey` 时 `return <Outlet />`；列表路由自身渲染不变。
- [ ] 内存路由探针（或切片 B 在册测试）：导航 `/settings/roles/{key}` → 子页 h1「权限矩阵」出现（缺陷反证转正证）。
- [ ] `pnpm run ci` 全绿·web 测试数只增不减·Biome 净·`tsc --noEmit` 0 issue。
- [ ] `platform.tenants`/后端/契约制品零触动。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：settings.roles 缺 Outlet 致 $roleKey 权限矩阵页不渲染——代码+实跑双证·单文件委托修复方案 |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.1.0 变更，以当前正文内容为准。
