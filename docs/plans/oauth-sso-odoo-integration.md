# 与 Odoo（OdooThink_20）单点登录 · 甲档落地方案（本仓充当 Odoo 的 OIDC OP）

> 适用范围: `模块(auth)`（新增 2 端点 + client 配置面）+ `跨端契约(@saas/contracts)`（authorize/userinfo zod 单源）+ `config/env`（client 注册表·四角对拍）——**零 schema 迁移**（不新增 BA 表·绕开 BA 表契约红线语境）
> 关联: 调研母案 [../research/odoo-sso-feasibility.md](../research/odoo-sso-feasibility.md)（§8 人裁=**甲档**·本文是其过审计门的实施细化）· [../research/better-auth-org.md](../research/better-auth-org.md)（BA 身份栈地基）· `specs/architecture` BA 定位条（「BA 只管认证」）· `specs/workflow` §3 高危清单 · `AGENTS.md` §2（auth 面 / 公共 API 契约 / config-env）
> 性质: 重写型（当前方案整体成文 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表
> 受众: **人 + Agent**（`读者: Agent`——本文约束实施边界与门禁，须遵循）

---

## 1. 背景与目标

**输入（人裁结论·调研 §8）**：身份中心方向已定为 **甲档**——**本框架（Better Auth 身份栈）为身份提供方（OP / IdP）**，Odoo 20 CE 以既有 `auth_oauth`（纯隐式流消费端）**零代码纯配置**接入，实现「SaaS → Odoo」单向 SSO。本文把调研 §4 的落地形态固化为**可审、可切片的开发依据**。

**目标**：
1. 我方新增 **2 个 OAuth2 端点**（均居 `apps/api/src/modules/auth`），满足 Odoo `auth_oauth` 隐式流对 authorize + userinfo 的最小协议要求：
   - `GET /api/v1/auth/oauth2/authorize` —— **会话墙内**（默认 `SessionGuard` deny-by-default 已覆盖·需已登录）：校验 `client_id`/`redirect_uri`/`response_type`/`scope`，以 BA 会话身份铸**超短 TTL JWT**，302 回 `redirect_uri#access_token=…&state=…`（fragment）。
   - `GET /api/v1/auth/oauth2/userinfo` —— **`@Public()` 旁路**（Odoo 服务端携 Bearer 令牌回源·无 BA cookie 会话）：验 JWT（含 `aud` 校验·补位 Odoo CE 缺失的 confused-deputy 防线），返回 `{ sub, email, name }`，**要求邮箱已验证**。
2. **client 注册表入 config/env**（zod 契约·四角对拍）——**不新增 BA 表**。
3. 跨端传输契约（authorize query 参数 + userinfo 响应）单源入 `@saas/contracts`，Controller 走官方 standard-schema 路径（`@Query({ schema })` / `@SerializeOptions({ schema })`·zod **值导入**）。
4. **e2e 真链路对拍**：Testcontainers PG + 本仓产物起服，另起 OdooThink_20 compose 的 Odoo 容器，跑 login → 落 Odoo 会话 → `/web/session/get_session_info` 200。

**非目标（显式锁定·防 over-engineering / 防越界）**：
- **不**引入 `@better-auth/sso` 插件（调研 §6：其为消费端 SP 插件·对甲档方向无帮助·采纳需 BA 升级 + 新增表 + 6 依赖三重高危，另立独立候选，**不随本案连带引入**）。
- **不**实现「Odoo → 我方」反向 SSO（丁档 token 桥）——是否为反向归人裁（见 §5·裁 ⓒ），**本案 scope 仅甲档单向**。
- **不**新增数据库表 / 迁移（client 走 config·非 DB）。
- **不**改 Odoo core / OKEE 代码（OdooThink_20 宪法「零修改 Odoo core」）——Odoo 侧仅 `auth.oauth.provider` 记录 + 参数配置。
- **不**裁决 JIT 建号 vs 预配映射（归产品·见 §5·裁 ⓑ），本案在 userinfo 侧只做「邮箱已验证」硬门，具体建号策略留 Odoo 侧配置项。

## 2. 方案（垂直切片 · expand–contract · 逐片可独立验证）

