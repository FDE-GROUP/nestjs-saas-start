# Epic 01 · 认证与会话

> 旅程: 一个自然人如何登录进来、维持/切换会话、并被全局安全墙保护 | 上下文: `auth`（Better Auth 原生 HTTP 面 + 全局守卫）
> 认证面挂载于 `/api/v1/auth/*`（Fastify 实例级通配·`AuthBootstrapService.onApplicationBootstrap`），非 Nest controller；邮箱+密码面**仅非生产启用**，magic-link **无条件挂载**。守卫公共前置见 [README 守卫模型](./README.md)。
> 版本: 0.2.0（2026-10-20·逐条对照代码讨论后校正增补）

本 Epic 分两节：**用户登录面（1.1–1.6·角色=自然人）** 与 **全局安全墙（1.7–1.9·角色=平台/运维·横切 deny-by-default 机制）**。

## 环境 × 登录面矩阵（先立此锚，免各条复述）

| 登录面 | dev/test | 生产 | 一句话 |
|---|---|---|---|
| 邮箱+密码 注册/登录（1.1/1.2） | ✅ 开 | ❌ 关 | dev/test 便利通道；生产邮箱注册属待决策独立产品项 **D8** |
| Magic-link 免密（1.3） | ✅ | ✅ | 无条件挂载·仅存量用户 |
| 社交 OAuth（1.4） | ✅ 配即开 | ✅ 配即开 | 首登即 provision·**生产新用户开户正道之一** |
| 境内 generic OAuth（1.5） | ✅ 配即开 | ✅ 配即开 | 飞书可用；微信/钉钉/企微系接口位待建（builder-pending） |

> **生产登录面 = magic-link（存量免密）+ OAuth（社交/generic·含首登开户）两路**；邮箱密码面关闭。magic-link 非「唯一」，与 OAuth 并列。

---

## 用户登录面（1.1–1.6）

### 1.1 邮箱 + 密码注册（dev/test 便利通道）
- **作为** 开发者/测试者，**我想** 在非生产用邮箱和密码注册账号，**以便** 无需 SMTP/OAuth 凭证即可快速拿到平台账号（`user`）去申请/加入租户。
- **验收**：
  - Given `NODE_ENV !== 'production'`，When 提交邮箱+密码（`minPasswordLength: 8`），Then 创建 `user` + `account` 行并自动登录（`autoSignIn`）。
  - Given 生产环境，When 走邮箱密码注册面，Then 该面关闭（`emailAndPassword.enabled=false`）——生产「邮箱为体」注册进服务属**独立产品决策 D8**（排序/验证/策略），本仓不在此预置。
- **溯源**：BA 原生 `signUpEmail`（`/api/v1/auth/sign-up/email`）· `auth.implement.ts` `emailAndPassword`（`minPasswordLength:8`·`enabled: NODE_ENV!=='production'`）· 关联 plan [`module-auth-magic-link-production`](../plans/module-auth-magic-link-production.md)（生产面收敛）。

### 1.2 邮箱 + 密码登录（dev/test 便利通道）
- **作为** 已注册用户，**我想** 在非生产用邮箱密码登录，**以便** 开发/测试期免配置外部 IdP/SMTP 即恢复会话。
- **验收**：
  - Given 非生产 + 凭证有效，When 提交登录，Then 签发带签名的 session cookie（DB `session` 行）。
  - Given 凭证错误，When 登录，Then 拒绝（BA 原生 4xx），不建会话。
  - Given 生产环境，When 走此面，Then 关闭（同 1.1·D8）。
- **溯源**：BA 原生 `signInEmail`（`/api/v1/auth/sign-in/email`）· `emailAndPassword` 非生产门（`auth.implement.ts`）· D4（cookie + 服务端 DB session）。

