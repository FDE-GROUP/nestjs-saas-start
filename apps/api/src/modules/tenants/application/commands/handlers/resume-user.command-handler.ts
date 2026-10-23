import {
  USER_STATUS,
  UserStatusService,
} from '@core/saas-kit/modules/tenants/lifecycle/user-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { UserGovernanceResult } from '../../read-models/platform-user.read-model';
import { ResumeUserCommand } from '../resume-user.command';

/**
 * 恢复平台用户（FR-10/FR-6·平台级）：`suspended → active`，撤去 deny-list 失能。恢复不重建
 * session（用户须自行重登）→ 无副作用。非法迁移 → 409；不存在 → null（404）。成败均落审计（FR-6）。
 */
@CommandHandler(ResumeUserCommand)
export class ResumeUserCommandHandler implements ICommandHandler<ResumeUserCommand> {
  constructor(
    @Inject(UserStatusService) private readonly status: UserStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
  ) {}

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
