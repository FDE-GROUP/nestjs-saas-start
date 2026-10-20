# global-ba-entity-domain-placement：BA 实体按域归位——Better Auth 降格为 auth 域工具，`database/ba/` 区消解

> 适用范围: `全局（宪法 BA 定位条 + 目录结构 + table-ownership 台账 + 列律登记 + ba/ 区消解）` ← 修宪级（对 `global-ba-contract-surface` 框架的**再裁决**）
> 关联: [`global-ba-contract-surface`](./global-ba-contract-surface.md)（被本案再裁决·其"契约面存储视图集中"框架由域归属框架取代）· [`global-entity-context-placement`](./global-entity-context-placement.md)（归位先例 + **BY_MODEL 勘误对象**·见 §1）· [`global-tenant-entity-reclamation`](./global-tenant-entity-reclamation.md)（域收权先例）· [`module-mikro-adapter-package-extraction`](./module-mikro-adapter-package-extraction.md)（adapter 零实体耦合基线 R-4）· `AGENTS.md` §2/§5 · `architecture.md`(+zh) BA 定位条
> 性质: **修宪提案（审前方案·零实现码）**；用户已裁定原则方向（2026-10-20·"BA 作为工具库参与身份认证而已，应当归属 auth 域——如 CASL 参与权限管理而 CASL 本身不是领域"）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标（人裁原则 + 认知修正链）

**人裁原则**：优先遵循 Clean Architecture 领域原则——**库约束接口，域拥有事实**。CASL 先例即范式：authorization 域自有 `tenant_role/grant/audit` 表（授权事实 SSOT），CASL 仅作运行时投影引擎居于 infrastructure；库可以约束我们的词汇表，但库不成为领域。Better Auth 应同理：**auth 域拥有身份机器的表（形状受 BA 接口契约约束），BA 本体降格为 auth 域 infrastructure 里的工具**（操作机器·`auth.api.*`），而非以工具名占据顶层存储区 `database/ba/`。

**认知修正链（本案的上游依据）**：
1. **勘误**：`global-entity-context-placement` §1 取证基线曾称"BA 表面 `entities.ts` 含 `BY_MODEL`……跨三属主**不可切**"——经直查官方 adapter 文档与代码双重证伪：① BA 的 adapter 契约是**运行时 model 字符串寻址**（`mikro-auth-adapter.ts:115,138,170`：`INSERT INTO ${q(model)}`，不经任何实体类），BA 对实体定义位置**零意见**；② 所引 `BY_MODEL` 在当前代码中**已不存在**（grep 全仓零命中）。"不可切"系对 BA 契约的误解，本案一并落勘误。
2. **两族自然缝**：BA 八表实为两个变更族——**身份机器族**（user/session/account/verification/consent·随 BA 认证机器演进）与**组织容器族**（organization/member/invitation·随 BA org 插件演进）。按域拆分后上游变更各自落在单一模块（auth / tenants），**上游的自然缝恰为领域界**——原"拆分扩散上游变更"的反对论证不成立。
3. **形状责任本就在我**：`ba/entities.ts` 全部为我们手写（BA 不提供 MikroORM v7 实体），迁移 DDL 亦为我们手写——形状定义与迁移责任早已由本仓承担，集中停放只是位置错误，非责任转移。

**目标**：八实体按族归域（§3）；`database/ba/` 区消解；宪法 BA 定位条翻转（"契约面存储视图集中"→"表归域·形状受工具契约约束·操作经工具 api"）；台账与文件位置**例外清零**；`global-entity-context-placement` 勘误落档。

**非目标（锁）**：**零 schema / 零迁移内容变更**（`migration:generate` 空 diff 为硬闸·纯搬迁）；不替换 BA 操作面（成员/邀请/会话机器仍走 `auth.api.*`——**拥有表 ≠ 接管操作**，CASL 类比不推导此步）；不动 `@okee/mikro-adapter`（零实体耦合基线）；不动 BA 的 model/字段解析链；不涉 `tenant`/`user_status` 等已归位实体。

## 2. 现状取证（2026-10-20）

