import type { components } from '@saas/api-client';
import { createWorkspaceSchema, updateWorkspaceSchema } from '@saas/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DangerButton, Feedback, Field, FormWrap, SubmitButton } from '../components/forms';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError, formatDate } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';
import { clientValidateFields } from '../lib/validation';

type WorkspacePageResponse = components['schemas']['WorkspacePageResponse'];
type WorkspaceItem = WorkspacePageResponse['items'][number];

export const Route = createFileRoute('/workspaces')({
  loader: async () => {
    await requireSession();
    const { data, error } = await api.GET('/api/v1/workspaces');
    if (error) {
      logApiError({ path: '/api/v1/workspaces', scope: 'workspaces' }, error);
      return { kind: 'error' as const, body: error };
    }
    return { kind: 'ok' as const, page: data?.data };
  },
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const result = Route.useLoaderData();
  const create = useAction();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    // 共享契约前置校验：slug 正则等格式原生 required 拦不住，本地即时逐字段拦截免无效往返。
    const fields = clientValidateFields(createWorkspaceSchema, { name, slug });
    if (Object.keys(fields).length > 0) {
      setFieldErr(fields);
      return;
    }
    setFieldErr({});
    const ok = await create.run({
      path: '/api/v1/workspaces',
      method: 'POST',
      scope: 'workspace.create',
      successMessage: `已创建「${name}」`,
      thunk: () => api.POST('/api/v1/workspaces', { body: { name, slug } }),
    });
    if (ok) {
      setName('');
      setSlug('');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspacesView page={result.page} />

      <section className="flex flex-col gap-3">
        <SectionHeading>新建 Workspace</SectionHeading>
        <FormWrap onSubmit={handleCreate}>
          <Field
            label="名称"
            name="name"
            value={name}
            onChange={setName}
            required
            error={fieldErr.name}
          />
          <Field
            label="Slug"
            name="slug"
            value={slug}
            onChange={setSlug}
            required
            error={fieldErr.slug}
          />
          <SubmitButton pending={create.pending}>创建</SubmitButton>
        </FormWrap>
        <Feedback error={create.error} success={create.success} />
      </section>

      {result.page?.items?.length ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>操作</SectionHeading>
          {result.page.items.map((ws) => (
            <WorkspaceRow key={ws.id} ws={ws} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

/** 单行 Workspace 的改名/删除操作。 */
function WorkspaceRow({ ws }: { ws: WorkspaceItem }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(ws.name);
  const [renameFieldErr, setRenameFieldErr] = useState<Record<string, string>>({});
  const rename = useAction();
  const del = useAction();

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const fields = clientValidateFields(updateWorkspaceSchema, { name: editName });
    if (Object.keys(fields).length > 0) {
      setRenameFieldErr(fields);
      return;
    }
    setRenameFieldErr({});
    const ok = await rename.run({
      path: `/api/v1/workspaces/${ws.id}`,
      method: 'PATCH',
      scope: 'workspace.rename',
      successMessage: '已重命名',
      thunk: () =>
        api.PATCH('/api/v1/workspaces/{id}', {
          params: { path: { id: ws.id } },
          body: { name: editName },
        }),
    });
    if (ok) setEditing(false);
  }

  async function handleDelete() {
    await del.run({
      path: `/api/v1/workspaces/${ws.id}`,
      method: 'DELETE',
      scope: 'workspace.delete',
      successMessage: `已删除「${ws.name}」`,
      thunk: () => api.DELETE('/api/v1/workspaces/{id}', { params: { path: { id: ws.id } } }),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm">
      {editing ? (
        <FormWrap onSubmit={handleRename} className="flex items-end gap-2">
          <Field
            label="新名称"
            name="editName"
            value={editName}
            onChange={setEditName}
            error={renameFieldErr.name}
          />
          <SubmitButton pending={rename.pending}>保存</SubmitButton>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            取消
          </button>
        </FormWrap>
      ) : (
        <span className="flex-1 font-medium text-slate-800">
          {ws.name}
          <span className="ml-2 text-xs text-slate-400">({ws.slug})</span>
        </span>
      )}
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-blue-600 hover:underline"
        >
          改名
        </button>
      )}
      <DangerButton pending={del.pending} onClick={handleDelete}>
        删除
      </DangerButton>
      <Feedback error={rename.error ?? del.error} success={rename.success ?? del.success} />
    </div>
  );
}

/** 纯展示（收 typed 分页形·可脱离 router 组件测：typed 渲染 / 空态）。 */
export function WorkspacesView({ page }: { page?: WorkspacePageResponse }) {
  const items = page?.items ?? [];
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>Workspaces</SectionHeading>
      {page ? (
        <p className="text-xs text-slate-400">
          共 {page.total} 条 · 页宽 {page.limit} · 偏移 {page.offset}
        </p>
      ) : null}
      {items.length === 0 ? (
        <EmptyPanel label="当前租户下暂无 workspace。" />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">名称</th>
              <th className="py-2 pr-4 font-medium">Slug</th>
              <th className="py-2 pr-4 font-medium">所属租户</th>
              <th className="py-2 font-medium">创建日期</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ws) => (
              <tr key={ws.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 font-medium text-slate-800">{ws.name}</td>
                <td className="py-2 pr-4 text-slate-600">{ws.slug}</td>
                <td className="py-2 pr-4 text-slate-600">{ws.organizationId}</td>
                <td className="py-2 text-slate-600">{formatDate(ws.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
