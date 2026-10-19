> 用途: **已审方案（开发依据）** | 状态: v0.3.0 · 已实施（人令「你自行裁定」代裁 GO·prod 实机/SMTP 真值段归运维） | 受众: 人（审计门）+ Agent
> 适用范围: `全局（生产登录面·auth 认证面 + config 契约 + 部署 env）`（blast radius 大·生产安全面）| 关联: [module-auth-magic-link](./module-auth-magic-link.md)（本片承接其未决项①「生产启用另需单独签核」）· global-tenancy D8/FR-3 · global-cn-adaptation（邮件送达）· module-common-rate-limit · tooling-standards §4.10（部署声明须真跑对拍）
> 定位: 评估把 magic-link 从「**仅非生产挂载**」扩到「**生产启用**」。父片 v0.3.0 刻意保守（生产登录面零变更），本片专司解除该门禁的**决策与前置条件**。
> 铁律: 触 `AGENTS.md` §2 多重高危——**改 auth 生产认证面 + 改 config 契约（APP_URL 上图/required）+ `.env`/SMTP 密钥 + compose 部署声明**→ **审计门强制·逐条人签核**；生产开新登录面属产品/安全裁决（P2 归人）。本片经人令「你自行裁定」= 签核与授权执行（问责归签核人）·Agent 代裁采最小安全姿态实施·但 **不臆造生产密钥/域名**（CORS_ORIGIN/SMTP 真值归运维）·**不代跑无法真跑的 prod SMTP 端到端**（§4.10）。

## 0. 一句话

magic-link 已非生产接入（父片 bcb1448）；**生产启用不是「删一行门」那么简单**——它引入一条**免密、且默认自动建号**的公开登录通道，叠加生产 SMTP 送达、APP_URL canonical、可信源/回调、滥用面四组前置条件，全部须先由人裁形态（开放注册 vs 仅存量用户登录）再实施。

## 1. 现状取证（代码实证）

- **挂载门**：[`auth.implement.ts:209`](../apps/api/src/modules/auth/auth.implement.ts) `...(process.env.NODE_ENV !== 'production' ? [magicLink({...})] : [])`——生产不挂 magicLink。移除该三元门即生产挂载。
- **生产现登录面**：`emailAndPassword.enabled = NODE_ENV!=='production'`（L236·生产关）→ 生产**当前无邮箱/密码登录**，唯一通道 = social OAuth + genericOAuth（境内飞书·FR-3/A1）。magic-link 将是生产**首条邮箱原生免密登录面**，与「邮箱为体」CN 策略高度相关（D8 排序）。
- **自动建号语义（源码坐实·better-auth@1.7.7 `plugins/magic-link/index.mjs` L179-200）**：verify 时 `findUserByEmail` 落空 → 若 `!opts.disableSignUp`（**默认关=false=自动建号开**）则 `createUser({ email, emailVerified:true, name })`。⇒ 默认形态下**任何持有可收邮箱者点链接即注册并登录**，等同开放自助注册口（新号无租户→落父 onboarding `pending_approval` 空态·S4 语义不受损，但仍是「未鉴别的公开 signup」）。
- **开放重定向**：`callbackURL`/`newUserCallbackURL`/`errorCallbackURL` 经 `originCheck` 中间件（L141-144）校验·回跳目标须在 `trustedOrigins`。生产 `trustedOrigins = corsConfig.origin`（L117-119）——**须含生产前端源**，否则回跳被拦/断。
- **canonical base 依赖 APP_URL**：`baseURL: process.env.APP_URL || undefined`（L116）；`grep APP_URL` 仅命中 `.env.example`，**非 Joi required·不在 compose**。生产未设 → BA 回退请求 origin（反代后易得内网 host/错域·邮件链接不可点）。
- **滥用/枚举**：`POST /sign-in/magic-link` 对任意邮箱**先发短信再判存在性**（建号在 verify），故本身即邮件投放口；受 `rateLimit:{enabled:true}`（L227·库默认登录类窗）+ 插件级 rateLimit 双重约束，但**生产 SMTP 配额/费用/信誉**仍是真约束（刷信可耗尽发信额度/触发服务商限流）。
- **前端面**：`apps/web/src/routes/login.tsx` `MagicLinkSection` **无条件渲染**——生产当前（未启用）点击会 404（父片留「实机对拍归人」·此 prod 死钮未见专票处置）。启用后此不一致自然消解；若不启用，另需前端 env 门（前端难知后端 NODE_ENV·见未决项）。
- **schema**：magic-link token 存 BA `verification` 表（`storeToken/consumeVerificationValue` 复用既有表·父片坐实「零迁移」）·生产启用不新增迁移。