> 排布依「契约先钉死 → 配置面 → 端点 → 真链路对拍」的依赖序；A/B 为增量面（不改既有行为），C/D 各穿透 auth 一层，E 为收口验证。每片单独过完成判据，全链过 `pnpm run ci`（L1）。

### 切片 A —— 跨端契约（`@saas/contracts`·纯增量·零行为）

- 新增 `libs/contracts/src/request/oauth-sso.ts`：`authorizeQuerySchema`（zod strict）覆盖 `client_id`/`redirect_uri`/`response_type`（字面量 `'token'`·Odoo 隐式流唯一支持形）/`scope`（`⊆ 'openid profile email'`）/`state`（可选·回传）。
- 新增 `libs/contracts/src/response/oauth-sso.ts`：`userinfoResponseSchema`（`{ sub, email, name }`）。
- barrel 汇入 `request/index.ts` / `response/index.ts` / `index.ts`（派生型 `OauthAuthorizeQuery` / `OauthUserInfo`）；wire enum 内联，由 apps 对拍测锁漂移（沿用 contracts 惯例）。
- **完成判据**：`pnpm run build:client` 通过；`@saas/contracts` 值导出可被 Controller 值导入（非 `import type`·防参数装饰器拿不到 schema）；新增契约镜测（strict 拒多余键）随片入链。

### 切片 B —— client 注册表配置面（`config/env`·**高危#5**·须人签）

- 在 `apps/api/src/config/interfaces/config.interface.ts` 扩 `AuthConfig`（或新 `oauthSso` 段）声明 client 形状：`{ clientId, redirectUris: string[]（精确白名单）, audience }`。
- env 侧以 zod 契约声明来源（对齐 tooling §4「配置/env 一律 zod」），**四角对拍**由既有 `verify:config-contract` 静态闸覆盖（`scripts/ci.ts` 已纳·见 global-config-contract-gate-in-chain）；缺省为空数组（fail-closed·无注册 client 即 authorize 一律拒）。
- `.env.example` 补占位键（**不含真实值**·AGENTS §2 禁 agent 写真实凭证）；dev 样例值经人签后回填。
- **完成判据**：`pnpm run verify:config-contract` 四角绿（孤儿键=0）；空注册表 → authorize 全拒的负向单测在位。

### 切片 C —— `authorize` 端点（auth·会话墙内）

- 新增 `apps/api/src/modules/auth/api/oauth-sso.controller.ts`：`@Controller('oauth2')` + `@Get('authorize')` + `@Query({ schema: authorizeQuerySchema })`。
  - **路径修正（v0.4.0·实施期实查坐实）**：落 `/api/v1/oauth2/authorize`（**非**草案所写 `/api/v1/auth/oauth2/*`）。缘起 `AuthBootstrapService` 以 Fastify 实例级通配 `app.all('/api/v1/auth/*')` 挂 BA 原生面并**绕开 Nest router/guard/validation 三层**——SSO OP 是我方 Nest controller 面，置于 `/auth/*` 前缀内会被通配抢路由；隔离到 `/oauth2/*` 后合两立面。切片 D 的 `userinfo` 同步落 `/api/v1/oauth2/userinfo`。
- **默认走全局 `SessionGuard`**（deny-by-default·需已登录会话·不加 `@Public`）；从 `req.sessionUser`（`{ id, email }`）取身份。
- 应用侧逻辑（`infrastructure/oauth-sso.service.ts`·auth 无 domain 聚合·机制件就近）：校验 `client_id` 已注册 · `redirect_uri` **精确匹配**白名单 · `response_type==='token'` · `scope ⊆ openid profile email`（后两项已在 zod 契约层拒入）；铸造 **超短 TTL JWT**（`sub`=`sessionUser.id`·`aud`=`client.audience`·TTL 120s）。
  - **token 原语实选（v0.4.0）**：`infrastructure/sso-token.service.ts` 以 `node:crypto` HMAC-SHA256 手搓紧凑 JWS（**非** BA `jwt`/`one-time-token`）。缘起：顶层 `jose`/`jsonwebtoken` 不可裸解（不可裸引·免新增依赖触供应链高危）；甲档本仓仅为极简对称 bearer OP（非完整 RS256+JWKS 发现），密钥复用 `auth.jwt.secret`、TTL 极短收敛风险。
