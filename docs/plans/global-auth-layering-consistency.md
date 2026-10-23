# auth 层形一致性与架构文档对账（机制上下文归位 · 减小 CA/DDD 架构误差）

> 适用范围: `全局`（`docs/specs/architecture` 宪法条款对账）+ `模块(auth)`（文件归位）← 两段 blast radius 分异，切片 A 触宪法、切片 B 仅 auth 内部 import
> 关联: `specs/architecture` §Layer-shape（L190–194 EN / L178–182 ZH）· §System mechanism vs Business domain 二分（L209–214 / L196–201）· §Two-package physical layout（L102 EN / L99 ZH）· `specs/glossary` · `scripts/verify-domain-layout.ts` 恒等闸 · global-architecture-positioning-uplift（层形豁免判据首立·本案续治）· global-governance-lifecycle-consolidation（BA 表共享宪条）
> 性质: 重写型（当前方案整体重写 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

> **指导原则（人裁 2026-10-23）**：本案以「**SaaS 基础架构 · 合理性与符合最佳实践为第一指导 · 不因成本/工作量退让**」为纲；宪法非静态，随项目推进**可动态修正**（本案对 §Layer-shape 即此）。凡能归入 CA+DDD 统一架构者一律归入、减小架构误差。

## 1. 背景与目标

真机对拍归列重构期间的架构复盘发现：`modules/auth` 与本仓 CA+DDD 分层约定存在**两处漂移（架构误差）**，需归账：

- **漂移①（文档内自相矛盾）**：`architecture` §Two-package physical layout（EN L102 / ZH L99）把 `auth` 与 `users/posts/payment/storage` 并列为「**full local vertical slices (domain→application→infrastructure→api)**」；而同文 §Layer-shape（EN L194 / ZH L182）又明裁「auth **依法无自有 `domain/`**（认证语义下沉 Better Auth·暂无自持不变量）」。二者对 auth 是否"四层齐备"直接冲突——前者 over-claim。
- **漂移②（文档↔代码不符）**：§Layer-shape 只豁免 `domain/` 缺席，且要求有内容的裁决「**never left inline**」。但现实 `modules/auth` 除 `infrastructure/`、`guards/`、`decorators/` 外，`auth.implement`(425 行·BA 工厂)/`auth.bootstrap`(134 行·BA HTTP 面挂载)/`session-resolver`/`generic-oauth-channels`/`social-provider-registration`/`seats-quota.hook`/`session-store.port`/`user-store.port`/`auth.service` **全部平铺在模块根**，未按层归位——违反 §Layer-shape「层有内容即归位」的精神（虽 `verify:domain-layout` 闸只强制 `domain/` 子目录规范、不强制 infra/api 归位，故非闸违例、乃一致性债）。

**目标**：
1. 文档对账——消除 auth「完整四层」的 over-claim，把 §Layer-shape 升格为 auth 层形的权威条款，并补「机制上下文归位规则」（auth 建**最小 `domain/` 仅含 `domain/ports/`**·无聚合·既有内容须落入 `infrastructure`/`api`/`domain/ports`，禁平铺）。
2. 代码归位——把平铺根文件按层归位至统一架构，减小误差；**零行为、零 DI token 语义、零 schema、零路由变更**。

**非目标（显式锁定·防 over-engineering）**：
- **不**为 auth 造自有 `domain/` 聚合根/实体（§Layer-shape + §FC L23 已裁「唯一天然聚合 User 生命周期归 BA」·硬造即违宪）。
- **不**触碰 BA 拥有的 `/api/v1/auth/*` 端点形态（端点由 `AuthBootstrapService` 通配挂载、非本仓 controller·故 auth **合理地无 `api/` controller 目录**，仅归位 guards/decorators）。
- **不**改 `AUTH_SESSION_STORE`/`AUTH_USER_STORE` 等 Symbol token 值与契约签名（仅可能改其**文件位置**与 import 路径）。
- **不**夹带归列生命周期案遗留行为改动。

