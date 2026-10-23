# 错误信封 `error` 字段按状态短名归一

> 适用范围: `全局`（公共错误契约 / 全局异常过滤器）
> 关联: `specs/architecture` 错误处理段 · `global-readiness-error-pagination`（错误契约前案）· `global-review-followups-reconcile`（曾登记「4xx 未附码轻·仍开」同族·本案治其 `error` 串缺省侧）
> 性质: 重写型（当前方案整体重写 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**现象（真机取证）**：`global-tenant-residual-cleanup` 收官后的 dev 真机验证里，
`GET /api/v1/organizations/invitations/mine` 因 BA 邮件校验门返回 403，其错误信封却是：

```json
{"statusCode":403, "error":"Internal Server Error", "errorCode":"ORG:PROVISIONING_REJECTED", ...}
```

`statusCode=403` 与 `error="Internal Server Error"`（500 味短语）**自相矛盾**，误导前端分类与排障。

**根因（单点·已定位）**：`apps/api/src/common/filters/http-exception.filter.ts` 把 `error`
缺省**硬编码**为 `'Internal Server Error'`（与 `status` 无关），仅当异常响应体 object 自带 `error`
字段时才覆盖。凡「裸 `HttpException`」（未显式带 `error`）的 4xx 都会落到这条 500 味缺省串。已核**两条不同
抛形路径同病**：

- `apps/api/src/modules/organizations/api/ba-error.mapping.ts` `mapBaError` →
  `new HttpException({ message, errorCode }, status)`：**object 无 `error`**（覆盖全部 BA 4xx·调用面 19 处）；
- `libs/core/src/modules/subscriptions/quota/quota.guard.ts` 座位超限 →
  `new HttpException(msgString, 402, { errorCode })`：**string response**（走 `else` 分支·`error` 保持缺省）。

**目标**：将 `error` 缺省由**状态短名（HTTP reason phrase）**推导，**一处机制修**覆盖全部裸抛 4xx；
statusCode/message/errorCode/`errors` 语义**逐字不变**，子类自带 `error` 与裸 `Error`→500 行为**保持**。

**非目标**：
- 不改 `mapBaError` 泛用码 `ORG:PROVISIONING_REJECTED` 的既定契约（对 BA 不透明 4xx 不逐态猜具体码·设计使然）；
- 不改 `message` 缺省串（裸非-HttpException 的归一 `'Internal server error'` 属甲档收口·防内部原文外泄·不动）；
- 不动事件面冻结字符串值（`'tenant.*'` 等）；不改任何 schema / 路由 / DI 形态。

## 2. 方案

- **单切片**（全局过滤器一处 + 负向测锁）：
  1. **切片 A** —— `http-exception.filter.ts`：
     - 引入 Node 内建 `import { STATUS_CODES } from 'node:http';`（**零新依赖**·非第三方·不受镜像影响）；
     - 将 `let error = 'Internal Server Error';` 改为按已算得的 `status` 取短名：
       `let error = STATUS_CODES[status] ?? 'Internal Server Error';`
       （`status` 已在上方算出；未知/越界码回落旧缺省，**500 段行为不变**）；
     - object 分支维持 `error = (exceptionResponseObj.error as string) || error;`
       —— **子类自带 `error` 优先**，仅缺省时才用派生短名。
     - **完成判据**：见 §5 三类真值矩阵。
  2. **切片 B** —— `http-exception.filter.test.ts` 负向锁：
     - `new HttpException({ message:'x', errorCode:'E' }, 403)` → `body.error === 'Forbidden'`（**不再**是 Internal Server Error）；
     - `new HttpException('Seat quota exceeded', 402, { errorCode: BILLING_SEAT_LIMIT_EXCEEDED })` → `body.error === 'Payment Required'` 且 `errorCode` 仍透出；
     - 回归锁：裸 `new Error(...)` → `status=500`·`body.error === 'Internal Server Error'`（不变）；
       `UnauthorizedException` → `body.error === 'Unauthorized'`（不变·子类优先）。
- 无宽重构·无 expand–contract（纯缺省源替换）。

