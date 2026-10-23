# 配置供给面的**四角契约漂移**与 Google 登录渠道「文档承诺有、实现无」

> ⚠️ **本案一处裁已被反悔修订（2026-10-23 · [global-config-contract-gate-in-chain](./global-config-contract-gate-in-chain.md)）**：本案「切片 C 人裁不做 ⇒ 四角对拍仍无门禁持有·已显式列为遗留」经人令「GO」撤销——`verify:config-contract` 已升为 `scripts/ci.ts` 硬闸（full+quick）。正文「切片 C 不做/不进链」为当时结项史实、不改，现状以翻案案为准。

> 适用范围: `配置面(.env.example + apps/api/src/config/** + modules/auth 渠道注册面) + 文档/宪法路径口径(docs/specs + docs/*.md)` ← blast radius（v0.2.0 已执行）：**代码** `envs/{default,development}.ts` + `modules/auth/{auth.bootstrap.ts, social-provider-registration.ts(+test)}`、**供给面** `.env.example`、**文档** 5 份（`architecture.md(±zh)` / `tooling-standards.md` / `oauth-guide-en.md` / `drizzle-migration-guide.md` / `install&run.md`）；**v0.2.2 追加落点**：`.env.example` 的 Seed 段（三行均注释态）+ `docs/drizzle-migration-guide.md` 的 Seeding 警示（**零代码变更**）；**不触** DB schema / 业务模块语义 / 部署编排（`docker-compose.yml`）/ CI 门禁面（切片 C 人裁不做）/ 开发机 `.env`
> 关联: `specs/tooling-standards.md` §4.10（部署声明对拍）· 已落地前片 [module-deploy-env-mount-boundary](./module-deploy-env-mount-boundary.md)（D4·**F4/F6 与其 `.env.example` 的 `# DATA_RESIDENCY_ENFORCE=` 注释行 逃生阀直接续接**）· [module-deploy-host-residency](./module-deploy-host-residency.md) §5 缓行清单（本片领取其「`envs/` 文档漂移」一项）· global-tenancy §10 挂账（本片结清 dead-code 两项）
> 性质: 缺陷收口（配置契约的供给面完整性 + 宪法承诺兑现）·机制单点修、不逐键特判
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**缘起**：D4 收口后，「配置事实由谁给出」这条线在编排面已经闭合，但**它下面还压着一层同样的问题**：`.env` / `.env.example` / Joi 校验 schema / 代码实际读取集**四份契约彼此从未对拍**。本轮按人「继续」做只读勘察，把前片遗留的缓行/挂账（host-residency §5 三条 + global-tenancy §10 两条）逐项核到底，结果既结清了三条旧账（F8），也**新查出一处宪法承诺落空的具体缺陷**（F3·本片定级依据）。

### 事实（八条，均为文件/代码事实或本轮直查，非推测）

**F1 · 四份「配置契约」互不校验，且 `allowUnknown: true` 让一切错位静默通过**

| 契约 | 载体 | 规模（本轮脚本实测） |
|------|------|------|
| 开发机实文件 | `.env`（未追踪） | 50 键 |
| 出厂样例 | `.env.example` | 51 键 |
| 校验层 | `config.module.ts` `createSchemaForEnv` 的 Joi 对象 | 27 键 |
| 消费层 | `process.env.X` 直读 51 键 + `configService.get('K')` 字面键 7 键 | 合集 58 键 |

`configModuleOptions.validationOptions = { allowUnknown: true, abortEarly: false }` ⇒ **多键、漏键、拼错键全部静默通过**；四象交叉比对本轮用脚本一次性算出（下列 F2/F3/F4 即其结果），**而仓库内没有任何门禁持有这套对拍**。

**口径教训（直接影响切片 C 的实现）**：只扫 `process.env` 会把 `MAIL_HOST` / `MAIL_USER` / `MAIL_FROM` / `APP_URL` 误判成死配置——它们实际经 `mailer.service.ts:27/31/103/112` 的 `this.configService.get('MAIL_HOST')` 消费（@nestjs/config 回落 `process.env`）。**这正是 AGENTS §2「静态分析结论必须二次人工核验」的现场版**，任何门禁化的读取集解析必须同时覆盖两种模式。

**F2 · 双文件分叉（D4 的 F6 具体化）**

- 仅开发机 `.env` 有：`DATADOG_API_KEY` / `DATADOG_HOST_NAME` / `DATADOG_INTAKE_REGION` / `DATADOG_SERVICE_NAME`——而 `config.module.ts:47` 注释明载「**Datadog 已移除（G1 / D6）**」⇒ 四个**无任何消费方的已删能力残留键**（属机器侧文件，仓库无物可改，但样例无从提醒使用者清理）。
- 仅 `.env.example` 有：`EVENT_STORE_ENABLED`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`OAUTH_GENERIC_PROVIDERS`、`PLATFORM_OPERATOR_EMAIL`——**开发机漏配这五项照样 boot**（靠内置默认），于是「按样例配的人」与「按需补的人」跑的是不同语义。
- 按上述口径，**全仓零消费方的声明键恰好只有 6 个**：`DATADOG_*` ×4（仅开发机）+ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`（**两份文件都有**）⇒ 前者是已删能力的机器侧残留，后者是 F3 缺陷的组成部分（**样例给了槽位、代码没有槽位**）。

**F3 · Google 登录渠道：宪法四处承诺 + 文档教用户这么配，代码里没有槽位（本片定级依据）**

- 承诺面：`docs/specs/vision.md:65`（「Google / GitHub 等海外 OAuth……予以保留」）、`docs/specs/tooling-standards.md:56`（登录渠道行「Google/GitHub（保留）」）、`docs/specs/glossary.md:40`、`README.md:43` **四处**均写「保留 Google/GitHub」。
- 教面：`docs/oauth-guide-en.md:72` 明确让用户写 `OAUTH_PROVIDERS=github,google`；:130 还给了 Google 控制台链接。
- 实现面：`envs/default.ts` 的 `oauth.secrets` **只有 `github` / `apple` / `feishu` 三个槽位**；`auth.bootstrap.ts:87-100` `buildSocialProviders()` 对每个启用的 provider 做 `const config = oauth.secrets[type]; if (!config?.clientId || !config.clientSecret) continue;`（:95）⇒ **`google` 被静默跳过**，既不报错也不告警。
- 消费面：全仓（含 `apps/api` / `libs/core` / `scripts` / 文档）**`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 零消费方**，而 `.env.example` 的 `GOOGLE_CLIENT_*` 两行（段头还写着「# OAuth Providers - Google (example)」）与开发机 `.env:90-91` 都摆着这两行——**给了「可配」的假象**（且两文件的 `OAUTH_PROVIDERS` 默认行分别是 `github,apple` / 代码兜底 `github`，均未列 google——即使列了也没有槽位）。
- `auth.constant.ts` 的 `OAuthProviderType` 里 `GOOGLE='google'` 在枚举中（故不会被类型过滤掉），进一步说明失败点是**缺 secrets 槽位**而非类型不认识。

