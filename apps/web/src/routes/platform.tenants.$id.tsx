import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorPanel, SectionHeading } from '../components/panels';
import { StatusBadge, TenantActions } from '../components/platform-tenants';
import { api } from '../lib/api';
import { apiErrorDetail, describeApiError, formatDate } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';

export const Route = createFileRoute('/platform/tenants/$id')({
  loader: async ({ params }) => {
    await requireSession();
    const id = params.id;
    const { data, error } = await api.GET('/api/v1/platform/tenants/{id}', {
      params: { path: { id } },
    });
    if (error) {
      logApiError(
        { path: `/api/v1/platform/tenants/${id}`, scope: 'platform.tenant.detail' },
        error,
      );
      return {
        kind: 'error' as const,
        denied: apiErrorDetail(error).statusCode === 403,
        body: describeApiError(error),
      };
    }
    const tenant = data?.data ?? null;
    if (!tenant) return { kind: 'notFound' as const, id };
    const { data: diagData, error: diagError } = await api.GET(
      '/api/v1/platform/tenants/{id}/diagnostics',
      { params: { path: { id } } },
    );
    if (diagError) {
      logApiError(
        { path: `/api/v1/platform/tenants/${id}/diagnostics`, scope: 'platform.tenant.diag' },
        diagError,
      );
    }
    return { kind: 'ok' as const, tenant, diag: diagData?.data ?? null };
  },
  component: TenantDetailPage,
});