## 2. 方案（切片·先裁形态再实施）

1. **裁形态（核心前置·归人）**：`disableSignUp` 取值二选一——
   - **乙·仅存量用户登录（推荐·安全档）**：`magicLink({ disableSignUp: true, ... })`。magic-link 只作既有账号的免密登录通道，不建号；生产不新增开放注册面（注册仍走 OAuth/邀请）。
   - **甲·开放自助注册**：保持默认（自动建号）。等于生产开一条「有邮箱即可注册」口·与 S4 审批制正交（能建 user 但不能自建活跃租户）·需产品明确背书。
2. **移门 + 形态落地**：`auth.implement.ts` 把 magicLink 从三元门移出为无条件挂载·按裁定带 `disableSignUp`。
3. **APP_URL 生产 canonical（触 config 契约·§2）**：二选一——(a) 把 `APP_URL` 升为 Joi `.required()`（生产缺即 fail-loud·与 D4 同构）并入 compose `services.app.environment`（触发 `verify:compose-contract` 判据③）；或 (b) 维持可选但文档化「magic-link 生产必设」。推荐 (a)·否则错配静默产出不可点链接（父片 §4.10 教训族）。
4. **可信源/回调**：确保生产 `CORS_ORIGIN`（→ trustedOrigins）含真实前端域·`originCheck` 才放行回跳。若前端与 API 同域反代则同源即可。
5. **SMTP 生产 + CN 送达**：确认生产 `MAIL_*` 为真实可用 SMTP 且送达达标（gmail 大陆差·见 global-cn-adaptation）；发信额度/退信监控（本片可仅打通·监控另议）。
6. **滥用缓解**：评估对 `/sign-in/magic-link` 收紧专属限流窗（库默认对登录类 3/10s 可能不足以护邮件配额·是否 per-email/per-ip 加档归人）。
7. **测试/对拍**：gated e2e（真库·`disableSignUp` 两态各测：存量邮箱→建会话·陌生邮箱→按形态拒绝/建号·`MAIL_*` override 捕 URL 校验回跳+originCheck）+ 登记 `GATED_E2E_FILES`；**生产实机端到端（真点邮件链接）归人·不自动代跑**。

> 机制非特判：门移除后 magic-link 与既有插件同走无条件挂载·`disableSignUp`/`APP_URL` 皆框架级配置项·不逐环境打洞。

## 3. 实施次序（审计 GO 后·切片可拆）

P-0 形态裁决（乙/甲·归人）→ P-1 移门 + `disableSignUp`（+ 甲则配套产品确认开放注册）→ P-2 `APP_URL` 契约升格（Joi required + compose·触 `verify:compose-contract`/`verify:config-contract`）→ P-3 `CORS_ORIGIN`/回调对拍 → P-4 SMTP 生产确证 → P-5 限流评估 → P-6 gated e2e + 登记 → P-7 `pnpm run ci` + `verify:compose-contract` + `verify:config-contract` +（如动契约）`verify:prod-boot`。**触 §2 高危面每一片单独留痕·P-2/P-3 改公共契约须明示签核。**

## 4. 审计记录

> 无已审方案不写码。本方案触 auth 生产认证面 + config 契约 + compose/env——§2 多重高危。

- 结论：**已审计 GO**（人令「你自行裁定」= 对 §2 高危的签核与授权执行·问责归签核人 P2）。父片 v0.3.0 保守默认「生产不启用」由本片解除（改无条件挂载）。
- 七未决项裁定（Agent 代裁·采最小安全姿态）：
  1. **生产启用** → **是**·但采「无条件挂载 + 乙形态」使默认安全（不新增未判别公开面）。运维仍可按 env 不提供真值而事实上不激活（warn·不发信失败）。
  2. **`disableSignUp` 形态** → **乙·`true`（仅存量用户登录）**。自主裁下新开公开注册口过于激进；限存量账号=最小风险且邮箱持有=合法认证因子。**副作用正收益**：send 恒发信+verify 才判存在性 → 不泄露账号存在性（无枚举）。
  3. **`APP_URL` 是否升 Joi required + 上 compose** → **否**（升全局 required 会波及不需 magic-link 的部署 fail-loud·过破坏）。改采 **prod 缺 APP_URL boot warn**（非 fail-closed·镜 trustedProxies 先例）·运维自设 canonical。
  4. **生产 `CORS_ORIGIN` 真值** → **不臆造**（部署域·归运维）·plan/注释文档化要求。代码面 trustedOrigins 已就绪（=CORS_ORIGIN）。
  5. **限流窗** → **沿用库默认 + `rateLimit.enabled:true`**·不预调（镜 tooling「窗值跟库默认不预调」先例）。
  6. **CN SMTP 送达** → **本片不换服务商**（凭证归运维·§2 密钥不写）·仅确保代码面接通。
  7. **前端死钮** → 无条件挂载自然消解（prod 不再 404）·h2 文案已标注「已有账号免密登录」对齐 disableSignUp:true 语义。