⇒ 与 D3（`docker-deployment.md:116` 把拒启归给模板并不存在的默认值）**同型的「声明有、实现无」**，且与已收口的 i18n 片（邮件资产根在产物布局下不存在·注释与实际不符）构成同一类先例；但本处更严：落在**宪法承诺 + 入门文档**上。已于 §4.1 实机坐实：**boot 期对本仓代码而言零提示**（静默 `continue`），唯一可见痕迹是用户真去点 Google 登录时由 **BA 自己**报的一条 error——而其措辞「Make sure to add the provider in your auth config」**会把人引向去改 `OAUTH_PROVIDERS`**（而该处早已列了 google），真正的缺口在 `envs/default.ts` 的 secrets 槽位——**运行期版的失实归因**。

**F4 · 代码读取、两份文件都未声明的 12 个键（v0.2.2 由 9 订正）**

`AUTH_TRUSTED_PROXIES` / `DATA_RESIDENCY_ENFORCE` / `DATA_RESIDENCY_DB_HOST_ALLOWLIST` / `LOG_LEVEL` / `LOG_FILE` / `PAYMENT_PROVIDER`（应用与守卫面）+ `VERIFY_PORT` / `VERIFY_TIMEOUT_MS` / `NO_COLOR`（`scripts/` 防线面）**+ `ADMIN_PASSWORD` / `USER_PASSWORD` / `SEED_CLEANUP`（`apps/api/src/database/seed.ts:70` / `:108` / `:199`·v0.2.2 直查补计·原 F4 漏项）**。
前三者**在样例里全是注释态**（`AUTH_TRUSTED_PROXIES` / `DATA_RESIDENCY_ENFORCE` / `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 三行），即样例声明了它们、却没给出「生产必须处理」的强度；本轮 D4 四态取证的 (c) boot 日志里就实测出现过 `AUTH_TRUSTED_PROXIES 未配置……限流将把所有用户归入共享桶` 这条 warn——**症状已在真容器上拍到，但出厂样例对此无提示**。
更硬的一条：**`AUTH_TRUSTED_PROXIES` 与 `PAYMENT_PROVIDER` 连 Joi schema 都已正式声明**（`config.module.ts:44` / `:41`），却在两份文件里都不存在——校验层承认其存在、供给层从未提供，是 F1「四角不对拍」最省力的复现样本。

**seed 面三项（v0.2.2 新发现·比其余六项更硬）**：`seed.ts:1-3` 自带 `import * as dotenv; dotenv.config()`，与 `scripts/verify-*.ts`（**只读进程 env、不 import dotenv**）相反 ⇒ 这三键**本就属于 `.env` / `.env.example` 的供给面**，但两份文件都没写、只有 `docs/drizzle-migration-guide.md` 的 Seeding → Environment Variables 小节教命令行内联传参。后果不是「开关默认」而是**静默弱口令**：未配 `ADMIN_PASSWORD` / `USER_PASSWORD` 时 `seed.ts:70` / `:108` 兜底 `admin123` / `user123`，且 `admin123` 是给**平台经营者账号**（email 取 `PLATFORM_OPERATOR_EMAIL`·兜底 `admin@example.com`·`Role.ADMIN`）灌的口令；本轮脚本坐实开发机 `.env` 的 50 个生效键不含这三项 ⇒ 本机 dev 库即处于该状态（属机器侧·本片不动高危面）。另 `SEED_CLEANUP=true` 是**破坏性开关**：`seed.ts:199` 的 `cleanup()` 会先 `delete post` + `delete user` 两张表再灌。

**F5 · 同一键的默认语义在样例与代码之间相反**

- `.env.example` 的 `EVENT_STORE_ENABLED=false` 行，但 `envs/development.ts` 写 `(process.env.EVENT_STORE_ENABLED ?? 'true') === 'true'`，而 `envs/default.ts` 写 `process.env.EVENT_STORE_ENABLED === 'true'` ⇒ **删掉该行不写时，dev 直接默认开启 ES 影子追加**（与「显式 false」的样例意图相反，且与 `default.ts` 的兜底方向相反）；开关的前提还是「目标库已 apply 0009 event 表，误开即 append fail-loud」。
- `.env.example` 的 `PLATFORM_OPERATOR_EMAIL=admin@example.com` 行 与代码兜底值**字面相同** ⇒ 漏配时看不出任何异常，平台治理面「谁是经营者」这件事在样例与默认里互相掩盖。

**F6 · D4 只封住了 compose 通道，非 compose 部署仍以文件为唯一源**

D4 落地后，编排里 `DATA_RESIDENCY_ENFORCE=true` 使挂载文件覆不动该键——但**直接 `node dist/apps/api/src/main.js` 起服（本文档自身的部署路径之一）没有编排注入**，此时 `.env.example` 的 `# DATA_RESIDENCY_ENFORCE=` 注释行 那行 `# DATA_RESIDENCY_ENFORCE=`（注释态·无说明文字）仍是「解注释即可把生产 strict 降为 warn」的通道。本片只负责把**样例文案的口径**补成「仅限非生产临时降级 + 生产严禁」，不改运行时语义（是否让逃生阀在非生产之外彻底失效属策略面·归人）。

**F7 · 文档路径口径漂移（承 `module-deploy-host-residency` §5 缓行项）**

- `docs/specs/architecture.md:10/:64` 与 `docs/specs/architecture-zh.md:8/:62` 仍写 `src/modules/<context>` / `src/modules/users/domain/**`；**实仓为 `apps/api/src/...` + `libs/core/src/...`**（`ls` 本轮坐实）。
- `docs/oauth-guide-en.md:85` 让用户「Update your configuration in `src/config/envs/default.ts`」，实际路径 `apps/api/src/config/envs/default.ts`（与 F3 直接相关：照文档改不到那个文件就补不上 google 槽位）。
- `AGENTS.md` §5 目录地图**已合规**（line 43 已写成 `libs/core/src` + `apps/api/src` 双包口径）——本轮初始把它当成漂移面，是取自 agent 上下文里的**旧快照**，直查磁盘后推翻（本身即「AI 上下文 ≠ 仓库实况」的一个现场样本，故不记为待修项）。
- 前片 `module-deploy-host-residency.md:88` 记的「`envs/.env.development` 分层」漂移：**AGENTS.md / `docs/specs/*` 已零命中**，仅 `.qoder/repowiki/` 三份自动生成卡仍如此描述（生成物·非人维手的 SSOT）⇒ 该缓行项在仓库维护面已闭合。
- 次生危害：新人 / Agent 照文档路径改配置会改到不存在的位置（文档是 L4 入口，AGENTS.md 自称「当前真相的指针」）。

**F8 · 三条旧挂账经人工二次核验已在现 HEAD 闭合（据实销账·零动作）**（AGENTS §2「静态分析结论必须二次人工核验」）

- 候选①「`StorageService.uploadFile` 无调用方」：**已不存在**——全仓 `uploadFile` 仅见于 `providers/storage.interface.ts`（+三 provider 实现·`uploadFileFromStream` 被 `storage.service.ts:78` 调用）与 `controllers/storage.controller.ts:43` 同名路由方法。经比对 `global-tenancy.md:242`：门面已于 2026-10-14 [module-tenancy-quota-member-wiring](./module-tenancy-quota-member-wiring.md) 人签删除——**挂账当时已结，本轮重启引擎后把它当开放项属陈旧重读**。
- 候选②「`TenantStatus` / `PlatformUserRow` re-export 冗余」：各自**唯一定义**（`libs/core/src/tenancy/lifecycle/tenant-lifecycle.ts:15`、`apps/api/src/modules/tenants/domain/repositories/user-governance.repository.ts:16`），26 处导入均走 `@core/saas-kit/...` 值导入，未见重复导出点；`global-tenancy.md:242` 已自记「陈旧重报·就此销账」。
- 候选③「`/health` 依赖外网 IP 查询（`external-ip-check`）」（host-residency §5 首条缓行项）：**该依赖已不存在**——`apps/api/src/common/health/health.controller.ts` 为 **ping-only**（`this.health.check([])` 空指示器数组），全仓 `grep -ri "external-ip\|ipify\|checkip"` 零命中⇒ 探针不再受容器 DNS 影响，缓行项自然结清（readiness 仍按原注释「丁项缓行」）。
⇒ 三项**均无需任何删除/修改动作**，本片只做销账与交叉回写（不动任何代码·不动高危面）。

