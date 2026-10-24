/**
 * ES 真相源写切换开关的 DI 注入 token（module-es-r1-replay-core §3-R1c）。
 *
 * @remarks
 * 注（global-governance-lifecycle-consolidation 切片 D·人裁 2026-10-23）：治理面（认证与授权）不保留
 * 「回放即真相」，租户生命周期不再作为 ES R1 试点——`ES_TRUTH_SOURCE_TENANTS` 旋钮随治理面 ES 覆盖层
 * 一并退役（仅保留 EDA 事件发布）。本文件自此只留订阅治理面开关。
 *
 * @public
 */
export const ES_TRUTH_SOURCE_SUBSCRIPTIONS = Symbol('ES_TRUTH_SOURCE_SUBSCRIPTIONS');
