import {
  USER_STATUS,
  UserStatusService,
} from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { UserGovernanceResult } from '../../read-models/platform-user.read-model';
import { ResumeUserCommand } from '../resume-user.command';

/**
 * 恢复平台用户 handler（FR-10/FR-6·平台级）：`suspended → active`，撤去 deny-list 失能。
 *
 * @remarks
 * 恢复不重建
 * session（用户须自行重登）→ 无副作用。非法迁移 → 409；不存在 → null（404）。成败均落审计（FR-6）。
 * @public
 */
@CommandHandler(ResumeUserCommand)
export class ResumeUserCommandHandler implements ICommandHandler<ResumeUserCommand> {
  constructor(
    @Inject(UserStatusService) private readonly status: UserStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

  /**
   * 执行恢复迁移；非法 → 409；查无 → null；成败均落审计。
   * @param command - 携带用户 id 与操作者的命令。
   * @returns 治理结果（用户 id + 新态）；查无为 `null`。
   *
   * @throws {ConflictException} 用户生命周期迁移非法时。
   */
  async execute(command: ResumeUserCommand): Promise<UserGovernanceResult | null> {
    const result = await this.status.transition(command.userId, USER_STATUS.ACTIVE, {
      actorId: command.operatorId,
    });
    if (result.kind === 'not-found') return null;
    if (result.kind === 'illegal') {
      await this.audit.logUserGovernance('resume', command.userId, command.operatorId, {
        from: result.from,
        to: result.to,
        error: 'illegal_transition',
      });
      throw new ConflictException(
        `Illegal user transition: ${result.from ?? 'active'} -> ${result.to}`,
        { errorCode: ERROR_CODES.USER_ILLEGAL_TRANSITION },
      );
    }
    await this.audit.logUserGovernance('resume', command.userId, command.operatorId, {
      from: result.previous,
      to: result.status,
    });
    return { userId: command.userId, status: result.status };
  }
}
