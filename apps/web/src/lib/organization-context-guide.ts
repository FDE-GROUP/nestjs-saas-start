import { ERROR_CODES } from '@saas/api-client';
import { rpc } from './api';
import { apiErrorDetail } from './format';

/**
 * 缺活跃租户 403 判别探测（module-frontend-organization-admin-guide）：租户边界管理页
 * loader 错误分支统一接此——非 `ISOLATION:NO_ACTIVE_CONTEXT` 返回 `null`（调用方维持
 * ErrorPanel 原文，语义不变）；命中则补一次廉价 `organizations.list` 分两态
 * （零组织 vs 有组织未激活），探测自身失败保守归零组织态（不阻塞渲染）。
 * 判别走 `describeApiError` 同源提码文案里的 `errorCode`——实为 @core 单源
 * `errorCodeOf`（经 format 层）·码引用常量零手打。
 */
export type OrganizationContextGuide = { hasMemberships: boolean };

// 码引用 @core 单源表（经 api-client re-export）·零手打字面量。
const NO_ACTIVE_CONTEXT_CODE = ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT;

export async function probeOrganizationContext(
  body: unknown,
): Promise<OrganizationContextGuide | null> {
  // 复用 format 的 apiErrorDetail（其内 errorCodeOf 单源提码），不另起第二判别路径。
  const detail = apiErrorDetail(body);
  if (detail.errorCode !== NO_ACTIVE_CONTEXT_CODE) {
    return null;
  }
  try {
    const list = (await rpc.organizations.list()) as unknown;
    return { hasMemberships: Array.isArray(list) ? list.length > 0 : false };
  } catch {
    return { hasMemberships: false };
  }
}
