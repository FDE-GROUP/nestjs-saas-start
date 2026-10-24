import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { OrganizationApplicationReadModel } from '../read-models/organization-application.read-model';

/**
 * 用户级能力（FR-11③·申请创建租户）：已注册平台 user 申请开通新租户。
 *
 * @remarks
 * 落 pending 组织、经审批方生效（FR-1·不得自助即时开通）。`userId` = 申请人（会话主体），
 * 由控制层从 SessionGuard 附着的当前用户注入，非请求体可伪造字段。
 * @public
 */
export class SubmitOrganizationApplicationCommand extends BaseCommand<OrganizationApplicationReadModel> {
  constructor(
    readonly userId: string,
    readonly name: string,
    readonly slug: string,
  ) {
    super();
  }
}
