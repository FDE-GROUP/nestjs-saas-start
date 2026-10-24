import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';

/**
 * PIPL 右-erase（C1 · FR-7）：硬删自然人用户行的 CQRS 命令。
 *
 * @remarks
 * PIPL right-to-erase (C1 · FR-7): hard-delete the natural-person user row.
 * `account` / `session` cascade; `consent` FK goes to null and is retained as
 * an anonymous audit trail (see schema.consent).
 *
 * Result is `void` — controller returns 204 on success.
 * @public
 */
export class DeleteUserCommand extends BaseCommand<void> {
  /**
   * @param userId - 待硬删的用户 id。
   */
  constructor(readonly userId: string) {
    super();
  }
}
