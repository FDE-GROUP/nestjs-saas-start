# global-governance-lifecycle-consolidation：治理生命周期归列——撤 tenant/user_status 旁表、撤治理面 ES 真相源、立 audit_log 审计账本

> 用途: **方案（提案–审计–实施）** | 状态: 已审签·实施中（A/B/C/D/E 已落地·F 文档翻案已成文·待提交） | 版本: 0.3.5
> 定位: 用户确立「框架定位·设计合理性第一·成本/工作量/沉没不作否决项·零技术债」原则后，复核 `global-tenant-entity-reclamation` 立下的 `tenant` 自有旁表，判其两根承重柱已被新约束抽掉，令「改」。
> 关联（翻案/牵连）: **反悔** global-tenant-entity-reclamation 核心裁（建自有 tenant 表收权）· global-entity-column-law（`BA_CONTRACT_TABLES` 禁加列律 + 17 表恒等）· global-ba-entity-domain-placement（「库约束接口·域拥有事实」）· table-ownership（tenant/userStatus 属主）· module-es-r1-replay-core（tenant 为 R1 治理面试点）· S4 审批制 · S6 用户暂停（user_status）· glossary/architecture±zh（Tenant 词条 + BA 定位条）。

## 0. 概览（TL;DR）
新约束（人裁·本窗）：① **认证库永久锁定 Better Auth，不考虑 BA 升级/换库**；② **认证与授权不需要 ES，「不需 ES」含租户治理生命周期——治理面不保留「回放即真相」**；③ **审计另立显式 `audit_log` 表**（不复用事件流）；④ **`user_status` 与 `tenant` 同案合并**。据此，本方案做四件事：
- **撤旁表·归真列**：`tenant.status/生命周期戳` 收进 `organization` 真列、`user_status.status/reason` 收进 `user` 真列；**DROP `tenant` 与 `user_status` 两张 1:1 竖拆旁表**（非退回 S4 的 metadata jsonb——那是无类型 blob·明确债；真列才是要的形态）。
- **撤治理面 ES 覆盖层**：删 `tenant-lifecycle-fold`、`ES_TRUTH_SOURCE_TENANTS` 端口与全部旋钮触点、service/handler 内 `truthSource` 分支、`rebuildTenantProjection`、`tenant-replay-truth.e2e`、doctor 脚本租户段。**保留 `TenantStatusTransitionedEvent` 发布**（EDA 跨上下文·subscriptions 联动消费者）——「撤回放即真相」≠「撤领域事件」。
- **立 `audit_log`**：append-only 审计账本（不可变表·无 updatedAt），治理动作（approve/reject/suspend/resume/soft-delete + user suspend）单点落账，PII 最小化（仅 id·不携邮箱）。
- **修宪（本窗人裁·升为通用宪法条款）**：确立「**BA 相关表非专用·系共享表——其他业务/域可按需增列，优先数据建模范式合理性；但受 BA 约束：不得删减或修改 BA 约定使用的字段及其数据类型（只可 additive）**」；据此把 `entity-column-law.ts` `BA_CONTRACT_TABLES` 旧注「改 BA 列=违契约」改写为该通用条款，architecture±zh BA 定位条 + Tenant 词条（不再有自有户籍表）随裁翻正；列定律表数恒等重算。

**承重前提**：`tenant == organization`（同 id·1:1）、`user 生命周期态 == user 行` 一一对应。前提若被他日推翻（一 org 对多租 / 租户独立于 org），本方案不成立、须另案。

