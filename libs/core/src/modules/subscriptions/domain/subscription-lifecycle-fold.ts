import type { DomainEvent } from '../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../shared-kernel/domain/domain-event-names';
import type { SubscriptionBootstrappedPayload } from './events/subscription-bootstrapped.event';
import type { SubscriptionCreatedPayload } from './events/subscription-created.event';
import type { SubscriptionStatusTransitionedPayload } from './events/subscription-status-transitioned.event';
import {
  canTransition,
  SUBSCRIPTION_STATUS,
  type SubscriptionStatus,
} from './subscription-lifecycle';

/**
 * 订阅治理状态机·轻量溯源 fold（ES R4 第二上下文推广 · module-es-r4-second-context-subscriptions
 * · 复用 R1 seam·裁①乙非聚合管道）。
 *
 * 纯函数 `事件序列 → 当前态`·零框架依赖·零 recordEvent/pullDomainEvents。事件仍由 handler/service
 * 产出（P3 操作记录语义）；本件只承「回放即真相」的读侧裁决形态：R4c 写切换后 `canTransition` 的
 * 前置态即从本 fold 的重放结果取得，而非表行。
 *
 * 流语义（subscription 流·aggregateType `subscription`·aggregateId=订阅行 id·裁ⓐ甲）：
 *  - `subscription.created` / `subscription.bootstrapped`：**流起点**。created=上线后新行·
 *    bootstrapped=存量快照。全流回放采「最后快照重启」（bootstrapped 覆盖此前一切·不重排历史·同 tenants）；
 *    created 亦要求空态出现（再见=流损坏 fail-loud）。
 *  - `subscription.status.transitioned`：迁移合法性经 `canTransition` 复验·且事件 `from` 必须等于
 *    重放态（空流起点 `from===null`）；不符即漂移 fail-loud。
 *  - 未知 eventType / 非 subscription 聚合 / payload 关键字段缺失：一律 fail-loud，不猜。
 *
 * `version` 为回放段内已应用事件数（快照重启后从 1 起）；物理并发校验由 `append(expectedVersion)` 承担（R4c）。
 */
export interface SubscriptionLifecycleState {
  readonly subscriptionId: string;
  readonly status: SubscriptionStatus;
  /** 已应用事件数（流内位置）。 */
  readonly version: number;
}

function requireStatus(value: unknown, label: string, eventId: string): SubscriptionStatus {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`subscription-fold: ${label} 缺失/非法（event ${eventId}）——流损坏，拒回放`);
  }
  return value as SubscriptionStatus;
}

/** 单事件推进；非法输入 fail-loud（语义见文件头）。 */
export function applySubscriptionEvent(
  state: SubscriptionLifecycleState | undefined,
  event: DomainEvent,
): SubscriptionLifecycleState {
  if (event.aggregateType !== 'subscription') {
    throw new Error(
      `subscription-fold: 非 subscription 聚合事件（${event.aggregateType}·${event.eventType}）`,
    );
  }
  const payload = event.payload;
  const nextVersion = (state?.version ?? 0) + 1;

  if (
    event.eventType === DOMAIN_EVENTS.subscriptionCreated ||
    event.eventType === DOMAIN_EVENTS.subscriptionBootstrapped
  ) {
    if (state !== undefined) {
      throw new Error(
        `subscription-fold: ${event.eventType} 起点事件出现在已定位流（@${state.version}）——只允许流起点（event ${event.eventId}）`,
      );
    }
    const status = requireStatus(
      (payload as SubscriptionCreatedPayload | SubscriptionBootstrappedPayload).status,
      `${event.eventType}.status`,
      event.eventId,
    );
    return { subscriptionId: event.aggregateId, status, version: nextVersion };
  }

  if (event.eventType === DOMAIN_EVENTS.subscriptionStatusTransitioned) {
    const { from, to } = payload as unknown as SubscriptionStatusTransitionedPayload;
    const expectedFrom: SubscriptionStatus | null = state?.status ?? null;
    if (from !== expectedFrom) {
      throw new Error(
        `subscription-fold: 事件 from=${String(from)} 与重放态 ${String(expectedFrom)} 漂移（event ${event.eventId}）——拒回放`,
      );
    }
    const toStatus = requireStatus(to, 'transitioned.to', event.eventId);
    if (!canTransition(state?.status, toStatus)) {
      throw new Error(
        `subscription-fold: 非法迁移 ${String(state?.status)} → ${toStatus}（event ${event.eventId}）——拒回放`,
      );
    }
    return { subscriptionId: event.aggregateId, status: toStatus, version: nextVersion };
  }

  throw new Error(
    `subscription-fold: 未知 eventType ${event.eventType}（event ${event.eventId}）——注册表外事件拒回放`,
  );
}

/**
 * 全流回放（load 的升序结果）；空流 → undefined（无订阅行=无状态记录）。
 *
 * 「最后快照重启」（沿 tenants R1b·裁②甲）：流内存在 bootstrapped 时以最后一个为起点折叠——存量
 * backfill 前缀不重排不校验；快照/起点之后仍严格 fold（漂移/非法迁移 fail-loud）。无快照流全严格回放。
 */
export function replaySubscriptionLifecycle(
  events: readonly DomainEvent[],
): SubscriptionLifecycleState | undefined {
  let start = 0;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].eventType === DOMAIN_EVENTS.subscriptionBootstrapped) {
      start = i;
      break;
    }
  }
  let state: SubscriptionLifecycleState | undefined;
  for (let i = start; i < events.length; i += 1) {
    state = applySubscriptionEvent(state, events[i]);
  }
  return state;
}

// 治理态起态常量再导出（供调用方引用·避免下游另引 subscription-lifecycle 造成漂移面）。
export { SUBSCRIPTION_STATUS };
