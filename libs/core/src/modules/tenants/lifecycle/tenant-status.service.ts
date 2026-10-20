import { Inject, Injectable, Optional } from '@nestjs/common';
import { currentRequestId } from '../../../shared-kernel/context/request-context';
import { ES_TRUTH_SOURCE_TENANTS } from '../../../shared-kernel/domain/es-truth-source.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../../shared-kernel/domain/event-publisher.port';
import { EVENT_STORE, type EventStore } from '../../../shared-kernel/domain/event-store.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared-kernel/domain/unit-of-work.port';
import { TenantStatusTransitionedEvent } from './events/tenant-status-transitioned.event';
import { canTransition, isTenantBlocked, type TenantStatus } from './tenant-lifecycle';
import { applyTenantEvent, replayTenantLifecycle } from './tenant-lifecycle-fold';
import { TENANT_STATUS_STORE, type TenantStatusStore } from './tenant-status.store';

/** 严格迁移结果结合（S5）：ok 携 previous 供审计；not-found/illegal 由调用方转 404/409。 */
export type TenantTransitionResult =
  | { kind: 'ok'; previous: TenantStatus | undefined; status: TenantStatus }
  | { kind: 'not-found' }
  | { kind: 'illegal'; from: TenantStatus | undefined; to: TenantStatus };

/** 迁移可选上下文（§6-③）：治理动作主体与理由，进事件 payload，不落存储新键。 */
export interface TenantTransitionOptions {
  readonly actorId?: string;
  readonly reason?: string;
}

/**
 * 租户状态读写唯一卡点（S4 · FR-1）：经 `TenantStatusStore` 端口读写自有 `tenant.status` 真列
 * （global-tenant-entity-reclamation 切片 B：旧「落 organization.metadata·无迁移」存储裁定已修订）。
 * 读侧 fail-closed：本体不存在/非法状态一律非 active；无户籍视同「无状态记录」（deny-list 不拦）。
 * ES 第二切片：合法迁移成功后经 `DOMAIN_EVENT_PUBLISHER` 产出
 * `tenant.status.transitioned`（shadow append·双模开关语义由发布器实现承担）。
 */
@Injectable()
export class TenantStatusService {
  constructor(
    @Inject(TENANT_STATUS_STORE) private readonly store: TenantStatusStore,
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入，防 swc design:paramtypes 退化
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    // ES Phase B 后半（module-es-outbox-transactional 切片 B）：ambient UoW，装配见
    // MikroOrmModule @Global·单测直 new 传 pass-through 假实现
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    // ES R1c 真相源写切换（module-es-r1-replay-core §3-R1c·高危#1 逐次亲签）：
    // 两参均 @Optional + 缺省——旋钮关（缺省）时既有 `new(store, publisher, uow)` 三参调用点
    // 逐字节不变（后两参落默认）；开时 TenantsModule 经 useFactory 注入布尔 + @Global EVENT_STORE。
    @Optional() @Inject(EVENT_STORE) private readonly eventStore?: EventStore,
    @Optional() @Inject(ES_TRUTH_SOURCE_TENANTS) private readonly truthSource = false,
  ) {}

  /** 读取租户当前生命周期状态；本体/户籍无记录 → undefined（deny-list 语义·视同 active）。 */
  async read(organizationId: string): Promise<TenantStatus | undefined> {
    return this.store.readStatus(organizationId);
  }

  /** 是否生效（FR-1/NFR-1 fail-closed：仅显式 active 为真）。 */
  async isActive(organizationId: string): Promise<boolean> {
    return (await this.read(organizationId)) === 'active';
  }

  /**
   * 是否被拦（S4 中间件失能卡点·deny-list）：无户籍行视同不拦（fail-open
   * 仅限「无状态记录」边界，与 fail-closed 隔离不矛盾——本体无行则下游租户解析早已 fail）。
   */
  async isBlocked(organizationId: string): Promise<boolean> {
    return isTenantBlocked(await this.store.readStatus(organizationId));
  }

