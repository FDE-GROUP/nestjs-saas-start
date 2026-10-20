# Epic 06 · 订阅 · 配额 · 支付

> 旅程: 租户如何开通/升级订阅、配额如何约束成员扩张、支付通道如何运作 | 上下文: `subscriptions`（订阅面）+ `payment`（支付通道）+ seats 配额 hook
> 商业闭环（vision §7 阶段 2·FR-7/FR-8/D5）：订阅建立「租户 ↔ 支付客户」映射；席位配额在成员增量时点（accept-invitation）以 **402** 拒绝超限。payment 面属**用户级**（Stripe customer/checkout·不经租户仓储）→ 类级 `@TenantExempt`（仍需会话），webhook 方法级 `@Public`（靠签名校验）。
> **支付通道现状（非「三通道并存」）**：`PaymentProviderId` 类型声明 stripe/alipay/wechat_pay 三种，但**当前仅 Stripe 实现并注册，且需配 `STRIPE secretKey` 才进入 providers 表**；alipay/wechat_pay 仅存于类型 + `payment.module` 里**注释掉的注册行**（无实现文件）——属 [`global-cn-adaptation`](../plans/global-cn-adaptation.md) 规划 / **D9 暂缓未落地**，“三通道”是设计意图非现状。
> **503 懒解析降级（NFR-2·对齐 Epic 01 warn 家族）**：`PaymentService.resolve()` 构造不校验；wanted 通道未注册则回退 stripe，**仅当无任何 provider（连 Stripe 都未配 key）才 503** `BILLING_PROVIDER_NOT_CONFIGURED` ⇒ 未配 Stripe 时整个支付面（含 6.2 建订阅）皆 503。
> **支付面安全边界（诚实）**：payment 各端点 `@TenantExempt`、无 `@Can`、不绑租户 ⇒ **任何登录用户皆可建 Stripe customer/checkout、发起退款**（用户级 by design·模板参考切片·非租户隔离）；真实产品需自加鉴权/归属校验。
> 版本: 0.2.0（2026-10-20·逐条对照代码讨论后校正增补）

---

### 6.1 查看当前订阅快照
- **作为** 租户成员，**我想** 查看本租户当前订阅（档位/席位配额/用量/客户映射），**以便** 了解套餐与余量。
- **验收**：Given active 租户，When `GET /subscriptions/current`，Then 返回生效订阅快照（任何成员可读）；Given 无租户，Then 403。
- **溯源**：`GET /api/v1/subscriptions/current` · `SubscriptionsController.getCurrent` · `@UseGuards(TenantScopeGuard)`（无 `@Can`·成员皆可读己方计划）· `GetSubscriptionQuery` → `TenantSubscriptionView` · 契约 `subscriptionViewSchema` · 关联 [`global-tenancy`](../plans/global-tenancy.md) S7 / [`module-tenancy-lifecycle-quota-relocation`](../plans/module-tenancy-lifecycle-quota-relocation.md)。

### 6.2 开通/升级订阅
- **作为** owner/admin，**我想** 开通或升级本租户订阅，**以便** 提升席位/存储/API 配额。
- **验收**：Given `update Organization`（owner/admin）+ 已配支付通道，When `POST /subscriptions`（plan+seats/storage/api 配额），Then 调 `PaymentService.createCustomer` 建租户↔客户映射并落订阅（201·返回新快照）；Given 无支付 provider，Then 503；Given member，Then 403。
- **溯源**：`POST /api/v1/subscriptions` · `SubscriptionsController.create` · `@Can('update','Organization')` · `CreateSubscriptionCommand`（ALS 盖租户·禁点名 tenantId）· 契约 `createSubscriptionSchema` · 关联 [`global-tenancy`](../plans/global-tenancy.md) FR-8。

### 6.3 席位配额超限拒绝（402）
- **作为** 平台（商业策略），**我想** 在成员增量时拒绝超出席位的入组，**以便** 促请升级档位（付费闭环）。
- **验收**：Given 目标租户席位已满，When 有成员 `accept-invitation`（现网唯一真实增量通道），Then `seats-quota` before-hook 抛 **402**（`used+1 > limit`）；Given 未超限/无法判定目标租户，Then 放行（交 BA 自身校验）。
- **溯源**：`createSeatsQuotaPlugin`（`seats-quota.hook.ts`·matcher `/organization/(accept-invitation|...)`）· `QuotaService.checkSeats` · 关联 [`global-tenancy`](../plans/global-tenancy.md) S7 / [`module-tenancy-quota-member-wiring`](../plans/module-tenancy-quota-member-wiring.md)（跨引 [3.4](./epic-03-members-invitations.md)）。

