import type { PlatformTenantRowView } from '@saas/contracts';
import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Field, FormWrap } from '../components/forms';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { StatusBadge } from '../components/platform-tenants';
import { rpc } from '../lib/api';
import { apiErrorDetail, describeApiError, formatDate } from '../lib/format';
import { logApiError } from '../lib/log';
import { requireSession } from '../lib/session';

type TenantRow = PlatformTenantRowView;

const LIMIT = 20;

interface TenantSearch {
  offset: number;
  q?: string;
}

export const Route = createFileRoute('/platform/tenants')({
  validateSearch: (search: Record<string, unknown>): TenantSearch => ({
    offset: Number(search.offset ?? 0) || 0,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
  }),
  // search 经 loaderDeps 注入 deps（对齐 TanStack Router 1.x：LoaderFnContext 无 search 字段，
  // validated search 只在 loaderDeps 的 opts 暴露）——此前直取 ctx.search 运行期恒 undefined 致崩。
  loaderDeps: ({ search }): TenantSearch => ({ offset: search.offset, q: search.q }),
  loader: async ({ deps }) => {
    await requireSession();
    try {
      const page = (await rpc.platform.tenants.list({
        limit: LIMIT,
        offset: deps.offset,
        search: deps.q,
      })) as unknown as { items?: TenantRow[]; total?: number };
      return { kind: 'ok' as const, page, offset: deps.offset, q: deps.q };
    } catch (e) {
      logApiError({ path: '/api/v1/platform/tenants', scope: 'platform.tenants' }, e);
      return {
        kind: 'error' as const,
        denied: apiErrorDetail(e).statusCode === 403,
        body: describeApiError(e),
      };
    }
  },
  component: PlatformTenantsPage,
});

function PlatformTenantsPage() {
  const result = Route.useLoaderData();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const [q, setQ] = useState(result.kind === 'ok' ? (result.q ?? '') : '');

  // 详情路由 `/platform/tenants/$tenantId` 是本路由的文件式子路由——命中子路由时交由 Outlet 渲染。
  if (matchRoute({ to: '/platform/tenants/$tenantId' })) return <Outlet />;

  if (result.kind === 'error') {
    return (
      <ErrorPanel
        message={
          result.denied ? `无平台运营权限（仅平台运营者可访问）：${result.body}` : result.body
        }
      />
    );
  }

  const items = result.page?.items ?? [];
  const total = result.page?.total ?? 0;
  const offset = result.offset;

  function goPage(nextOffset: number) {
    navigate({
      to: '/platform/tenants',
      search: (prev) => ({ ...prev, offset: Math.max(0, nextOffset) }),
    });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ to: '/platform/tenants', search: () => ({ offset: 0, q: q || undefined }) });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading>租户治理</SectionHeading>

      <FormWrap onSubmit={submitSearch} className="flex items-end gap-3">
        <Field
          label="搜索"
          name="q"
          value={q}
          onChange={setQ}
          placeholder="按名称 / slug 模糊匹配"
        />
        <button
          type="submit"
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          搜索
        </button>
      </FormWrap>

      <TenantsListView items={items} />

      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
        <button
          type="button"
          onClick={() => goPage(offset - LIMIT)}
          disabled={offset <= 0}
          className="rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          上一页
        </button>
        <span>
          共 {total} 条 · 偏移 {offset}
        </span>
        <button
          type="button"
          onClick={() => goPage(offset + LIMIT)}
          disabled={offset + LIMIT >= total}
          className="rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          下一页
        </button>
      </div>

      {items.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading>进入详情</SectionHeading>
          {items.map((t) => (
            <TenantRowLink key={t.tenantId} tenant={t} />
          ))}
        </section>
      )}
    </div>
  );
}

/** 单租户详情入口（含 Link·页面级·不入纯展示测）。 */
function TenantRowLink({ tenant }: { tenant: TenantRow }) {
  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
      <span className="flex-1 font-medium text-slate-800 dark:text-slate-100">{tenant.name}</span>
      <span className="text-xs text-slate-400 dark:text-slate-500">{tenant.slug}</span>
      <span className="text-xs text-slate-400 dark:text-slate-500">
        组织 {tenant.organizationCount}
      </span>
      <StatusBadge status={tenant.status} />
      <Link
        to="/platform/tenants/$tenantId"
        params={{ tenantId: tenant.tenantId }}
        search={{ offset: 0 }}
        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
      >
        详情 →
      </Link>
    </div>
  );
}

/**
 * 纯展示（收 typed 租户页·可脱离 router 组件测：typed 渲染 / 空态 / 状态徽标）。
 * 数据源 = `PlatformTenantPageResponse`（`{items,total,limit,offset}`·offset 分页）。
 */
export function TenantsListView({ items }: { items?: TenantRow[] }) {
  const list = items ?? [];
  return (
    <section className="flex flex-col gap-3">
      {list.length === 0 ? (
        <EmptyPanel label="平台暂无租户数据。" />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">名称</th>
              <th className="py-2 pr-4 font-medium">Slug</th>
              <th className="py-2 pr-4 font-medium">组织数</th>
              <th className="py-2 pr-4 font-medium">状态</th>
              <th className="py-2 font-medium">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.tenantId} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                  {t.name}
                </td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{t.slug}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                  {t.organizationCount}
                </td>
                <td className="py-2 pr-4">
                  <StatusBadge status={t.status} />
                </td>
                <td className="py-2 text-slate-500 dark:text-slate-400">
                  {formatDate(t.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
