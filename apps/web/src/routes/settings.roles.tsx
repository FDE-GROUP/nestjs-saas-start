import { createFileRoute, Link, Outlet, useMatchRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DangerButton, Feedback, Field, FormWrap, SubmitButton } from '../components/forms';
import { OrganizationContextGuidePanel } from '../components/organization-context-guide';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { probeOrganizationContext } from '../lib/organization-context-guide';
import { requireSession } from '../lib/session';

/**
 * 角色管理面（前端 F3 · module-frontend-rbac-admin §2.2·A1）。
 * 列表（系统 + 自定义）+ 新建/改名/删除；行内链至权限矩阵页 `/settings/roles/$roleKey`。
 * 系统角色（isSystem）改名/删除按钮 disable（前端防御 + 后端 409 兜底双保险）。
 */
type TenantRoleView = import('@saas/api-client').components['schemas']['TenantRoleViewResponse'];

export const Route = createFileRoute('/settings/roles')({
  loader: async () => {
    await requireSession();
    const { data, error } = await api.GET('/api/v1/organizations/roles');
    if (error) {
      logApiError({ path: '/api/v1/organizations/roles', scope: 'roles' }, error);
      const guide = await probeOrganizationContext(error);
      if (guide) return { kind: 'guide' as const, guide };
      return { kind: 'error' as const, body: error };
    }
    return { kind: 'ok' as const, roles: data?.data ?? [] };
  },
  component: RolesPage,
});

function RolesPage() {
  const result = Route.useLoaderData();
  const create = useAction();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const matchRoute = useMatchRoute();

  // 权限矩阵页 `/settings/roles/$roleKey` 是本路由的文件式子路由——命中子路由时交由 Outlet 委托渲染
  // （镜像 platform.tenants.tsx L54；缺此委托则子页永不挂载·见 module-frontend-roles-outlet-delegation）。
  if (matchRoute({ to: '/settings/roles/$roleKey' })) return <Outlet />;

  if (result.kind === 'guide')
    return <OrganizationContextGuidePanel hasMemberships={result.guide.hasMemberships} />;
  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const ok = await create.run({
      path: '/api/v1/organizations/roles',
      method: 'POST',
      scope: 'role.create',
      successMessage: `已创建角色「${name}」`,
      thunk: () => api.POST('/api/v1/organizations/roles', { body: { key, name } }),
    });
    if (ok) {
      setKey('');
      setName('');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <RolesView roles={result.roles} />

      <section className="flex flex-col gap-3">
        <SectionHeading>新建自定义角色</SectionHeading>
        <FormWrap onSubmit={handleCreate}>
          <Field label="Key（组织内唯一）" name="key" value={key} onChange={setKey} required />
          <Field label="名称" name="name" value={name} onChange={setName} required />
          <SubmitButton pending={create.pending}>创建</SubmitButton>
        </FormWrap>
        <Feedback error={create.error} success={create.success} />
      </section>

      {result.roles.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading>操作</SectionHeading>
          {result.roles.map((r) => (
            <RoleRow key={r.id} role={r} />
          ))}
        </section>
      )}
    </div>
  );
}

/** 单角色的改名/删除操作（系统角色保护）。 */
function RoleRow({ role }: { role: TenantRoleView }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(role.name);
  const rename = useAction();
  const del = useAction();

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const ok = await rename.run({
      path: '/api/v1/organizations/roles/rename',
      method: 'POST',
      scope: 'role.rename',
      successMessage: '已重命名',
      thunk: () =>
        api.POST('/api/v1/organizations/roles/rename', { body: { key: role.key, name: editName } }),
    });
    if (ok) setEditing(false);
  }

  async function handleDelete() {
    await del.run({
      path: '/api/v1/organizations/roles/delete',
      method: 'POST',
      scope: 'role.delete',
      successMessage: `已删除「${role.name}」`,
      thunk: () => api.POST('/api/v1/organizations/roles/delete', { body: { key: role.key } }),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
      {editing ? (
        <FormWrap onSubmit={handleRename} className="flex items-end gap-2">
          <Field label="新名称" name="editName" value={editName} onChange={setEditName} />
          <SubmitButton pending={rename.pending}>保存</SubmitButton>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            取消
          </button>
        </FormWrap>
      ) : (
        <span className="flex-1 font-medium text-slate-800 dark:text-slate-100">
          {role.name}
          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">({role.key})</span>
          {role.isSystem && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              系统
            </span>
          )}
        </span>
      )}
      {!editing && (
        <>
          <Link
            to="/settings/roles/$roleKey"
            params={{ roleKey: role.key }}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            权限矩阵
          </Link>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={role.isSystem}
            title={role.isSystem ? '系统角色受保护' : undefined}
            className="text-xs text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline dark:text-blue-400 dark:disabled:text-slate-600"
          >
            改名
          </button>
        </>
      )}
      <DangerButton pending={del.pending} onClick={handleDelete}>
        <span aria-hidden={role.isSystem} title={role.isSystem ? '系统角色不可删除' : undefined}>
          删除
        </span>
      </DangerButton>
      <Feedback error={rename.error ?? del.error} success={rename.success ?? del.success} />
    </div>
  );
}

/** 纯展示（收 typed 角色数组·可脱离 router 组件测：typed 渲染 / 空态 / 系统标记）。 */
export function RolesView({ roles }: { roles?: TenantRoleView[] }) {
  const list = roles ?? [];
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>角色</SectionHeading>
      {list.length === 0 ? (
        <EmptyPanel label="当前组织暂无角色数据。" />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">名称</th>
              <th className="py-2 pr-4 font-medium">Key</th>
              <th className="py-2 font-medium">类型</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                  {r.name}
                </td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{r.key}</td>
                <td className="py-2 text-slate-600 dark:text-slate-300">
                  {r.isSystem ? '系统' : '自定义'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
