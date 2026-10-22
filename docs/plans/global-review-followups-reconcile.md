# 全局评审 Follow-up 对账与登记（④⑤·纯文档·零代码·不实现）

> 适用范围: `全局`（对账呈报 + 待办登记·不动码）
> 关联: [global-architecture-positioning-uplift.md](./global-architecture-positioning-uplift.md)（同批定位升格·其非目标明列本片不实现修复本体）· `module-rbac-casl.md` §4.1-5 · `module-tenancy-data-export.md` · `global-readiness-error-pagination.md`
> 性质: 呈报型——就架构定位评估报告 §4 自列的 5 个 🟡 项做**只读核验**逐项记 disposition；报告 §5 stories 路径漂移做**登记**。修复本体各自留待已审切片，本片零实现。
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景

评估报告的 ④ 命名 🟡 项清单与 ⑤ stories 漂移非权威、且未集中留痕。本档以报告**自列 5 项**为对账域（不重建报告外的上轮审查全集），只读核验当前代码给出处置；仍开项登记为待办、**不改码**。

## 2. ④ 五项对账表（只读核验·逐项带证据 disposition）

| # | 报告命名项 | 核验证据（当前代码） | disposition | 后续 |
|---|---|---|---|---|
| 1 | `mapBaError` errorCode 透传 | `apps/api/src/modules/tenants/api/ba-error.mapping.ts`：`if (err instanceof HttpException) throw err` 前置拒绝直透保 `errorCode`；由 `tenants-org-facade.test.ts` 锁测 | **已闭**：前置拒绝路径（有锁测）+ 4xx 分支附码均已闭 | 4xx 分支改 object response 携泛用码 `TENANCY:PROVIDER_REJECTED`（filter 透传入 envelope.errorCode·细分仍据 status·不逐态猜码）→ 落地 `62fcfea`（承 global-readiness-error-pagination·过码表契约锁测 + L1 全链） |
| 2 | 文本字段 `maxLength` | 核验时全 `libs/contracts` 仅 3 处 `.max()`（`platform.reason` 500、`pagination.limit` 100/`cursor` 512）；实体文本列入参原无上界 | **已闭**：实体业务文本入参已按分类补 `maxLength` 上界（输入卫生·非防溢出，列系 PG text） | 已施加（name/title 200·slug/key/id 128·email 254·content/description 20000·search 200·i18n `validate.text.maxLength` 单源）→ 落地 `af525bd`（触契约面·已过审计门） |
| 3 | REST 一致性簇（状态码/method 语义） | 12 控制器逐路由对表（`@HttpCode`/method/`@ApiResponse` vs 运行时默认 vs OpenAPI 文档）：全仓 6 处「@Post 无 `@HttpCode`」唯 2 处真 drift——tenants approve、payment webhooks 运行时默认 201 而文档记 200 | **已闭**：核验完成·2 偏差已订正（补 `@HttpCode(OK)`·`9463a3f`）；余为命令式 POST 200 / DELETE 200·204 依返体自洽 / createRole 200 系风格裁量（doc=runtime 非 drift·不动） | 反射锁测 x2 钉状态码基线防回退（`@HttpCode` 直调 handler 触不到）→ 落地 `9463a3f` |
| 4 | 请求/查询瘦身 | `libs/contracts` 分页 DTO 已 typed（`CursorPage`/`Page`）；其余 GET 查询/列表 DTO 是否夹带冗余字段未逐端点核 | **部分**：分页契约已 typed；余下查询面**待办** | 逐端点查询瘦身盘点留后续 |
| 5 | 数据导出流式 | 本窗只读勘察（追至 Mikro 实现）：用户导出 4 表 per-subject 天然有界（accounts≈OAuth 渠道·sessions 有 `expiresAt` 窗·consents 少）·低风险；租户导出 operator-gated·6 集合（members+invitations+workspaces+subscriptions+posts[含 `content` PG text]+tenant 行）皆 `em.find` 无 limit → 全量入内存单 JSON·Fastify body 帽只护入站·无出站护栏 | **缓行**（勘察裁定）：真实但低危 NFR——稀有 operator 取证路径 + 无大租户驱动 + 流式会破 `{data}` envelope 契约；现上 IO 改造属 YAGNI | 触发判据达任一再启流式片：① 单租户 members/posts 超阈值 ② 导出延迟/内存告警 ③ 真生产大租户落地（轻折中备选：先加聚合行 fail-fast 帽·不破契约） |

**对账小结**（呈报成文时）：5 项中 1 项主体已闭、2 项仍开、2 项部分/待办——**均不在本片实现**，各自留待已审切片。**后续落地勾稽**：项①（`62fcfea`）、项②（`af525bd`）、项③（`9463a3f`）已分别经独立后端主线片闭之；项④ 输入面本窗核验为已精简（无冗余）、项⑤ 已勘察裁定缓行（详见 §2 表）。

## 3. ⑤ stories 路径漂移登记（建议项 → 已落地）