## 1. 背景与取证
- 收权案（global-tenant-entity-reclamation）当初立 `tenant` 旁表，其正当性来自两柱：**认证库可替换 → tenancy schema 须与 BA 表形物理隔离**、**`tenant` 为 ES R1「回放即真相」试点宿主**。新约束①②恰抽掉此二柱：BA 锁死 ⇒ 隔离价值消失；治理不需 ES ⇒ 试点理由消失。
- 现态：`entity-column-law.ts` 把 `organization/user` 列入 `BA_CONTRACT_TABLES`，注「改 BA 列=违契约」；然 `ba-org.entities.ts` 由**本仓 `defineEntity` 撰写**、`table-ownership.ts` 判 `organization→'tenants'`——**属主与 schema 皆在我侧**，「契约」护的只是 BA 必需列的存在性，非「禁加列」。加 `status` 等列对 `mikro-auth-adapter`（raw SQL 寻址 BA 必需列）为纯 additive·零冲突。
- `tenant-lifecycle-fold.ts` 头注自证「R1c 写切换后 `canTransition` 前置态取自重放而非表行」；`default.ts` `esTruthSource.tenants = ==='true'` **缺省关**——表列本就是默认真相源，撤覆盖层=删旁路、主干不伤。
- `TenantStatusTransitionedEvent` 有真实 EDA 消费者 `TenantStatusSubscriptionLinkHandler`（suspend⇒订阅收敛·「跨上下文只经领域事件」）：故事件发布链保留，只撤「load→fold→投影」的真相源重建语义。
- 代价实测（旁表负累）：`readStatus` 行缺失→`undefined`→deny-list 视同 active（O1 fail-open 边界·收权案 §3 观察登记）；并发 transition 无乐观锁（O2·同案登记）；治理列表按态过滤经旁表 join。归真列后 O1「缺席态」消失（列恒有值·provisioning 显式写 pending_approval）。

