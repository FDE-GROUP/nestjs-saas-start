# 与 Odoo（OdooThink_20）单点登录 · 可行性调研

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）
> 关联: [better-auth-org.md](./better-auth-org.md)（BA 身份栈地基）· [better-auth-cn-providers.md](./better-auth-cn-providers.md)（境内登录面）· `specs/architecture` BA 定位条（「BA 只管认证」）· `AGENTS.md` §2 高危清单（auth 面 / 依赖 / schema）
> 日期: 2026-10-24 | 证据基线: 本仓 `better-auth@1.7.7`（npm registry exports 实查）· Odoo **20.0 FINAL CE**（`~/EA/odoo20/ce` `origin/20.0` 源码实读）· OdooThink_20 仓（`/home/abel/EA/OdooThink_20`·重构宪法实读）· [Better Auth SSO/OIDC 官方文档](https://better-auth.com/docs/plugins/sso)
> 本文只作制定 plan 的**参考**，结论须经人二次核验后方可写入方案（`workflow.md` §3）。**本文不裁决、不写码**；实施须另立 plan 过审计门。
> 受众: **Agent 可参考（非依据）· 人主导判读**

---

## 0. 调研目的

回答：**本框架（nestjs-saas-start·Better Auth 身份栈）与 Odoo（OdooThink_20·Odoo 20 CE + OKEE 前端）之间实现单点登录（SSO）是否可行、代价几何、走哪条路**。据此为「身份中心放哪边」「协议怎么选」「两侧各动多少」提供证据输入。核心悬念两个：

1. Better Auth 能否当**身份提供方（IdP）**让 Odoo 来消费？
2. Odoo 20 CE 能否当 IdP（或至少以可接受代价补齐该能力）让本框架消费？

## 1. 结论速览

**可行性：高（方向选定后约 1–2 周量级）。** 推荐**甲档起步**：

> **甲档 = 本框架为身份中心**：我方自建**薄 OAuth2 provider 面**（authorize + userinfo 两端点·满足 Odoo 隐式流），**Odoo 侧零代码纯配置**（`auth.oauth.provider` 记录 + 2 个参数）接入 `auth_oauth`。

三条硬事实支撑这个分岔（取证见 §2）：

- **Odoo 20 CE 的 `auth_oauth` 只是消费端**，且**仅支持隐式流**（`response_type=token`·无 code flow/PKCE/client_secret）——任何「Odoo 消费外部 IdP」的方案都受此协议形状约束；
- **Odoo CE 无任何 IdP 面**（无 authorize/token/userinfo provider 端点；EE 的 `auth_saml` 也是消费端）——「Odoo 为 IdP」必须自写 addon；
- **Better Auth 1.7.x 已发布包无 OIDC/OAuth Provider 插件**（1.7.7 与最新 1.7.12 的 npm exports 均无 `./plugins/oidc`；上游文档虽有但自标「active development·即将废弃」且未随包发布）——「我方为 IdP」不能开箱即用，需薄自建（工作量可控·§4）。

`@better-auth/sso` 官方插件（用户所指）经核实是**消费端（SP）插件**（OIDC+SAML 2.0 入站+域验证），**不提供 IdP 能力**——它不改变甲档结论，但把乙档（Odoo 为 IdP）的我方成本降到近零（§6）。

## 2. 双方现状取证

### 2.1 Odoo 20 CE（`~/EA/odoo20/ce/addons/auth_oauth/` 源码实读）

| 面 | 事实 | 出处 |
|---|---|---|
| 登录协议 | **仅隐式流**：`list_providers` 构造 `response_type='token'` 授权链接；回调 `/auth_oauth/signin` 经 `@fragment_to_query_string` 把 URL fragment 转 query 取 `access_token` | `controllers/main.py:33-44, 94-96` |
| provider 模型 | 字段仅 `client_id / auth_endpoint / scope(缺省 'openid profile email') / validation_endpoint(UserInfo URL) / data_endpoint / enabled / body`——**无 token_endpoint、无 client_secret、无 issuer/JWKS** | `models/auth_oauth.py:13-23` |
| userinfo 契约 | GET `validation_endpoint`；`auth_oauth.authorization_header` 参数为真时带 `Authorization: Bearer`，否则 `?access_token=` query；期望 JSON 含 `sub`/`id`/`user_id`（三选一·统一为 subject）+ `email` + `name`；可选 `data_endpoint` 结果合并 | `models/res_users.py:47-87` |
| 用户匹配 | 按 `(oauth_provider_id, oauth_uid)` 唯一约束查 `res.users`；无匹配且未设 `no_user_creation` 上下文 → **JIT 自动建号**（`auth_signup` 通道·login=email·email 缺省 `provider_{p}_user_{uid}`） | `models/res_users.py:27-30, 104-133` |
| 凭证落库 | `oauth_access_token` 持久存 `res.users`（参与会话 token 字段集·有 UI 清除入口） | `models/res_users.py:24, 41-45, 169-170` |
| 安全面 | CE 源码**注释掉**了 confused-deputy/audience 校验（只留 advice 注释）——audience 绑定须由 provider 侧自行强制 | `models/res_users.py:137-141` |
| 登出 | 无 OIDC backchannel logout / 单点登出机制——两侧会话各自独立过期 | 模块全貌 |

**CE 认证模块盘点**：`auth_ldap / auth_oauth / auth_passkey / auth_signup / auth_totp` 等——**全部是消费/增强端，无 provider 端模块**。

### 2.2 OKEE（OdooThink_20 的 React 前端）

- 登录走 `okee-client` 的 `authenticate(db, login, password)`（JSON-RPC `/web/session/authenticate`）→ **建的是 Odoo 会话**；Odoo 会话即 OKEE 会话（同源反代）。**Odoo 层的任何 SSO 天然覆盖 OKEE，无需改 OKEE**。
- 出处：`apps/okee/src/api/auth.ts`（14 行薄封装）。

### 2.3 OdooThink_20 仓宪法（README 重构原则）

- **零修改 Odoo core**：只经标准接口（JSON-RPC / WebSocket / addon 机制）集成——自写**薄 addon 合法**，但「纯配置」更优；
- OKEE 反代同源拓扑（`/`→SPA·`/web`·`/websocket` 反代 Odoo）——浏览器侧跨站问题最小化。

### 2.4 本框架（Better Auth 1.7.7·npm registry 实查）

| 面 | 事实 |
|---|---|
| 消费能力 | `generic-oauth` 插件在包内（含 keycloak/okta/auth0/entra 预设）——**消费外部 OIDC IdP 开箱可用** |
| **IdP 能力** | **无**：`better-auth@1.7.7` 与最新 `1.7.12` 的 exports（各 54 项）均不含 `./plugins/oidc`；dist/plugins 实查无 oidc 目录；上游 [v1.6 OIDC Provider 文档](https://better-auth.com/docs/1.6/plugins/oidc-provider) 自标「active development·may not be suitable for production·即将废弃转 OAuth Provider Plugin」且**未随 npm 包发布** |
| 可复用件 | `one-time-token`（一次性令牌铸造/兑换）、`jwt`（JWT access token）、`bearer` 插件均在包内——薄自建 provider 面的现成积木 |
| `@better-auth/sso` | **消费端（SP）插件**：OIDC discovery + OAuth2 + **SAML 2.0** 入站 + DNS TXT 域验证 + user/org provisioning hooks；`@better-auth/sso@1.7.12` peer 要求 `better-auth ^1.7.12`（本仓钉 1.7.7）·新增 6 依赖（samlify/jose/tldts/XML 栈）·`npx auth migrate` **新增表**（详见 §6） |
| 会话墙 | 全局 deny-by-default（S11）——新增 authorize 端点须嵌在既有守卫语义内 |

## 3. 四方案对比

| 方案 | 拓扑 | 我方工作量 | Odoo 侧工作量 | 评估 |
|---|---|---|---|---|
| **甲：我方 IdP + Odoo `auth_oauth` 直连** | SaaS→Odoo 单向 SSO | 薄 provider 面（2 端点+配置面·§4） | **零代码**：provider 记录 + `auth_oauth.authorization_header=true` + `auth_signup` 依赖（可 data addon 固化） | ✅ **推荐起步**——协议完全落在 Odoo 既有能力上，两侧改动最小 |
| **乙：Odoo 为 IdP + 我方消费** | Odoo→SaaS 单向 SSO | 近零（`@better-auth/sso` 或 generic-oauth） | **自写 provider addon**（authorize/token/userinfo/discovery——CE 完全没有） | ⚠️ 可行但 Odoo 侧是硬成本；且身份中心放 ERP 与本框架「BA 身份栈」定位冲突 |
| **丙：中间 broker**（Keycloak/Casdoor） | 双方都消费 | 改消费端 | 改消费端 | ❌ 现阶段成本最高、身份 SSOT 分裂；仅当未来多系统联邦（企微/钉钉统一入口·N 应用）时再议 |
| **丁：自定义 token 桥**（HMAC 短时 token + Odoo 薄 addon `/sso/login`） | 可双向 | 1 端点铸 token（可复用 one-time-token） | 薄 addon（合法但自维护） | ⚠️ **甲的演进位**——规避隐式流弃用问题、可补「Odoo→我方」反向；两侧均自定义安全面，起步不必 |

**匹配语义（甲档）**：Odoo 按 `oauth_uid` ≡ 我方 `sub`（平台 `user.id`·稳定）；email 仅作 Odoo 侧 login 字段；多组织（org）语境与 Odoo 登录无关（身份取平台级）。

## 4. 甲档落地形态（推荐·供 plan 起草参考）

**我方新增**（全部居 `modules/auth`·触 auth 高危面·须 plan 过审计门）：

1. `GET /api/v1/auth/oauth2/authorize` —— 会话墙后：校验 `client_id` 已注册、`redirect_uri` **精确白名单**匹配、`response_type=token`、`scope ⊆ openid profile email`；以 BA 会话身份铸**超短 TTL JWT**（`sub`=平台 user id·`aud`=client_id·60–120s·一次性）；302 至 `redirect_uri#access_token=…&state=…`（fragment）。
2. `GET /api/v1/auth/oauth2/userinfo` —— 验 JWT（含 `aud` 校验·补位 Odoo CE 缺失的 confused-deputy 防线）；返回 `{ sub, email, name }`；**要求邮箱已验证**（复用 `ORG:PROVISIONING_REJECTED` 验证门语义）。
3. client 注册表入 env/config（zod 契约·四角对拍）——**不新增 BA 表**，绕开「BA 表契约」红线语境。

**Odoo 侧配置**：`auth.oauth.provider` 记录（`auth_endpoint`/`validation_endpoint` 指我方）+ `ir.config_parameter` `auth_oauth.authorization_header=true` + 装 `auth_signup`。可由 OdooThink_20 侧 data addon 固化（零 Python）。

**验证路径**：挂现有 e2e 黄金流体系——Testcontainers PG + 本仓产物起服，另起 OdooThink_20 compose 的 Odoo 容器做真链路对拍（login → 落 Odoo 会话 → `/web/session/validate` 200）。

## 5. 风险登记册

| # | 风险 | 缓解 |
|---|---|---|
| 1 | **隐式流已被 OAuth 2.1 弃用**（token 走 URL fragment·浏览器历史/Referrer 暴露面） | 超短 TTL（60–120s）·一次性·`aud` 绑定 client·精确 redirect_uri 白名单·仅受信部署间使用；长期可换丁档 |
| 2 | **Odoo 持久存 `oauth_access_token`** 到 `res.users` | 短 TTL 使落库值快速失效；或 Odoo 侧例行 `remove_oauth_access_token` |
| 3 | **JIT 建号治理**：默认任何平台用户点一次即在 ERP 建号 | 裁「预配映射优先 + JIT 关闭（`no_user_creation`）/白名单」——**归产品决策** |
| 4 | **CE 无 audience 校验**（源码注释明示） | 我方 provider 在 token 内强制 `aud` 并在 userinfo 校验 |
| 5 | **单点登出不可达**（CE 无 backchannel logout） | 如实标注产品边界：两侧会话各自过期 |
| 6 | **BA 升级路径不确定**：官方 provider 插件「文档有·包没有·将废弃」 | 短期不依赖它（薄自建更可控）；若未来发布稳定 OAuth Provider 插件再评估换轨 |
| 7 | **多租户 × 单库**：我方多组织 vs Odoo 按部署单库 | 按 Odoo 实例绑 `client_id` 即可；身份取平台级，无结构冲突 |
| 8 | **PIPL**：跨系统仅传最小 PII（`sub/email/name`） | 不涉出境；email 须已验证才放行 SSO |
| 9 | 本仓流程面：触 **auth 高危**（AGENTS §2）+ 新端点契约 | 无已审方案不写码；plan 过审计门·人签核 |

## 6. `@better-auth/sso` 插件评估（乙档修正 + 独立候选）

**定位核实**（[官方文档](https://better-auth.com/docs/plugins/sso) + npm 实查）：消费端（SP/RP）插件——`/sso/register`·`/sign-in/sso`·SAML SP metadata/ACS·OIDC callback；企业配套 DNS TXT 域验证（email 域→IdP 路由）、`resolveUser` 账号映射、**user/organization provisioning hooks**。

- **对甲档无帮助**（方向相反）；**对乙档**：把我方消费面升级为开箱的 OIDC+SAML+域验证（与多租户 org 模型天然契合），但 Odoo 侧自写 provider addon 的硬成本不变——乙档整体从「两侧重」变「Odoo 侧重」。
- **本仓采纳门槛（三道·实查）**：
  1. peer 要求 `better-auth ^1.7.12`（本仓钉 1.7.7）→ 须先做 BA 升级（auth 高危：全量 ci 基线恒等 + `test:auth-consistency` 9/9 真库复验）；
  2. `npx auth migrate` **新增表** → 触宪法「BA 表契约」红线语境（Ⅲ BA 表非专用与业务共享·Ⅳ改表契约优先）与高危#1 schema——须人亲签；
  3. 新增 6 依赖（samlify/jose/tldts/XML 栈）→ 供应链高危签核；npmmirror 镜像同步待实查（先例：fallow 平台件镜像缺 3.33.1）。
- **独立价值**（与 Odoo 无关）：企业客户以自家 IdP（AD/Okta 等）SSO 入平台是 B2B SaaS 经典场景，本插件为此而生——**登记为路线图候选**，不因 Odoo 一案连带引入。

## 7. 工作量量级

| 侧 | 内容 | 量级 |
|---|---|---|
| 我方（甲档） | 2 端点 + client 配置面 + 负向测 + e2e | 与 `global-error-envelope-reason-phrase` 同级偏上·1 plan·2–3 切片 |
| Odoo 侧（甲档） | 纯配置 + 对拍 | 半天 |
| 若走丁档追加 | 我方 token 铸造端点（复用 one-time-token）+ Odoo 薄 addon | 各约 1 切片 |

## 8. 需人裁定的点（本文不裁决）

1. **身份中心方向**：甲（SaaS 为中心）为默认推荐；若业务上 Odoo 员工档案才是主身份源，重议乙（配 `@better-auth/sso` + Odoo provider addon）。
2. **JIT 建号 or 预配映射**（风险 #3）。
3. **是否需要反向（Odoo→我方）SSO**——需要则甲+丁并走。
4. 是否同步将 `@better-auth/sso` 登记为企业 SSO 入站方向的独立候选（§6）。

## 9. 证据清单

- Odoo 20 CE 源码：`~/EA/odoo20/ce/addons/auth_oauth/{controllers/main.py, models/auth_oauth.py, models/res_users.py}`（`origin/20.0`·逐行实读）
- OKEE：`OdooThink_20/apps/okee/src/api/auth.ts`；OdooThink_20 `README.md` 重构原则
- 本仓：`node_modules/better-auth@1.7.7` dist/plugins 与 package.json exports 实查；npm registry `better-auth@1.7.7` / `1.7.12` exports（各 54 项·无 `./plugins/oidc`）；`@better-auth/sso@1.7.12` peerDependencies/dependencies
- 官方文档：[Better Auth SSO 插件](https://better-auth.com/docs/plugins/sso)·[v1.6 OIDC Provider（自标不稳·将废弃）](https://better-auth.com/docs/1.6/plugins/oidc-provider)·[1.3 发布说明](https://better-auth.com/blog/1-3)