- **用 `@Res()` 直发 302**，绕开全局 `TransformInterceptor`（重定向无 JSON 信封）；fragment 与 `redirect_uri` 既有 `#` 以 `&` 续接（RFC 6749 §4.2.2）。
- **完成判据**：正向铸 token + 302 fragment 断言；负向矩阵（未注册 client / redirect_uri 非精确 / response_type≠token / scope 越界 / 无会话 401）全绿；重生成 openapi.yaml 消 drift。

### 切片 D —— `userinfo` 端点（auth·`@Public` + Bearer 验签）

- 同 controller（`api/oauth-sso.controller.ts`）加 `@Get('userinfo')`（落 `/api/v1/oauth2/userinfo`·随切片 C 路径修正）+ `@Public()`（Odoo 服务端回源无 cookie 会话·必须旁路会话墙·`IS_PUBLIC_KEY` from `@core/saas-kit/tenant-isolation/public.decorator`）。
- 从 `Authorization: Bearer` 头取 JWT（Odoo 侧须置 `auth_oauth.authorization_header=true`·见 §3）；验签 + **强制 `aud` 校验**（`aud` 必∈已注册 client 受众集·补位 CE 无 audience 校验·风险 #4）。逻辑单源居 `infrastructure/oauth-sso.service.ts` 的 `resolveUserInfo`。
  - **裸 JSON 手段实选（v0.5.0）**：**非** `@SerializeOptions`（其仅作 Nest 返回值序列化·会被全局 `TransformInterceptor` 包络），而是 `@Res().send(obj)` 直发 `{sub,email,name}` 绕过信封（否则 Odoo 解析 `sub/email` 失败）；`userinfoResponseSchema` 仍为契约单源（供派生型 `OauthUserInfo` 与输出形状）。
  - **身份取数实选（v0.5.0）**：按 `claims.sub` 经 `MikroOrmService.fork()` + `em.findOne(User,{id})` 取 user 表**实时权威值**（`name`/`email`/`emailVerified`）而非信令牌内嵌 claims（防落库后 PII 漂移·与 `user-store.adapter` 同柱读自身 owned `user` 表）。`AUTH_USER_STORE` 端口现仅写侧（无读），故不扩端口、就近走同域 Mikro 直读。
- **邮箱已验证硬门**：`user.emailVerified` 为假 → `ForbiddenException`（403·主体已鉴但无建号授权·风险 #3 治理前置）；缺头/验签失败/`aud` 不符/主体查无 → `UnauthorizedException`（401）。**未给专用 `ERROR_CODES`**（保 @core shared-kernel 公共契约不动·高危#4）——本端点由 Odoo 服务端消费而非本站 SPA·无机器码消费方。subject 对齐 Odoo `res_users` 期望的 `sub`（三选一取 `sub`）。
- **完成判据**：有效 token → 200 + `{sub,email,name}`；篡改/过期/`aud` 不符/未验证邮箱 → 对应错误信封（`error` 由 `STATUS_CODES[status]` 缺省·见 global-error-envelope-reason-phrase）；负向测在位。

### 切片 E —— e2e 真链路对拍（gated·收口）

- 新增 `apps/api/src/modules/auth/oauth-sso.e2e.test.ts`（env-gated 真库）：
  - **DB-free 段**（实选·v0.6.0）：**非**整树 boot 冒烟（`app-boot.smoke` 无实存同名范式可复），改为独立反射元数据测 `api/oauth-sso.controller.metadata.test.ts`（随默认 `pnpm run test` 常跑）——锁 `authorize` 的 `@Query` 携 `authorizeQuerySchema`（值挂接防 `import type` 擦除）+ `authorize` 未标 `@Public`（落会话墙内 deny-by-default）+ `userinfo` 标 `@Public`（旁墙）。
  - **真库段**：复用 `auth-http-surface.e2e.test.ts` 同款 harness（AppModule 全树 boot + `app.inject` 命中完整 Nest router/guard/validation·B1 override `OutboxRelay`）；模拟 Odoo `auth_oauth` 隐式流：登录拿会话 → `authorize` 302 fragment 取 `access_token` → 以 Bearer 打 `userinfo` 断言裸 `{sub,email,name}`（锁非信封）。
