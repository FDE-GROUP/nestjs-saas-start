# 前端 F6 · 运维与支付集成状态面（只读）

> 适用范围: `模块(apps/web)`（纯前端增量·后端/契约/OpenAPI 零触动）
> 关联: `global-frontend-adoption` §2.2 · vision §4 第 7 支柱 · tooling §4.12 · `module-common-health-probe`（探针 SSOT）
> 性质: 重写型
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

前端主线收尾择向「`/payment/*` 消费面 + `/health` 运维探针可视化」。勘察坐实两-backend 面实态（皆 typed·openapi+schema.d.ts 在册）：

- `GET /api/v1/health`：`@Public`+`@SkipThrottle`·terminus ping-only·**零凭据零会话恒可达**。
- `GET /api/v1/payment/test`：`@TenantExempt`（仅需会话）·`paymentStatusSchema`=`{status:'ok', selected, available[]}`·provider 枚举 `['stripe','alipay','wechat_pay']`·**只读状态无需 PSP 键**。
- `POST /payment/{customers,checkouts,refunds}`：service `getProvider` 无渠道 → **503 `ServiceUnavailableException`**·需真 PSP 键。

**目标**：`apps/web` 增一只读「运维与支付集成状态」面——服务存活 + 支付通道配置可见。

**非目标（诚实边界）**：**不建 payment 操作面**（建/撤 checkout·客户·退款）——无凭据只会 503，「建一个只会报错的表单」= 硬造工作，缓至运维配真 PSP 键后另片；不做文件式依赖健康指示器（探针本即 ping-only·后续 readiness 属后端配置非前端片）。

## 2. 方案（单片穿透）

`/settings/integrations` 页·并置两面板：

- **服务存活面板**：`GET /api/v1/health` → 状态徽标（ok / degraded / down / unknown）+ 客户端刷新时刻。
- **支付集成面板**：`GET /api/v1/payment/test` → selected provider 高亮 + available channels 徽标列表。
- route loader 并行取两端点（`requireSession` 前置·payment 面需会话）→ 导出**纯展示 Panel**（`HealthStatusPanel` / `PaymentIntegrationPanel`）供 jsdom typed fixture 锁测 → 「刷新」按钮走 `router.invalidate()` 重跑 loader。复用 `ErrorPanel`/`describeApiError`/`SectionHeading`。

**发现（health 文档↔运行时落差·非本片修·留痕）**：`TransformInterceptor` 全局把返回包成 `{data,statusCode,message}` 且 **health 未豁免** → 运行期探针态实在 `data.data.status`；但 `apiOkPassthrough` 生成的 openapi/schema.d.ts 把 health 文档为**透传体（顶层 `status`）**——两者不一致。本片前端采**双兜解包**（`body.data?.status ?? body.status`）保持运行正确，**不改后端/契约**（修 openapi 文档或拦截器豁免属后端/高危面·另片）。payment/test 无此问题（正确 envelope·`data.data` 一致）。

**完成判据**：`pnpm run ci` L1 全绿（web typecheck + jsdom 测）；dev 反代真跑：health 恒 200 绿·payment/test 视 provider 注册返回（真机对拍归人）。

**待裁点裁定**（用户「同意」GO 推荐档）：① 合并单页 `/settings/integrations`；② 只读、payment 操作面缓；③ loader 初取 + `router.invalidate()` 刷新；④ jsdom 仅测纯展示 Panel；⑤ 认可单独成页（本面较 storage 薄·价值判断由人点头）。

## 3. 影响面与风险

- **blast radius / 可逆性**：`apps/web` 增量——新增 2 文件 + 改 `__root.tsx` + `routeTree.gen.ts` 重生。**不命中 `workflow.md` §3 高危清单**；后端 / `@saas/contracts` / `openapi.yaml` / `schema.d.ts` 零触动。完全可逆。
- **主要风险**：health 文档↔运行时落差（见 §2 发现）——前端双兜规避；真实状态值语义仍以后端运行期为准。

## 4. 审计记录

- 结论：用户择向「前端收尾 payment+health」+「同意」→ 待裁点①–⑤ 采推荐档 → **GO**（纯前端只读增量·非高危·后端/契约零改动）。
- 未决项：payment 操作面（需真 PSP·另片）；health openapi 文档落差修复（后端/契约面·另片）；端到端真机对拍归人。
- 审计人 / 日期：用户 GO / 2026-10-22。

## 5. 完成判据（可核验 + 穷尽）

- [x] `apps/web/src/routes/settings.integrations.tsx`（Route + 纯展示 `HealthStatusPanel`/`PaymentIntegrationPanel` 导出）
- [x] `apps/web/src/routes/settings.integrations.test.tsx`（typed fixture 双面板纯展示锁测·jsdom·3 例）
- [x] `__root.tsx` 导航增「集成状态」·`routeTree.gen.ts` 重生（剔 IDE 扩展误注 `/test` 桩）
- [x] 后端 / `@saas/contracts` / `openapi.yaml` / `schema.d.ts` 零改动（git status 坐实）
- [x] `pnpm run ci` L1 全绿（web typecheck 净·885 passed·fallow 无违界）
- [ ] dev 反代真跑 health + payment/test（归人·health 恒可达·payment/test 视 provider）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-22 | 0.1.0 | 前端收尾择向·用户 GO | 首版：health+payment/test 只读状态面·操作面缓·health 文档↔运行时落差发现留痕 |
| 2026-10-22 | 0.2.0 | 落地实施 | 页 + 测 + 导航 + routeTree 重生·ci L1 885 绿·后端/契约零改动·dev 真跑归人；实施发现二则：① openapi-fetch 单 200 响应端点（`/payment/test`）直接成员访问 `.error` 会塌 `never`·改 posts.tsx 已验的 `{data,error}` 解构规避；② IDE Router 扩展对新路由/测文件注入 `Hello` 桩并将 `/settings/integrations/test` 塞进 routeTree·剥桩后 `vite build` 权威重生 |

---

<!-- 变更戳 -->
正文已于 2026-10-22 / v0.2.0 落地（§5 自动化判据全绿·端到端真跑归人）；后续验收 / 变更随下窗回写 §5/§6。
