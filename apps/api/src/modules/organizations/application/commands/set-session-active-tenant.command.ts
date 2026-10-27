import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { ActiveTenantResult } from '@saas/contracts/index';

/**
 * 用户级动作（第三次层级复裁 切片 4·D7 租户激活解绑）：把当前会话的**活动租户**切至 `tenantId`。
 *
 * @remarks
 * 选租**不依赖先选活动组织**——令租成员在无活动 org 时亦可建立租上下文以达租级端点（计费/席位/目录）。
 * `sessionId` 由 `SessionGuard` 从已验签 BA 会话挂上（可信·与 userId 同处）；`userId` 供成员资格校验
 * （非目标租户成员 → handler 抛 403·fail-closed）。写会话真列经 `AUTH_SESSION_STORE` 属主端口（不绕行直捅 entity）。
 * @public
 */
export class SetSessionActiveTenantCommand extends BaseCommand<ActiveTenantResult | null> {
  constructor(
    readonly userId: string,
    readonly sessionId: string,
    readonly tenantId: string,
  ) {
    super();
  }
}