- **现状**：`docs/stories/` 有 `README.md` + `epic-01`…`epic-10` 共 10 个 epic 文件、`###` 级故事 **78 条**（报告口径「64 条」与实测 78 不符，此处以取证 78 为准）。
- **缓解已在**：故事溯源纪律「只指文件与方法名（不引行号，防漂移）」（见 `docs/stories/README.md`），故数轮目录搬迁（`src`→`apps/reference`→`apps/api`、`packages/core` 分包）对**文件名/方法名**引用冲击有限；实测 stories 内无 `apps/reference`/`src/modules` 陈旧全路径残留。
- **缺口**：**无**「stories-drift 恒等闸」——没有任何门禁自动校验每条故事溯源指向的文件/方法/关联 plan 链接是否仍解析（对照 OpenAPI drift 三向闸、表所有权守卫均有恒等闸，stories 面缺位）。
- **建议**：新增 stories-drift 恒等校验（解析每条溯源的文件/符号/`../plans/*.md` 链接存在性，纳入 `ci` full）。**实现属后续独立方案·触 CI 门禁需另签**，本窗仅登记不落地。
- **落地（后续窗·经人签核）**：新增 `scripts/verify-stories-drift.ts`——**四档硬闸**：关联 plan 链接 / `.ts` 文件名 / `NS:NAME` wire 码 / **后缀锚定 class-suffix 符号**（Controller|Command|CommandHandler|Service|Repository|Guard|Handler|Event·`.method` 尾剥离·class∪interface 索引·皆取仓内明确产物·基线全绿 28/42/2/48）+ 自测 9 例·登记 `verify:stories-drift` 与 ci.ts step（full/quick 均跑·闸实跑 110ms）。**诚实边界**：闸只锁「引用产物实存性」机械 drift（符号档仅断类名实存·不校方法名/所有权），不校散文语义（如故事 2.2 原记 approve 201——即由本闸立项时发现并随项③ 订正同步为 200·`893d9a7`）。闸本体 `550527b`·第四档扩 `ad1e1ad`（GO-E 经人签）。

## 4. 审计记录

- 结论：④ 五项只读对账（disposition 见 §2 表）、⑤ stories-drift 登记为建议项——本档成文时全程零代码、零门禁改动。（后续窗：⑤-b stories-drift 恒等闸已经人签核落地 `550527b`·详见 §3）。
- 边界：以报告自列 5 项为对账域，不重建报告外上轮全集；仍开项只登记不实现。
- 未决项：无（本档自身无待裁；各待办另起片时逐片过审计门）。
- 审计人 / 日期：用户批准（CreatePlan·落实边界=全含含 ④⑤ 登记）/ 2026-10-21。

## 5. 完成判据（可核验 + 穷尽）

- [x] ④ 五项逐项带证据 disposition（已闭/仍开/待办·含 mapBaError 4xx 微差、maxLength 计数）。
- [x] ⑤ stories-drift 登记（实测 10 epic / 78 条 + 无恒等闸缺口 + 建议项归属）。
- [x] 全程只读核验、零生产码/测试/门禁改动。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 评估报告 ④⑤ 落实 | 首版（对账表 + stories 漂移登记） |
| 2026-10-22 | 0.2.0 | 项①② 落地后勾稽 | 项①（mapBaError 4xx 附码 `62fcfea`）、项②（maxLength 上界 `af525bd`）disposition 更新为已闭 + 落地指针；小结补后续 |
| 2026-10-22 | 0.3.0 | 项③ 核验+订正落地后勾稽 | 项③（REST 一致性核验·approve/webhook 补 @HttpCode(OK)·`9463a3f`）disposition 由待办更新为已闭；小结补后续 |
| 2026-10-22 | 0.4.0 | 项⑤ 只读勘察后裁定 | 项⑤（数据导出流式）disposition 由仍开更新为缓行（附两端体量取证 + 触发判据·无码片） |
| 2026-10-22 | 0.5.0 | ⑤-b stories-drift 闸落地 | ⑤-b 由建议项更新为已落地（`verify:stories-drift` 三档硬闸 `550527b` + epic-02 语义 drift 同步 `893d9a7`·高危 CI 门禁经人签） |
| 2026-10-22 | 0.6.0 | ⑤-b 闸扩第四档符号 | 应选做追加 class-suffix 符号存在性档（后缀锚压 FP·class∪interface 索引·基线 48 绿·`ad1e1ad`·GO-E 经人签） |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.1.0 成文；v0.2.0勾稽项①②（`62fcfea`/`af525bd`）、v0.3.0（2026-10-22）勾稽项③（`9463a3f`）为已闭、v0.4.0 裁项⑤ 缓行，v0.5.0 勾稽⑤-b stories-drift 闸落地（`550527b`/`893d9a7`），v0.6.0 扩第四档 class-suffix 符号（`ad1e1ad`），余项④ 以当前代码为准。