## 2. 方案（切片，含必须归人的权衡点）

**切片 A · F3 的取舍（人裁 2026-10-16「同意」= 采纳推荐组合）**

- ✅ **A-1 已落地**：`envs/default.ts` 的 `oauth.secrets` 补 `google` 槽位（读 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`）⇒ 四处宪法承诺与 `oauth-guide-en.md` 即刻成立（A-2 撤承诺未采纳）。
- ✅ **共同底线（按人裁形式落地）**：三条静默 `continue` 下沉为纯函数面 `modules/auth/social-provider-registration.ts`（`resolveSocialProviders` 裁决 + `planProviderDiagnostics` 定强度）：三类弃用各自点名真因（`unknown-type` / `no-config-slot` / `missing-credentials`）；**非生产 boot 期一条 warn、生产直接 throw 拒启**（fail-loud）。`auth.bootstrap.ts` 只保留装配与强度执行，不再逐 provider 特判。
- 单测配套：`social-provider-registration.test.ts` 8 例（含三分支归因区分、extras 透传、文案含「光放 `*_CLIENT_ID` 不生效」、warn/throw 强度升级）。
- 可见化的目的：阻断同类「文档教了、代码没接」再犯（机制修·不逐 provider 特判），且不得沿用 BA 那句误导措辞（§4.1 已证）。
- ✅ **对称半边（v0.2.1 补齐·同一机制）**：`generic-oauth-channels.ts` 的 `buildGenericOAuthConfigs()` 原来也是**两条静默 `continue`**（无构建器 / 缺凭证），与 social 面同构——只修 social 面就是只做到一半。现抽出单一裁决点 `classifyGenericChannel` + `resolveGenericChannels`（一次遍历同时给 `configs` 与 `drops`，避免两处判定条件漂移），三类归因 `unknown-id` / `builder-pending` / `missing-credentials`；`buildGenericOAuthConfigs` 降为薄封装 ⇒ **既有 7 条契约测全部不变**。
- ⚠️ **强度刻意不同（依既有契约、不自行升级）**：generic 面取**一律 warn（含生产）而不拒启**——`.env.example` 的 `OAUTH_GENERIC_PROVIDERS` 段明示「未列即不注册（**不配凭证可正常启动**）」，且 NFR-2「未配即降级」/ D8「wechat / dingtalk / wecom 仅留接口位」为**既有人裁**；给它们加生产 fail-loud 会直接违反该契约（尤其接口位被声明时）。是否升级（或只对 `unknown-id` / `missing-credentials` 两类升级、`builder-pending` 永远 warn）已列入本节末尾「缓行 / 另案」待裁。

**切片 B · 样例↔代码对齐（✅ 已落地·唯一落点 `.env.example`）**
实际改法与口径订正：
- 新上图 4 键：`AUTH_TRUSTED_PROXIES`（并段到 Auth 区·含「不配 = 客户端 IP 可被伪造」与三档典型值，并把原本只在尾部说明的 compose `172.16.0.0/12` 「只解拿到 IP、不解拿到对的 IP」一句合并进来，同时**删掉尾部重复项**以免一个键两处文案）、`LOG_LEVEL` / `LOG_FILE`（新 Logging 段）、`PAYMENT_PROVIDER`（并段到 Stripe 区·注明 alipay 仅配置面占位、**填了也不会启用**）。`DATA_RESIDENCY_ENFORCE` / `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 样例原已注释态，本轮只补「不填 = 按 NODE_ENV 自动」与「优先用白名单而不是关守卫」两句口径。
- **新键一律取注释态**：以免改变新克隆者默认行为（若把 `LOG_LEVEL=log` 直接生效，dev 会从全开变为静默）——即“可见化”而非“改默认”。
- F5：`development.ts` 的 `?? 'true'` 已改为与 `default.ts` / `production.ts` 同口径（未显式置 true 即关），样例文案同步；`PLATFORM_OPERATOR_EMAIL` 原本**挂在 ES 注释块底下**（段头说的是平台经营者、值却排在 `EVENT_STORE_ENABLED` 之后）⇒ 已归位到自身段。
- ✅ **v0.2.2 补漏（seed 面三键）**：`ADMIN_PASSWORD` / `USER_PASSWORD` / `SEED_CLEANUP` 已在样例 PostgreSQL 段之后成文（**一律注释态**·`cp` 后的键集合不变），文案点明两条静默行为：未配即用内置弱口令 `admin123` / `user123`（归给平台经营者账号），以及 `SEED_CLEANUP=true` 会**清空 `post` + `user` 两表**（破坏性·勿对共享或生产库开）。同步在 `docs/drizzle-migration-guide.md` 的 Environment Variables 小节补两条警示（该文档原只教内联传参，未说明 seed 也读 `.env`、更未提示弱口令兜底与破坏性开关；该文件为英文，注释按原文语言写）。
- **`scripts/` 面三键刻意不上图**（`VERIFY_PORT` / `VERIFY_TIMEOUT_MS` / `NO_COLOR`）：直查坐实 `scripts/ci.ts` 与 `scripts/verify-*.ts` **不 import dotenv、不读 `.env`**（只读 `process.env`），把它们写进样例就是**制造本片 F3 同型的「声明有、实现无」**——用户按样例在 `.env` 里设 `VERIFY_PORT` 根本不生效。归属应是脚本自身的进程 env（集合与理由见 §4.6）。
- 未动：开发机 `.env`（含 `DATADOG_*` 四项残留·机器侧文件归人）。

**切片 C · 门禁化（人裁：本片不做）**
`scripts/verify-config-contract.ts`（与 `verify-compose-contract.ts` 同构·独立 script·**不进 `ci` 链**）三判据：① 样例键 ⊆（Joi schema 键 ∪ 代码实际读取键）→ 无死配置；② 代码读取键 ⊆（样例 ∪ 显式白名单）→ 无隐藏必需项；③ Joi `.required()` 键全部出现在 `docker-compose.yml` 的 `environment` → 承接 D4 已闭合的判据不回潮。
代价：白名单需要人维护；F3 的静默跳过属运行期语义，静态脚本抓不到（故 A 的 warn 化不能被 C 替代）。