- **四处实施期实查（v0.6.0·真库实跑拓出）**：① **harness 需补 `setGlobalPrefix('api')`+`enableVersioning(URI,'1')`**——`auth-http-surface` 只打 BA 实例级字面通配 `/api/v1/auth/*` 故不需·我方 Nest controller 依赖此二者否则实际注册在裸 `/oauth2/*` → `/api/v1/oauth2/*` 404（openapi:codegen 走真 bootstrap 有施加故含路由·测试 harness 须同装配）；② **`authorize` 需标 `@TenantIsolationExempt()`**——全局除 `SessionGuard`/`CsrfOriginGuard` 外尚有**第三道** `TenantIsolationGuard`（deny-by-default 租户墙·跑在会话墙后），OP 为跨租身份提供方、已认证但合法无租户上下文·不豁免则携会话 GET 被 403 死锁（`userinfo` 因 `@Public` 已被租户墙旁路）；③ **client 注册表经「副作用先行导入」预置**——`default.ts` 为对象字面量、`parseSsoClients(process.env...)` 于**模块导入期**静态求值，`beforeAll` 设 env 太晚；新建 `oauth-sso.e2e.setup.ts`（仅设 env）作测试文件首条 import（ESM 按声明序求值·早于任何触达 config 的模块）；④ **`authorize` 显式 `reply.code(302).redirect()`**——实跑发现 harness 下裸 `reply.redirect()` 状态留 200（仅 `Location` 正硬），显式钉 302 与隐式流协议一致。
- **登记 `GATED_E2E_FILES`**（`scripts/ci-fullstack.ts`）——**新增 gated e2e 必须同步登记**，清单/实存恒等校验机制 fail-loud（AGENTS §4：漏登 ≠ 在链·手动单跑绿不算）。
- **跨系统真 Odoo 对拍**：另起 OdooThink_20 compose 的 Odoo 容器，`auth.oauth.provider` 指我方 endpoint + `auth_oauth.authorization_header=true`，跑 login → 落 Odoo 会话 → `/web/session/get_session_info` 200 —— **此段为部署态人工/专项对拍**（本仓默认链不编排外部 Odoo 容器·归运行期验证），完成判据以「配置就位 + 我方端点契约测绿」为 L1 口径，真 Odoo 联调作结项证据由人执行或另立 runbook。

## 3. Odoo 侧配置清单（零代码·供联调参考·非我方代码交付）

- 装 `auth_oauth`（依赖 `auth_signup`·JIT 建号通道）。
- `auth.oauth.provider` 记录：`auth_endpoint` = `https://<我方>/api/v1/oauth2/authorize`；`validation_endpoint` = `https://<我方>/api/v1/oauth2/userinfo`（路径经 v0.4.0 由 `/auth/oauth2/*` 修正为 `/oauth2/*`·避 BA 通配抢路由）；`scope` = `openid profile email`；`client_id` = 注册表内值；`enabled = true`。
- `ir.config_parameter`：`auth_oauth.authorization_header = true`（使 userinfo 回源走 `Authorization: Bearer`，与我方切片 D 验签口径对齐）。
- JIT/预配策略（依 §5·裁 ⓑ 结论）：`no_user_creation` 上下文或 `auth_signup` 白名单配置。
- 可由 OdooThink_20 侧 data addon 固化（零 Python·合其宪法「标准接口集成」）。

## 4. 影响面与风险（承接调研 §5·9 条→本案 scope 内缓解落点）

