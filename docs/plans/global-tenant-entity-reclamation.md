# global-tenant-entity-reclamation：租户实体收权——tenant 自有表，BA 缩回宪法定位

> 用途: **方案（提案–审计–实施）** | 状态: 已完成（人验收） | 版本: 0.2.2
> 定位: 用户由「为什么没有 Tenant 实体」追问，自查出 **BA 责任面被放大**——租户生命周期态机寄居 `organization.metadata`（jsonb），而宪法对 BA 定位是「纯认证与成员数据源」（±zh），租户生命周期既非认证也非成员。用户裁「同意乙」（建自有 tenant 表收权），并令参考外部文章（已鉴定：CSDN 内容农场文·所述系同名 Java 项目·非本仓 better-auth.dev·仅取其多租户工程惯例旁证，全部支持乙档方向；设计先例采本仓 `user_status` 旁表模式）。
> 关联: S4 审批制（metadata 态机出处·本案修订其存储决策）· global-entity-column-law（新表受 L1/L2 管辖·16→17 表恒等账）· table-ownership（organization 属主=tenants 不变·新表入账）· module-rbac-casl 甲裁（org HTTP 封端·不动）。

## 0. 概览（TL;DR）
- **新表 `tenant`**（tenants 上下文自有·垂直切片 `modules/tenants/infrastructure/entities/tenant.entity.ts`）：`id` PK 且 = `organization.id`（同值代理键·沿 `user_status` 以 `userId` 为 PK-FK 的先例）、`status` **真列**（text + DB CHECK·值域沿用状态机枚举）、`created_at/approved_at/suspended_at` 等生命周期戳、领域扩展位归位；受实体列定律管辖（createdAt 必有·可变表 updatedAt **nullable**＝L2 新表方向·零豁免）。
- **迁移**：`migration:generate` 出新表 + **数据回填** migration（`organization.metadata` 的租户态键 → `tenant` 行·一次性 backfill·迁移后 metadata 我方键退役）。
- **换轨**：`mikro-tenant-status.store` 读写改 `tenant` 表（列约束替代应用层裁决存储职责）；provisioning/approve/reject/suspend/resume/delete 治理链同事务写 `tenant`；`Organization`/member/invitation **留在 BA 契约面**（BA 只按其承诺管身份/会话/组织成员容器）。
- **翻账**：宪法 ±zh BA 定位条重申 + tenancy 节「租户身份=organization」隐含位移改判「tenant 一等实体·organization 为其认证/成员面投影」；table-ownership + 列定律 17 表恒等 + 守卫清单。
- **非目标（锁）**：不动 BA 八表表形（零契约违例）；不做权限模板（另账）；不改账号模型（email 为体·一人多组织）；不动 org HTTP 封端；workspace/subscription 外键语义不改指（仍认 organization id 为租户锚·见裁点④）。

## 1. 背景与取证
- 现状实据：`mikro-tenant-status.store.ts` 头注自证「直接落 Better Auth 的 `organization.metadata`（jsonb）·不另建表/列→无迁移」；`load` 以 undefined/null 区分 fail-closed；治理命令链（submit/approve/reject/suspend/resume/delete）全经此 store。
- 已显形代价（对话在案）：状态无 DB 约束/不可索引 → 租户列表按态过滤只能应用层；「tenants 上下文无 Tenant 实体」语义绕折；BA 上游 metadata 行为变化直接打击租户态机（数据面耦合超出契约承诺）。
- 先例可抄：`user_status`（id PK=userId 同值·tenants 属主旁表）——本案 `tenant` 表同构。
- 外部旁证（参考·非依据）：同名 Java 项目文章采 `SysTenant` 独立实体 + 状态列 + 注册初始化 + 启用门——与本仓既有治理语义同型，佐证收权方向；其「账号按租户切割」与 S10 划界相反，明确拒用。

## 2. 范围（三片）
- **A｜表+迁移+定律入账**：`tenant` 实体（零装饰器 defineEntity 惯例）+ `migration:generate` DDL + backfill 迁移（dev 库实测）；列定律 `entity-column-law.ts` 清单入账（新合规 nullable 表 1→2·16→17 恒等）；table-ownership 登记 tenant→tenants；守卫测对账。
- **B｜读写轨换轨**：tenant-status.store 改 tenant 表真列；治理 command handler 链（approve/reject/suspend/resume/delete/provisioning）同事务建/维护 tenant 行；metadata 我方键全仓 grep 清零（BA 自身 metadata 用途不干涉）；gated e2e（tenant-hard-delete、approval 链）适配 + 新增「列约束负向测」（非法态值 DB 拒绝）。
- **C｜宪法翻账**：architecture ±zh 定位条 + tenancy 段改判成文；docs/plans/README；S4 历史 plan 加修订注记（不改史）。
- 硬闸：`ci` + `ci:db`（gated e2e 含改轨链）+ `verify:prod-boot`；backfill 正确性以 dev 库实跑对拍（迁移前后态分布逐行核）。**触 schema 迁移与宪法=高危，人签后行**。