### 1.3 Magic-Link 免密邮件登录（存量用户·全环境·与 OAuth 并列）
- **作为** 已注册用户（尤其在生产），**我想** 点邮件里的一次性链接免密登录，**以便** 无密码安全进入。这是生产面向**存量用户**的免密通道，与 OAuth（1.4/1.5）**并列**构成生产登录面（**非唯一**）。
- **验收**：
  - Given 任意环境（magic-link 无条件挂载），When 请求向已存在邮箱发链接，Then 经 `MailerService`（MJML+i18n）发出 300s 一次性链接（`expiresIn:300`·token 存 `verification` 表·零迁移）。
  - Given 陌生邮箱点链接 verify，Then **不自动开户**（`disableSignUp:true`·仅存量登录，不新开注册面）。
  - Given 非生产发信，Then 链接同时打进控制台（SMTP 未配也可点）；**生产绝不打印含 token 的链接**（`NODE_ENV` 门）。
  - **存量从哪来（补 cross-ref）**：生产既不开邮箱注册、magic-link 又只认存量，故新用户 `user` 行来自 ① OAuth 首登自动建号（见 [1.4](#14-社交账号-oauth-登录生产新用户开户正道之一)/[1.5](#15-境内第三方-oauth-渠道generic-oauth飞书可用微信钉钉企微待建)）或 ② 管理员邀请落地（见 [Epic 03](./epic-03-members-invitations.md)）——本条不承接开户，仅接存量免密。
- **溯源**：BA `magicLink` 插件（`expiresIn:300`·`disableSignUp:true`）· `createMagicLinkSender`（`auth.implement.ts`·`isProd` 门）· `APP_URL` canonical（缺则 warn 回退 origin）· 关联 plan [`module-auth-magic-link`](../plans/module-auth-magic-link.md) / [`module-auth-magic-link-production`](../plans/module-auth-magic-link-production.md)。

### 1.4 社交账号 OAuth 登录（生产新用户开户正道之一）
- **作为** 用户，**我想** 用 Google/GitHub 等社交账号登录，**以便** 免密进入；**在生产，OAuth 首登本身就是新用户开户正道之一**（首登即 provision `user`+`account`），老用户经同邮箱 `accountLinking` 并号。
- **验收**：
  - Given 已配社交凭证，When 走 `/callback/:provider`，Then 建/联 `account` 行并登录（首登 provision 新用户）。
  - Given 同邮箱既有账号，When 经 **trusted 渠道（`google`/`github`）** 登录，Then `accountLinking` 自动并号。**trusted 特权的安全边界**：仅这俩 IdP 的「邮箱由其强校验」被采信，可凭 verified email 直接并号；非 trusted 渠道并号需额外确认（防「伪造邮箱的 IdP 接管既有账号」）。
  - Given 生产环境但某启用渠道**未能注册**（三弃因任一：拼错渠道名 `unknown-type` / 有启用无槽位 `no-config-slot` / 有槽位无密钥 `missing-credentials`），When 启动装配，Then **fail-loud 拒启**（`planProviderDiagnostics` 生产返 `mode:'throw'`·不静默降级）——生产把「文档承诺已接、实际没接线」当**必修缺陷**。
- **溯源**：`socialProviders`（`AuthBootstrapService.buildSocialProviders`）· `resolveSocialProviders` / `planProviderDiagnostics`（`social-provider-registration.ts`·三弃因 + 生产 throw）· `account:{accountLinking:{enabled:true,trustedProviders:['google','github']}}`（`auth.implement.ts`）· 关联 [`global-cn-adaptation`](../plans/global-cn-adaptation.md)。

### 1.5 境内第三方 OAuth 渠道（generic OAuth·飞书可用·微信/钉钉/企微待建）
- **作为** 中国大陆用户，**我想** 用境内 IdP 登录，**以便** 走合规的第三方认证。**as-built 现状（诚实三分）**：飞书已可用；微信/钉钉/企微系 D8 登记的**接口位**、本期**无构建器**（列入只 warn·暂不可登录）。
- **验收**：
  - Given `OAUTH_GENERIC_PROVIDERS` 配了飞书凭证，When 启动，Then 挂 `genericOAuth` 对应渠道（有配置才挂·`configs.length>0` 方装插件）。
  - Given 某 generic 渠道未配凭证（`missing-credentials`）/ 或列入尚无构建器的渠道（`builder-pending`：wechat/dingtalk/wecom）/ 或 id 不认（`unknown-id`），When 启动，Then **一律 warn 可见化、不拒启（含生产）**。
  - **与 1.4 的刻意不对称（归因）**：generic 面 `.env.example` 自始承诺「不列即不注册、不配凭证可正常启动」+ D8/NFR-2「未配即降级」既有人裁，故此层**只补可见化**；是否升级为生产 fail-loud **已登记归人（活口·未决）**——非疏漏，是契约差。
- **溯源**：`genericOAuth`（`AuthBootstrapService.buildGenericConfigs`·`configs.length>0` 才挂）· `resolveGenericChannels` / `GenericChannelDropReason`（`unknown-id` / `builder-pending` / `missing-credentials`·`generic-oauth-channels.ts`）· 关联 [`global-cn-adaptation`](../plans/global-cn-adaptation.md) 与 D8 排序。

### 1.6 获取当前会话 / 登出（BA 端点）
- **作为** 已登录用户，**我想** 读取我的当前会话（含活动租户锚），**以便** 前端据此渲染、后端据此绑定租户上下文；并可主动登出销毁会话。
- **验收**：
  - Given 携带有效 session cookie，When `getSession`，Then 返回 `user` + `session`（含 `activeOrganizationId`·**租户上下文锚**·`TenantIsolationMiddleware` 据此绑 ALS）。
  - Given 用户点登出，When `signOut`，Then 销毁该会话。
  - **会话有效性与暂停失能**由全局 `SessionGuard` 统一把关（deny-by-default）；「无会话→401 / isBlocked→403」两层链见 [1.7](#17-全局会话墙deny-by-default)，本条只述 BA 两端点本身。
- **溯源**：BA 原生 `getSession` / `signOut`（`/api/v1/auth/*`）· `session-resolver.ts`（`resolveRequestSession` 单源转发 `auth.api.getSession({headers})`）· `activeOrganizationId → TenantIsolationMiddleware`（ALS 绑定源）。

---

## 全局安全墙（1.7–1.9）

> 本节三条角色为「平台/运维」，是横切 **deny-by-default 机制**而非用户旅程，故与登录面分列。
> **warn-非-fail-closed 三连同构**（同一决策家族·镜 IP-trust 先例）：1.3 缺 `APP_URL`→warn 回退 origin / 1.8 缺 Origin/Referer→warn 放行 / 1.9 未配 `AUTH_TRUSTED_PROXIES`→warn——皆因「非 PIPL 级法定依据 + 直连/非浏览器场景本就正常」，故**可见化告警而不拒启**（区别于社交面的生产 fail-loud）。

### 1.7 全局会话墙（deny-by-default）
- **作为** 平台，**我想** 所有路由默认要求有效会话，**以便** 未认证请求一律拒入（`@Public` 显式旁路）。
- **验收**：
  - Given 无有效会话（含被暂停用户 session 已硬删者），When 访问任意非 `@Public` 路由，Then **401** `Missing or invalid session`（`SessionGuard` 经 `APP_GUARD` 全局·deny-by-default）。
  - Given 路由标 `@Public`，When 访问，Then 旁路会话墙——**实存仅两处**：支付 webhook（`payment.controller.ts`）、健康探针（`health.controller.ts` 类级）。
  - **暂停/封禁用户两层失能链**（承接 1.6）：
    - **主路径·即时**：平台 suspend 用户时于**同事务**（`uow.run`）硬删其全部 session 行（不留「已 suspend 但 session 仍活」窗口）→ 后续请求解析不到会话 → **401**；
    - **纵深防御**：若 session 仍解析得出（重登绕过/竞态），`SessionGuard` 的 `isBlocked` 命中 → **403** `Account suspended`。
  - **失能态 = `suspended ‖ deleted`**（非仅 suspended）；**无 `user_status` 行 → 不拦**（deny-list·视同 active·与租户侧同构）。
  - **统一谓词·多点纵深**：`isBlocked` 系单源谓词，于 `SessionGuard`（用户层·全路由）/ `PlatformOperatorGuard`（平台治理层）/ `TenantIsolationMiddleware`（ALS 绑定时同查 user+tenant 两态 deny-list）三处复用，**非依赖单闸**。
- **溯源**：`SessionGuard`（`auth.module.ts` 注册 `APP_GUARD`·先于 `CsrfOriginGuard`）· `@Public`（`tenant-isolation/public.decorator`）· `UserStatusService.isBlocked`（`libs/core` `user-status.service.ts`·`suspended‖deleted`·无行不拦）· `SuspendUserCommandHandler`（`uow.run` + `AUTH_SESSION_STORE.deleteAllForUser` 同事务硬删）· `platform-operator.guard.ts` / `tenant-isolation.middleware.ts`（多点复用）· 关联 [`module-rbac-casl`](../plans/module-rbac-casl.md) 高危#4 收口。

### 1.8 CSRF Origin/Referer 纵深防御
- **作为** 平台，**我想** 对依赖 cookie 会话的状态改变请求校验跨站来源、并给会话 cookie 钉 `SameSite`，**以便** 抵御 CSRF（并为「将来翻 `SameSite=None`」预设第二防线）。
- **验收**（四出口判定链·403 是**兜底非默认**）：
  - 安全方法（`GET`/`HEAD`/`OPTIONS`）→ 放行（不校验）；
  - Given 状态改变请求**无** `Origin`/`Referer`（非浏览器 / 服务直连），Then **放行 + warn（不拦·防误杀纯 API 后端·warn 非 fail-closed）**；
  - 同源（`Origin` host 命中请求 `Host`/`X-Forwarded-Host`·scheme 无关）→ 放行；
  - 白名单命中（`trustedOrigins` 含该 origin 或 `'*'`·**白名单单源于 `CORS_ORIGIN`**）→ 放行；
  - **仅当**有跨站 `Origin` 且既非同源又不在白名单 → **403** `AUTH:CSRF_ORIGIN_MISMATCH`。
  - cookie 属性：签发会话 cookie 显式钉 `sameSite:'lax'`（部分合并·不冲掉 httpOnly/secure/path）；跨源前端需求出现时经配置翻 `none`（叠 `secure`）——**彼时 SameSite 失效，此 Origin 墙即独立兜底**（两道防线的分工，非冗余）。
- **溯源**：`CsrfOriginGuard`（`guards/csrf-origin.guard.ts`·`SAFE_METHODS`/`isSameOrigin`/`trustedOrigins`·缺源 warn 放行）· `advanced.defaultCookieAttributes:{sameSite:'lax'}`（`auth.implement.ts`）· `trustedOrigins = corsConfig.origin`（单源）· 关联 [`module-auth-csrf-defense`](../plans/module-auth-csrf-defense.md)。

### 1.9 登录限流与反向代理 IP 信任链
- **作为** 运维，**我想** 对登录/路由面限流并能正确识别反代后的真实客户端 IP，**以便** 防爆破/洪水且不误杀。
- **验收**：
  - **两链同源、阈值各异**（同源指共享 `AUTH_TRUSTED_PROXIES` 的 IP 解析，**非**同阈值）：BA 登录限流 **3 次/10s**（库默认·防凭证爆破）；Nest 全局墙 **300 次/60s·IP 宽档**（丙裁·主挡脚本级洪水）。
  - Given 未配 `AUTH_TRUSTED_PROXIES`，When 生产启动，Then **warn·不拦**——因未配即 `undefined`、不传→**保持安全默认按直连 socket IP 分桶**（直连部署本就无需 trustedProxies）；仅「经反向代理**却**未配」才会把所有用户归共享桶整站误杀，故 warn 可见化而非 fail-closed。
  - Given 配了代理网段 CIDR，When 请求进来，Then 解析代理链**最右可信真客户端 IP** 分桶（BA 限流 + Nest throttler 双链同一 env）。
- **溯源**：`parseTrustedProxies`（`common/trusted-proxies`·一 env 喂两链·未配→`undefined` 保持直连 socket IP）· BA `rateLimit:{enabled:true}`（`auth.implement.ts`·窗值跟库默认）· `ThrottlerModule` `RATE_LIMIT_DEFAULT` 300/60s（`common/rate-limit.module.ts`·`APP_GUARD` 排 `AuthModule` 前）· `fastify-http-options`（trustProxy 解析最右可信 IP）· 关联 [`module-common-rate-limit`](../plans/module-common-rate-limit.md) / [`module-auth-ip-trust`](../plans/module-auth-ip-trust.md)。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论后校正：1.1/1.2 定性为 dev 便利通道 + D8 待决策；1.3 去「唯一」误读、补存量来源 cross-ref；1.4 定性「生产开户正道之一」+ fail-loud 三弃因 + trusted 并号特权；1.5 补 builder-pending（微信/钉钉/企微待建）+ 与 1.4 不对称归因；1.6 收敛为 BA 端点、失能链移交 1.7；1.7 订正失能态 suspended‖deleted + 两层两码（401/403）+ isBlocked 多点纵深；1.8 补 fail-open（缺源 warn 放行）+ 四出口判定链 + cookie/Origin 墙纵深关系；1.9 厘清「双链同源非同一阈值」+ 未配降级语义 + warn 三连同构；分「用户登录面 / 全局安全墙」两节 + 环境×登录面矩阵。
