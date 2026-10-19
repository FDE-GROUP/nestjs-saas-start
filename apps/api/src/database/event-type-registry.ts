import { TenantRejectedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-rejected.event';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-status-transitioned.event';
import { UserStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/user-status-transitioned.event';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DOMAIN_EVENTS } from '@core/saas-kit/shared-kernel/domain/domain-event-names';

/**
 * `eventType → 事件类` 注册表（ES Phase B 后半 · module-es-outbox-transactional 切片 C）。
 *
 * outbox relay 从表行重建 `DomainEvent` 类实例投进程内总线——`@EventsHandler(Class)` 按
 * **类引用**匹配，故字符串→类的还原必须单源。设计参考五点之②「事件名集中常量 + 契约测试
 * 双向锁定」：本表与 `DOMAIN_EVENTS` 常量、各类 `static EVENT_TYPE` 由
 * `event-type-registry.test.ts` 双向锁死（加事件漏登记 = 测试红，杜绝 relay 运行期才炸）。
 *
 * 重建契约（锁于测试）：事件类构造须接受**完整信封显式值**（eventId/occurredAt/correlationId
 * 等透传，不重掷 uuidv7、不重取 now——审计事实按原始时点复原）。
 */
export type RegistrableEventClass = {
  readonly EVENT_TYPE: (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];
  new (props: Record<string, any>): DomainEvent;
};

export const EVENT_TYPE_REGISTRY: ReadonlyMap<string, RegistrableEventClass> = new Map<
  string,
  RegistrableEventClass
>([
  [UserStatusTransitionedEvent.EVENT_TYPE, UserStatusTransitionedEvent],
  [TenantStatusTransitionedEvent.EVENT_TYPE, TenantStatusTransitionedEvent],
  [TenantRejectedEvent.EVENT_TYPE, TenantRejectedEvent],
]);
