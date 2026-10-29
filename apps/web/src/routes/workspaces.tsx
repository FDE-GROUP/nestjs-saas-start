import { createWorkspaceSchema, updateWorkspaceSchema, type WorkspacePage } from '@saas/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DangerButton, Feedback, Field, FormWrap, SubmitButton } from '../components/forms';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { rpc } from '../lib/api';
import { describeApiError, formatDate } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';
import { clientValidateFields } from '../lib/validation';

type WorkspacePageResponse = WorkspacePage;
type WorkspaceItem = WorkspacePageResponse['items'][number];

export const Route = createFileRoute('/workspaces')({
  loader: async () => {
    await requireSession();
    try {
      // 【换轨 B-6】oRPC typed 客户端：直接回拆封后的分页载荷（无 {data,error} 组·错误抛 ORPCError）。
      const page = await rpc.workspaces.list({});
      return { kind: 'ok' as const, page: page as unknown as WorkspacePageResponse };
    } catch (e) {
      logApiError({ path: '/api/v1/workspaces', scope: 'workspaces' }, e);
      return { kind: 'error' as const, body: e };
    }
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
      thunk: () => rpc.workspaces.create({ name, slug }),
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
        <SectionHeading>新建工作区</SectionHeading>
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
      thunk: () => rpc.workspaces.update({ id: ws.id, name: editName }),
    });
    if (ok) setEditing(false);
  }

  async function handleDelete() {
    await del.run({
      path: `/api/v1/workspaces/${ws.id}`,
      method: 'DELETE',
      scope: 'workspace.delete',
      successMessage: `已删除「${ws.name}」`,
      thunk: () => rpc.workspaces.remove({ id: ws.id }),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
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
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            取消
          </button>
        </FormWrap>
      ) : (
        <span className="flex-1 font-medium text-slate-800 dark:text-slate-100">
          {ws.name}
          <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">({ws.slug})</span>
        </span>
      )}
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
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
      <SectionHeading>工作区</SectionHeading>
      {page ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          共 {page.total} 条 · 页宽 {page.limit} · 偏移 {page.offset}
        </p>
      ) : null}
      {items.length === 0 ? (
        <EmptyPanel label="当前组织下暂无工作区。" />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">名称</th>
              <th className="py-2 pr-4 font-medium">Slug</th>
              <th className="py-2 pr-4 font-medium">所属组织</th>
              <th className="py-2 font-medium">创建日期</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ws) => (
              <tr key={ws.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                  {ws.name}
                </td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{ws.slug}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                  {ws.organizationId}
                </td>
                <td className="py-2 text-slate-600 dark:text-slate-300">
                  {formatDate(ws.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