| # | 风险 | 本案缓解落点 |
|---|---|---|
| 1 | 隐式流已被 OAuth 2.1 弃用（token 走 fragment） | 超短 TTL（60–120s）·一次性·`aud` 绑定 client·精确 `redirect_uri` 白名单·仅受信部署间；长期演进位=丁档（本案非目标） |
| 2 | Odoo 持久存 `oauth_access_token` 到 `res.users` | 短 TTL 使落库值快速失效；Odoo 侧例行清除 |
| 3 | JIT 建号治理（点一次即在 ERP 建号） | 归产品裁（§5·裁 ⓑ）；userinfo 侧只保证「邮箱已验证」硬门，建号策略留 Odoo 配置 |
| 4 | CE 无 audience/confused-deputy 校验（源码注释明示） | 切片 D **强制 `aud` 校验**（我方 provider 侧补位） |
| 5 | 单点登出不可达（CE 无 backchannel logout） | 如实标注产品边界：两侧会话各自过期（不承诺 SLO） |
| 6 | BA 官方 provider 插件「文档有·包没有·将废弃」 | 不依赖之，薄自建（`jwt`/`one-time-token` 现成件·实查选型）；未来稳定版另评估换轨 |
| 7 | 多租户 × 单库 | 按 Odoo 实例绑 `client_id`；身份取平台级（`sub`=平台 user id），无结构冲突 |
| 8 | PIPL 跨系统 PII | 仅传最小 `sub/email/name`·email 须已验证；不涉出境 |
| 9 | 流程面：触 auth 高危 + 新公共 API 契约 + config/env | 见 §5 高危触面；无已审方案不写码·逐片人签 |

**新增工程面风险（本案特有）**：
- **openapi drift**：新增 2 端点必改 OpenAPI 产物 → `pnpm run build` 的 openapi 对拍步须重生成一致（否则 `ci` fail）。
- **ESM/装饰器元数据（R-η）**：Controller 的 zod schema 与注入类**值导入**；`@Query({ schema })` / `@SerializeOptions({ schema })` 缺值导入则校验/序列化静默跳过；构造函数注入须显式 `@Inject`（防 `UnknownDependenciesException`）。
- **会话墙语义分层**：`authorize` 默认在墙内（401 未登录）；`userinfo` 加 `@Public` 旁墙但自带 Bearer 验签——须守「后端不可用(5xx) vs 未授权(401/403)」区分，勿把验签失败误裸抛。

## 5. 审计记录（无已审方案不写码 · 本案触高危须人签）

> 本案命中高危：**改 auth 面**（AGENTS §2 / workflow §3 高危清单）+ **新增公共 API 契约**（高危#4）+ **改 `config/env` 键**（高危#5·`.env.example`）。**零 schema 迁移**（不新增表·不触高危#1）。须过审计门 + 人签核后方逐片实施。

- 结论：**已审计·签发**（人「同意」2026-10-24＝审计门 GO·进实施·ⓐ–ⓓ 全按推荐档定档·高危 auth 面 + 新公共 API 契约#4 + config/env#5 随此签·B/C/D 逐片亲签落地·问责归令者）——切片 A（契约·纯增量零行为）本窗实施；B config/env、C/D 新契约端点逐片再亲签。
- 裁定记录（**人裁 2026-10-24·承调研 §8**）：
  - **ⓐ 身份中心方向**：✅ **甲档**（本仓为 OP·SaaS→Odoo 单向）——本案 scope 锚点。
  - **ⓑ JIT 建号 vs 预配映射**（风险 #3）：✅ **预配优先 + JIT 白名单**（推荐档）——userinfo 侧锁「邮箱已验证」硬门；Odoo 侧 `no_user_creation` 上下文/白名单防任意平台用户一键建 ERP 号（建号策略落 §3 Odoo 配置项）。
  - ⓒ 是否需要反向（Odoo→我方）SSO：✅ **暂不做**（保守档·非目标已排除丁档）——反向需求另立丁档切片，本案仅甲档单向。
  - ⓓ 是否登记 `@better-auth/sso` 为企业 SSO 入站独立候选（调研 §6）：✅ **不引入·不额外登记候选行**（保守档·防过度建面）——触发条件=企业客户自带 IdP（AD/Okta）需求 + BA 升级窗口时再议。
- 高危逐次签核边界：切片 B（config/env）与切片 C/D（新契约端点）各自高危，逐片亲签；Odoo 联调真跑对拍属部署声明（tooling §4.10）·结项以实跑链为验收口径。
- 审计人 / 日期：人（GO）/ 2026-10-24

## 6. 完成判据（可核验 + 穷尽）

