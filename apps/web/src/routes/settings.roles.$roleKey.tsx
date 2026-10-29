import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Feedback } from '../components/forms';
import { OrganizationContextGuidePanel } from '../components/organization-context-guide';
import { ErrorPanel, SectionHeading } from '../components/panels';
import {
  type AuthorizationAction,
  type AuthorizationSubject,
  cellKey,
  RbacMatrix,
} from '../components/rbac-matrix';
import { rpc } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { probeOrganizationContext } from '../lib/organization-context-guide';
import { requireSession } from '../lib/session';

/**
 * 权限矩阵页（前端 F3 · module-frontend-rbac-admin §2.2·A2）。
 * loader 校验 roleKey 存在（防 ghost）并取当前授权行；toggle 即调 grant/revoke（whole-subject·待裁点③甲）。
 * 成功 → router.invalidate 重载矩阵；失败 → describeApiError 展示 + 灰格回弹。
 */
export const Route = createFileRoute('/settings/roles/$roleKey')({
  loader: async ({ params }) => {
    await requireSession();
    const roleKey = params.roleKey;
    let roles: Awaited<ReturnType<typeof rpc.organizations.roles.list>>;
    try {
      roles = await rpc.organizations.roles.list();
    } catch (e) {
      logApiError({ path: '/api/v1/organizations/roles', scope: 'role.matrix' }, e);
      const guide = await probeOrganizationContext(e);
      if (guide) return { kind: 'guide' as const, guide: guide.hasMemberships };
      return { kind: 'error' as const, body: describeApiError(e) };
    }
    const role = (roles ?? []).find((r) => r.key === roleKey);
    if (!role) {
      return { kind: 'notFound' as const, roleKey };
    }
    try {
      const grants = await rpc.organizations.roles.grants.list({ roleKey });
      return { kind: 'ok' as const, role, grants };
    } catch (e) {
      logApiError({ path: '/api/v1/organizations/roles/grants', scope: 'role.matrix' }, e);
      return { kind: 'error' as const, body: describeApiError(e) };
    }
  },
  component: RoleMatrixPage,
});

function RoleMatrixPage() {
  const result = Route.useLoaderData();
  const action = useAction();
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  if (result.kind === 'guide')
    return <OrganizationContextGuidePanel hasMemberships={result.guide} />;
  if (result.kind === 'error') return <ErrorPanel message={result.body} />;
  if (result.kind === 'notFound') return <ErrorPanel message={`角色不存在：${result.roleKey}`} />;

  // 早返已把 result 收敛到 ok 分支；抽本地 const 供 handleToggle 闭包稳定消费。
  const { role, grants } = result;

  async function handleToggle(
    subject: AuthorizationSubject,
    actionName: AuthorizationAction,
    currentlyGranted: boolean,
  ) {
    const key = cellKey(subject, actionName);
    setPendingCell(key);
    try {
      if (currentlyGranted) {
        await action.run({
          path: '/api/v1/organizations/roles/grants/revoke',
          method: 'POST',
          scope: 'role.revoke',
          successMessage: `已撤销 ${subject}:${actionName}`,
          thunk: () =>
            rpc.organizations.roles.grants.revoke({
              roleKey: role.key,
              subject,
              action: actionName,
            }),
        });
      } else {
        await action.run({
          path: '/api/v1/organizations/roles/grants',
          method: 'POST',
          scope: 'role.grant',
          successMessage: `已授予 ${subject}:${actionName}`,
          thunk: () =>
            rpc.organizations.roles.grants.grant({
              roleKey: role.key,
              subject,
              action: actionName,
            }),
        });
      }
    } finally {
      setPendingCell(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeading>权限矩阵</SectionHeading>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          角色：{role.name}（key：{role.key}）
          {role.isSystem && ' · 系统角色（授权可调整，名称受保护）'}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <RbacMatrix grants={grants} pendingCell={pendingCell} onToggle={handleToggle} />
        <Feedback error={action.error} success={action.success} />
      </section>
    </div>
  );
}
