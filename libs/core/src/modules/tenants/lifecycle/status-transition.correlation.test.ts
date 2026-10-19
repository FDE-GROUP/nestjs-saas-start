import { describe, expect, it } from 'vitest';
import { requestStorage } from '../../../shared-kernel/context/request-context';
import type { DomainEventPublisher } from '../../../shared-kernel/domain/event-publisher.port';
import { TENANT_STATUS, withTenantStatus } from './tenant-lifecycle';
import { TenantStatusService } from './tenant-status.service';
import type { TenantStatusStore } from './tenant-status.store';
import { UserStatusService } from './user-status.service';
import type { UserStatusStore } from './user-status.store';

/**
 * 治理状态迁移构造点 correlationId 穿透测（module-common-request-correlation · FR-4 样本②③）：
 * 真实 service + fake store/发布器，锁「请求上下文内非空·上下文外 undefined」两态
 * （reject-handler 构造点同形·专测另在）。
 */
function makeRecorder(): {
  publishAll: (events: readonly unknown[]) => Promise<void>;
  captured: { correlationId?: string }[];
} {
  const captured: { correlationId?: string }[] = [];
  return {
    captured,
    async publishAll(events) {
      captured.push(...(events as { correlationId?: string }[]));
    },
  };
}

describe('TenantStatusService.transition 构造点', () => {
  it('请求上下文内迁移：tenant.status.transitioned 携带当前 requestId', async () => {
    const store: TenantStatusStore = {
      async load() {
        return { metadata: withTenantStatus({}, TENANT_STATUS.PENDING) };
      },
      async save() {},
    };
    const rec = makeRecorder();
    const svc = new TenantStatusService(store, rec as unknown as DomainEventPublisher, {
      run: <T>(fn: () => Promise<T>) => fn(),
    });
    await requestStorage.run({ requestId: 'rq-9' }, () =>
      svc.transition('org-1', TENANT_STATUS.ACTIVE),
    );
    expect(rec.captured).toHaveLength(1);
    expect(rec.captured[0]?.correlationId).toBe('rq-9');
  });

  it('上下文外（后台/脚本）迁移：correlationId undefined·持久化 ?? null 语义不动', async () => {
    const store: TenantStatusStore = {
      async load() {
        return { metadata: withTenantStatus({}, TENANT_STATUS.PENDING) };
      },
      async save() {},
    };
    const rec = makeRecorder();
    const svc = new TenantStatusService(store, rec as unknown as DomainEventPublisher, {
      run: <T>(fn: () => Promise<T>) => fn(),
    });
    await svc.transition('org-1', TENANT_STATUS.ACTIVE);
    expect(rec.captured[0]?.correlationId).toBeUndefined();
  });
});

describe('UserStatusService.transition 构造点', () => {
  const store: UserStatusStore = {
    async readStatus() {
      return 'active';
    },
    async userExists() {
      return true;
    },
    async upsert() {},
  };

  it('请求上下文内暂停：user.status.transitioned 携带当前 requestId', async () => {
    const rec = makeRecorder();
    const svc = new UserStatusService(store, rec as unknown as DomainEventPublisher, {
      run: <T>(fn: () => Promise<T>) => fn(),
    });
    await requestStorage.run({ requestId: 'rq-u1' }, () =>
      svc.transition('u-1', TENANT_STATUS.SUSPENDED),
    );
    expect(rec.captured).toHaveLength(1);
    expect(rec.captured[0]?.correlationId).toBe('rq-u1');
  });
});