- **消费面**：`database/ba/entities` 非测试 import **13 处**（auth×2：session-store.adapter/seats-quota.hook；tenants×5：tenant-status/user-status store + governance/provisioning/user-governance repo；users×2：export handler/user repo；platform×1：identity lookup；subscriptions×1：quota store；database×2：column-law/migration-entities）+ 测试 **16 文件**。bounded sweep，量级小于实体归位案（~40）。
- **台账现状**（`table-ownership.ts:19-29`）：`user→users`、`account/session/verification/consent→auth`、`organization/member/invitation→tenants`。
- **列律现状**（`entity-column-law.ts:19-34`）：`BA_CONTRACT_TABLES` 清单做**表名恒等登账**、不裁列形（"改 BA 列=违契约"）——本案保留该登记语义，仅随实体迁移同步引用路径。
- **一致性 spec 现居** `database/ba/auth-adapter.consistency.spec.ts`（env-gated 真库·`vitest.consistency.config.ts` 引用其路径）。
- **实体建模形态**：手写 `defineEntity`（非 META 系）——本案**不改变建模习语**（META 统一另案可议·见 §8 未决②）。

## 3. 目标态

```
modules/auth/infrastructure/entities/ba-identity.entities.ts   ← 身份机器族（裁①②定稿）
  User? · Session · Account · Verification · Consent            （逐实体头注：形状受 BA 接口契约约束·
                                                                  上游变更沿本族演进·操作经 auth.api.*）
modules/tenants/infrastructure/entities/ba-org.entities.ts     ← 组织容器族
  Organization · Member · Invitation                            （同上注记）
database/ba/ → 消解（一致性 spec 迁 auth/infrastructure·裁③）
```

- **宪法翻转**（±zh 对拍）：BA 定位条由"契约面存储视图集中（上游变更整组动）"改为"**BA 为 auth 域工具：身份机器表归 auth 域、组织容器表归 tenants 域，形状受 BA 接口契约约束（列律登账），操作经 `auth.api.*` 工具面**"；`organization` 词条的"认证/成员面投影"表述相应翻正。
- **台账**：与文件位置同步（`user` 归属随裁①定稿）；列律 `BA_CONTRACT_TABLES` 引用同步。
- **目录树**：architecture(±zh) 与 AGENTS §5 核验翻账。

## 4. 执行切片（人裁倒置序：**C 文档先行 → A → B**·每片过门禁）

- **切片 A｜身份机器族迁 auth**：五实体迁 `modules/auth/infrastructure/entities/`（裁①②定稿成员）；一致性 spec 迁位（裁③）+ `vitest.consistency.config.ts` 路径订正；消费面 sweep（auth/users/platform/subscriptions/database 侧 import 改址）。**判据**：`ci` 全绿 + 一致性套件真库绿（`ci:db`）。
- **切片 B｜组织容器族迁 tenants**：三实体迁 `modules/tenants/infrastructure/entities/`（与既有 tenant/user-status 同居）；消费面 sweep（tenants 五处 + database 两处）。**判据**：`ci` 全绿 + 表所有权守卫绿（写面归位后台账↔路径全量一致·例外清零）。
- **切片 C｜宪法翻账 + 勘误收口**：architecture(±zh) BA 定位条与目录树、`table-ownership` 注释语境、列律引用；**`global-entity-context-placement` 演变记录补 BY_MODEL 勘误行**；`global-ba-contract-surface` 补再裁决注（其框架被本案取代·理由留档不删史）；README 索引。**判据**：文档树↔实存对拍一致。
- **全程硬闸**：`migration:generate` **空 diff**（零 schema 变更证明·沿归位案先例）+ `ci` + `ci:db`（gated e2e 含 16 测试文件 import sweep 后）+ `verify:prod-boot`。

## 5. 影响面与风险

- **blast radius**：中。~29 import 触点（13 生产 + 16 测试）+ 宪法两文件（±zh）+ 台账/列律注释 + 一致性配置路径；**零逻辑/零 schema/零契约变更**。可逆（git revert 分片）。
- **风险登记**：
  - R-1 上游变更落点变化：BA 认证机器升级 → 仅 auth 模块；org 插件升级 → 仅 tenants 模块（两族缝=域界·§1-2 论证）；比集中制**更**贴合上游演进线。
  - R-2 tsx 链相对导入约束（归位案实跑教训）：`migration-entities.ts`/`seed.ts`/column-law 等新址 import 一律相对路径。
  - R-3 一致性 spec 迁移后 `BA_MIKRO_CONSISTENCY` 门禁路径恒等：`vitest.consistency.config.ts` 与 `scripts/ci-fullstack.ts` 双处核。
  - R-4 adapter 零触：`@okee/mikro-adapter` 不 import 任何实体（抽包案 R-4 基线）——本案不验自证。