function TenantDetailPage() {
  const result = Route.useLoaderData();
  const action = useAction();
  const navigate = useNavigate();
  // 硬删不可逆：需键入 slug 才解禁（裁③甲·后端另要求先软删·双闸）。
  const [hardInput, setHardInput] = useState('');
  const [hardHint, setHardHint] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  if (result.kind === 'error') {
    return <ErrorPanel message={result.denied ? `无平台运营权限：${result.body}` : result.body} />;
  }
  if (result.kind === 'notFound') return <ErrorPanel message={`组织不存在：${result.id}`} />;

  const { tenant, diag } = result;
  const id = tenant.organizationId;
  const armed = hardInput === tenant.slug;

  async function doTransition(
    verb: 'suspend' | 'resume',
    path: string,
    scope: string,
    success: string,
  ) {
    await action.run({
      path,
      method: 'PATCH',
      scope,
      successMessage: success,
      thunk: () =>
        verb === 'suspend'
          ? api.PATCH('/api/v1/platform/tenants/{id}/suspend', { params: { path: { id } } })
          : api.PATCH('/api/v1/platform/tenants/{id}/resume', { params: { path: { id } } }),
    });
  }

  // 审批通过（epic-02 §2.2 · 非破坏）：pending→active ·无确认 · 成功经 action.run 里 router.invalidate() 重载详情。
  async function doApprove() {
    await action.run({
      path: `/api/v1/tenants/applications/${id}/approve`,
      method: 'POST',
      scope: 'platform.tenant.approve',
      successMessage: '已通过审批（pending→active）',
      thunk: () =>
        api.POST('/api/v1/tenants/applications/{id}/approve', { params: { path: { id } } }),
    });
  }

  // 驳回（epic-02 §2.3 · reject=物理硬删·不可逆）：确认后才发 · 成功后 org 行消失→跳列表避免详情 404。
  async function doReject() {
    if (!window.confirm('驳回将不可逆硬删该待审批组织（reject=物理删除 · FK 级联），确认？'))
      return;
    const ok = await action.run({
      path: `/api/v1/tenants/applications/${id}/reject`,
      method: 'POST',
      scope: 'platform.tenant.reject',
      successMessage: '已驳回并硬删除',
      thunk: () =>
        api.POST('/api/v1/tenants/applications/{id}/reject', { params: { path: { id } } }),
    });
    if (ok) await navigate({ to: '/platform/tenants', search: { offset: 0 } });
  }

  async function doSoftDelete() {
    if (!window.confirm(`确认软删除组织「${tenant.name}」（→ deleted · 行保留供导出）？`)) return;
    await action.run({
      path: `/api/v1/platform/tenants/${id}`,
      method: 'DELETE',
      scope: 'platform.tenant.softDelete',
      successMessage: '已软删除（进入 deleted 终态）',
      thunk: () => api.DELETE('/api/v1/platform/tenants/{id}', { params: { path: { id } } }),
    });
  }

  async function doPermanentDelete() {
    if (!armed) {
      setHardHint(`请先键入 slug「${tenant.slug}」以解禁不可逆硬删`);
      return;
    }
    if (!window.confirm('硬删不可逆（FK 级联 + 事件清除），最终确认？')) return;
    setHardHint(null);
    await action.run({
      path: `/api/v1/platform/tenants/${id}/permanent`,
      method: 'DELETE',
      scope: 'platform.tenant.permanentDelete',
      successMessage: '已不可逆硬删除',
      thunk: () =>
        api.DELETE('/api/v1/platform/tenants/{id}/permanent', { params: { path: { id } } }),
    });
  }

  async function handleExport() {
    setExporting(true);
    setExportErr(null);
    try {
      const { data, error } = await api.GET('/api/v1/platform/tenants/{id}/export', {
        params: { path: { id } },
      });
      if (error) {
        logApiError(
          {
            path: `/api/v1/platform/tenants/${id}/export`,
            method: 'GET',
            scope: 'platform.export',
          },
          error,
        );
        setExportErr(describeApiError(error));
        return;
      }
      // passthrough（类型 unknown·六段聚合不解析）→ 原样序列化下载。
      const blob = new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tenant-${tenant.slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/platform/tenants"
        search={{ offset: 0 }}
        className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← 返回组织列表
      </Link>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <SectionHeading>{tenant.name}</SectionHeading>
          <StatusBadge status={tenant.status} />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          slug：{tenant.slug} · 组织 ID：{tenant.organizationId} · 创建：
          {formatDate(tenant.createdAt)}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>诊断</SectionHeading>
        {diag ? (
          <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-300">
            <span>成员 {diag.memberCount}</span>
            <span>待处理邀请 {diag.invitationCount}</span>
            <span>工作区 {diag.workspaceCount}</span>
            <span>帖子 {diag.postCount}</span>
          </div>
        ) : (
          <p className="text-sm text-slate-400 dark:text-slate-500">诊断数据不可用。</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>治理动作</SectionHeading>
        <TenantActions
          status={tenant.status}
          pending={action.pending}
          onApprove={doApprove}
          onReject={doReject}
          onSuspend={() =>
            doTransition(
              'suspend',
              `/api/v1/platform/tenants/${id}/suspend`,
              'platform.tenant.suspend',
              '已暂停（active→suspended）',
            )
          }
          onResume={() =>
            doTransition(
              'resume',
              `/api/v1/platform/tenants/${id}/resume`,
              'platform.tenant.resume',
              '已恢复（suspended→active）',
            )
          }
          onSoftDelete={doSoftDelete}
          onPermanentDelete={doPermanentDelete}
        />
        {tenant.status === 'deleted' && (
          <div className="flex flex-col gap-1 rounded border border-red-200 bg-red-50 p-3 dark:border-red-500/40 dark:bg-red-500/10">
            <label htmlFor="hard-delete-slug" className="text-xs text-red-700 dark:text-red-400">
              不可逆硬删：请键入 slug「{tenant.slug}」以解禁上方「硬删除」
            </label>
            <input
              id="hard-delete-slug"
              value={hardInput}
              onChange={(e) => setHardInput(e.target.value)}
              placeholder={tenant.slug}
              className="rounded border border-red-300 px-2 py-1 text-sm dark:border-red-500/50"
            />
            {hardHint && <span className="text-xs text-red-700 dark:text-red-400">{hardHint}</span>}
          </div>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          非法状态转移将由后端 409 拒绝（前端 disable 仅为止损）。
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {exporting ? '导出中…' : '导出数据（JSON 下载）'}
          </button>
        </div>
        {exportErr && <p className="text-xs text-red-700 dark:text-red-400">{exportErr}</p>}
        <p className="mt-1">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {action.success ?? action.error ?? '动作结果将显示于此'}
          </span>
        </p>
      </section>
    </div>
  );
}
