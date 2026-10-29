/**
 * platform-users 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 平台操作员用户治理切片（多租户 S6）：列全平台用户 + 暂停/恢复。全线 `PlatformOperatorGuard`（唯一跨平台权威·
 * fail-closed）·故意无租户作用域——守卫留 apps/api。`:id` 路径参经紧凑 input 合并（suspend body⊕id·resume 纯参）。
 * in-handler `NotFoundException`（USER_NOT_FOUND）经 WP-D 承接。
 */
import {
  listPlatformUsersQuerySchema,
  platformUserIdParamSchema,
  platformUserPageSchema,
  suspendUserInputSchema,
  userGovernanceResultSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const platformUsersListMeta = openapi({
  method: 'GET',
  path: '/platform/users',
  summary: 'List all platform users with lifecycle status (operator only)',
});
export const platformUsersSuspendMeta = openapi({
  method: 'PATCH',
  path: '/platform/users/:id/suspend',
  summary: 'Suspend a platform user (active → suspended · sessions invalidated · fail-closed失能)',
});
export const platformUsersResumeMeta = openapi({
  method: 'PATCH',
  path: '/platform/users/:id/resume',
  summary: 'Resume a suspended platform user (suspended → active)',
});

export const platformUsersListContract = oc
  .input(listPlatformUsersQuerySchema)
  .output(platformUserPageSchema)
  .meta(platformUsersListMeta);
export const platformUsersSuspendContract = oc
  .input(suspendUserInputSchema)
  .output(userGovernanceResultSchema)
  .meta(platformUsersSuspendMeta);
export const platformUsersResumeContract = oc
  .input(platformUserIdParamSchema)
  .output(userGovernanceResultSchema)
  .meta(platformUsersResumeMeta);
