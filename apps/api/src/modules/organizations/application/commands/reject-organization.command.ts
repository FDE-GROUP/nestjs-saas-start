import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';

/**
 * 平台级动作（FR-11①·FR-6）：经营者驳回**pending 申请** → 硬删组织行（FK 级联清成员/邀请）。
 *
 * @remarks
 * S5 收紧：仅 `pending_approval` 可驳回（无状态存量记录视同 active 不可驳回 → 409；生效租的
 * 暂停/删除属治理端点）。目标不存在 → false（控制层转 404）。`operatorId` 供结构化审计。
 * @public
 */
export class RejectOrganizationCommand extends BaseCommand<boolean> {
  constructor(
    readonly organizationId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}
