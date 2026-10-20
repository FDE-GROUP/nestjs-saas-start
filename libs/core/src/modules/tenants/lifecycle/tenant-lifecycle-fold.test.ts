import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../shared-kernel/domain/domain-event';
import { TenantBootstrappedEvent } from './events/tenant-bootstrapped.event';
import { TenantRejectedEvent } from './events/tenant-rejected.event';
import { TenantStatusTransitionedEvent } from './events/tenant-status-transitioned.event';
import { applyTenantEvent, replayTenantLifecycle } from './tenant-lifecycle-fold';

/**
 * 租户治理 fold 单测（ES R1a · module-es-r1-replay-core §3-R1a · DB-free）。
 * 锁「回放即真相」读侧裁决语义：快照起点 / from 漂移拒回放 / 非法迁移拒回放 /
 * rejected tombstone / 未知事件 fail-loud。
 */

function transitioned(
  aggregateId: string,
  from: string | null,
  to: string,
  eventId = aggregateId,
): TenantStatusTransitionedEvent {
  return new TenantStatusTransitionedEvent({
    aggregateId,
    eventId,
    payload: { from: from as never, to: to as never },
  });
}

describe('replayTenantLifecycle（tenant 流回放 fold）', () => {
  it('空流 → undefined（无户籍=无状态记录·deny-list 同口径）', () => {
    expect(replayTenantLifecycle([])).toBeUndefined();
  });

  it('bootstrapped 起点 → 以其 status 建立状态；后续迁移正常续放', () => {
    const events = [
      new TenantBootstrappedEvent({ aggregateId: 'orgA', payload: { status: 'active' } }),
      transitioned('orgA', 'active', 'suspended'),
      transitioned('orgA', 'suspended', 'active'),
    ];
    const state = replayTenantLifecycle(events);
    expect(state).toMatchObject({ organizationId: 'orgA', status: 'active', purged: false });
    expect(state?.version).toBe(3);
  });

  it('无快照历史流：首事件 from=null ↔ 空态起点（存量治理事件可回放）', () => {
    const state = replayTenantLifecycle([transitioned('orgB', null, 'suspended')]);
    expect(state).toMatchObject({ status: 'suspended', purged: false, version: 1 });
  });

  it('rejected → tombstone（status=deleted·purged=true）；purged 后再迁移 fail-loud', () => {
    const events = [
      new TenantBootstrappedEvent({ aggregateId: 'orgC', payload: { status: 'pending_approval' } }),
      new TenantRejectedEvent({ aggregateId: 'orgC', payload: { actorId: 'ops' } }),
    ];
    const state = replayTenantLifecycle(events);
    expect(state).toMatchObject({ status: 'deleted', purged: true });
    expect(() => applyTenantEvent(state, transitioned('orgC', 'deleted', 'active'))).toThrow(
      /purged/,
    );
  });

  it('from 与重放态漂移 → fail-loud（篡改/分叉防御）', () => {
    const events = [transitioned('orgD', null, 'suspended')];
    expect(() =>
      replayTenantLifecycle([...events, transitioned('orgD', 'active', 'deleted')]),
    ).toThrow(/漂移/);
  });

  it('非法迁移（deleted 终态再迁移）→ fail-loud，canTransition 复验生效', () => {
    const state = replayTenantLifecycle([transitioned('orgE', null, 'deleted')]);
    expect(state?.status).toBe('deleted');
    expect(() => applyTenantEvent(state, transitioned('orgE', 'deleted', 'active'))).toThrow(
      /非法迁移/,
    );
  });

  it('bootstrapped 出现在已定位流 → fail-loud（快照只允许流起点）', () => {
    const state = replayTenantLifecycle([transitioned('orgF', null, 'active')]);
    expect(() =>
      applyTenantEvent(
        state,
        new TenantBootstrappedEvent({ aggregateId: 'orgF', payload: { status: 'active' } }),
      ),
    ).toThrow(/流起点/);
  });

  it('未知 eventType / 非 tenant 聚合 / payload 缺关键字段 → 一律 fail-loud', () => {
    const bogus = {
      eventId: 'x',
      aggregateId: 'orgG',
      aggregateType: 'tenant',
      eventType: 'tenant.mystery',
      eventVersion: 1,
      occurredAt: new Date(),
      payload: {},
    } as DomainEvent;
    expect(() => replayTenantLifecycle([bogus])).toThrow(/未知 eventType/);
    const foreign = transitioned('orgG', null, 'active');
    Object.defineProperty(foreign, 'aggregateType', { value: 'user' });
    expect(() => replayTenantLifecycle([foreign])).toThrow(/非 tenant 聚合/);
    const missing = { ...bogus, eventType: 'tenant.bootstrapped', payload: {} } as DomainEvent;
    expect(() => replayTenantLifecycle([missing])).toThrow(/流损坏/);
  });
});