**切片 D · F7 路径口径归零（✅ 已执行·人「同意」含 D）**
实测旧口径共 12 处命中，按同类缺陷一次改完（不逐文件特判）——**范围扩张（超出本切片字面列举的 `architecture(±zh)` + `oauth-guide`三份）**：额外含 `tooling-standards.md:55/:96/:102`（含 vitest `include` 从失实的 `src/**/*.test.ts` 订正为实值 `['apps/**/*.test.ts', 'libs/**/*.test.ts']`）、`drizzle-migration-guide.md` 的两处 schema 路径行（migrate 步骤 1 + Project Structure 目录块）、`install&run.md:57`；其余：`architecture.md:10/:64` + `architecture-zh.md:8/:62` → `apps/api/src/modules/<context>`（并注明共享契约侧居 `libs/core/src/modules/<context>`）；`oauth-guide-en.md:85` 并补「渠道要同时有槽位 + 凭证」的说明与 `google` 槽位示例。
**范围与性质说明（均已显式登记待人复核/可回退）**：除上方「文件面从字面列举的三份扩到五份」外，还有**一处性质不同的修正（超出「只改路径」裁示）**：`architecture.md:64-65` / `architecture-zh.md:62-63` 声称「Domain 纯净性由一个测试锁定」——直查发现**全仓不存在**扫描 domain 禁依赖的测试（仅 `user.aggregate.test.ts` 与 `table-ownership.guard.test.ts` 用 fs），边界实际由 `scripts/ci.ts:50-58` 的 **fallow 佐证（advisory·不阻断）**承担。若只把路径改对，就是给不存活的测试指一具新的不存在的路径⇒ 因此改为如实描述“fallow 佐证 + 逐层 import 矩阵 + 代码评审”。`.qoder/repowiki/` 属生成物，未手改（如需订正走重生流程）。

**缓行 / 另案（不在本片并案）**：**seed 弱口令兜底是否移除**（`seed.ts` createUsers 面缺 `ADMIN_PASSWORD` / `USER_PASSWORD` 时静默兜底 `admin123` / `user123`——改成 fail-loud 拒跑属**行为变更 + 触数据面**·归人，本片只做样例与文档的可见化·v0.3.1 按本片行号引用纪律改小节式)——**已人裁（2026-10-17·AskUserQuestion 定档「生产 fail-loud + 非生产 warn」）→ 另片立案 [module-config-seed-fail-loud-and-contract-gate](./module-config-seed-fail-loud-and-contract-gate.md)（起草·待审计签核）**；**切片 C 四角对拍门禁化**——**同批已人裁「独立 verify 脚本（不进 `ci` 链）」→ 同上另片（其切片 F）**；其余仍归人：compose 把 `5432` 连同弱口令 `postgres/postgres` 发布到宿主（安全面·范围独立）；`DATA_RESIDENCY_ENFORCE` 逃生阀是否应在非编排部署路径也彻底移除（策略面·归人）；**generic 面是否从「一律 warn」升级为生产 fail-loud**（与 `.env.example` 现行文案 + NFR-2/D8 相抵触，属契约变更·归人）。F8 三项已销账、不再列。

## 3. 影响面与风险

- **F3 是「静默不可用」而非「不可启动」**：它不会让任何现有测试或门禁变红，故**只修 warn 不修槽位**（A-1 的半边）会让人继续误信文档；反之**只补槽位不加 warn**，下一个未接的 provider（facebook/twitter/…枚举里还有 8 个）仍会同样静默。二者须同做。
- **A-1 与 A-2 是承诺方向之争**（要不要在模板里对外提供 Google），**归人**；本片不预设。`vision.md` 把 Google/GitHub 列为「境内约束的例外保留」，若走 A-2 即修宪，须与当初 D8 排序一并复核。
- 改 `.env.example` 会影响**新克隆者的第一份配置**：新增键必须给安全默认（注释态或空值 + 说明），**不得写入任何真实凭证**；`OAUTH_*` 类键的默认值变化可能改变本地登录面行为（`[ ]` 落地前复核 seed/e2e 是否依赖现值）。
- 切片 C 属门禁面（AGENTS §2 高危），且判据①/② 依赖「代码读取键集合」的解析口径——**必须复用与本轮相同的 `process.env` + `ConfigService.get('K')` 双模式扫描**，否则重演 fallow 型假阳性（F8 正是反例：门面方法已不存在却仍挂在账上）。
- 切片 D 触宪法与 L4 入口文件，属人签核项；本片**只提议、不改写**。
- 可逆性：各切片独立成 commit，无数据面、无迁移。

## 4. 取证计划（判据的执行口径）

1. **四角对拍存照**：把本轮的比对脚本口径固化并输出四组集合（仅真实有 / 仅样例有 / 代码读两文件皆无 / 文件有两代码不读），作为 F1–F4 的**可复核存照**（切片 B/C 的基线）。
2. **F3 双向实证**：落地前——**已执行（见 §4.1）**。（口径订正：原计划走 `auth.service` 的 provider 列表，直查发现 `getOauthProviders()` **无任何 HTTP 暴露面**（全仓无调用方），故改用 BA 自身端点 `POST /api/v1/auth/sign-in/social` 做四探，并加两组对照以证明生效的 `OAUTH_PROVIDERS` 确为注入值。）落地后（A-1 + boot 期告警）——同一输入下 google 应能拿到 authorize URL（与 github 齐平），或（故意不填凭证）boot 日志给出可定位告警；若走 A-2，则改为「文档/样例/代码三处均不再出现 google」的 grep 存照。
3. **回归**：`pnpm run ci` 基线 **346（330/16）** 零掉（落地后新增 8 例 ⇒ 新基线 354，见 §4.4）；`verify:prod-boot` /health 200；若批准切片 C，则新增脚本正跑 PASSED + **人造违规 ×3**（样例塞死键 / 代码读键不上样例 / required 键不上编排）各非零退出。
4. **样例可用性**：以 `cp .env.example .env` 的洁净夹具跑一次 `docker compose config` 与产物起服冒烟，证明样例本身不缺口（合成假密钥·验毕清零）。**本片未执行**（新增键全为注释态 ⇒ 不改变 `cp` 后的有键集合；且该验证需覆写开发机 `.env`，属高危面未得授权）。

### 4.1 落地前存照（v0.1.1 已执行·零仓库文件改动）

按本节第 2 条的「落地前」一半已实机坐实。手法：**不碰 `.env`**（高危面），而用**进程环境注入** `OAUTH_PROVIDERS=github,google` + `GOOGLE_CLIENT_ID/SECRET=probe_fake_*`（dotenv「不覆盖已有 env」语义→注入值胜出），跑 `pnpm run build` 后的**产物真进程**（`PORT=7099`·`/api/v1/health` 200），对 `POST /api/v1/auth/sign-in/social` 做四探：

| # | provider | 列入声明 | 代码有槽位 | env 有凭证 | 结果 |
|---|----------|----------|------------|------------|------|
| ① | `github` | ✓ | ✓ | ✓（`.env` 占位假值） | **200** + `https://github.com/login/oauth/authorize?...` ⇒ 机制可用、探针方法有效 |
| ② | **`google`** | **✓** | **✗** | **✓**（本次注入非空） | **404 `Provider not found` / `PROVIDER_NOT_FOUND`** ⇒ F3 坐实：唯一变量就是「无槽位」 |
| ③ | `apple` | ✗（被我注入值顶掉） | ✓ | ✓（`.env:86-87`） | 404 ⇒ **对照组**：证明生效的 `OAUTH_PROVIDERS` 确为 `github,google`（否则 apple 应像 github 一样 200） |
| ④ | `facebook` | ✗ | ✗ | ✗ | 404 ⇒ 噪声基线（未声明也未实现） |

