> 用途: **已审方案（开发依据）** | 状态: 已实施 v0.3.0 | 受众: 人（审计门）+ Agent
> 适用范围: `局部（apps/web · settings 租户边界管理页）`（blast radius 小·**前端零后端改动**·不触 §2 高危）| 关联: module-frontend-tenant-bootstrap-activation（A 片·切换引导先例）· module-frontend-tenant-onboarding（零组织申请面板）· module-rbac-casl（`/tenants/roles` 门面）· common 错误契约（`errorCode` 判别）
> 定位: 实机日志坐实：零租户成员账号进 `/settings/{roles,members,invitations}` 得 403 `TENANCY:NO_ACTIVE_CONTEXT`，前端仅 `ErrorPanel` 展示后端原文（`No active tenant context（TENANCY:NO_ACTIVE_CONTEXT）`）——语义正确但**无路可走**（用户不知下一步）。本片把死胡同 403 升级为可操作引导。

## 0. 一句话

租户边界管理三页（角色/成员/邀请）的 loader 错误分支识别 `TENANCY:NO_ACTIVE_CONTEXT`，改渲共享引导面板：**零组织→去首页申请入组；有组织未激活→去首页「我的租户」切换**——复用 A 片/onboarding 片既有出路语义，后端零改动。

## 1. 现状取证（代码实证）

- **403 来源（设计非缺陷）**：`TenantPermissionGuard` 对无活跃租户上下文统一 fail-closed 403 `TENANCY:NO_ACTIVE_CONTEXT`（实机日志存照：`GET /tenants → 200 data:[]` 后 invitations/members/roles 三连 403）。
- **判别基建已在**：`apps/web/src/lib/format.ts` `describeApiError` 经 `@saas/api-client` `errorCodeOf` 单源提 `errorCode`（L26-41）——前端可按码分派，无需字符串嗅探 message。
- **三种子态**（决定引导文案，取证自 A 片 §语义）：
  1. **零组织成员**（`GET /tenants` 空）→ 唯一合规出路 = 首页 `TenantOnboardingPanel`（申请→pending / 等邀请）；
  2. **有组织但未激活**（≥1 且 loader 前未切换；A 片自动激活仅覆盖 dashboard「恰一个」场景，多组织需手动切）→ 出路 = 首页 `TenantSwitchSection`「切换到此租户」；
  3. **其他 4xx/5xx**（无权限 403 / 网络等）→ 维持现 `ErrorPanel` 原文展示（不吞不改语义）。
- **现渲染路径**：`settings.roles.tsx` L19-27 / `settings.roles.$roleKey.tsx` L23-45 / `settings.members.tsx` / `settings.invitations.test.tsx` 对应页 loader：`error → ErrorPanel(describeApiError)`——三页同构，皆无 errorCode 分派。
- **组件先例**：`panels.tsx`（EmptyPanel/ErrorPanel/SectionHeading）+ `forms.tsx` 纯展示 View 拆分纪律（可脱离 router 组件测）——本片新组件沿用。

## 2. 方案（切片·纯前端加法）

1. **新共享纯展示组件** `apps/web/src/components/tenant-context-guide.tsx`：`TenantContextGuidePanel({ hasMemberships }: { hasMemberships: boolean })`——两态文案 + 均给 `<Link to="/">` 出路（态①「你尚未加入任何租户，去首页提交租户申请或等待邀请」；态②「你已有租户成员身份但尚未激活，去首页『我的租户』切换」），样式对齐 EmptyPanel 家族。
2. **探测辅助** `apps/web/src/lib/tenant-context-guide.ts`：`probeTenantContext(body)`——当 `errorCodeOf(body) === 'TENANCY:NO_ACTIVE_CONTEXT'` 时补一次廉价 `GET /api/v1/tenants`（复用 `api` 客户端·失败保守归态①），返回 `null`（非该码）或 `{ hasMemberships }`；三页 loader 错误分支统一接它（机制非逐页特判）。
3. **三页接线**：roles 列表 / roles 矩阵（`$roleKey`）/ members / invitations 四路 loader：`error` 分支先 probe，命中 `TENANCY:NO_ACTIVE_CONTEXT` → 渲 `TenantContextGuidePanel`，否则原 `ErrorPanel` 不变。
4. **测试**：组件镜测（两态文案 + Link 存在）+ 至少一页（roles 列表）错误分派镜测（stub `GET /tenants` 空/非空两路）；预期基线 +3~4 只增。
5. **门禁**：`pnpm run ci`（含 web 测）+ web tsc + Biome。无后端/契约/迁移/文档资产触面（i18n 资产闸不适用·前端文案现用中文内联·镜现有页面惯例）。

