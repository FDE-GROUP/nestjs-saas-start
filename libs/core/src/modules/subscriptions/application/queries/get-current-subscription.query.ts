import { BaseQuery } from '../../../../shared-kernel/cqrs/types';
import type { OrganizationSubscriptionView } from '../read-models/subscription.read-model';

/**
 * 读当前活跃租户的订阅档位/用量/映射命令（S7 · FR-7/FR-8 读侧）。
 *
 * @remarks
 * 无租户 arg——由 query handler 从 ALS 上下文取活跃租户（port/adapter 单点·FR-5）；
 * 访问裁决由 controller 侧 `TenantIsolationGuard` 前置把守（fail-closed：无活跃租户 → 403）。
 *
 * @public
 */
export class GetSubscriptionQuery extends BaseQuery<OrganizationSubscriptionView> {}