## 2. 方案

两段独立、各穿透一层、可各自过审计门与验收；切片 A（文档·高危触宪法）先行钉死判据，切片 B（代码归位）据 A 的归位规则实施。

### 切片 A —— 架构文档对账（纯文档·触 `docs/specs` 宪法·高危#5 随签）

完成判据：
1. **修 over-claim**：`architecture` EN L102 / ZH L99「full local vertical slices」清单**移出 auth**（auth 系 System mechanism·非业务域完整切片），改为指向 §Layer-shape 的措辞（如「mechanism contexts 见 §Layer-shape 层形豁免」）；`users/posts/payment/storage` 保留原列。
2. **修正并升格 §Layer-shape 为 auth 层形权威**（动态修宪）：把「auth 依法无自有 `domain/`」细化为——auth 建**最小 `domain/` 仅承载已发布端口**（`domain/ports/`·系抽象契约·对齐 §L25「domain/ 承载 policies/VO/**ports**」与 authorization/core 各上下文端口同位之统一约定），**但无自持聚合/policies**（认证不变量归 Better Auth·§FC L23）；一旦出现 auth 本地不变量须即物化进 `domain/`。并补「机制上下文归位规则」：① BA-facing 适配/挂载（implement/bootstrap/oauth-channels/social-registration/quota-hook/resolver）归 `infrastructure/`；② 已发布端口归 `domain/ports/`；③ 呈现守卫/装饰器归 `api/`；④ 死码清除（见切片 B · U2）。
3. **中英镜像**：architecture ±zh 两处（physical layout 条 + §Layer-shape 条）同步·句对句。
4. **交叉一致**：glossary / §System mechanism 表若含 auth 层形表述，随 §Layer-shape 权威口径对齐（防双 SSOT）。

### 切片 B —— auth 文件归位（代码·expand–contract ·零行为）

依切片 A 钉死的归位规则搬迁，逐文件改 import 路径；`git mv` 保历史。目标布局：

| 现（模块根平铺） | 归位至 | 依据 |
|------|------|------|
| `auth.implement.ts` | `infrastructure/` | BA 工厂适配（数据面单一切换点·drizzle/mikro 双轨） |
| `auth.bootstrap.ts` | `infrastructure/` | BA HTTP 面挂载（Fastify 通配·infra 关注） |
| `session-resolver.ts` | `infrastructure/` | 会话解析适配（有 1 处跨模块消费·改路径即） |
| `generic-oauth-channels.ts` · `social-provider-registration.ts` · `seats-quota.hook.ts` | `infrastructure/` | BA 渠道/钩子适配 |
| `session-store.port.ts` · `user-store.port.ts` | `domain/ports/` | 已发布抽象契约（对齐 §L25「ports 居 domain」与 authorization/core 同位惯例；跨模块消费：session 2·user 3 处·仅改 import 路径·Symbol token 不变） |
| `guards/{session,csrf-origin}.guard.ts` | `api/guards/` | 呈现层墙（deny-by-default / CSRF·对齐 authorization/api 先例） |
| `decorators/current-user.decorator.ts` | `api/decorators/` | 呈现层参数装饰器 |
| `auth.service.ts` | **删除**（U2 已核）：全仓零调用点（仅 `auth.module.ts` 注册 provider）·`getOauthUserAccount` 含 `console.log` 桩返回 `{id:''}`·`getOauthProviders` 无消费者·真死面·依「不退让成本」清除（属高危删码须人签） |
| `auth.module.ts` · `auth.interface.ts` · `auth.constant.ts` | **留模块根**（模块装配与注入契约·非层内容） |

- **归位不变量**：新建**最小 `domain/`（仅 `domain/ports/`）**、无聚合无 policies（BA 持认证不变量）；搬迁只动文件位置与相对 import + 删死码；跨模块消费方（tenants/users）改端口 import 路径。
- **验收前置**：切片 A 已签发后，B 方可实施（避免文档/代码两头改·单源优先）。

## 3. 影响面与风险

- **切片 A**：触 `docs/specs/architecture` 宪法 = **高危**（workflow §3 / AGENTS 铁律），须人签核；纯文档、零代码、可 git 回滚。
- **切片 B**：命中高危清单「删码删依赖」（若 U2 裁删 `auth.service`）与「DI/结构移动」——须人签核。blast radius 实测（grep 全仓引用）：除 `session-store.port`(跨模块 2)/`user-store.port`(跨模块 3)/`session-resolver`(跨模块 1) 外，**其余平铺根文件均模块内引用（外部 0）**，主要成本为 auth 目录内 import 路径重写 + 上述少数跨模块端口路径更新。
- **不可逆性**：低。`git mv` + import 改写，Symbol token 与契约签名不动 → 行为等价；回滚 = revert commit。
- **残余风险**：ESM 装饰器元数据/值导入（AGENTS 铁律 R-η）——改 import 路径须守 `@Body/@Param` 装饰器与构造函数注入类的**值导入**，防 DI 运行时 `UnknownDependenciesException`；由既有 Controller 反射锁测 + DI 集成测兜底回归。

## 4. 审计记录

> 无已审方案不写码。本案触宪法（A）+ 结构移动/可能删码（B）= **高危·须人签核**。

- 结论：**待审计**（本窗仅立方案·未动宪法与代码）——U1–U3 已依指导原则裁定（见下），待你对「修宪（A）+ 归位/删码（B）」下 GO 签核后方实施。
- 未决项（**均已裁 2026-10-23 · 依「合理+最佳实践为第一 · 不退让成本」**）：
  - **U1✅**：端口归 `domain/ports/`（非独立 `ports/`、非并入 infra）——auth 建最小 `domain/` 仅含端口，对齐 §L25 与各上下文统一约定；为此**动态修正** §Layer-shape「auth 无 domain」表述。
  - **U2✅**：`auth.service.ts` 全仓零调用实证为死面 → **删除**（高危删码随本方案签）。
  - **U3✅**：guards/decorators 并入 `api/guards/`、`api/decorators/`（对齐 authorization/api 先例）。
- 审计人 / 日期：____

## 5. 完成判据（可核验 + 穷尽）

- [ ] 切片 A：architecture ±zh physical-layout 条与 §Layer-shape 条**句对句对账一致**·L102/L99 auth over-claim 已消·glossary 无残留冲突表述
- [ ] 切片 B：`git mv` 归位完成·全仓无对旧平铺路径的悬挂 import（`grep` 旧路径 = 0）
- [ ] `pnpm run verify:domain-layout` 绿（domain 布局恒等闸不受损）
- [ ] `pnpm run verify:test-types` + full `pnpm run ci` 全绿（含 `tsc` 0·fallow 佐证 0 边界违例）
- [ ] 真机冒烟：干净重建起服 → BA 登录 → `GET /api/v1/platform/tenants` 200（归列读面·复用既有对拍口径）
- [ ] 文档状态单源：本案 README 索引行随 A/B 各切片推进翻账
- [ ] 零行为回归：Symbol token / 契约签名 / BA 端点 / schema 未动（diff 仅 import 路径 + 文件位置 + 文档条款）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-23 | 0.1.0 | 起草 | 首版：立 auth 层形对账（文档 over-claim 修正 + 平铺根文件归位·两切片）·含 U1–U3 未决项待人裁 |
| 2026-10-23 | 0.2.0 | 人裁 U1–U3 + 治理原则 | 采最佳实践一致解：U1 端口归 `domain/ports/`（auth 建最小 domain·动态修正 §Layer-shape）·U2 删 `auth.service` 死面·U3 guards/decorators 并入 `api/`·新增「合理+最佳实践为第一·不退让成本」指导原则段 |

---

<!-- 变更戳 -->
正文已于 2026-10-23 / v0.1.0 变更，以当前正文内容为准。
