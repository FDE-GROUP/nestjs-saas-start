import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { TenantHardDeleteResult } from '../read-models/tenant-governance.read-model';

/**
 * 平台级动作（FR-11①·FR-6·NFR-6 删除半）：经营者对**已 deleted 终态**租户执行不可逆连带消灭。
 *
 * @remarks
 * 治理台改锚 tenant（rehierarchy 片一）：硬删作用于**租户**——先补删该租户 + 其名下每组织的 lifecycle 事件、
 * 后连带清除该租户名下所有组织行（各子表 FK cascade 自动消灭）+ 名下订阅行 + 租户本体（plan §3.1 顺序论证：
 * 任意一步失败均可整请求重试不留不可达残迹）。非 deleted 态 → 409（前置闸·两段式先软后硬）；不存在/已被硬删 → null（404 幂等）。
 * @public
 */
export class DeleteOrganizationPermanentlyCommand extends BaseCommand<TenantHardDeleteResult | null> {
  constructor(
    readonly tenantId: string,
    readonly operatorId: string,
  ) {
    super();
  }
}