## 3. 影响面与风险

- **blast radius / 可逆性**：**全局**（公共错误契约面·所有经异常过滤器的响应共用此 `error` 字段），
  命中 `workflow.md` §3 **高危清单**（改公共错误契约）→ **须人亲签**方可实施；**可逆**（改一行缺省源 + 删测）。
- **兼容性**：契约 `errorResponseSchema.error` = `z.string()`（自由串·非枚举）→ 短语变更**不破坏类型契约**；
  前端/api-client 据 `statusCode` + `errorCode` 辨类（`error` 为展示辅助），预期无反噬——**实施前须 grep**
  `apps/web` / `packages/api-client` / `*.e2e.test.ts` 是否有 `error === 'Internal Server Error'` 之类硬断言，若有则同步。
- **短语差异**：`STATUS_CODES` 个别码在 Node 版本间措辞有别（如 422「Unprocessable Entity」↔「Unprocessable Content」），
  属非破坏·不逐模块特判；真机验证所用 Node 短名为准。
- **回滚策略**：`git revert` 本案提交即可，无数据/迁移面。

## 4. 审计记录

> 无已审方案不写码。本 plan 触**公共错误契约**（高危），已人签核后实施。

- 结论：**已审计·签发**（人「同意」2026-10-23＝整案 GO·高危·改公共错误契约随此亲签·问责归签核人）
- 未决项（**采推荐档定案**）：
  - ⓐ `message` 裸 Error 缺省**不动**（防内部原文外泄的甲档收口语义保留）——已定；
  - ⓑ quota 402 的 `error` 维持标准短语「Payment Required」而非业务化文案（业务语义靠 `errorCode`）——已定。
- 审计人 / 日期：人（FDE）/ 2026-10-23

## 5. 完成判据（可核验 + 穷尽）

- [x] 真值矩阵（已逐项断言·`http-exception.filter.test.ts` 5 新测）：
  | 抛形 | status | 期望 `error` | 期望 `errorCode` |
  |------|--------|--------------|------------------|
  | `mapBaError` 裸 object 无 error | 403 | `Forbidden` ✓ | `ORG:PROVISIONING_REJECTED`（透传不变）|
  | quota 裸 string | 402 | `Payment Required` ✓ | `BILLING:SEAT_LIMIT_EXCEEDED` |
  | 裸 object 无 error 400 | 400 | `Bad Request` ✓ | — |
  | 裸 `Error`（非 HttpException）| 500 | `Internal Server Error`（不变 ✓）| 无 |
  | `UnauthorizedException`（子类自带 error）| 401 | `Unauthorized`（不变 ✓）| 视携带 |
- [x] grep 全仓 `error === 'Internal Server Error'` 硬断言（web/api-client/e2e）——**无**（无反噬）；
- [x] 新增/回归测通过：`http-exception.filter.test.ts` **17/17**（12 旧 + 5 新）；
- [x] `pnpm run ci` 全绿：build + **868 passed**｜48 skipped + openapi drift（错误信封 shape 未变恒等）+ type-escape + fallow 边界 0 违规；
- [x] 真机复跑：独立端口 7010 起新构建 dist → 登录 operator（未验证邮箱）+ set-active → `GET /organizations/invitations/mine` 回 **403** 信封 `{"statusCode":403,"error":"Forbidden","errorCode":"ORG:PROVISIONING_REJECTED"}`——`error` 不再为 `Internal Server Error`，statusCode/errorCode 逐字不变。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-23 | 0.1.0 | 起草 | 首版（真机验证拓出·立案待审·零实现）|
| 2026-10-23 | 0.2.0 | 签发+落地 | 人「同意」整案 GO（高危·改公共错误契约亲签·ⓐⓑ采推荐定档）；切片 A `http-exception.filter.ts` 一行缺省源 + 切片 B 5 负向测；ci 全链绿 + 真机复现 403 error=Forbidden |

---

<!-- 变更戳 -->
正文已于 2026-10-23 / v0.2.0 变更，以当前正文内容为准。
