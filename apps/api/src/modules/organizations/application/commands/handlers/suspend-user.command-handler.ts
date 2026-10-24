import {
  AUTH_SESSION_STORE,
  type AuthSessionStore,
} from '@app/modules/auth/domain/ports/session-store.port';
import {
  USER_STATUS,
  UserStatusService,
} from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { UserGovernanceResult } from '../../read-models/platform-user.read-model';
import { SuspendUserCommand } from '../suspend-user.command';

/**
 * 暂停平台用户 handler（FR-10/FR-6·平台级）：`active → suspended`，成功后硬删其全部 session。
 *
 * @remarks
 * 经 `UserStatusService.transition`
 * 严格裁决（§9.4 迁移表·非法 → 409·不存在 → null 转 404）。成功后**硬删该用户全部 session 行**
 * （D4 session 模式即时失权·§159）→ 当前请求立刻 401；deny-list 守卫作纵深防御拦重登。
 * 成败均落结构化审计（FR-6）。
 *
 * 架构精度修宪 S3：状态写与 session 删**同事务原子**——关键段包 `uow.run`（transition 内部
 * 的 uow.run 可重入复用外层），session 删经 `AUTH_SESSION_STORE` 端口（原 `em.nativeDelete`
 * 直捅 auth 表的越界写收编；适配器 fork() ALS 感知·事务内自动同 em）。删除失败 → 状态写
 * 一并回滚，不再留「已 suspend 但 session 仍活」窗口。
 * @public
 */
@CommandHandler(SuspendUserCommand)
export class SuspendUserCommandHandler implements ICommandHandler<SuspendUserCommand> {
  constructor(
    @Inject(UserStatusService) private readonly status: UserStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUTH_SESSION_STORE) private readonly sessions: AuthSessionStore,
  ) {}

  /**
   * 执行暂停：同事务内迁移态 + 删 session；非法 → 409；查无 → null；成败均落审计。
   * @param command - 携带用户 id/操作者/可选原因的命令。
   * @returns 治理结果（用户 id + 新态）；查无为 `null`。
   */
  async execute(command: SuspendUserCommand): Promise<UserGovernanceResult | null> {
    const result = await this.uow.run(async () => {
      const r = await this.status.transition(command.userId, USER_STATUS.SUSPENDED, {
        reason: command.reason,
        actorId: command.operatorId,
      });
      if (r.kind !== 'ok') return r;
      // FR-10 immediate global 失权：invalidate every active session of the suspended user（同事务）。
      await this.sessions.deleteAllForUser(command.userId);
      return r;
    });
    if (result.kind === 'not-found') return null;
    if (result.kind === 'illegal') {
      await this.audit.logUserGovernance('suspend', command.userId, command.operatorId, {
        from: result.from,
        to: result.to,
        error: 'illegal_transition',
      });
      throw new ConflictException(
        `Illegal user transition: ${result.from ?? 'active'} -> ${result.to}`,
        { errorCode: ERROR_CODES.USER_ILLEGAL_TRANSITION },
      );
    }
    await this.audit.logUserGovernance('suspend', command.userId, command.operatorId, {
      from: result.previous,
      to: result.status,
      reason: command.reason,
    });
    return { userId: command.userId, status: result.status };
  }
}