日志侧（据实订正 F3 原「零线索」说法）：92 行 boot 日志里本仓代码**未就 google 给过一行提示**（无 warn 无 error）；直到用户真去调该渠道，才出现 `ERROR [Better Auth]: Provider not found. Make sure to add the provider in your auth config { provider: 'google' }`。**⇒ 切片 A 的「可见化」底线不能只是“有日志就行”**：已有一条属于 BA 的运行期 error，真正缺的是 **boot 期就点名「哪个已启用渠道无配置槽位」** 的本仓自有告警（且不得沿用 BA 那句误导性措辞）。
清理：进程已 kill、端口 7099 已释放、`/tmp` 探针文件残留 0、**全程零仓库文件改动**（未读写 `.env` 内容入库·注入值为合成假凭证）。

### 4.2 落地后存照（v0.2.0 已执行·同一探针口径）

同样走**进程环境注入**（不碰 `.env`），跑 `pnpm run build` 后的产物真进程：

| # | 场景 | 注入 | 结果 |
|---|------|------|------|
| P1 | A-1 正向复探（dev·`github,google` + `GOOGLE_CLIENT_*=probe_fake_*`） | 与 §4.1 同一输入 | `POST /api/v1/auth/sign-in/social` **200 + `https://accounts.google.com/o/oauth2/v2/auth?...client_id=probe_fake_id...`** ⇒ **与 github 齐平，F3 失效面闭合**；boot 日志渠道告警计数 **0**（均有槽位） |
| P2 | 非生产可见化（dev·`github,facebook`·facebook 在枚举但无槽位） | 不给槽位 | boot 日志在挂 surface **之前**就出 `WARN [AuthBootstrapService] 1 个已启用的 OAuth 社交渠道未被注册……facebook：……oauth.secrets 无此渠道槽位……**光在 .env 里放 *_CLIENT_ID / *_CLIENT_SECRET 不会生效**`；服务照常 `/health` 200（开发不断链） |
| P3 | 生产 fail-loud（`NODE_ENV=production`·`github,facebook`·另注入合规 residency：`STORAGE_PROVIDER=alioss` + `oss-cn-hangzhou` + `localhost` DB） | 排除其他拒启因素 | **退出码 1·`ERROR [Bootstrap] Failed to start application: 生产环境不得静默弃用已启用的 OAuth 社交渠道（fail-loud，修好再启动）`**（堆栈落在 on-app-bootstrap hook）⇒ 配置错位无法带着上线 |
| P4 | 存量路径回归（生产·`.env:75` = `github,apple`·两者均有槽位 + 占位非空凭证） | 不注入 | `pnpm run verify:prod-boot` **PASSED**（/health 200）⇒ 新 fail-loud **不影响现有部署** |

订正登记（不据实就是本片自己的失实）：§5 原拟的“落地后判据”写的是“google 拿 authorize URL **或** boot 告警”二择一；因人裁同时采纳 A-1 与可见化，两条**均已拍到**（P1 与 P2/P3），无需二择。

### 4.3 四角对拍复算（切片 B 后的可复核存照）

口径：`.env` 只计生效行；`.env.example` 分“生效 / 注释态”两集（上一轮脚本把注释行混计入“样例有”、导致 `ex-env` 错报为空，本轮已拆集合重算）。