> 不做（边界）：不在管理页内联申请表单（出路统一指回 dashboard 唯一 SSOT 面板，防双引导面漂移）；不动后端 403 语义（fail-closed 正确）；不改 A 片自动激活逻辑。

## 3. 实施次序（审计 GO 后）

P-1 组件 + probe 辅助（含单测）→ P-2 四路 loader 接线（含分派镜测）→ P-3 门禁三件套 + 实机自查（dev 用零租户账号进 `/settings/roles` 见引导）→ P-4 翻账。单一片可一次交付。

## 4. 审计记录

> 无已审方案不写码。前端纯加法·不触 §2 高危面（不改后端/契约/门禁/密钥）。

- 结论：**已审计 · GO**（用户令「同意」＝四未决项全采推荐档；前端纯加法不触 §2，审计人=用户·问责归人 P2）。
- 未决项（请人裁·均附推荐档）：
  1. **接线范围**：四路（roles 列表/矩阵/members/invitations）全接（**推荐**·机制统一）vs 仅 roles 两路（最小验证）。
  2. **态②是否也提示「自动激活仅限单组织」差异**：推荐一句带过（不展开机制解释·防文案膨胀）。
  3. **probe 二次 `GET /tenants` 的成本**：推荐接受（单请求·仅 403 分支触发·失败保守归态①不阻塞渲染）。
  4. **英文/日文文案**：前端现无 i18n 站（文案中文内联·镜全站惯例）→ 推荐本片维持中文内联，不引入前端 i18n（那是独立大切口）。
- 审计人 / 日期：用户（令「同意」）· 2026-10-19

## 5. 完成判据（审计 GO 后·可核验 + 穷尽）

- [x] `TenantContextGuidePanel` 两态渲染 + Link 出路绿（经 route 级两态分派测覆盖·独立组件镜测未另立，见 §6 v0.3.0 注）；`probeTenantContext` 判别走 `apiErrorDetail`→@core 单源 `errorCodeOf`（不嗅探 message 字符串），码引用 `ERROR_CODES.TENANCY_NO_ACTIVE_CONTEXT` 零手打。
- [x] 四路 loader 接线：`TENANCY:NO_ACTIVE_CONTEXT` → 引导面板；其余错误维持 `ErrorPanel` 原文（既有错误分派镜测不回归——nesting/invitations/members 套件全绿）。
- [x] `pnpm run ci` PASSED·基线 623→630 只增（probe 4 + route 级分派 3）·Biome 净·web tsc 净。
- [ ] dev 实机自查存照：零租户账号进 `/settings/roles` 见「去首页申请/等邀请」引导；seed admin 未激活态进同页见「去切换」引导（或归人浏览器验收）。
- [x] 后端/契约/迁移零改动（git diff 文件全集 ∈ apps/web + docs）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：实机 403 日志坐实死胡同 → 三态判别（errorCodeOf 基建已在）+ 共享引导组件/probe 辅助/四路接线方案 + 4 未决项（均小裁点·无 §2 高危）·待审计 |
| 2026-10-19 | 0.2.0 | 审计 GO | 用户令「同意」＝四未决项全采推荐档（四路全接/态②一句带过/probe 成本接受/中文内联），许可实施 |
| 2026-10-19 | 0.3.0 | 实施回执 | 交付：① `components/tenant-context-guide.tsx`（两态文案+Link）② `lib/tenant-context-guide.ts`（probe·码走单源常量）③ 四路 loader+组件接线（roles/矩阵/members/invitations）④ 测 +7（623→630）。**偏差留痕**：分派测原拟 routes 同址，实跑坐实运行中 dev watcher 会把 routes/ 新增 `*.test.tsx` 注册进 routeTree.gen 并**向源文件追加 createFileRoute 样板**（染编译）——改安置 `src/testing/tenant-admin-guide.test.tsx` 釜底抽薪，gen 已回滚净；watcher 既有行为缺口（既有同址测仅因非 watcher 存活期新增未遭），长期宜 vite 配置 `routeFileIgnore` 机制修复（另片裁定·本片不触配置）；独立组件镜测以 route 级两态测替代（更强·含真 Link 上下文） |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.3.0 变更，以当前正文内容为准。
