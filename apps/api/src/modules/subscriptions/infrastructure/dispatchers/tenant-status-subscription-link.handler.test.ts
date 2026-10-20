import { EVENT_TYPE_REGISTRY } from '@app/database/eventing/event-type-registry';
import { SUBSCRIPTION_STATUS } from '@core/saas-kit/modules/subscriptions/quota/tenant-plans';
import { TenantStatusTransitionedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-status-transitioned.event';
import { TENANT_STATUS } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantStatusSubscriptionLinkHandler } from './tenant-status-subscription-link.handler';

/**
 * 治理联动消费者单测（module-es-first-real-consumer 治理档 S2）：映射裁决 + at-least-once
 * 幂等语义（终态收敛调用·非计数）+ relay→bus→handler 的**类同一性**锁（registry 重建类
 * 必须 === @EventsHandler 匹配类，否则 outbox 模式下事件永远投不到本 handler）。
 */

function makeEvent(to: string, from: string | null = TENANT_STATUS.ACTIVE) {
  return new TenantStatusTransitionedEvent({
    aggregateId: 'org-9',
    payload: { from: from as never, to: to as never, actorId: 'op-1' },
  });
}

function makeHandler() {
  const convergeStatus = vi.fn(async () => true);
  const handler = new TenantStatusSubscriptionLinkHandler({ convergeStatus });
  return { handler, convergeStatus };
}

describe('TenantStatusSubscriptionLinkHandler（治理档消费者）', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('suspend → active 行收敛为 suspended（终态收敛式调用·显式 tenantId 取事件 aggregateId）', async () => {
    const { handler, convergeStatus } = makeHandler();
    await handler.handle(makeEvent(TENANT_STATUS.SUSPENDED));
    expect(convergeStatus).toHaveBeenCalledExactlyOnceWith(
      'org-9',
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.SUSPENDED,
    );
  });

  it('resume/approve(to=active) → 仅回收 suspended 行，不回溯历史 cancelled', async () => {
    const { handler, convergeStatus } = makeHandler();
    await handler.handle(makeEvent(TENANT_STATUS.ACTIVE, TENANT_STATUS.SUSPENDED));
    expect(convergeStatus).toHaveBeenCalledExactlyOnceWith(
      'org-9',
      SUBSCRIPTION_STATUS.SUSPENDED,
      SUBSCRIPTION_STATUS.ACTIVE,
    );
  });

  it('deleted / pending_approval → 零 converge 调用（FK cascade 兜底 / 时序不可能）', async () => {
    const { handler, convergeStatus } = makeHandler();
    await handler.handle(makeEvent(TENANT_STATUS.DELETED));
    await handler.handle(makeEvent(TENANT_STATUS.PENDING));
    expect(convergeStatus).not.toHaveBeenCalled();
  });

  it('幂等（at-least-once 硬要求）：同事件重投 N 次 = 同样 N 次收敛调用且零异常——幂等归端口契约（changed=false 即 no-op），handler 不计数不分叉', async () => {
    const { handler, convergeStatus } = makeHandler();
    const ev = makeEvent(TENANT_STATUS.SUSPENDED);
    convergeStatus.mockResolvedValueOnce(true).mockResolvedValue(false);
    await handler.handle(ev);
    await handler.handle(ev); // 重投：端口返 false（无 from 行）→ 行为不变、零副作用
    expect(convergeStatus).toHaveBeenCalledTimes(2);
  });

  it('类同一性锁：@EventsHandler 匹配类 === EVENT_TYPE_REGISTRY 重建类（relay 投递必达本 handler）', () => {
    expect(EVENT_TYPE_REGISTRY.get('tenant.status.transitioned')).toBe(
      TenantStatusTransitionedEvent,
    );
  });
});
