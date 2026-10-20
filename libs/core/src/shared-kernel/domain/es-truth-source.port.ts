/**
 * ES 真相源写切换开关（module-es-r1-replay-core §3-R1c）。
 *
 * core 侧只声明注入 token（零 Nest ConfigService/ORM 依赖，端口倒置沿 S10/event-store.port 先例）：
 * 参考应用 `TenantsModule` 以 `useFactory` 读 `ConfigService.getEsTruthSourceConfig().tenants`
 * 绑定布尔值注入 `TenantStatusService`。缺省 false ⇒ `transition` 走原「表行裁决 + publishAll」
 * 路径逐字节不变（回退窗）；true ⇒ 走「load→fold 裁决→publishDurable(乐观锁 append)→投影 upsert」。
 *
 * 与 `EVENT_PUBLISH_MODE` 正交：本开关决定「谁是真相源/写序」，`EVENT_PUBLISH_MODE` 决定
 * 「事件如何派发」（见 `publishDurable` 语义）。生产真相源目标态配 `outbox`（同事务 append + relay 投）。
 */
export const ES_TRUTH_SOURCE_TENANTS = Symbol('ES_TRUTH_SOURCE_TENANTS');

/**
 * ES R4 第二上下文推广写切换开关（module-es-r4-second-context-subscriptions §3-R4c）。
 *
 * 与 `ES_TRUTH_SOURCE_TENANTS` 同构·正交：决定订阅治理写路径（`convergeStatus` +
 * create）是否翻为「回放即真相」（load→fold 裁决→publishDurable(乐观锁 append)→投影 upsert/insert）。
 * core/参考应用侧只声明注入 token；`SubscriptionsModule` 以 `useFactory` 读
 * `ConfigService.getEsTruthSourceConfig().subscriptions` 绑定布尔。缺省 false ⇒ 原 CRUD 写路径逐字节不变。
 */
export const ES_TRUTH_SOURCE_SUBSCRIPTIONS = Symbol('ES_TRUTH_SOURCE_SUBSCRIPTIONS');
