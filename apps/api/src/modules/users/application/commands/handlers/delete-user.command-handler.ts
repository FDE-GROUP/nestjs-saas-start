import {
  AUTH_USER_STORE,
  type AuthUserStore,
} from '@app/modules/auth/domain/ports/user-store.port';
import { EVENT_STORE, type EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { USER_REPOSITORY, type UserRepository } from '../../../domain/repositories/user.repository';
import { DeleteUserCommand } from '../delete-user.command';

/**
 * PIPL 右-erase 命令处理器：经 auth 域端口硬删用户行并补删其事件台账。
 *
 * @remarks
 * 写面归位属主（切片 A：user 表归 auth）；event 表无 FK，该用户全部事件行由应用层显式补删，
 * 失败 fail-loud（PIPL 不留残迹）。
 * @public
 */
@CommandHandler(DeleteUserCommand)
export class DeleteUserCommandHandler implements ICommandHandler<DeleteUserCommand, void> {
  private readonly logger = new Logger(DeleteUserCommandHandler.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    // PIPL 硬删经 auth 域端口（切片 A：user 表归 auth·台账例外清零·S3 同型收编）。
    @Inject(AUTH_USER_STORE) private readonly userStore: AuthUserStore,
    // PIPL 级联补删（ES 第二切片 §3.2）：直注 EVENT_STORE，不受 EVENT_PUBLISH_MODE 开关控制——
    // 表在就要清；失败 fail-loud（PIPL 不留残迹）。S9 教训：显式 @Inject + 值导入。
    @Inject(EVENT_STORE) private readonly eventStore: EventStore,
  ) {}

  /**
   * 执行硬删：用户查无 → 404；命中则经属主端口删除并清理事件行。
   * @param command - 携带待删用户 id 的命令。
   * @returns 删除完成的 Promise（无返回量）。
   *
   * @throws {NotFoundException} 指定 userId 的用户不存在时。
   */
  async execute(command: DeleteUserCommand): Promise<void> {
    const existing = await this.users.findById(command.userId);
    if (!existing) {
      throw new NotFoundException(`User with ID ${command.userId} not found`, {
        errorCode: ERROR_CODES.USER_NOT_FOUND,
      });
    }
    // Hard delete (PIPL). FK cascades handle account/session; consent is set-null by schema.
    // （经 auth 域端口·逐字同旧 remove 语义·写面归位属主。）
    await this.userStore.hardDelete(command.userId);
    // event 表无 FK（shadow append 设），该用户的全部事件行由应用层显式补删。
    const purgedEvents = await this.eventStore.deleteByAggregate('user', command.userId);
    this.logger.log(
      `Deleted user ${command.userId} (PIPL right-to-erase; purged ${purgedEvents} event rows)`,
    );
  }
}
