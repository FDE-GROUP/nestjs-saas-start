import type {
  OrganizationDiagnosticsView,
  PlatformTenantDetailView,
  PlatformTenantOrganizationView,
} from '@saas/contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { ErrorPanel, SectionHeading } from '../components/panels';
import { StatusBadge, TenantActions } from '../components/platform-tenants';
import { rpc } from '../lib/api';
import { apiErrorDetail, describeApiError, formatDate } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';

type TenantOrg = PlatformTenantOrganizationView;
type Diagnostics = OrganizationDiagnosticsView;
type TenantDetail = PlatformTenantDetailView;

export const Route = createFileRoute('/platform/tenants/$tenantId')({
  loader: async ({ params }) => {
    await requireSession();
    const tenantId = params.tenantId;
    try {
      const tenant = (await rpc.platform.tenants.detail({
        tenantId,
      })) as unknown as TenantDetail | null;
      if (!tenant) return { kind: 'notFound' as const, tenantId };
      return { kind: 'ok' as const, tenant };
    } catch (e) {
      logApiError(
        { path: `/api/v1/platform/tenants/${tenantId}`, scope: 'platform.tenant.detail' },
        e,
      );
      return {
        kind: 'error' as const,
        denied: apiErrorDetail(e).statusCode === 403,
        body: describeApiError(e),
      };
    }
  },
  component: TenantDetailPage,
});

function TenantDetailPage() {
  const result = Route.useLoaderData();
  const action = useAction();
  // 硬删不可逆：需键入 slug 才解禁（裁③甲·后端另要求先软删·双闸）。
  const [hardInput, setHardInput] = useState('');
  const [hardHint, setHardHint] = useState<string | null>(null);

  if (result.kind === 'error') {
    return <ErrorPanel message={result.denied ? `无平台运营权限：${result.body}` : result.body} />;
  }
  if (result.kind === 'notFound') return <ErrorPanel message={`租户不存在：${result.tenantId}`} />;

  const { tenant } = result;
  const tenantId = tenant.tenantId;
  const armed = hardInput === tenant.slug;

  async function doTransition(verb: 'suspend' | 'resume') {
    const path = `/api/v1/platform/tenants/${tenantId}/${verb}`;
    await action.run({
      path,
      method: 'PATCH',
      scope: `platform.tenant.${verb}`,
      successMessage:
        verb === 'suspend' ? '已暂停（active→suspended）' : '已恢复（suspended→active）',
      thunk: () =>
        verb === 'suspend'
          ? rpc.platform.tenants.suspend({ tenantId })
          : rpc.platform.tenants.resume({ tenantId }),
    });
  }

  async function doSoftDelete() {
    if (
      !window.confirm(`确认软删除租户「${tenant.name}」（→ deleted · 封禁整个租户 · 行留供导出）？`)
    )
      return;
    await action.run({
      path: `/api/v1/platform/tenants/${tenantId}`,
      method: 'DELETE',
      scope: 'platform.tenant.softDelete',
      successMessage: '已软删除（进入 deleted 终态）',
      thunk: () => rpc.platform.tenants.remove({ tenantId }),
    });
  }

  async function doPermanentDelete() {
    if (!armed) {
      setHardHint(`请先键入 slug「${tenant.slug}」以解禁不可逆硬删`);
      return;
    }
    if (!window.confirm('硬删不可逆（连带清除名下所有组织 + 子表 + 事件清除），最终确认？')) return;
    setHardHint(null);
    await action.run({
      path: `/api/v1/platform/tenants/${tenantId}/permanent`,
      method: 'DELETE',
      scope: 'platform.tenant.permanentDelete',
      successMessage: '已不可逆硬删除（连带清除名下组织）',
      thunk: () => rpc.platform.tenants.permanentRemove({ tenantId }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/platform/tenants"
        search={{ offset: 0 }}
        className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← 返回租户列表
      </Link>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <SectionHeading>{tenant.name}</SectionHeading>
          <StatusBadge status={tenant.status} />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          slug：{tenant.slug} · 租户 ID：{tenant.tenantId} · 组织 {tenant.organizations.length} 个 ·
          创建：{formatDate(tenant.createdAt)}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>治理动作</SectionHeading>
        <TenantActions
          status={tenant.status}
          pending={action.pending}
          onSuspend={() => doTransition('suspend')}
          onResume={() => doTransition('resume')}
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
        <p className="mt-1">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {action.success ?? action.error ?? '动作结果将显示于此'}
          </span>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>名下组织</SectionHeading>
        {tenant.organizations.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">该租户名下暂无组织。</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tenant.organizations.map((org) => (
              <OrganizationDrill key={org.organizationId} tenantId={tenantId} org={org} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 名下组织下钻面（一组织一公司·Odoo 绑定态 + 诊断/导出·键 orgId·经租户详情抵达）。 */
function OrganizationDrill({ tenantId, org }: { tenantId: string; org: TenantOrg }) {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagErr, setDiagErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  async function handleDiagnostics() {
    setDiagErr(null);
    try {
      const diag = await rpc.platform.tenants.diagnostics({
        tenantId,
        orgId: org.organizationId,
      });
      setDiag(diag as unknown as Diagnostics);
    } catch (e) {
      logApiError(
        {
          path: `/api/v1/platform/tenants/${tenantId}/organizations/${org.organizationId}/diagnostics`,
          scope: 'platform.organization.diag',
        },
        e,
      );
      setDiagErr(describeApiError(e));
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportErr(null);
    try {
      // passthrough（六段聚合不解析）→ oRPC 客户端已拆信封，payload 即聚合体·原样序列化下载。
      const payload = await rpc.platform.tenants.exportData({
        tenantId,
        orgId: org.organizationId,
      });
      const blob = new Blob([JSON.stringify(payload ?? {}, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `organization-${org.slug}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logApiError(
        {
          path: `/api/v1/platform/tenants/${tenantId}/organizations/${org.organizationId}/export`,
          method: 'GET',
          scope: 'platform.export',
        },
        e,
      );
      setExportErr(describeApiError(e));
    } finally {
      setExporting(false);
    }
  }

  const btn =
    'rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800';

  return (
    <li className="flex flex-col gap-2 rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1 font-medium text-slate-800 dark:text-slate-100">{org.name}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">{org.slug}</span>
        <StatusBadge status={org.status} />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {org.odooCompanyId != null
            ? `Odoo 公司 ${org.odooCompanyId}（${org.odooBindingStatus ?? '未知'}）${org.odooCompanyName ? ` · ${org.odooCompanyName}` : ''}`
            : '未绑定 Odoo 公司'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleDiagnostics} className={btn}>
          诊断
        </button>
        <button type="button" onClick={handleExport} disabled={exporting} className={btn}>
          {exporting ? '导出中…' : '导出数据（JSON 下载）'}
        </button>
      </div>
      {diagErr && <p className="text-xs text-red-700 dark:text-red-400">{diagErr}</p>}
      {exportErr && <p className="text-xs text-red-700 dark:text-red-400">{exportErr}</p>}
      {diag && (
        <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span>成员 {diag.memberCount}</span>
          <span>待处理邀请 {diag.invitationCount}</span>
          <span>工作区 {diag.workspaceCount}</span>
          <span>帖子 {diag.postCount}</span>
        </div>
      )}
    </li>
  );
}
