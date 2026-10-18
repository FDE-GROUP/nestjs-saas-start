import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Feedback } from '../components/forms';
import { ErrorPanel, SectionHeading } from '../components/panels';
import {
  cellKey,
  RbacMatrix,
  type TenantAction,
  type TenantSubject,
} from '../components/rbac-matrix';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
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
    const { data: rolesData, error: rolesError } = await api.GET('/api/v1/tenants/roles');
    if (rolesError) {
      logApiError({ path: '/api/v1/tenants/roles', scope: 'role.matrix' }, rolesError);
      return { kind: 'error' as const, body: describeApiError(rolesError) };
    }
    const role = (rolesData?.data ?? []).find((r) => r.key === roleKey);
    if (!role) {
      return { kind: 'notFound' as const, roleKey };
    }
    const { data: grantsData, error: grantsError } = await api.GET('/api/v1/tenants/roles/grants', {
      params: { query: { roleKey } },
    });
    if (grantsError) {
      logApiError({ path: '/api/v1/tenants/roles/grants', scope: 'role.matrix' }, grantsError);
      return { kind: 'error' as const, body: describeApiError(grantsError) };
    }
    return { kind: 'ok' as const, role, grants: grantsData?.data ?? [] };
  },
  component: RoleMatrixPage,
});

function RoleMatrixPage() {
  const result = Route.useLoaderData();
  const action = useAction();
  const [pendingCell, setPendingCell] = useState<string | null>(null);

  if (result.kind === 'error') return <ErrorPanel message={result.body} />;
  if (result.kind === 'notFound') return <ErrorPanel message={`角色不存在：${result.roleKey}`} />;

  // 早返已把 result 收敛到 ok 分支；抽本地 const 供 handleToggle 闭包稳定消费。
  const { role, grants } = result;

  async function handleToggle(
    subject: TenantSubject,
    actionName: TenantAction,
    currentlyGranted: boolean,
  ) {
    const key = cellKey(subject, actionName);
    setPendingCell(key);
    try {
      if (currentlyGranted) {
        await action.run({
          path: '/api/v1/tenants/roles/grants/revoke',
          method: 'POST',
          scope: 'role.revoke',
          successMessage: `已撤销 ${subject}:${actionName}`,
          thunk: () =>
            api.POST('/api/v1/tenants/roles/grants/revoke', {
              body: { roleKey: role.key, subject, action: actionName },
            }),
        });
      } else {
        await action.run({
          path: '/api/v1/tenants/roles/grants',
          method: 'POST',
          scope: 'role.grant',
          successMessage: `已授予 ${subject}:${actionName}`,
          thunk: () =>
            api.POST('/api/v1/tenants/roles/grants', {
              body: { roleKey: role.key, subject, action: actionName },
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
        <p className="text-xs text-slate-500">
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
