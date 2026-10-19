# CSRF 显式防线（auth 纵深防御）— 已定档·丁（甲+丙）落地

> 适用范围: `模块(auth·会话墙)` ← 可能新增全局守卫（高危#4 signed decision）+ BA cookie 配置
> 关联: 外部评审报告 🟡「无显式 CSRF 防护，非 auth 端点仅靠 cookie SameSite 默认值」· `session.guard.ts`（APP_GUARD）· `getCorsConfig().origin`（ALLOWED_ORIGINS SSOT）· `ERROR_CODES`
> 性质: 定点加固（含多方案择一）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 威胁模型（取证现状·非在架漏洞）

- **BA 认证端点**：Better Auth 内置 `originCheck`（`trustedOrigins` = 我们刚统一的 `ALLOWED_ORIGINS` 白名单）已对 cookie 写操作要求 Origin，缺失/不符 403（`auth-http-surface.e2e.test.ts` 实机坐实）。
- **应用自建非 auth 端点**（posts/workspaces/tenants/… 经 `SessionGuard` cookie 会话鉴权）：**无**应用层 CSRF 校验。当前靠三道**隐式**防线：
  1. CORS 白名单 + 自定义 JSON `Content-Type` 触发预检（跨源脚本无法静默发非简单请求）；
  2. 会话 cookie SameSite **缺省 lax**（BA 默认）——**未显式钉死**，若为支持跨源前端翻成 `None+Secure`，此防线静默消失；
  3. **同源拓扑**：dev `/api` 反代（`vite.config.ts`）；生产 `docs/frontend-dev-proxy-runbook.md` 明写「同域反代**另片裁定**」——拓扑尚未定档。
- **结论**：这是**纵深防御缺口**（依赖隐式默认 + 未定拓扑），非当下可利用漏洞。修法应是显式化，而非赌浏览器默认。

## 2. 方案选项（择一或组合·待人裁）

### 甲 — Origin/Referer 校验守卫（推荐·最小·零前端改动）
- 新增 `CsrfOriginGuard`，经 `AuthModule` 注册为全局 `APP_GUARD`（**排在 `SessionGuard` 之后**·执行序沿用限流→会话既有约定）。
- 逻辑（仅对**依赖 cookie 会话**的**非安全方法**生效）：
  - `@Public()` 面 → 跳过（不依赖会话，CSRF 无意义：如存活探针、Stripe webhook〔签名鉴权·第三方无 Origin〕、OAuth 入站回调）。
  - 安全方法（GET/HEAD/OPTIONS）→ 跳过。
  - 取 `Origin`（缺失回退 `Referer` 的 origin）：命中可信源白名单（复用 `getCorsConfig().origin` = `ALLOWED_ORIGINS` **单一真源**）→ 放行；**有 Origin 且不符** → 403 `ERROR_CODES.AUTH_CSRF_ORIGIN_MISMATCH`；**无 Origin 头**（非浏览器/同源老客户端）→ 放行 + warn 计数（镜鉴 IP-trust「warn 非 fail-closed」取向，防误杀纯 API 后端）。
- **耦合与代价**：CSRF 白名单 == CORS 白名单 == 允许携带 cookie 的前端源。同源部署须把本站公网 origin 也登记进 `ALLOWED_ORIGINS`（现代浏览器**同源 POST 亦带 Origin**）。plan 与 `.env.example` 注释说明。
- blast radius：单守卫 + 一个错误码（append-only）+ APP_GUARD 注册（高危#4）。不触前端、不触迁移。

### 乙 — `@fastify/csrf-protection`（token / Double-Submit Cookie）
- 最强、最标准。但需 `/csrf-token` 端点 + 前端每个写请求带 `x-csrf-token` 头 → **改 `apps/web` + api-client 契约**，blast radius 大；在 prod 拓扑未定档时可能白做。**列为"未来确需跨源前端才升级"**。

### 丙 — 仅显式钉死 cookie SameSite（+文档）
- 在 BA cookie 配置显式 `sameSite:'lax'`（跨源需求出现时经 env 切 `none`+`secure`），把「靠默认」变「靠声明」。最小码，但**不新增 Origin 校验**——防线仍系于浏览器属性。

### 丁 — 甲 + 丙（推荐终态·纵深防御）
- Origin 校验（甲）为主 + SameSite 显式钉死（丙）为辅，两道互不依赖，任一回退另一道兜底。

## 3. 影响面与风险