## 6. 高危签核清单（实施前置）

- **#5 改宪法**：BA 定位条翻转 + 对 `global-ba-contract-surface` 框架的再裁决（推翻近期已结项之案的框架，依据为认知修正链 §1——**归人亲签**）。
- 无 #1（零 schema·空 diff 闸证）/ 无 #3（不删依赖·`ba/` 区消解为搬迁）/ 无 #6（门禁仅路径订正不语义变更）。

## 7. 审计记录

- 结论：**已审计·GO**（用户 2026-10-20 令「按建议裁，先完成文档」）——四裁点全采建议档：① `User` → **auth**（台账 `user→users` 随切片同步翻 `user→auth`·users 模块经端口消费不变）；② `Consent` → **auth**；③ 一致性 spec → **`modules/auth/infrastructure/`**；④ **三片分笔**。
- **执行序倒置（人裁「先完成文档」）**：本仓「修宪殿后」镜像纪律在本案被显式倒置——切片 C（宪法翻账+勘误+再裁决注）**先行落地**，代码切片 A/B 随后；过渡期宪法目录注记带「迁移中」标记，A/B 落地时摘除（判据 §8 兜底对拍）。倒置理由：本案认知修正链（勘误/再裁决）不依赖物理状态，先行成文可止住错误论证的继续流传。
- 未决项：~~四项已裁（见结论）~~。
- 审计人 / 日期：人（按建议裁·四裁点 + 执行序）/ 2026-10-20。

## 8. 完成判据（可核验 + 穷尽）

- [ ] 八实体新家落位（裁①②③定稿），`database/ba/` 目录消解。（**切片 A 已落地**：身份机器族五实体落 auth·台账 user→auth·AUTH_USER_STORE 收编；余切片 B 三实体）
- [ ] 全仓 `database/ba/entities` 旧路径 grep 零残留（注释留痕除外）。
- [ ] `migration:generate` 空 diff（零 schema 变更·二次 generate 复核）。
- [ ] 台账↔文件位置全量一致（表所有权守卫绿·BA 表例外清零）；列律 `BA_CONTRACT_TABLES` 引用同步。
- [ ] `ci` 全绿 + `ci:db`（含一致性套件新路径 + 16 测试文件 sweep 后）+ `verify:prod-boot` `/health` 200。
- [ ] 宪法 ±zh BA 定位条翻转成文两版一致；`global-entity-context-placement` BY_MODEL 勘误行落档；`global-ba-contract-surface` 再裁决注落档。

## 9. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.3.0 | 切片 A 落地 | 身份机器族五实体迁 `modules/auth/infrastructure/entities/ba-identity.entities.ts`（BA 契约头注）+ 一致性 spec 迁位（consistency config 路径订正·真库 9/9）+ 18 文件 import sweep（含 seed tsx 相对导入）+ **台账 `user→auth` 翻转并收编写面**：新 `AUTH_USER_STORE` 端口（S3 同型）·users 端口去 `remove`·delete-user handler 经端口硬删（逐字同语义）——表所有权守卫绿。硬闸：700 测全绿 + `migration:generate` 空 diff + gated e2e 10 文件 36 测 + prod-boot /health 200 |
| 2026-10-20 | 0.2.0 | 人裁 GO（按建议裁·先完成文档）| §7 翻正已审计·GO（四裁点建议档全采）+ 执行序倒置成文（C→A→B）；切片 C 文档件先行落地（宪法 ±zh 翻转[带迁移中注记]/归位案勘误/成区案再裁决注/索引翻正） |
| 2026-10-20 | 0.1.0 | 起草 | 首版：BA 实体按域归位修宪提案（两族归域 + ba/ 区消解 + 宪法翻转 + BY_MODEL 勘误收口；四裁点归人） |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.2.0 变更（人裁 GO·四裁点建议档·C 片文档先行），以当前正文内容为准。
