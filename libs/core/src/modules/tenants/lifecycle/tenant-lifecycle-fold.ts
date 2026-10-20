import type { DomainEvent } from '../../../shared-kernel/domain/domain-event';
import { DOMAIN_EVENTS } from '../../../shared-kernel/domain/domain-event-names';
import type { TenantBootstrappedPayload } from './events/tenant-bootstrapped.event';
import type { TenantRejectedPayload } from './events/tenant-rejected.event';
import type { TenantStatusTransitionedPayload } from './events/tenant-status-transitioned.event';
import { canTransition, TENANT_STATUS, type TenantStatus } from './tenant-lifecycle';

/**
 * 租户治理状态机·轻量溯源 fold（ES R1a · module-es-r1-replay-core §3-R1a · 裁①乙）。
 *
 * **非聚合管道**（S1 删管道后不复活）：纯函数 `事件序列 → 当前状态`，零框架依赖、
 * 零 `recordEvent/pullDomainEvents`。事件仍由 service/handler 产出（P3 操作记录语义），
 * 本件只负责「回放即真相」的**读侧裁决形态**：R1c 写切换后 `canTransition` 的前置态
 * 即从本 fold 的重放结果取得，而非表行。
 *
 * 流语义（tenant 流·aggregateType `tenant`）：
 *  - `tenant.bootstrapped`：**快照事件**。全流回放（`replayTenantLifecycle`）采
 *    「最后快照重启」语义（§3-R1b·裁②甲——**快照事件覆盖此前一切**）：R1b backfill 落
 *    存量流的 bootstrapped 在历史治理事件之后（max+1 续位不重排历史），快照前缀不重放不校验。
 *    增量推进（`applyTenantEvent`）仍只容空态出现——已定位后再见 = 流损坏 fail-loud。
 *  - `tenant.status.transitioned`：迁移合法性经 `canTransition` 复验（篡改/分叉防御），
 *    且事件记录的 `from` 必须等于重放态（无户籍历史 `from===null` ↔ 空态起点）；不符即漂移 fail-loud。
 *  - `tenant.rejected`：驳回 = 硬删事实（非状态迁移·§6-① 口径）→ 终态 tombstone
 *    `status=deleted, purged=true`；此后一切治理事件视为对已抹除流写入 = fail-loud。
 *  - 未知 eventType / 非 tenant 聚合 / payload 形态缺关键字段：一律 fail-loud，不猜。
 *
 * `version` 为**回放段内已应用事件数**（快照重启后从 1 起·非流全长；端口 load 不携列值）；
 * 物理并发校验由 `append(expectedVersion)` 承担（R1c 接线）。
 */
export interface TenantLifecycleState {
  readonly organizationId: string;
  readonly status: TenantStatus;
  /** 驳回硬删 tombstone 标记（true 后本流只容 PIPL 补删，不再接受治理事件）。 */
  readonly purged: boolean;
  /** 已应用事件数（流内位置）。 */
  readonly version: number;
}

function requireString(value: unknown, label: string, eventId: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`tenant-fold: ${label} 缺失/非法（event ${eventId}）——流损坏，拒回放`);
  }
  return value;
}

/** 单事件推进；非法输入 fail-loud（语义见文件头）。 */
export function applyTenantEvent(
  state: TenantLifecycleState | undefined,
  event: DomainEvent,
): TenantLifecycleState {
  if (event.aggregateType !== 'tenant') {
    throw new Error(`tenant-fold: 非 tenant 聚合事件（${event.aggregateType}·${event.eventType}）`);
  }
  const payload = event.payload;
  const nextVersion = (state?.version ?? 0) + 1;

  if (event.eventType === DOMAIN_EVENTS.tenantBootstrapped) {
    if (state !== undefined) {
      throw new Error(
        `tenant-fold: bootstrapped 快照事件出现在已定位流（@${state.version}）——只允许流起点（event ${event.eventId}）`,
      );
    }
    const status = requireString(
      (payload as unknown as TenantBootstrappedPayload).status,
      'bootstrapped.status',
      event.eventId,
    ) as TenantStatus;
    return { organizationId: event.aggregateId, status, purged: false, version: nextVersion };
  }

  if (event.eventType === DOMAIN_EVENTS.tenantStatusTransitioned) {
    if (state?.purged) {
      throw new Error(
        `tenant-fold: 已驳回（purged）流出现 transitioned 事件（event ${event.eventId}）——流损坏，拒回放`,
      );
    }
    const { from, to } = payload as unknown as TenantStatusTransitionedPayload;
    const expectedFrom: TenantStatus | null = state?.status ?? null;
    if (from !== expectedFrom) {
      throw new Error(
        `tenant-fold: 事件 from=${String(from)} 与重放态 ${String(expectedFrom)} 漂移（event ${event.eventId}）——拒回放`,
      );
    }
    const toStatus = requireString(to, 'transitioned.to', event.eventId) as TenantStatus;
    if (!canTransition(state?.status, toStatus)) {
      throw new Error(
        `tenant-fold: 非法迁移 ${String(state?.status)} → ${toStatus}（event ${event.eventId}）——拒回放`,
      );
    }
    return {
      organizationId: event.aggregateId,
      status: toStatus,
      purged: false,
      version: nextVersion,
    };
  }

  if (event.eventType === DOMAIN_EVENTS.tenantRejected) {
    // 驳回 = 硬删事实（reject 不经状态机·同 tenant 流）；(void) 消费 payload 类型引用防未用告警。
    void (payload as unknown as TenantRejectedPayload);
    if (state?.purged) {
      throw new Error(
        `tenant-fold: 重复 rejected tombstone（event ${event.eventId}）——流损坏，拒回放`,
      );
    }
    return {
      organizationId: event.aggregateId,
      status: TENANT_STATUS.DELETED,
      purged: true,
      version: nextVersion,
    };
  }

  throw new Error(
    `tenant-fold: 未知 eventType ${event.eventType}（event ${event.eventId}）——注册表外事件拒回放`,
  );
}

/**
 * 全流回放（load 的升序结果）；空流 → undefined（无户籍=「无状态记录」·deny-list 同口径）。
 *
 * 「最后快照重启」（module-es-r1-replay-core §3-R1b·裁②甲）：流内存在 bootstrapped 时，
 * 以**最后一个**为起点折叠——快照覆盖此前一切（存量 backfill 前缀含 shadow 期首事
 * `from='pending_approval'` 一类无空态起点的历史，不重放不校验，避免历史重排）；
 * 快照之后仍严格 fold（漂移/非法迁移/purged 一律 fail-loud）。无快照流保持全严格回放。
 */
export function replayTenantLifecycle(
  events: readonly DomainEvent[],
): TenantLifecycleState | undefined {
  let start = 0;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].eventType === DOMAIN_EVENTS.tenantBootstrapped) {
      start = i;
      break;
    }
  }
  let state: TenantLifecycleState | undefined;
  for (let i = start; i < events.length; i += 1) {
    state = applyTenantEvent(state, events[i]);
  }
  return state;
}