## 3. 边界·风险·未决
- **R1 双写窗口**：backfill 后 store 直切新表（dev/未上线环境一步切换，无生产流量兼容负担；若你要求平滑窗口则改「读新写双」过渡档——归裁③）。
- **R2 FK 时序**：tenant 行 FK→organization 必须与 approve 建 org 同事务（seed/测试夹具抢跑教训入账）。
- **R3 语义锚迁移**：下游（workspace/subscription/tenancy ALS 的 tenantId）现值即 organization.id，本案不改值只补户籍——若裁④要改指 tenant.id 则波及面扩大，Agent 建议**不改**。
- **观察登记 O1（人评 2026-10-20）**：「无户籍视同 active」的 fail-open 边界，backfill 后触发面只剩 seed/外部直插（BA 自助建 org 已 S4 双闸封堵）；若未来出现其它建 org 路径（LDAP/SCIM 同步类），**即时入户籍行须作为该方案的必达判据**，否则边界被放大。
- **观察登记 O2（人评 2026-10-20）**：并发 transition 无乐观锁/CAS（同一租户两并发仍靠 UoW 事务隔离 + canTransition 前置）——真列化后纯 additive `version` 小片门槛已降低，本案不夹带，待令人另立小 plan。
- 归人裁：① 整案 GO（含 schema 迁移与修宪高危面）；② 表形：`tenant`（建议·直白）vs `tenant_profile`；status 采 text+CHECK（建议·与仓内枚举列惯例对拍后定）vs native enum；③ backfill 一步切换 vs 双写过渡（建议一步·无存量生产）；④ 下游 tenantId 锚不改指（建议维持）；⑤ 三片分笔提交。

## 4. 审计结论
- 裁决：**GO**（人 2026-10-20 令「同意」：五裁点全采建议档——①整案 GO（schema 迁移+回填+修宪三重高危亲签）②表名 `tenant`·status text+CHECK（与仓内惯例对拍后定稿）③backfill 一步直切 ④tenantId 锚不改指 ⑤三片分笔）
- 意见 / 修改要求：无；高危问责归签核人。
- 结论：**已签核·实施中**
- 未决项：无。
- 审计人 / 日期：人（同意·五裁点全采建议）/ 2026-10-20

## 5. 验收判据（实施后回写·带取证）
- [x] `tenant` 表迁移落库 + backfill 对拍（迁移前后租户态逐行等值）；列定律 17 表恒等守卫绿；table-ownership 入账。**取证（切片 A·f47c016）**：DDL+backfill 两工件落 dev 库逐行对拍 2/2（态入列·同岁·metadata 剥离净）；二次 `migration:generate` 空 diff；CHECK 违例负向红得其所；守卫 17 表恒等绿。
- [x] 治理链 e2e 全绿（含非法态 DB CHECK 负向测）；metadata 我方键全仓 grep=0。**取证（切片 B·596a40f）**：新 gated e2e `tenant-table.e2e.test.ts` 四断言真库跑住（入册+盖戳/`tenant_status_check` 负向/无户籍兑底不拦/FK cascade 随灭）；ci:db 恒等闸认登记（10 gated+1 豁免）·存量 9 gated 文件零回归；`status`/`appliedAt` 写面退场后全仓 grep 仅余「已退场」叙述性注释（零寄居读写）。
- [x] `ci`/`ci:db`/`verify:prod-boot` 全绿；宪法 ±zh 改判成文两版一致。**取证**：切片 A/B 各跑硬闸全绿（ci 677 测·prod-boot /health 200）；切片 C 后终跑存照（本行回写时点）；±zh 术语纪律段租户实体改判 + BA 定位条重申两版镜像（本文件提交内）。

## 6. 变更记录
| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 用户判「BA 责任被放大」并同意乙档、令参考外部文章（已鉴定为同名项目嫁接文·取惯例旁证） | 首版三片：A 表+迁移+backfill+定律入账 / B 读写换轨 / C 宪法翻账；五裁点待审计 |
| 2026-10-20 | 0.2.0 | 签核后三片实施完毕 | 切片 A（f47c016）checks 通道+实体+DDL/backfill+17 表恒等；切片 B（596a40f·含 appliedAt 退役收口 amend）端口三原语化/服务换轨/治理读面折叠/新 gated e2e 四断言/棘轮正名；切片 C 宪法 ±zh 改判成文（术语纪律段+BA 定位条）+ global-tenancy 修订注（§9.2/§10 S4 行/§12/§13 v0.24.0·不改史）；§5 判据三项勾账带取证；README 翻「已实施·待人类验收」；推送待人令 |
| 2026-10-20 | 0.2.1 | 人验收评价（A 级）后令「先落留痕增补一并推」 | §3 增观察登记 O1（新建 org 路径须即时入册·fail-open 边界防放大）/O2（并发 transition 无乐观锁·真列化后 version 小片门槛降低·不夹带待另案）；glossary v0.2.0 同步翻正 Tenant 词条（旧裁「= organization 不另建表」改判成文+存储实体非聚合回归注·防术语 SSOT 漂移） |
| 2026-10-20 | 0.2.2 | 人验收（评价 A 级·实跑核验 677 测/棘轮 33-154）·推送毕结项 | 四笔入库并推送 `origin/main`（8d1e3fa..3c0acab）：A `f47c016` / B `596a40f` / C `77725fa` / 留痕 `3c0acab`；状态翻「已完成（人验收）」；遗留归后续：O1/O2 观察项（触及时另立小 plan） |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.2.2 结项回写（四笔入库已推送·人验收 A 级）。