## 2. 范围（分片·每片各自过审计门，高危标注）
- **A｜修宪（BA 表共享化·建模合理性优先）**[高危#5·本窗人裁已给宪法内容·待落文签核]：`entity-column-law.ts` `BA_CONTRACT_TABLES` 注释 + architecture±zh 附录——成文「BA 表非专用·共享·业务/域可按需 additive 增列·优先数据建模范式合理性·禁改/删/减 BA 约定字段与数据类型」；「库约束接口·域拥有事实」条补注『接口约束=保 BA 必需列在位且类型不变，非禁增列』。**本片是 B/C 的前置许可**。
- **B｜tenant 归列**[高危#1·schema]：`organization` 加 `status`（text+CHECK·值域 `TENANT_STATUS`·`NOT NULL DEFAULT 'active'`）；`MikroTenantStatusStore` 读写改 organization（`readStatus`/`nativeUpdate` 直写 `organization.status`）；provisioning 显式 `nativeUpdate(status=pending_approval)`（堵 O1·BA 建 org 落 DB 默认 active 后即时翻 pending）；DROP `tenant` + `tenant_status_check`；backfill `UPDATE organization SET status FROM tenant WHERE tenant.id=organization.id`（未命中行留列默认 active·逐行等值于旧 `effectiveStatus` 兑底）；`tenant-table.e2e` 断言迁 organization。**实施裁（本窗·设计合理性第一）**：原 §2-B 所列 `approvedAt`/`suspendedAt` **不落地**——现链零写零读（仅 plan 文本提及），加无源列即 `tenant.entity.ts` 头注「不预置扩展位（禁空 jsonb 垃圾策略）」明令禁止的死 schema·治理动作时刻本应归切片 E `audit_log`；此系对签核文本的 scoped-down（问责归签核人）。**与 D 强耦合**：`ci:db` 内 `tenant-replay-truth.e2e`/`es-projection-doctor` 直读直写 `tenant` 表为 ES 投影宿主，DROP 表须与撤治理面 ES 覆盖层（D）**同提交**落，否则 B 单片无法过 ci:db——故本窗 B·D 合并为「租户生命周期链」一个连贯变更集实施（逻辑切片仍分列）。
- **C｜user_status 归列**[高危#1·schema]：`user` 加 `status`（CHECK·值域 `{active,suspended,deleted}`）+ `statusReason`（nullable）；治理写经 **`AUTH_USER_STORE` 端口**落 auth 属主（消写侧越界·沿 PIPL 硬删同型）；DROP `user_status`（其 `updatedAt NOT NULL` 豁免键随删）；backfill `user_status→user`。
- **D｜撤治理面 ES 覆盖层**：删 `tenant-lifecycle-fold.ts`（`applyTenantEvent`/`replayTenantLifecycle`）；`ES_TRUTH_SOURCE_TENANTS` 端口成员 + `config default/module/interface` 租户旋钮 + `tenants.module` provider；`tenant-status.service` truthSource 分支 + `rebuildTenantProjection`；`reject-tenant.command-handler` truthSource 分支；`es-projection-doctor.ts` 租户段；`tenant-replay-truth.e2e.test.ts`；`tenant-status.service.test.ts` truthSource 用例。**保留** `TenantStatusTransitionedEvent` 与其订阅联动 handler。
- **E｜立 audit_log**：新表 `audit_log`（`IMMUTABLE_TABLES` 登记·append-only）：`id`/`entityType`(`tenant`|`user`)/`entityId`/`action`(审批/驳回/挂起/恢复/软删)/`from`→`to`/`actorId`/`reason`/`correlationId`/`createdAt`；`AUDIT_LOG_STORE` 端口（shared-kernel）+ Mikro 适配；治理 transition/reject/suspend/resume 单点写账；`table-ownership` 入账 `auditLog`（属主裁·见 §3 裁点③）。对拍 `tenant_role_audit` 既有审计先例。
- **F｜宪法/词条/留痕**：architecture±zh BA 定位条 + tenancy 段改判成文；glossary `Tenant` 词条撤「自有户籍表」改「organization 行上的治理列」；global-tenant-entity-reclamation 加**修订注**（不改史·标被本案反悔）；S4/S6 历史 plan 注记；README 状态。
- 硬闸：`ci` + `ci:db`（改轨链 + 迁移回填 gated e2e）+ `verify:prod-boot`；backfill 以 dev 库实跑逐行对拍（迁移前后态分布等值）。

## 3. 边界·风险·归人裁
- **R1 O1 闭合**：provisioning 必显式写 `pending_approval`，杜绝「缺席=fail-open active」；BA 自助建 org 已 S4 双闸封堵——若现 LDAP/SCIM 类新建路径，即时置 status 列为**该方案必达判据**（承继收权案 O1）。
- **R2 O2 并发**：归列后仍无 CAS（收权案已登记为「待另立小 plan」）。本方案**不夹带**乐观锁，维持既有「UoW 事务隔离 + `canTransition` 前置读」——归列不加剧也不修复并发面，另案处理（裁点②可要求并入）。
- **R3 属主越界（user）**：user.status 治理写须经 auth 端口，不得 tenants 上下文直写 auth 表（守卫写侧红牌）。
- **R4 reject 语义**：驳回=硬删（org 行灭·cascade）→ `audit_log` 记 `action=rejected`，不依赖 status 列存 deleted；软删保留 status=deleted 行。
- **R5 事件残留甄别**：撤 fold 后，`tenant.bootstrapped`（纯 ES 快照事件）若**无 EDA 消费者**即随覆盖层退役；`tenant.status.transitioned` 保留（订阅联动）；`tenant.rejected` 存在性以实消费者核验为准——**逐事件查消费者再删，不臆断**。
- 归人裁：① 整案 GO（含三重高危面：schema 双 DROP+加列 / 修宪落文 / ES 试点拆除）；② O2 乐观锁本方案并做 or 维持另案（建议另案·不夹带）；③ `audit_log` 属主上下文（建议 `tenants` 起步·跨域泛化留观察，或新立 `platform-ops`）；④ `user_status` 合并取向——承「建模合理性优先」，`status` 系 user 实体属性·列归 `user` 更合范式，治理写经 `AUTH_USER_STORE` 端口消越界（建议**合并**·与 tenant 同案）；若判「user 生命周期属治理域、宁保旁表」则仅合并 tenant。**注：BA 表共享化条款本身已由人 2026-10-23 裁定为宪**（见 §0/§2-A），「加列是否许可」不再列为待裁。

## 4. 审计结论
- 裁决：**GO**（人 2026-10-23 令「整案 GO·2 另案·3 归 tenants·④ 合并」= 四裁点全定：① 整案 GO（schema 双 DROP+加列 / 修宪 / ES 试点拆除 三重高危亲签）② O2 乐观锁维持另案·不夹带 ③ `audit_log` 属主=tenants 起步 ④ `user_status` 同案合并进 `user`·治理写经 `AUTH_USER_STORE` 端口）
- 意见 / 修改要求：无；高危问责归签核人。
- 结论：**已签核·实施中**（逐片 A→F·每片硬闸·迁移/修宪面高危已在整案 GO 内亲签）
- 未决项：无（O2 并发另案·承 §3-R2）。
- 审计人 / 日期：人（整案 GO）/ 2026-10-23

## 5. 验收判据（实施后回写·带取证）
- [x] 修宪 A 过门：`BA_CONTRACT_TABLES` 新表述成文 ±zh 一致；列定律守卫认 organization/user 携域列仍绿。（✅ 2026-10-23·`entity-column-law.ts` L19-37「BA 契约面非专用·系共享表·可 additive 增自撰域列」成文·architecture.md「BA Table Sharing」与 architecture-zh.md「BA 表共享」中英镜像·守卫 16 表恒等组 organization.status/user.status 仍绿·`ci` 863 passed）
- [x] B：`tenant` 表 DROP + organization 携 `status` CHECK（✅ 2026-10-23·迁20261023093000·dev 实库对拍 4 active+1 pending 保 pending_approval·二次空 diff·`tenant-table.e2e` 迁 organization 真库跑住·O1 缺席态消失 provisioning 置 pending）。
- [x] C：`user_status` DROP + user 携 `status`/`statusReason`（✅ 2026-10-23·迁20261023100000·值域 {active,suspended,deleted} CHECK·治理写经 AUTH_USER_STORE.updateStatus 落 auth 属主·backfill 实库逐行等值对拍（旧旁表 0 行→8 user 全默认 active）·二次空 diff·守卫 16→15 恒等重算）。
- [x] D：全仓 grep `replayTenantLifecycle`/`ES_TRUTH_SOURCE_TENANTS`/`applyTenantEvent` = 0；subscriptions ES 正交不受累；`TenantStatusTransitionedEvent` 联动 e2e 仍绿。（✅ 2026-10-23 grep 实源（排 dist/node_modules）三符号仅存退役说明注释 config.module.ts:59 / event-store.mikro.e2e.test.ts:186 / es-truth-source.port.ts:5、零生产码调用·tenant-lifecycle-fold.ts/tenant-replay-truth.e2e.test.ts 已删·subscriptions ES（R4）与治理面正交不受累·TenantStatusTransitionedEvent EDA 消费者联动 e2e 于切片 D commit 真库绿）
- [x] E：`audit_log` append-only + 治理动作落账 + PII 最小化负向测；`AUDIT_LOG_STORE` 端口装配（✅ 2026-10-23·迁20261023110000·新表纯 additive·DDL 实库逐列对拍 10 列/bigserial PK/`audit_log_entity_created_idx`/`actorId→user ON DELETE SET NULL`·二次空 diff·守卫 15→16 恒等重算（自撰 8/不可变 4）·治理审计单点 `PlatformAuditService` 双通道演进（pino 恒发 + 已提交动作（无 `error`）落 `audit_log`）·PII 负向测锁无 email 键·硬闸 ci PASSED(863)/test:fullstack exit 0(零足迹)/verify:prod-boot exit 0）。
- [x] F：glossary/architecture±zh 翻案成文两版镜像；reclamation plan 修订注；README 单源翻正。（✅ 2026-10-23·architecture.md 术语段 L219-234 + auth 条 L312（英）与 architecture-zh.md 术语段 L206-215 + auth 条 L272（中）镜像翻案：自有户籍表 `tenant`→`organization.status` 治理列·presentation token `tenant.status`→`organization.status`·reclamation→consolidation·glossary Tenant/User 两词条 v0.3.0 + 演变行（不改史）·domain-concepts.md v0.4.0（ASCII 图+散文+映射表+表数 17→16）·global-tenant-entity-reclamation 顶部修订注（只标反悔不改正文）·README L11 consolidation 行状态 + L107 reclamation 行标⚠️已被反悔）
- [x] `ci`/`ci:db`/`verify:prod-boot` 全绿（含迁移回填 gated 段）。（✅ 2026-10-23·切片 A→E 逐片当时均过三重硬闸（B/C/D/E 实库对拍 + `ci`/`test:fullstack`/`verify:prod-boot`·见 0.3.2–0.3.4 changelog）；切片 F 为纯文档翻案·零代码/零 schema/零部署 diff·`ci` 复跑 PASSED（863 passed | 48 skipped·fallow 0 违规）·ci:db/prod-boot 自 0.3.4 硬闸以来未触码/迁移/部署产物、结论仍有效）

## 6. 变更记录
| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-23 | 0.1.0 | 用户立「框架·合理性第一·不留债」原则并锁四约束（BA 锁死 / 治理不需 ES / 立 audit_log / user_status 同案）；据实反悔 reclamation 旁表裁 | 首版六片：A 加列纪律松绑（前置许可）/ B tenant 归 organization 列 / C user_status 归 user 列 / D 撤治理 ES 覆盖层保 EDA / E 立 audit_log / F 宪法·词条·留痕；承重前提与归人裁 ①–④ 待审计门 |
| 2026-10-23 | 0.2.0 | 人裁「BA 相关表非专用·共享·按需增列·优先数据建模范式合理性·禁改删 BA 约定字段与数据类型」= 升为**通用宪法条款**（非 tenant 个案松绑） | §0/§2-A 改写为通用宪法口径；§3 归人裁移除「加列许可」（已裁定）、补④ `user_status` 建模取向；版本头/戳同步 |
| 2026-10-23 | 0.3.0 | 人「整案 GO·2 另案·3 归 tenants·④ 合并」——四裁点全定·过审计门 | §4 记 GO·状态翻「已签核·实施中」·进逐片实施 |
| 2026-10-23 | 0.3.1 | 切片 B 实施中发现：`approvedAt`/`suspendedAt` 系死 schema（零写零读·违「不预置扩展位」律）；且 DROP `tenant` 与撤治理面 ES 覆盖层经 `ci:db` 强耦合 | §2-B 划去 `approvedAt`/`suspendedAt`（scoped-down·时刻审计归 E `audit_log`）·记 B·D 同变更集实施；status 列 `NOT NULL DEFAULT 'active'` 语义成文 |
| 2026-10-23 | 0.3.2 | 切片 B·D（租户生命周期链）已落地并推远端（commit 95a3600）；切片 C（user_status 归列）实施完成 | §5 回写 B·C 验收判据（带实库对拍取证）；C 采「读侧宽松直读 `user.status`·写侧经 AUTH_USER_STORE 委托落 auth 属主」消写侧越界（沿 PIPL 硬删同型）·user_status 非 ES 真相源无需撤覆盖层 |
| 2026-10-23 | 0.3.3 | 切片 C 已提交并推远端（commit e723606）；切片 E（立 `audit_log` 治理审计耐久账本）实施完成 | §5 回写 E 验收判据（DDL 实库逐列对拍 + 二次空 diff + 三重硬闸取证）；E 对拍 `tenant_role_audit` 先例·`PlatformAuditService`（FR-6 唯一单点）双通道演进（pino 观测 + `audit_log` 落账·以 `detail.error` 为判别子免改 handler 分支）·`entityId` 多态裸值非 FK 承 R4 硬删幸存·§5-E PII 最小化负向测·属主=tenants（§3 裁点③） |
| 2026-10-23 | 0.3.4 | 人令「先处理 hardDelete 隐患」——切片 C 遗留 PIPL 硬删静默失效缺陷闭合 | `MikroUserStoreAdapter.hardDelete` 谓词 `{ userId }`→`{ id: userId }`（user 主键系 `id`·无 `userId` 列）；运行时铁证：旧码 `nativeDelete(User,{userId})` 抛 `Trying to query by not existing property User.userId` → `DELETE /users/me` 必 500、被遗忘权失效（handler 测整 stub 端口·无 gated e2e 跑真库故长期潜伏）；去 `as never`（type-escape 基线下调 33 文件·149 处）；补 `user-hard-delete.e2e.test.ts`（走 CommandBus 全链·真库锁 account/session FK cascade + consent set-null 幸存 + user 聚合事件补删 + 重复删 NotFound·旧码下第①段必红）登记 `GATED_E2E_FILES`（13 gated+1 exempt 恒等）；三重硬闸全绿（ci 863 / test:fullstack exit 0 零足迹 / prod-boot /health 200） |
| 2026-10-23 | 0.3.5 | 人「同意」推切片 F（收尾·文档翻案）·零代码/零 schema/零部署 | §5 回写 A/D/F 验收判据（均带取证·原已勾 B/C/E）：architecture.md±zh 术语段+auth 条镜像翻案（自有户籍表 `tenant`→`organization.status` 治理列·presentation token 同步）·glossary Tenant/User 两词条 v0.3.0 + 演变行（不改史）·domain-concepts.md v0.4.0 整件重写（ASCII 图+散文+映射表+表数 17→16）·global-tenant-entity-reclamation 顶部修订注（只标反悔）·README L11 consolidation 行状态 + L107 reclamation 行标⚠️已被反悔·`ci` 复跑 PASSED（863 passed | 48 skipped·fallow 0）·待提交

---

<!-- 变更戳 -->
正文已于 2026-10-23 / v0.3.0 过审计门：人令「整案 GO·2 另案·3 归 tenants·④ 合并」，四裁点全定·三重高危亲签，状态「已签核·实施中」，逐片 A→F 落码（每片硬闸）。
