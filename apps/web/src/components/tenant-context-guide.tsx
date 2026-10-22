import { Link } from '@tanstack/react-router';
import { SectionHeading } from './panels';

/**
 * 缺活跃租户引导面板（module-frontend-tenant-admin-guide）：租户边界管理页 403
 * `TENANCY:NO_ACTIVE_CONTEXT` 时替死胡同错误原文给可操作出路——两态统一指回
 * dashboard 唯一引导 SSOT（零组织→申请/等邀请；有组织未激活→「我的租户」切换），
 * 不在本页内联申请表单（防双引导面漂移）。纯展示·可脱离 router loader 镜测。
 */
export function TenantContextGuidePanel({ hasMemberships }: { hasMemberships: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-900">
      <SectionHeading>无活跃组织</SectionHeading>
      {hasMemberships ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          你已有组织成员身份，但尚未激活任一组织，管理页暂不可入。请到首页「我的组织」切换。
        </p>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          你尚未加入任何组织。请到首页提交组织申请（待平台审批），或等待管理员邀请入组。
        </p>
      )}
      <Link to="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        前往首页
      </Link>
    </div>
  );
}