- **命中高危**：新增全局守卫 = 高危#4（signed decision，仓库既有「APP_GUARD stays a signed decision」纪律）；改公共契约（新增 errorCode）→ **须人签核**，故本 plan 停在选项裁定。
- **可逆性**：皆代码面·git revert 可回；无 DB 迁移。
- **主要风险**：甲若把「有 Origin 即校验」写死，纯 server-to-server 携 cookie 的少见场景需靠「无 Origin 放行 + warn」兜；同源部署漏登记本站 origin 会误杀写请求（运维注意项，`.env.example` 注释 + 完成判据加冒烟）。

## 4. 审计记录

- 结论：**已定档·丁（甲+丙）**——人签核通过（用户明示「全部由你自行裁定」= 高危#4 新增全局守卫 + errorCode 契约变更的授权到位）；**prod 拓扑定为同源**（与 dev 反代一致·最贴仓库既有事实），故 SameSite 显式钉 `lax`、不引入跨源适配与新 env 键。乙（`@fastify/csrf` token）留作「确需跨源前端」时的终态升级，本阶段不做。

## 5. 落地记录（丁）

- **甲·Origin/Referer 校验守卫**：新增 `apps/api/src/modules/auth/guards/csrf-origin.guard.ts`（`@Injectable`·`@Inject(Reflector)`/`@Inject(ConfigService)` 显式注入对齐 session.guard 惯例·守 DI 值导入铁律）：`@Public` 跳过 → 安全方法（GET/HEAD/OPTIONS）跳过 → 取 `Origin`（缺失回退 `Referer` 的 origin）：**同源放行**（Origin 的 host 命中请求 `Host`/`X-Forwarded-Host`·scheme 无关·免登记本站 origin）→ 否则命中 `getCorsConfig().origin`（= `ALLOWED_ORIGINS` 单一真源·覆盖跨源合法前端）或白名单含 `*` 放行；无 Origin（服务直连）放行 + warn（非 fail-closed·镜 IP-trust）；有 Origin 且既非同源亦不在白名单 → 403 `ERROR_CODES.AUTH_CSRF_ORIGIN_MISMATCH`。经 `AuthModule` 注册为全局 `APP_GUARD`，排在 `SessionGuard` 之后（401 先于 403）。
- **errorCode 契约**：`libs/core/src/shared-kernel/errors/error-codes.ts` 追加 `AUTH_CSRF_ORIGIN_MISMATCH: 'AUTH:CSRF_ORIGIN_MISMATCH'`（append-only·合 `ERROR_CODE_PATTERN` 与 key=value.replace 契约测）。
- **丙·显式钉 SameSite**：`auth.implement.ts` 的 `advanced.defaultCookieAttributes` 显式 `{ sameSite: 'lax' }`（部分合并·不冲掉 httpOnly/secure/path；BA 覆盖语义已核 `dist/cookies/index.mjs`）。
- **测试**：`csrf-origin.guard.test.ts`（10 例：@Public/安全方法/白名单内/同源放行（白名单空）/X-Forwarded-Host 同源/白名单外 403+码/同源 host 不同且白名单外 403/Referer 回退/无 Origin warn 放行/`*` 通配）；error-codes 契约测覆盖新码。
- **门禁**：`pnpm run ci`（check→build→647 test→fallow 0 边界违规）PASSED；app-boot smoke 解析新增全局守卫 DI 链通过。
- **运维注意**：同源部署（prod 定档）无需把本站 origin 登记进 `ALLOWED_ORIGINS`——守卫自动识别同源放行；`ALLOWED_ORIGINS` 只需登记**跨源**合法前端源（若未来引入独立域前端）。
- 未决项：无（①方案已定丁；② prod 拓扑已定同源·同源自动放行无需登记本站 origin）。
- 审计人 / 日期：用户授权「全部自行裁定」· Agent 落地 · 2026-10-19

## 6. 完成判据（已达成）

- [x] 按丁（甲+丙）实现；新增 errorCode 过 `ERROR_CODE_PATTERN` 文法闸与契约测。
- [x] 守卫矩阵测：`@Public` 跳过 / 安全方法跳过 / 白名单内 Origin 放行 / 白名单外 Origin 403+码 / Referer 回退 / 无 Origin warn 放行 / `*` 通配。
- [x] `pnpm run ci` 全绿（647 test）；未触前端（丁不需 token），无前端冒烟。

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版（含甲乙丙丁四选项·推荐丁/甲·停待裁） |
| 2026-10-19 | 0.2.0 | 定档·落地 | 用户授权自行裁定→选丁（甲+丙）·prod 同源；守卫+errorCode+SameSite 钉 lax+测落地·门禁绿 |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.2.0 变更，以当前正文内容为准。
