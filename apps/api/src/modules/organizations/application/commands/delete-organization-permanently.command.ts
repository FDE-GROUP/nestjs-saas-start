import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';

/** 硬删结果（丁裁：200+purgedEvents 供审计核对）。 */
export interface OrganizationHardDeleteResult {
  organizationId: string;
  purgedEvents: number;
}

/**
 * 平台级动作（FR-11①·FR-6·NFR-6 删除半）：经营者对**已 deleted 终态**租户执行不可逆消灭——
 * 先补删 tenant lifecycle 事件、后删 organization 主行（五张子表 FK cascade 自动消灭），
 * 任意一步失败均可整请求重试不留不可达残迹（plan §3.1 顺序论证）。
 * 非 deleted 态 → 409（前置闸·两段式先软后硬）；不存在/已被硬删 → null（404 幂等）。
 */
export class DeleteOrganizationPermanentlyCommand extends BaseCommand<OrganizationHardDeleteResult | null> {
  constructor(
    readonly organizationId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}
