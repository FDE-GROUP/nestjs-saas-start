> 用途: **已审方案 = 开发依据** | 状态: 已实施 v0.4.0 · 待实机端到端对拍（人验收） | 受众: 人（审计门）+ Agent
> 定位: Better Auth [magic-link 插件](https://better-auth.com/docs/plugins/magic-link)（免密邮件登录）接入。首版仅非生产挂载；**现状以子片为准**：[module-auth-magic-link-production](./module-auth-magic-link-production.md) 已改无条件挂载（乙·`disableSignUp:true`），本片 v0.4.0 另增 dev 控制台打印链接。
> 铁律: 触 `AGENTS.md` §2 高危面（**auth 认证面**）→ 已人签核 GO；生产启用与否已由子片另裁落地（本片的初版保守默认「仅非生产」被子片解除·非本片回改）。

## 0. 一句话

magic-link = 用户输邮箱 → 服务端发一次性链接 → 点链接即建会话登录。本仓**已接入（v0.4.0）**：后端挂 `magicLink` 插件（初版非生产门·已由子片 production 改无条件挂载+`disableSignUp:true`）+ `MailerService.sendMagicLinkEmail` 发信（`baseURL` 复用 `APP_URL`）+ 前端登录页发起表单；verify 由 BA 自处理。**dev 便利（v0.4.0）**：非生产控制台打印一次性链接（未配 SMTP 亦可直用·发信失败非致命），生产绝不打链接且语义不变。

## 1. 现状取证（v0.1.0 起草时基线·全负向·现已闭合）

- **插件未装**：[`auth.implement.ts:110-196`](../apps/api/src/modules/auth/auth.implement.ts) `plugins[]` 仅 `add-account-to-session`（内联会话追踪）、`genericOAuth`（条件）、`organization({allowUserToCreateOrganization:false})`、`createSeatsQuotaPlugin`；导入行 `import { genericOAuth, organization } from 'better-auth/plugins'` **无 `magicLink`**。全仓 `grep magicLink|magic-link` 零命中。
- **无 email 配置块**：`auth.implement.ts` 内 `grep email:|verification|emailVerification` 空——BA 的 `emailVerification` 插件 / `email:{verification}` 选项均未设。
- **邮件基建已备未接线**：[`mailer.service.ts`](../apps/api/src/mailer/mailer.service.ts) 有 `sendWelcomeEmail`/`sendVerificationEmail`/`sendForgotPasswordEmail`（MJML + I18n·走 `MAIL_*` SMTP），但**全仓 grep 未见任何调用点**（无 controller/hook 触发）⇒ 疑为孤儿能力·**实施前须实勘确认**是否真无消费方；magic-link 的 `sendTo` 将是首个把 Mailer 接进 BA 的消费者。
- **无 canonical baseURL**：BA 生成邮件内链接需 `baseURL`；现 config 仅 `STORAGE_BASE_URL`（storage）与 `OAUTH_CALLBACK_URL_BASE`（oauth·default 兜底 `http://localhost:7009/api/v1/auth/callback`·见 [`envs/default.ts:86`](../apps/api/src/config/envs/default.ts)）——**无面向 BA 的 auth base**，需新增。
- **前端无落地面**：`apps/web/src/routes` 无 verify/callback/magic 页；[`lib/auth.ts`](../apps/web/src/lib/auth.ts) 有 `BASE='/api/v1/auth'` + `signInEmail`/`signUpEmail` fetch 范式（可镜像出 `signInMagicLink`）。
- **版本可用**：better-auth `^1.7.7`（magic-link 插件在该版本受支持）；`@better-auth/test-utils@1.7.7` 在册（gated e2e 可读发出 token）。

## 2. 方案（四段·推荐保守切片·生产默认关）

1. **后端·插件挂载**（已实施·仅非生产）：`auth.implement.ts` 条件 spread 加入 `magicLink({ expiresIn: 300, sendMagicLink: async ({ email, url }) => mailer.sendMagicLinkEmail(email, url) })`（1.7.7 钩子名是 `sendMagicLink`、非 `sendTo`）。链接由 BA 用 `baseURL` 自拼（`/magic-link/verify?token=...&callbackURL=...`）。
2. **后端·config base**（已实施·零新增契约键）：`baseURL: process.env.APP_URL || undefined`——复用既有 raw env `APP_URL`（mailer 已读），**不新增 config 契约键**·不动三 env/.env.example（§2 高危最小化）。`trustedOrigins` 沿用既有前端源。
3. **后端·邮件模板**（已实施）：新增 `i18n/<lang>/emails.json` 的 `magic-link` 块（zh/en/ja）+ `magic-link.mjml`（承 `verify:i18n-assets` 资产闸登记）；`MailerService` 加 `sendMagicLinkEmail(email, magicLinkUrl, lang)`。
4. **前端·发起面**（已实施）：登录页加 `MagicLinkSection`「发送登录邮件」表单（`lib/auth.signInMagicLink(email, window.location.origin)` → `POST ${BASE}/sign-in/magic-link`）。**verify 由 BA 自处理**（`GET /magic-link/verify` 落 cookie→`redirect(callbackURL)`）——**前端无需自建 verify 路由**（订正 v0.1.0 初稿的「新落地路由」设想）。

可选配对（未决项 4）：连带 `emailVerification` 插件做邮箱验证闭环，或仅 magic-link（点链接即视为已验证）。

## 3. 实施次序（审计 GO 后·切片可拆）

M-1 config base（**实装时折叠进 M-2**·复用 `APP_URL`·免新增契约键与三 env 面变更）→ M-2 后端 `magicLink` 插件（非生产门 spread）+ Mailer 接线（`AuthModule` imports `MailerModule`·`CreateAuth` 加形参）+ MJML/i18n → M-3 前端表单（无自建 verify 路由·BA 自处理）→ M-4 测试（DB-free 镜测已入 L1；gated e2e 视能否一次跑绿再定·不带半成品进链）→ M-5 门禁 + 实机对拍（dev `emailAndPassword` 已开·真 SMTP/mailhog 收件点链接·归人）。**M-2/M-3 可各自独立成片过门，不夹带。**

## 4. 审计记录

> 无已审方案不写码。本方案触 auth 面——`AGENTS.md` §2 高危·人已签核。

- 结论：**GO·已实施（保守档）**。授权按「你定」推荐档落地：magic-link **仅非生产挂载**（spread pattern 镜像 `genericOAuth`·`NODE_ENV!=='production'` 门），生产登录面零变更，S4/审批制语义不受影响。
- 未决项裁决（人 GO·推荐档自裁）：
  1. **生产是否启用**：本阶段**仅非生产挂载**（`NODE_ENV!=='production'` 条件 spread 进 `plugins[]`）·生产不启用 magic-link·与现有关密码面生产关对称。生产启用另需单独签核。
  2. **callbackURL/baseURL 形态**：**不新增 config 契约键**——复用既有 raw env `APP_URL`（`baseURL: process.env.APP_URL || undefined`·mailer 已用此键），BA 自处理 `GET /magic-link/verify`（落 cookie→`redirect(callbackURL??"")`），**前端无需自建 verify 路由**。前端 `signInMagicLink` 传 `callbackURL = window.location.origin`。§2 高危面最小化（避免触 config-contract 三 env 面变更）。
  3. **MailerService 接线**：实证 `sendWelcome/Verification/ForgotPassword` 原为孤儿能力（无消费方）；magic-link 的 `sendMagicLink` 是**首个把 Mailer 接进 BA 的消费者**·`MailerModule` 非 `@Global`，故 `AuthModule` 显式 `imports` + `AuthBootstrapService` 经 S9 铁律值导入 + `@Inject(MailerService)` 注入。
  4. **emailVerification 插件**：本阶段**仅 magic-link**（点链接即视为已验证·MVP），不夹带邮箱验证闭环。
  5. **CN 邮件送达**：本阶段仅打通链路（沿用既有 `MAIL_*` SMTP 基建）·国内邮件服务另议（global-cn-adaptation）。
  6. **测试档**：DB-free 镜测已入 L1（mailer 单测 +1·前端 login 镜测 +2·基线 616→619 只增）。**gated e2e 未强行加**——真库 + MailerService override 捕 URL + BA verify 落 cookie+redirect 的对拍**归人实机验收**（不带未一次跑绿的半成品进链·守 §2「部署/链路声明须真跑对拍」）。
- 关键契约取证：better-auth@1.7.7 是 `sendMagicLink({ email, url, token, metadata })`（**非 `sendTo`**）·URL 由 BA 用 `baseURL` 拼（非本仓自拼）。
- 审计人 / 日期：FDE Team · 2026-10-19

## 5. 完成判据（保守档实施回执）

- [x] 后端 `plugins[]` 含 `magicLink`（仅 `NODE_ENV!=='production'` 门 spread）且 `sendMagicLink` 经 MailerService 真发信；`baseURL` 复用 `APP_URL`·链接域名非 `localhost` 漂移（raw env·dev 由 `.env` 定）。
- [x] 前端登录页可发起 magic-link（`MagicLinkSection`·`POST ${BASE}/sign-in/magic-link`）；verify 由 **BA 自处理** `GET /magic-link/verify` 落会话并 `redirect(callbackURL)`·前端无自建 verify 路由（无死胡同）。
- [x] **不新增 config 契约键**（复用 `APP_URL`）·`trustedOrigins` 沿用既有前端源；`verify:config-contract` 对 magic-link **零新增红**（唯一红 `WEB_PROXY_TARGET` 为前端 F0 既存债·stash 对拍 HEAD 复现·非本片引入·归前端后续）。
- [x] 邮件模板 `magic-link.mjml` + i18n `emails.magic-link.*` 键 zh/en/ja 齐；`verify:i18n-assets` 过（dist 资产闸登记 magic-link）。
- [x] 前端镜测（+2：分区 label 唯一性 + 发起 POST 打 `/sign-in/magic-link` 并回执发信）·mailer 单测（+1：subject 本地化 + `magicLinkUrl` 流入插值 args）；`pnpm run ci` 全绿（619 passed·基线只增）·Biome 净·web tsc 净·openapi-drift 净·fallow 无违规。**gated e2e 归人实机（见 §4 未决项⑥）**。
- [x] **生产面零变更**（未决项①·仅非生产挂载·不动生产 `emailAndPassword`/新登录面开关）；schema 迁移零（magic-link token 存 BA 自有表）。
- [ ] 实机端到端对拍（真点邮件链接登录）归人验收（**未闭合**·SMTP 收件 + BA verify 落租链）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版：magic-link 现状全负向取证（无插件/无 email 配置/邮件基建未接线/无 baseURL/前端无落地路由）+ 四段接入方案 + 6 条未决项（核心=生产启用与否归人·触 auth/config/env 高危）·待审计 |
| 2026-10-19 | 0.2.0 | 人签核 GO | §4 落审计结论=GO·保守档；6 未决项裁决（仅非生产挂载·复用 APP_URL 免新增契约键·BA 自处理 verify·仅 magic-link 不带 emailVerification·gated e2e 归人实机）；§2/§3 契约订正（1.7.7 是 `sendMagicLink` 非 `sendTo`） |
| 2026-10-19 | 0.3.0 | 实施回执 | M-2/M-2b/M-3/M-4/M-5 落地：`auth.implement` 挂 `magicLink`（非生产门 spread）+ `baseURL=APP_URL`；`AuthModule` imports `MailerModule`·`AuthBootstrap` 值导入注入 `MailerService`·`CreateAuth` 加 mailer 形参；`MailerService.sendMagicLinkEmail` + `magic-link.mjml` + zh/en/ja `emails.magic-link.*` + 资产闸登记；前端 `signInMagicLink` + `MagicLinkSection`；测 mailer+1/ 前端+2（基线 616→619）；门禁 Biome/build/openapi-drift/test/i18n/web-tsc 全绿·config-contract 仅红于既存 `WEB_PROXY_TARGET`。实机端到端归人 |
| 2026-10-19 | 0.4.0 | 人令「dev 控制台打印邮件链接」+ 状态同步 | 新增具名导出 `createMagicLinkSender`（镜 `isSealedOrgHttpPath` 谓词先例·单测锁三态 620→623）：非生产打印一次性链接（未配 SMTP 亦可浏览器直用）+ 发信失败降 warn 非致命；**生产语义与原实现全等**（不打链接·上抛）。同步：本片「仅非生产挂载」头部/定位/一句话陈旧态订正为「已由子片 production（`b4ea991`）解除·无条件挂载+disableSignUp:true」 |