### 6.4 查询支付集成状态
- **作为** 任意登录用户（test 无角色门·非仅运维/开发），**我想** 查看当前支付 provider 选择与可用通道，**以便** 确认支付面配置。
- **验收**：Given 已登录，When `GET /payment/test`，Then 返回 `{status, ...describe()}`（`describe()` = `{selected: 配置 provider, available: 已注册通道}`）——未配 Stripe key 时 `available` 为空。
- **溯源**：`GET /api/v1/payment/test` · `PaymentController.test` · `PaymentService.describe` · 契约 `paymentStatusSchema` · 关联 [`global-cn-adaptation`](../plans/global-cn-adaptation.md)（三通道为规划·现仅 Stripe 落地）。

### 6.5 创建支付客户
- **作为** 系统/用户，**我想** 在支付服务商侧创建 customer，**以便** 建立计费主体。
- **验收**：Given 已登录，When `POST /payment/customers`，Then 返回 customer 引用（201）。
- **溯源**：`POST /api/v1/payment/customers` · `PaymentController.createCustomer` · `@TenantExempt`（用户级）· 契约 `createCustomerSchema`/`paymentCustomerRefSchema`。

### 6.6 创建收款会话（checkout / payment intent）
- **作为** 用户，**我想** 发起一笔收款，**以便** 完成支付意向。
- **验收**：Given 已登录，When `POST /payment/checkouts`，Then 返回 checkout 引用（201）；参数非法 Then 400。
- **溯源**：`POST /api/v1/payment/checkouts` · `PaymentController.createCheckout` · 契约 `createCheckoutSchema`/`paymentCheckoutRefSchema`。

### 6.7 查询收款会话
- **作为** 用户，**我想** 按 id 取回某笔 checkout 状态，**以便** 核对支付进度。
- **验收**：Given checkout 存在，When `GET /payment/checkouts/:id`，Then 返回其引用；不存在 Then 404。
- **溯源**：`GET /api/v1/payment/checkouts/:id` · `PaymentController.retrieveCheckout` · `@ApiParam id`。

### 6.8 退款
- **作为** 用户/系统，**我想** 对某笔 checkout 发起退款，**以便** 处理退单。
- **验收**：Given 已登录 + 可退款项，When `POST /payment/refunds`，Then 返回退款引用（201）；非法 Then 400。
- **溯源**：`POST /api/v1/payment/refunds` · `PaymentController.refund` · 契约 `refundPaymentSchema`/`paymentRefundRefSchema`。

### 6.9 支付入站回调（Webhook·公开）
- **作为** 支付服务商，**我想** 向我推送支付事件，**以便** 系统验签并接收事件（当前不驱动状态收敛）。
- **验收**：Given `stripe-signature` 有效，When `POST /payment/webhooks`，Then 验签后按 `event.type` 分发并回执 `{received:true}`；Given 签名无效，Then 400；未配 Stripe 时 `verifyWebhook` 先 503。
  - **空实现边界（as-built 纠正）**：`payment_intent.succeeded` / `payment_intent.payment_failed` 两 case **体为空（仅 `break`+注释）**——验签与分发骨架就位，但**收款/失败后的状态落账/订阅收敛尚未接线**，webhook 当前实际只做验签回执。
- **溯源**：`POST /api/v1/payment/webhooks` · `PaymentController.handleWebhook` · `@Public()`（旁路会话墙·靠签名而非会话·raw body 验签）· `PaymentService.verifyWebhook` · 契约 `webhookAckSchema` · 关联 [`module-auth-http-surface`](../plans/module-auth-http-surface.md)（@Public 例外语义）。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论：路由/码位（6.1/6.2/6.3 及 6.4–6.8 的状态码）均准；**纠正两处 overclaim**——（一）「支付三通道并存」→实为仅 Stripe 落地且需配 secretKey、alipay/wechat_pay 仅类型占位+注释未实现（D9 暂缓）；（二）6.9「据实收款/失败更新状态」→webhook 两分支实为空实现（仅 break·无落账）；另补 503 懒解析降级条件与支付面无 RBAC/租户归属的安全边界（诚实）。
