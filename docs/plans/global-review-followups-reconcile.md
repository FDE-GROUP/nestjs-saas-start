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
| 1 | `mapBaError` errorCode 透传 | `apps/api/src/modules/tenants/api/ba-error.mapping.ts`：`if (err instanceof HttpException) throw err` 前置拒绝直透保 `errorCode`；由 `tenants-org-facade.test.ts` 锁测 | **部分已闭**：前置拒绝路径已闭（有锁测）；但 4xx 分支 `new HttpException(String(message), status)` **不附业务 errorCode**（轻·仍开） | 4xx 附码留待错误码面切片（承 global-readiness-error-pagination） |
| 2 | 文本字段 `maxLength` | 全 `libs/contracts` 仅 3 处 `.max()`：`request/platform.ts` `reason` 500、`request/pagination.ts` `limit` 100 / `cursor` 512；实体文本列（post title/body 等）入参无长度上界 | **仍开**：实体业务文本入参无 `maxLength` 约束 | 逐 DTO 补 `maxLength` 留独立 expand 片（触契约面·须过审计门） |
| 3 | REST 一致性簇（状态码/method 语义） | 9 控制器使用 `@HttpCode`、5 处 `@Delete`；delete 返 204/200、POST 201、`@ApiResponse` vs 实抛的逐路由一致性未系统核验 | **待办**：未逐路由核验（需全 controller 扫描对表） | 登记为 REST 一致性核验片（只读盘点→逐路由订正·触 api 面） |
| 4 | 请求/查询瘦身 | `libs/contracts` 分页 DTO 已 typed（`CursorPage`/`Page`）；其余 GET 查询/列表 DTO 是否夹带冗余字段未逐端点核 | **部分**：分页契约已 typed；余下查询面**待办** | 逐端点查询瘦身盘点留后续 |
| 5 | 数据导出流式 | `GET /users/me/data-export` 返 `UserDataExportReadModel` 全量入内存；租户导出为六表聚合 JSON 一次性序列化（见 `module-tenancy-data-export.md`） | **仍开**：导出为非流式全量入内存 | 流式导出留独立片（NFR·大租户场景驱动·触 IO） |

**对账小结**：5 项中 1 项主体已闭（残留轻微微差）、2 项仍开、2 项部分/待办——**均不在本片实现**，各自留待已审切片。

## 3. ⑤ stories 路径漂移登记（建议项·不实现）

- **现状**：`docs/stories/` 有 `README.md` + `epic-01`…`epic-10` 共 10 个 epic 文件、`###` 级故事 **78 条**（报告口径「64 条」与实测 78 不符，此处以取证 78 为准）。
- **缓解已在**：故事溯源纪律「只指文件与方法名（不引行号，防漂移）」（见 `docs/stories/README.md`），故数轮目录搬迁（`src`→`apps/reference`→`apps/api`、`packages/core` 分包）对**文件名/方法名**引用冲击有限；实测 stories 内无 `apps/reference`/`src/modules` 陈旧全路径残留。
- **缺口**：**无**「stories-drift 恒等闸」——没有任何门禁自动校验每条故事溯源指向的文件/方法/关联 plan 链接是否仍解析（对照 OpenAPI drift 三向闸、表所有权守卫均有恒等闸，stories 面缺位）。
- **建议**：新增 stories-drift 恒等校验（解析每条溯源的文件/符号/`../plans/*.md` 链接存在性，纳入 `ci` full）。**实现属后续独立方案·触 CI 门禁需另签**，本窗仅登记不落地。

## 4. 审计记录

- 结论：④ 五项只读对账（disposition 见 §2 表）、⑤ stories-drift 登记为建议项——全程零代码、零门禁改动。
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

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.1.0 成文，以当前代码只读取证为准。