  /**
   * 严格状态迁移（S5 收紧）：按 §9.4 迁移表裁决合法边，非法 → illegal（调用方转 409）；
   * 本体行不存在 → not-found（转 404·判据是 `organizationExists` 非户籍行有无）；合法则
   * upsert `tenant` 户籍行并返回 previous 供审计。平台级动作专用（approve/suspend/resume/delete），
   * 权限裁决归 PlatformOperatorGuard。
   * ES Phase B 后半（module-es-outbox-transactional 切片 B）：关键段（写回 + 发布）包入
   * `UNIT_OF_WORK`——outbox 下域行与事件行同事务原子；shadow 下发布/append 失败连带业务写
   * 回滚（语义较旧「非事务窗口」收紧·plan §2.1）；inproc 下事务空转语义等价。
   * not-found/illegal 零分支绝不发事件。
   */
  async transition(
    organizationId: string,
    to: TenantStatus,
    options?: TenantTransitionOptions,
  ): Promise<TenantTransitionResult> {
    return this.uow.run(async () => {
      if (!(await this.store.organizationExists(organizationId))) {
        return { kind: 'not-found' } as const;
      }

      // —— ES R1c 真相源写路径（旋钮开·module-es-r1-replay-core §3-R1c）——
      // 事件流为裁决输入与耐久真相，tenant 表行降为投影：load→fold 取前置态→
      // publishDurable(带 expectedVersion 乐观锁·同事务 append)→投影 upsert(fold 结果)。
      // 读序与写序均为「append 先于投影」（§2 目标态），投影携 fold.status⇒读己之写不变。
      if (this.truthSource) {
        if (!this.eventStore) {
          throw new Error('ES_TRUTH_SOURCE_TENANTS=true 需装配 EVENT_STORE（真相源写路径）');
        }
        if (!this.events.publishDurable) {
          throw new Error(
            'ES_TRUTH_SOURCE_TENANTS=true 要求发布器实现 publishDurable（耐久 append + 乐观锁）',
          );
        }
        const stream = await this.eventStore.load('tenant', organizationId);
        const replay = replayTenantLifecycle(stream);
        const previous = replay?.status;
        if (!canTransition(previous, to)) return { kind: 'illegal', from: previous, to } as const;
        const event = new TenantStatusTransitionedEvent({
          aggregateId: organizationId,
          correlationId: currentRequestId(),
          payload: {
            from: previous ?? null,
            to,
            actorId: options?.actorId,
            reason: options?.reason,
          },
        });
        // 乐观锁：tenant 流 contiguous（bootstrap/append 均 max+1 续位·硬删清空整流），
        // 故物理 max version === 流长；expectedVersion = 流长 + 1（与 store.append 内部 max+1 校验同律）。
        await this.events.publishDurable([event], stream.length + 1);
        // 投影：fold 结果回写 tenant 户籍行（非手推 to·严格等于重放态）。
        const next = applyTenantEvent(replay, event);
        await this.store.upsert(organizationId, next.status);
        return { kind: 'ok', previous, status: to } as const;
      }

      // —— 原路径（缺省·旋钮关·逐字节不变）——
      const previous = await this.store.readStatus(organizationId);
      if (!canTransition(previous, to)) return { kind: 'illegal', from: previous, to } as const;
      await this.store.upsert(organizationId, to);
      await this.events.publishAll([
        new TenantStatusTransitionedEvent({
          aggregateId: organizationId,
          // 关联 id 统一链（FR-4）：治理动作均在 HTTP 请求内，后台调用允许 undefined。
          correlationId: currentRequestId(),
          payload: {
            from: previous ?? null,
            to,
            actorId: options?.actorId,
            reason: options?.reason,
          },
        }),
      ]);
      return { kind: 'ok', previous, status: to } as const;
    });
  }

  /**
   * 单流重建投影（ES R1c·§3-R1c 诊断面·非新增 HTTP 端点）：`load → fold → upsert`。
   * 用于投影漂移修复/灾难重建（真相源回写表行）。空流（无事件）=「无状态记录」→
   * 不写投影、返回 undefined（deny-list 同口径·避免凭空造 active 户籍行）。返回重建后状态。
   */
  async rebuildTenantProjection(organizationId: string): Promise<TenantStatus | undefined> {
    if (!this.eventStore) {
      throw new Error('rebuildTenantProjection 需装配 EVENT_STORE');
    }
    const replay = replayTenantLifecycle(await this.eventStore.load('tenant', organizationId));
    if (!replay) return undefined;
    await this.store.upsert(organizationId, replay.status);
    return replay.status;
  }
}