- [x] 切片 A（已落地 2026-10-24）：contracts 新增 schema 值导出可被 Controller 值导入·strict 负向镜测在位·`build:client` 绿（8 测绿·Biome 净·build:libs TSC 0）
- [x] 切片 B（已落地 2026-10-24）：`verify:config-contract` 四角绿（判据①②③全过）·空注册表 → `parseSsoClients` 返回 `[]` fail-closed 单测在位·`.env.example` 占位无真实凭证（注释态）·`build` TSC 0 issue
- [x] 切片 C（已落地 2026-10-24·路径修正 `/oauth2/authorize`）：`authorize` 正向（302 fragment + 短 TTL `aud` JWT）+ 负向矩阵（未注册/非精确 redirect/state 透传/token 篡改/换密钥/过期）单测 10 绿·`build` TSC 0·全量 `test` 899 绿无回归·openapi.yaml + schema.d.ts 已重生（+authorize path·纯新增无删除）；response_type/scope 越界已在切片 A zod 契约层拒入
- [x] 切片 D（已落地 2026-10-24·`/oauth2/userinfo`）：`userinfo` `@Public` + Bearer 验签 + `aud` 强制校验（∈注册受众集）+ 邮箱已验证硬门；正向（权威 `{sub,email,name}`）+ 负向矩阵（缺头/非法令牌/`aud` 不符/主体查无→401·未验证→403）单测 6 绿·`build` TSC 0·全量 `test` 153 files 绿无回归·config-contract/domain-layout/i18n-parity 全 PASSED·openapi.yaml+schema.d.ts 已重生（48 paths·+userinfo·纯新增）；裸 JSON 经 `@Res().send` 绕 envelope·身份取 user 表实时值（非令牌 claims）
- [x] 切片 E（已落地 2026-10-24·收口）：DB-free 反射元数据测 `api/oauth-sso.controller.metadata.test.ts`（3 绿·authorize 携 `authorizeQuerySchema`+未标 `@Public`落墙内·userinfo 标 `@Public`）+ gated 真库 e2e `oauth-sso.e2e.test.ts`（8 绿·隐式流全链：登录→`authorize` 302 取 fragment `access_token`→Bearer 打 `userinfo` 得裸 `{sub,email,name}`·含未注册/`response_type` 越界 400·无会话 401·非法 Bearer 401·未验证 403）——**已对真库实跑全绿**（`postgres-dev`/`nestjs_e2e`·12 migrations·非仅 skip）·`GATED_E2E_FILES` 已登记（C1 恒等不 fail-loud）·`build` TSC 0·`verify:test-types` EXIT 0·全量 `test` 154 files 绿无回归·四便宜闸 PASSED
- [ ] `pnpm run verify:test-types` + full `pnpm run ci` 全绿（含 openapi drift 一致·type-escape ratchet 不劣化·fallow 佐证 0 边界违例）
- [ ] 零 schema 变更：`migration:generate` 空 diff（不新增表·client 走 config）
- [ ] 真链路对拍（结项证据）：Odoo 容器 `auth.oauth.provider` 指我方 → login 落 Odoo 会话 → `/web/session/get_session_info` 200（人执行或另立 runbook 存照）
- [ ] 文档状态单源：本案 README 索引行随各切片推进翻账

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-24 | 0.1.0 | 起草（承调研 §8 人裁甲档） | 首版：本仓充当 Odoo OIDC OP 的甲档实施细化——2 端点（authorize 会话墙内 / userinfo `@Public`+aud 验签）契约、client 走 config 不新增表、gated e2e 真链路对拍、9 条风险缓解落点；ⓐ 已裁甲档，ⓑ–ⓓ 归人裁未决 |
| 2026-10-24 | 0.2.0 | 审计门 GO·进实施 | §5 翻账为「已审计·签发」并落裁定：ⓐ甲档/ⓑ预配优先+JIT 白名单/ⓒ暂不反向/ⓓ不引入不登记（均推荐·保守档）；本窗实施切片 A（契约纯增量零行为·含 4 校验键 zh/en 双份 + strict/refine 镜测），B/C/D 逐片再亲签 |
| 2026-10-24 | 0.3.0 | 切片 B 落地 | 实施 client 注册表配置面：新 `config/envs/sso-clients.ts`（`ssoClientSchema` + `parseSsoClients`·未配→[] fail-closed·非法→fail-loud）+ `default.ts` 挂 `oauthSso.clients` + `interfaces` 扩 `OauthSsoConfig` + `config.module.ts` baseSchema 补 `SSO_OAUTH_CLIENTS`(.optional 免动 compose) + `config.service` 加 `getOauthSsoConfig` + `.env.example` 注释态占位；单测 4 绿·四角对拍 PASSED·`build` TSC 0；C（authorize 端点·触 auth+openapi）回签待 GO |
| 2026-10-24 | 0.4.0 | 切片 C 落地·路径修正 | 实施 `authorize` 端点：新 `api/oauth-sso.controller.ts`（`@Controller('oauth2')`·默认会话墙内·`@Res()` 直发 302）+ `infrastructure/sso-token.service.ts`（`node:crypto` HS256 铸/验·TTL 120s）+ `infrastructure/oauth-sso.service.ts`（client/redirect 精确白名单校验）·`auth.module.ts` 挂 controller + 两 provider。**两处实施实查修正草案**：① 路径 `/auth/oauth2/*`→`/oauth2/*`（避 BA 实例级通配 `app.all('/api/v1/auth/*')` 抢路由·D 同步）；② token 件 BA `jwt`→`node:crypto` 手写（顶层 `jose`/`jsonwebtoken` 不可裸引·甲档对称短 TTL bearer 非完整 RS256 OP·复用 `auth.jwt.secret`）。单测 10 绿·修 1 真 bug（签发段误按 utf8 而非 base64url 编码）·`build` TSC 0·全量 `test` 899 绿·config-contract/domain-layout/i18n-parity 全 PASSED·openapi drift 仅未提交产物所致（随片提交转绿）；D（userinfo·`@Public`+aud 验签）回签待 GO |
| 2026-10-24 | 0.5.0 | 切片 D 落地 | 实施 `userinfo` 端点（同 controller `@Get('userinfo')`+`@Public()`·落 `/api/v1/oauth2/userinfo`）+ `OauthSsoService.resolveUserInfo`（Bearer 提取→验签→`aud`∈注册受众→`em.findOne(User,{id})` 取实时权威行→邮箱已验证硬门）。**两处实施实选**：① 裸 JSON 走 `@Res().send` 而非 `@SerializeOptions`（后者会被全局 `TransformInterceptor` 包络·Odoo 无法解析）；② 身份按 `sub` 走同域 Mikro 直读 user 表（`AUTH_USER_STORE` 仅写侧·不扩端口）。未新增 `ERROR_CODES`（保 @core 契约不动·本端点无本站 SPA 消费方）；未验证 403 / 其余 401。单测 6 绿·`build` TSC 0·全量 `test` 153 files 绿无回归·三便宜闸 PASSED·openapi 重生 48 paths·零 schema未触 migrate；E（gated e2e 隐式流模拟 + `GATED_E2E_FILES` 登记）回签待 GO |
| 2026-10-24 | 0.6.0 | 切片 E 落地·收口 | 新增 gated 真库 e2e `oauth-sso.e2e.test.ts`（8 绿·隐式流全链）+ DB-free 反射元数据测 `api/oauth-sso.controller.metadata.test.ts`（3 绿）·登记 `GATED_E2E_FILES`（`scripts/ci-fullstack.ts`·C1 双向恒等）。**四处实跑修正**（详见 §2 切片 E）：harness 补 `setGlobalPrefix`+`enableVersioning`·`authorize` 标 `@TenantIsolationExempt()`（第三道全局租户墙对已认证无租面 403）·client 经副作用先行 setup 模块预置（`default.ts` 导入期静态读 env）·`reply.code(302).redirect()` 显式钉状态。无新增路由/schema→openapi 无需重生（仍 48 paths）。**已对真库实跑全绿**（`postgres-dev`/`nestjs_e2e`·12 migrations·非仅 skip）·`build` TSC 0·`verify:test-types` EXIT 0·全量 `test` 154 files/14 skip 绿·四便宜闸 PASSED·Biome 净（仅余 1 条 pre-existing 无关 info）。未提交（A–E 归人）·真 Odoo 跨系统对拍归人/另立 runbook |

---

<!-- 变更戳 -->
正文已于 2026-10-24 / v0.1.0 成文（候选稿·待审计门），以当前正文内容为准。