- `.env` 生效键 **50**（未动）；`.env.example` 生效键 **51** + 注释态文档化键 **15**（v0.2.2 补 seed 三键后为 **18**·生效集仍 51 未变）。
- 仍仅开发机有：`DATADOG_*` ×4（零消费方残留·机器侧归人）；样例已不提及该能力（`config.module.ts:47` 注释可对照）。
- F4 的 6 个应用/守卫面键现**全部在样例成文且带「不配后果」**（其中 `DATA_RESIDENCY_ENFORCE` / `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 原已注释态·本轮只补口径，新上图的是 `AUTH_TRUSTED_PROXIES` / `LOG_LEVEL` / `LOG_FILE` / `PAYMENT_PROVIDER` 四键）。
- 因切片 C 人裁不做，**仓库内仍无持有该对拍的门禁**（四角仍靠人工/Agent 自觉）⇒ 遗留风险显式保留，已记入缓行。
- **v0.2.2 重算（口径钉死）**：消费合集 **63** 键（直读 56 + `configService.get('K')` 字面 7）·扫描范围 `apps/**` + `libs/**` + `scripts/**` + `drizzle.config.ts` 的非 `*.test.ts` 文件；上图 seed 三键后「代码读·两文件皆未声明」集合 = `NO_COLOR` / `VERIFY_PORT` / `VERIFY_TIMEOUT_MS` 三项（均仅由 `scripts/` 读·刻意不上图·理由见切片 B）。上一轮记的 58 键不含 seed 面三项，**差因无法复现（那轮脚本未入库）**——这正是切片 C 不做留下的「口径不可复核」风险的具体样本，故本轮把脚本口径写进 §4.6 供后人复算。

### 4.4 门禁与工具链存照

`pnpm run build`：TSC **0 issues**、SWC **151 files**（+1 新模块）；`biome check`：**309 files** 净（+2 新文件）；`pnpm run test`：**338 passed / 16 skipped = 354**（原基线 346·+8 新例·**零回归零掉**）；`pnpm run ci`：**Local CI PASSED**；`verify:prod-boot`：PASSED。**如实记录**：本机 `@fallow-cli/linux-x64-gnu` 二进制缺失，fallow 佐证本轮**未产出结论**（脚本按设计不阻断），故本轮不引 fallow 任何断言（亦不拿“边界 0 违规”当证据）。
清理：探针进程全 kill、端口 7097/7098/7099 监听计数 **0**、`/tmp/p{1,2,3}.log` 已 rm；v0.2.1 的探针（7095/7096）同样 kill、监听计数 **0**、`/tmp/g{1,2}.log` 已 rm。

### 4.5 generic（境内）面可见化存照（v0.2.1 已执行·同一环境注入口径）

| # | 场景 | 结果 |
|---|------|------|
| G1 | dev·`OAUTH_GENERIC_PROVIDERS=feishu,wechat,dingding` | boot 日志一条 `WARN [AuthBootstrapService] 3 个已声明的境内 OAuth 渠道未被注册`，**三类真因各自点名**：`feishu` 缺凭证（开发机 `.env` 确实无 `FEISHU_*`）、`wechat` 系 D8 接口位、`dingding` 拼错不在登记面；`/health` **200** 照常启动 |
| G2 | production·同样输入（另注入合规 residency 与 `OAUTH_PROVIDERS=github,apple`） | `/health` **200**、warn 计数 **1**、`Failed to start application` 计数 **0** ⇒ 「不配凭证可正常启动」的既有契约在生产侧**未被破坏**（与 social 面 P3 的退出码 1 形成受控差异） |

单测：`generic-oauth-channels.test.ts` +4（三类归因一次给出、缺凭证仍不注册、文案点名接口位与拼错、`buildGenericOAuthConfigs` 仍为薄封装）；全量基线 **358（342/16）**。

### 4.6 seed 面弱口令与 scripts 面键的处置存照（v0.2.2）

**扫描口径（写死在此以便复算·因切片 C 未做故脚本不入库）**：`walk(apps) + walk(libs) + walk(scripts) + drizzle.config.ts`，排除 `node_modules` / `dist` / `.git` / `*.test.ts` / `*.d.ts`；键取两种模式并集——`process.env(.|?.)KEY` 与 `(configService|this.config|config).get(<…>)?('KEY')`；文件集合分「生效 / 注释态」两集（`^KEY=` vs `^#\s*KEY=`）。

| 集合 | 值 |
|------|-----|
| 代码读取合集 | **63**（直读 56 + `get('K')` 7） |
| `.env` 生效 / 注释态 | 50 / 9（未动） |
| `.env.example` 生效 / 注释态 | 51 / **18**（v0.2.0 时 15 ⇒ seed 三键 +3·**生效集不变**⇒ `cp` 后行为不变） |
| 代码读·两文件皆未声明 | 上图前 **6** → 上图后 **3**：`NO_COLOR` / `VERIFY_PORT` / `VERIFY_TIMEOUT_MS`（均仅 `scripts/` 读） |

**零行为变更的实证**（不靠断言）：`require('dotenv').parse(readFileSync('.env.example'))` 得 **51** 键（与本轮改动前同数）且 `ADMIN_PASSWORD` / `USER_PASSWORD` / `SEED_CLEANUP` **均不在解析结果中**（因三行全为注释态）⇒ §4-4 担心的「`cp .env.example .env` 改变新克隆者行为」已被产物级解析直接排除，无需真去覆写开发机 `.env`。

**直查证据（逐条行号）**：`seed.ts:1-3` `import * as dotenv; dotenv.config()` / `:70` `process.env.ADMIN_PASSWORD || 'admin123'` / `:108` `process.env.USER_PASSWORD || 'user123'` / `:199` `SEED_CLEANUP === 'true'` 门控的 `cleanup()` 内 `db.delete(post)` + `db.delete(user)`；`scripts/verify-prod-boot.ts:16` / `:19` 的 `VERIFY_PORT ?? 7099` / `VERIFY_TIMEOUT_MS ?? 30_000`；四个 `scripts/*.ts` 均读 `!process.env.NO_COLOR`，而 `grep -rn dotenv scripts/*.ts` **零命中** ⇒ 脚本**从不加载 `.env` 文件**（上一轮口径订正：当时用 `\.env` 做正则拿到的“命中”其实只是 `services.app.environment` 的子串，不构成反例）。

**刻意未做的两件事（均非本片可自裁）**：① 未改 `seed.ts` 的兜底逻辑（移除弱口令默认值 = 行为变更 + 触数据面·已入「缓行 / 另案」归人）；② 未在本机跑 `pnpm run db:seed` 取证（会**真写开发机库**且 `SEED_CLEANUP` 语义是删表·属高危面）——本片结论只依赖代码与文件级直查，不拿跑 seed 当证据。

## 5. 完成判据（可核验 + 穷尽）

- [x] F3 定性闭合：人裁取 **A-1**（`envs/default.ts` 补 `google` 槽位），且 `buildSocialProviders` 的静默跳过已可见化（人裁定强度 = **非生产 boot warn + 生产 throw 拒启**·§4.2 P1/P2/P3 已实机拍到）
- [x] F3 已实机坐实（§4.1 落地前存照·四探含两组对照·零仓库文件改动）
- [x] **机制不逐模块特判**：social 面的同一缺陷在 generic（境内）面也已可见化（§4.5 G1），强度差异按既有契约取舍并显式登记归人（不自行升级 NFR-2/D8）
- [x] F1/F2/F4 四角对拍集合已存照（§4.3）；切片 C **人裁不做** ⇒「仓库内仍无门禁持有该对拍」已显式列为遗留·不再假装已闭
- [x] F4 的 **12** 个键已逐面处置（v0.2.2 由 9 订正）：应用/守卫面 6 键已在样例成文并带「未配后果」注释（新上图 4 键·其余 2 键原已注释态·本轮只补口径）；**seed 面 3 键**已注释态上图并点明内置弱口令与破坏性开关；`scripts/` 面 3 键**刻意不上图**并给出理由（脚本不读 `.env`·上图即自造 F3 同型缺陷）；F5 两处默认语义矛盾已消（`development.ts` 兜底改回「不写即关」与 default/production 同口径·样例文案同步·`PLATFORM_OPERATOR_EMAIL` 归位）
- [x] F6 样例的 `DATA_RESIDENCY_ENFORCE` 注释文案已改口径（不填 = 按 NODE_ENV 自动·境内地址优先走白名单而不是关守卫）
- [x] F7 路径口径已归零（旧口径 12 处命中全部改完：`architecture.md(±zh)` / `tooling-standards.md` / `oauth-guide-en.md` / `drizzle-migration-guide.md` / `install&run.md`·`AGENTS.md` §5 本就合规）且无残留 `src/modules` 式旧口径；**附带一处超出字面裁示的修正（Domain 纯净性「由测试锁定」系失实 → 改为如实的 fallow 佐证口径）见切片 D 末段·待人复核或回退**
- [x] F8 三条旧挂账的销账结论已交叉回写（`global-tenancy.md:241-242` 已自记①②的处置记录与人签覆盖行；`module-deploy-host-residency` §5 已于 v0.2.6 标③「已自然结清·无需另案」）·不动任何代码
- [x] `pnpm run ci` 基线零掉 + `verify:prod-boot` 200（新基线 **358**（342/16）·v0.2.0 时 354·累计 +12 例·§4.4/§4.5；切片 C 未批准故无 `verify-config-contract` 人造违规项）
- [x] 临时夹具（探针日志 + 进程）清零·**全程未读写开发机 `.env`**（改用进程环境注入）；§4-4 的 `cp .env.example .env` 夹具未执行（原因已在该条记明）——但其风险点已用**产物级解析代替**排除（`dotenv.parse(.env.example)` 得 51 键·本片新上图的七个键均为注释态·见 §4.6）
- [x] **本片自己的 F4 键数失实已据实订正**：原记 9 键漏计了 seed 面 3 键（现订正为 12）；扫描口径钉死于 §4.6 以便复算，并显式记下「上一轮脚本未入库 ⇒ 口径不可复核」是切片 C 不做的具体代价
- [ ] 人类验收

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-15 | 0.1.0 | 人「继续」→ 对前片遗留的缓行/挂账逐项只读勘察并立案（**零代码**） | 首版八条事实：F1 四份配置契约（`.env` 50 键 / `.env.example` 51 键 / Joi 27 键 / 消费合集 58 键）互不校验且 `allowUnknown: true` 使错位静默通过·F2 双文件分叉（仅真实有 4 个 **已移除的 DATADOG_\***、仅样例有 5 键）·**F3 本片定级依据：`vision.md:65`/`tooling-standards.md:56`/`glossary.md:40`/`README.md:43` 四处承诺「保留 Google/GitHub」+ `oauth-guide-en.md:72` 教用户写 `OAUTH_PROVIDERS=github,google`，而 `envs/default.ts` 的 `oauth.secrets` 只有 github/apple/feishu，`auth.bootstrap.ts:95` 对无槽位者 `continue` 静默跳过，`GOOGLE_CLIENT_ID/SECRET`（`.env.example` 的 `GOOGLE_CLIENT_*` 两行）全仓零消费方**·F4 代码读而两文件皆无的 9 键（前三者在样例里均为注释态·`AUTH_TRUSTED_PROXIES` 的 warn 已在 D4 真容器日志实测）·F5 同键默认语义相反（样例 `EVENT_STORE_ENABLED=false` vs `development.ts` 的 `?? 'true'` ⇒ 不写即开；`PLATFORM_OPERATOR_EMAIL` 与兜底字面相同互相掩盖）·F6 D4 只封 compose，非编排路径仍以文件为唯一源（`.env.example` 的 `# DATA_RESIDENCY_ENFORCE=` 注释行·逃生阀无说明）·F7 `architecture.md:10/:64` + `architecture-zh.md:8/:62` + `oauth-guide-en.md:85` 仍用 `src/…` 旧路径（实为 `apps/api/src` + `libs/core/src`）；**AGENTS.md §5 已合规**（本轮初判取自 agent 旧快照、直查磁盘后推翻）；`envs/.env.development` 漂移在 AGENTS/specs 零命中、仅 `.qoder/repowiki/` 生成物残留·**F8 经人工二次核验销账三条旧账**（`StorageService.uploadFile` 门面已于 2026-10-14 quota-member-wiring 人签删·`global-tenancy.md:242` 已自记；`TenantStatus`/`PlatformUserRow` 各唯一定义、26 处统一 `@core/saas-kit` 值导入；`/health` 已为 ping-only `check([])`、`external-ip-check` 全仓零命中→host-residency §5 首条缓行自然结清）。方案：切片 A（A-1 补 google 槽位 / A-2 撤承诺·**互斥归人**·共同底线是静默跳过必须可见化）／B 样例↔代码对齐（`.env.example` 单点）／C 门禁化 `verify-config-contract`（高危·可选·判据三条含承接 D4）／D 文档路径口径归零（触宪法·高危）；另案：compose `5432` 对外发布、逃生阀在非编排路径是否彻底移除（策略面） |
| 2026-10-16 | 0.1.1 | 人取消四问答复后说「继续」→ 只执行**不需新签核**的那一格（§4-2 「落地前存照」） | 新增 §4.1：产物真进程 + 进程环境注入（**不碰 `.env`**·零仓库文件改动）对 `POST /api/v1/auth/sign-in/social` 四探——`github` **200 + authorize URL**（机制可用）、**`google` 404 `PROVIDER_NOT_FOUND`**（已列入声明 + env 已给非空凭证·唯一变量是无 secrets 槽位）、`apple` 404 作**对照证明生效的 `OAUTH_PROVIDERS` 确为注入值**（否则 apple 应 200）、`facebook` 404 噪声基线。据此**订正 F3 原「日志零线索」说法**（不据实订正就是本片自己的失实）：boot 期本仓代码零提示，但用户真点登录时 BA 会报一条 `Provider not found. Make sure to add the provider in your auth config`——该措辞把人引向改 `OAUTH_PROVIDERS`（早已列了 google）而找不到真因，属**运行期版的失实归因**；因此切片 A 的「可见化」底线收敛为：**boot 期就点名「哪个已启用渠道无配置槽位」的本仓自有告警，不得沿用 BA 那句措辞**。§5 新增一条 `[x]`（仅指“已坐实”，A-1/A-2 方向仍归人）。清理：进程 kill·端口释放·/tmp 归零。同时订正 §4-2 口径（原拟走 `auth.service` 列表，直查发现 `getOauthProviders()` 无 HTTP 暴露面→改 BA 端点四探）。切片 C/D 属高危未动码 |
| 2026-10-16 | 0.2.0 | 人「同意」= 采纳我上一轮给出的推荐组合裁示（**A-1 + 非生产 warn / 生产 fail-loud + 切片 B、D 做、切片 C 不做 + ES 兜底改回 `false`**）→ 本片由立案转实现 | **切片 A-1 落地**：`envs/default.ts` 的 `oauth.secrets` 补 `google` 槽位（interface 侧 `secrets: Record<string, Record<string,string>>` 无需改）。**共同底线落地**：新建纯函数面 `modules/auth/social-provider-registration.ts`（`resolveSocialProviders` 把三条静默 `continue` 拆成 `unknown-type`/`no-config-slot`/`missing-credentials` 三类归因 + `planProviderDiagnostics` 定强度），`auth.bootstrap.ts` 的 `buildSocialProviders()` 只保留装配与「非生产 warn / 生产 throw」执行（不再直读枚举逐 provider 特判）；新单测 8 例。**切片 B**：`.env.example` 新上图 `AUTH_TRUSTED_PROXIES`（并段 Auth 区·合并尾部重复项与 compose 「172.16.0.0/12 只解拿到 IP」口径）、`LOG_LEVEL`/`LOG_FILE`（新 Logging 段）、`PAYMENT_PROVIDER`（Stripe 区·注明 alipay 填了也不启用）；**四键均取注释态**以免改变新克隆者默认行为；F6 文案改口径；F5 的 `development.ts` `?? 'true'` 改为与 default/production 同口径（不写即关）+ 样例文案同步；`PLATFORM_OPERATOR_EMAIL` 从 ES 注释块下**归位**。**切片 D**：旧 `src/…` 口径 12 处命中改完（`architecture.md(±zh)`、`tooling-standards.md:55/:96/:102`（含 vitest `include` 失实订正为实值）、`drizzle-migration-guide.md` 的两处 schema 路径行（migrate 步骤 1 + Project Structure 目录块）、`install&run.md:57`、`oauth-guide-en.md:85` 并补「槽位 + 凭证」双要件说明与 `google` 示例）。**两处范围说明（均已显式登记待人复核/可回退）**：其一，切片 D 的文件面从字面列举的三份扩到五份（同类旧口径不逐文件特判）；其二，`architecture.md(±zh)` 宣称的「Domain 纯净性由一个测试锁定」直查发现**全仓不存在**此类测试（fs 扫描仅 `user.aggregate.test.ts` 与 `table-ownership.guard.test.ts`），边界实由 `scripts/ci.ts:50-58` 的 fallow 佐证（advisory·不阻断）承担→改为如实描述（只改路径会给不存在的测试指一条新路径）。**切片 C 人裁不做**⇒ 四角对拍仍无门禁持有，显式列为遗留。**新增 §4.2 落地后存照**：P1 同输入下 `google` 已 **200 + accounts.google.com authorize URL**（与 §4.1 的 404 形成直接对比·F3 失效面闭合）且 boot 告警计数 0；P2 `github,facebook` 在 dev 拿到 `WARN [AuthBootstrapService]` 点名真因且服务照常 boot；P3 生产同输入**退出码 1 拒启**（另注入合规 residency 以排除干扰因素）；P4 `.env:75` 的 `github,apple` 均有槽位·`verify:prod-boot` PASSED ⇒ 存量部署零影响。**§4.3 四角复算口径订正**：上一轮脚本把注释行混计入「样例有」致 `ex-env` 错报为空，本轮拆「生效 / 注释态」两集重算（`.env` 生效 50·样例生效 51 + 注释态 15·仅开发机有仍为 `DATADOG_*`×4）。**§4.4 门禁存照**：TSC 0 issues、SWC 151 files、Biome 309 files 净、测试 **354（338/16）** 较基线 346 **+8 零掉**、`pnpm run ci` PASSED；**如实记录本机 `@fallow-cli/linux-x64-gnu` 缺失 ⇒ fallow 佐证本轮未产出结论**，故不引其任何断言。未做：§4-4 的 `cp .env.example .env` 洁净夹具（需覆写开发机 `.env`·高危未得授权）；compose `5432` 与逃生阀策略仍另案 |
| 2026-10-16 | 0.2.1 | 人「继续」→ 先盘点本片**范围内尚未闭合的一格**（不摆矩阵·不再请示）：机制修只做了一半 | **补齐对称半边**：`generic-oauth-channels.ts` 的 `buildGenericOAuthConfigs()` 与 social 面同构地带着两条静默 `continue`（无构建器 / 缺凭证），AGENTS §2「机制修复不逐模块特判」要求同一口径可见化。做法：抽 `classifyGenericChannel`（单渠道裁决）+ `resolveGenericChannels`（一次遍历同时出 `configs` 与 `drops`，避免两处判定条件漂移），三类归因 `unknown-id` / `builder-pending` / `missing-credentials`；`buildGenericOAuthConfigs` 降为薄封装 ⇒ 既有 7 条契约测零改动全绿；`auth.bootstrap.ts` 的 `buildGenericConfigs()` 只加一条 warn。**强度刻意与 social 面不同**（一律 warn·含生产也**不拒启**）：因 `.env.example` 的 `OAUTH_GENERIC_PROVIDERS` 段明示「不配凭证可正常启动」+ NFR-2「未配即降级」/ D8 接口位为既有人裁，升级即违反既有契约 ⇒ 作为**新的待裁项登记归人**（已入「缓行 / 另案」），而不是替人拍。样例文案同步一句「会 warn 但不拒启」。**新增 §4.5 存照**：G1（dev·`feishu,wechat,dingding`）一条 warn **三类真因各自点名**（feishu 缺凭证·wechat 系 D8 接口位·dingding 拼错不在登记面）且 `/health` 200；G2（生产同样输入）`/health` **200**·warn 计数 1·`Failed to start application` 计数 **0** ⇒ 「不配凭证可正常启动」契约在生产侧未被破坏（与 P3 退出码 1 形成受控差异）。单测 +4（`generic-oauth-channels.test.ts`）；基线 **354→358（342/16）**·`pnpm run ci` PASSED·Biome 309 files 净（中途 2 处格式由 `check --write` 归零）；探针进程 kill、端口 7095/7096 计数 0、`/tmp/g*.log` 已 rm。**本片判据除「人类验收」外全部 [x]，未开新任务面** |
| 2026-10-16 | 0.2.2 | 人「继续」→ 继续盘点本片**范围内**尚未闭合的一格（不摆矩阵·不再请示）：发现 **F4 自己的键数从未穷尽** | **据实订正本片自身失实**：用钉死口径（`apps/**` + `libs/**` + `scripts/**` + `drizzle.config.ts`·排除 `*.test.ts`·`process.env` 与 `configService.get('K')` 双模式·样例拆生效/注释态两集）重算得消费合集 **63** 键，「代码读而两文件皆无」的集合实为 **6** 项而非 F4 原记的 9 键扣除上图 6 键后的 3 项——多出的是 **seed 面 `ADMIN_PASSWORD` / `USER_PASSWORD` / `SEED_CLEANUP`**（`seed.ts:70` / `:108` / `:199`）。**新缺陷的定级依据**：`seed.ts:1-3` 自带 `dotenv.config()`（与 `scripts/verify-*.ts` 只读进程 env **相反**）⇒ 这三键本属 `.env` 供给面却两份文件都没写，而 `drizzle-migration-guide.md` 的 Seeding → Environment Variables 小节只教内联传参；未配时 `seed.ts:70` / `:108` **静默兜底 `admin123` / `user123`**，且 `admin123` 是给**平台经营者账号**（email 取 `PLATFORM_OPERATOR_EMAIL`·`Role.ADMIN`）灌的口令；`SEED_CLEANUP=true` 则是**删 `post` + `user` 两表**的破坏性开关。**落地仍在切片 B 的既有授权面（`.env.example` 单点）内**：三键一律**注释态**上图（`cp` 后键集合不变·不改任何默认行为）+ 两条后果文案；同步给 `drizzle-migration-guide.md` 的 Seeding 小节补英文警示（该文件全篇英文⇒按原文语言写）。**`scripts/` 面三键刻意不上图**并给出理由（脚本不 import dotenv·上图即制造本片 F3 同型的「声明有、实现无」）。**未做且登记归人**：改 `seed.ts` 兜底为 fail-loud（行为变更 + 触数据面）；跑 `db:seed` 取证（真写开发机库·高危）⇒ 本片结论只依赖代码与文件级直查。**§4.6 新增存照**（集合表 + 逐条行号 + 扫描口径钉死·并自记上一轮用 `\.env` 正则拿到的“命中”实为 `services.app.environment` 子串这一口径瑕疵）；§4.3 集合数字随之更新（样例注释态 15→18·生效 51 不变）；§5 的 F4 判据改为覆盖 12 键并新增一条「本片自身键数失实已订正」`[x]`；顺带将正文 4 处误打的全角中点（U+30FB）归一为间隔号（U+00B7）。**附带一个机制修（不逐处特判）**：把行号式引用改为键名 / 小节式——本轮往 `.env.example` 插入 9 行、往指南插入 12 行，**使 12 处 `.env.example:NN` 引用集体漂移**（其中 F4 那条 `:116` 其实早在本片 v0.2.0 改样例时就已漂了·只是本轮才发现）；分布：本片 8 处 + `docs/plans/README.md` 1 处 + `module-deploy-env-mount-boundary.md` 1 处 + `module-deploy-host-residency.md` 2 处（后四处属跨片文档的指针错位·与切片 D 同属「引用指错位」类缺陷·不逐处特判）；本片另有 3 处指南行号引用（`:15/:85` 与 `:64/67/70`）一并改为小节式。门禁：`pnpm run ci` PASSED·基线 **358 不动**（零代码变更·无新增测试）·Biome 309 files 净 |
| 2026-10-17 | 0.3 | 人类验收·结项 | 人签核批量验收：README 索引行翻已验收·结项；四拍实机存照+对称半边 v0.2.1+F4 键数失实 v0.2.2 订正齐·基线 358；两项归人待裁（弱口令兜底 fail-loud 与否·四角对拍无门禁持有）登记后继续挂账不阻塞结项；另留 Domain 纯净性文档失实订正待复核 |
| 2026-10-17 | 0.3.1 | 人裁「2」→ 两项归人待裁点定档 | 「缓行 / 另案」中 **seed 弱口令兜底**裁为「生产 fail-loud + 非生产 warn」、**切片 C 四角对拍门禁化**裁为「独立 verify 脚本（不进 `ci` 链）」——均非本片可并入（已结项 + 触行为变更/门禁面），依约另片立案 `module-config-seed-fail-loud-and-contract-gate`（起草·待审计签核）；其余三条（compose 5432 弱口令发布·逃生阀非编排路径移除·generic 面升级）仍归人挂账 |

---

<!-- 变更戳 -->
正文停 2026-10-16 / v0.2.2 实体变更·2026-10-17 打 v0.3 结项戳（仅翻账行）（人「继续」→ 订正 F4 键数失实·补 seed 面三键的可见化·§4.6 存照·弱口令兜底是否移除已登记归人），人类验收·结项（批量验收）后以当前正文内容为准。
