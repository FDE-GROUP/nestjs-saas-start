import {
  AUTH_SESSION_STORE,
  type AuthSessionStore,
} from '@app/modules/auth/domain/ports/session-store.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ForbiddenException, Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { ActiveTenantResult } from '@saas/contracts/index';
import {
  TENANT_DIRECTORY_REPOSITORY,
  type TenantDirectoryRepository,
} from '../../../domain/repositories/tenant-directory.repository';
import { SetSessionActiveTenantCommand } from '../set-session-active-tenant.command';

/**
 * 会话活动租户设置 handler（第三次层级复裁 切片 4·D7 租户激活解绑）。
 *
 * @remarks
 * **安全底线**：写会话 `activeTenantId` 前必校「当前用户是目标租户成员」——复用租户目录读面
 * `listForUser`（成员资格唯一 SSOT：user ∈ 某 org 成员 且 该 org 派生租户==目标）作准入闸，非成员
 * 一律 fail-closed 403（防把会话活动租切至他租而绕过跨租硬地板）。校验通过后经 `AUTH_SESSION_STORE`
 * 属主端口写会话真列（适配器同时清 `activeOrganizationId`·选租与选 org 互斥不混绑）。会话行查无 →
 * null（控制层转 401）。本 handler 不改租户生命周期态、不裁决 org 级角色——仅租级激活位落库。
 * @public
 */
@CommandHandler(SetSessionActiveTenantCommand)
export class SetSessionActiveTenantCommandHandler
  implements ICommandHandler<SetSessionActiveTenantCommand>
{
  constructor(
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入（Symbol 端口）。
    @Inject(TENANT_DIRECTORY_REPOSITORY)
    private readonly directory: TenantDirectoryRepository,
    @Inject(AUTH_SESSION_STORE) private readonly sessions: AuthSessionStore,
  ) {}

  /**
   * 执行租级激活。
   * @param command - 携 userId / sessionId / 目标 tenantId 的命令。
   * @returns 激活回执；会话行查无为 `null`。
   * @throws {ForbiddenException} 非目标租户成员时（fail-closed·防跨租提权）。
   */
  async execute(command: SetSessionActiveTenantCommand): Promise<ActiveTenantResult | null> {
    // 成员资格闸：目标租户必须在当前用户可见目录内（SSOT·绝不信任未校验的 tenantId 直落会话）。
    const visible = await this.directory.listForUser(command.userId);
    const isMember = visible.some((entry) => entry.tenantId === command.tenantId);
    if (!isMember)
      throw new ForbiddenException('Not a member of the target tenant', {
        errorCode: ERROR_CODES.AUTHZ_PERMISSION_DENIED,
      });
    const affected = await this.sessions.setActiveTenant(command.sessionId, command.tenantId);
    if (!affected) return null;
    return { tenantId: command.tenantId };
  }
}
