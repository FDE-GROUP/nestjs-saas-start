import type { components } from '@saas/api-client';
import { createFileRoute } from '@tanstack/react-router';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError, formatDate } from '../lib/format';
import { logApiError } from '../lib/log';
import { requireSession } from '../lib/session';

type WorkspacePageResponse = components['schemas']['WorkspacePageResponse'];

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
  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;
  return <WorkspacesView page={result.page} />;
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
