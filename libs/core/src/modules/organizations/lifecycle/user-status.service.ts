import { Inject, Injectable } from '@nestjs/common';
import { currentRequestId } from '../../../shared-kernel/context/request-context';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../../shared-kernel/domain/event-publisher.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared-kernel/domain/unit-of-work.port';
import { UserStatusTransitionedEvent } from './events/user-status-transitioned.event';
import { canTransition, TENANCY_STATUS, type TenancyStatus } from './organization-lifecycle';
import { USER_STATUS_STORE, type UserStatusStore } from './user-status.store';

/**
 * 用户生命周期状态（复用租户状态机的 active/suspended/deleted 子集）。
 *
 * @remarks
 * pending 属租户准入语义，用户侧不产生。
 *
 * @public
 */
export type UserStatus = TenancyStatus;

/**
 * 用户生命周期状态词汇（从租户状态机择取用户侧合法子集）。
 *
 * @public
 */
export const USER_STATUS = {
  ACTIVE: TENANCY_STATUS.ACTIVE,
  SUSPENDED: TENANCY_STATUS.SUSPENDED,
  DELETED: TENANCY_STATUS.DELETED,
} as const;

/**
 * 严格迁移结果结合：ok 携 previous 供审计；not-found/illegal 由调用方转 404/409。
 *
 * @public
 */
export type UserTransitionResult =
  | { kind: 'ok'; previous: UserStatus | undefined; status: UserStatus }
  | { kind: 'not-found' }
  | { kind: 'illegal'; from: UserStatus | undefined; to: UserStatus };

/**
 * 用户状态读写唯一卡点（S6 · FR-10）：经 `USER_STATUS_STORE` 端口落 `user.status` 真列。
 *
 * @remarks
 * （global-governance-lifecycle-consolidation 切片 C：原 `user_status` 旁表归位 BA `user` 共享表的
 * additive 自撰域列·写经 AUTH_USER_STORE 落 auth 属主）。deny-list 语义——列默认 'active'，
 * 仅显式 suspended/deleted 才失能（本体不存在 → 视同 active）。
 *
 * @public
 */
@Injectable()
export class UserStatusService {
  constructor(
    @Inject(USER_STATUS_STORE) private readonly store: UserStatusStore,
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入，防 swc design:paramtypes 退化
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    // ES Phase B 后半（module-es-outbox-transactional 切片 B）：ambient UoW，装配见
    // MikroOrmModule @Global·单测直 new 传 pass-through 假实现
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  /**
   * 读取用户当前生命周期状态；无记录行 → undefined（视同 active）。
   *
   * @param userId - 目标用户 id
   * @returns 当前状态；无记录返回 `undefined`
   */
  async read(userId: string): Promise<UserStatus | undefined> {
    return (await this.store.readStatus(userId)) as UserStatus | undefined;
  }

  /**
   * 是否被拦（deny-list）：仅显式 suspended/deleted 为真；无行 → 不拦。
   *
   * @param userId - 目标用户 id
   * @returns 命中失能态返回 `true`；否则 `false`
   */
  async isBlocked(userId: string): Promise<boolean> {
    const status = await this.read(userId);
    return status === USER_STATUS.SUSPENDED || status === USER_STATUS.DELETED;
  }

  /**
   * 严格状态迁移：目标用户不存在 → not-found（转 404）；非法边 → illegal（转 409）。
   *
   * @remarks
   * 合法则 upsert `user_status` 并返回 previous 供审计。平台级动作专用（suspend/resume/delete），
   * 权限裁决归 PlatformOperatorGuard；session 硬删由调用方（治理 handler）叠加。
   * ES 第三切片 + Phase B 后半（module-es-outbox-transactional 切片 B）：upsert + 发布关键段包入
   * `UNIT_OF_WORK`（outbox 同事务原子·shadow 连带回滚·inproc 空转等价），产出
   * `user.status.transitioned`（与 user.registered 同聚合流·not-found/illegal 零发）。
   *
   * @param userId - 目标用户 id
   * @param to - 目标状态
   * @param opts - 可选治理上下文（主体/理由）
   * @returns 迁移结果结合（ok/not-found/illegal）
   */
  async transition(
    userId: string,
    to: UserStatus,
    opts?: { reason?: string; actorId?: string },
  ): Promise<UserTransitionResult> {
    return this.uow.run(async () => {
      if (!(await this.store.userExists(userId))) return { kind: 'not-found' } as const;

      const previous = await this.read(userId);
      if (!canTransition(previous, to)) return { kind: 'illegal', from: previous, to } as const;

      await this.store.upsert(userId, to, opts?.reason ?? null);
      await this.events.publishAll([
        new UserStatusTransitionedEvent({
          aggregateId: userId,
          // 关联 id 统一链（FR-4）：治理动作均在 HTTP 请求内，后台调用允许 undefined。
          correlationId: currentRequestId(),
          payload: {
            from: previous ?? null,
            to,
            actorId: opts?.actorId,
            reason: opts?.reason,
          },
        }),
      ]);
      return { kind: 'ok', previous, status: to } as const;
    });
  }
}