- 审计人 / 日期：人（「你自行裁定」授权）/ 2026-10-19

## 5. 完成判据（审计 GO 后·可核验 + 穷尽）

- [x] 形态按裁定②落地：`disableSignUp:true`（auth.implement 显式设值）。
- [x] magic-link 无条件挂载·生产 `NODE_ENV=production` 下 `plugins[]` 含 magic-link（DB-free 断言：ip-trust 测新增「生产仍挂 magic-link」·绿）。
- [x] `APP_URL` canonical 依赖显性化：prod 缺 → boot warn（非 fail-closed·不拦既有部署）·**未升全局 Joi required**（裁③·避免破坏性波及·config-contract 判据③ 8 required 键不变）。
- [ ] 生产 `CORS_ORIGIN` 含前端源·`originCheck` 放行回跳（真值归运维·Agent 不臆造）。
- [ ] SMTP 生产真发信（人实机点链接收信）·退信/额度监控归运维/另议。
- [x] 限流沿用库默认 `rateLimit.enabled:true`（裁⑤·不预调）·滥用面缓解=send 恒发信不泄露存在性 + 库窗。
- [ ] gated e2e（真库·disableSignUp 两态·捕 URL 校回跳+originCheck）+ 登记 `GATED_E2E_FILES`（本片以 DB-free 挂载断言覆盖挂载事实；两态行为需真库+MAIL override·归后续或人实机）。
- [x] L1 全链绿：`pnpm run ci` PASSED·基线 619→**620**只增·fallow 0 违规·`verify:config-contract` PASSED·web tsc 净·Biome 净。
- [ ] **生产实机端到端对拍（真点邮件链接登录）归人验收**（Agent 不代跑·守 §4.10「以实跑链为验收」）。
- [x] schema 迁移零（magic-link 复用 `verification` 表）；不改生产 `emailAndPassword` 关态（裁：仅动 magic-link·密码面仍生产关）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：生产启用 magic-link 评估——现状取证（非生产门 L209·生产无密码面·源码坐实默认自动建号 disableSignUp·originCheck/APP_URL/rateLimit/前端死钮）+ 七切片方案（形态裁定乙/甲·移门·APP_URL 契约升格·可信源·SMTP·限流·gated e2e）+ 7 未决项（①是否启用②disableSignUp 形态均**归人·不可自裁**·触 §2 auth+config+env 多重高危）·待审计 |
| 2026-10-19 | 0.2.0 | 人令「你自行裁定」代裁 GO | §4 七未决项定裁：①生产启用（无条件挂载）②**disableSignUp:true（乙·仅存量登录）**③**不升全局 required·改 prod 缺 APP_URL warn**④CORS_ORIGIN 真值归运维不臆造⑤限流沿用库默认不预调⑥SMTP 不换服务商⑦前端死钮自然消解·采最小安全姿态 |
| 2026-10-19 | 0.3.0 | 实施回执 | `auth.implement.ts`：magicLink 移出 `NODE_ENV!=='production'` 三元门为无条件挂载 + `disableSignUp:true` + prod 缺 APP_URL boot warn（镜 trustedProxies）；`login.tsx` h2→「已有账号免密登录」+注释更正；`auth.ip-trust.test.ts` 隔离新 warn（置 APP_URL）+ 新增「生产仍挂 magic-link」DB-free 断言（+1·mailer 第6参补齐）·**ci 619→620 PASSED·config-contract PASSED（required 8 不变）·web tsc 净·Biome 净**·未提交 |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.3.0 变更，以当前正文内容为准。
