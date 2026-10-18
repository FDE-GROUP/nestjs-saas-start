import type { components } from '@saas/api-client';
import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Field, FormWrap } from '../components/forms';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { StatusBadge } from '../components/platform-tenants';
import { api } from '../lib/api';
import { apiErrorDetail, describeApiError, formatDate } from '../lib/format';
import { logApiError } from '../lib/log';
import { requireSession } from '../lib/session';

type TenantRow = components['schemas']['PlatformTenantRowResponse'];

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
  loader: async (ctx) => {
    await requireSession();
    // validateSearch 的返回类型未被插件登记进路由注册表（本仓首个 offset 分页面）——
    // `ctx.search` 运行时存在，此处按 TenantSearch 形取，编译期诚实降级。
    const search = (ctx as unknown as { search: TenantSearch }).search;
    const { data, error } = await api.GET('/api/v1/platform/tenants', {
      params: { query: { limit: LIMIT, offset: search.offset, search: search.q } },
    });
    if (error) {
      logApiError({ path: '/api/v1/platform/tenants', scope: 'platform.tenants' }, error);
      return {
        kind: 'error' as const,
        denied: apiErrorDetail(error).statusCode === 403,
        body: describeApiError(error),
      };
    }
    return { kind: 'ok' as const, page: data?.data, offset: search.offset, q: search.q };
  },
  component: PlatformTenantsPage,
});

function PlatformTenantsPage() {
  const result = Route.useLoaderData();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const [q, setQ] = useState(result.kind === 'ok' ? (result.q ?? '') : '');

  // 详情路由 `/platform/tenants/$id` 是本路由的文件式子路由——命中子路由时交由 Outlet 渲染。
  if (matchRoute({ to: '/platform/tenants/$id' })) return <Outlet />;

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
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
        >
          搜索
        </button>
      </FormWrap>

      <TenantsListView items={items} />

      <div className="flex items-center gap-4 text-sm text-slate-600">
        <button
          type="button"
          onClick={() => goPage(offset - LIMIT)}
          disabled={offset <= 0}
          className="rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
          className="rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
      </div>

      {items.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHeading>进入详情</SectionHeading>
          {items.map((t) => (
            <TenantRowLink key={t.organizationId} tenant={t} />
          ))}
        </section>
      )}
    </div>
  );
}

/** 单租户详情入口（含 Link·页面级·不入纯展示测）。 */
function TenantRowLink({ tenant }: { tenant: TenantRow }) {
  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm">
      <span className="flex-1 font-medium text-slate-800">{tenant.name}</span>
      <span className="text-xs text-slate-400">{tenant.slug}</span>
      <StatusBadge status={tenant.status} />
      <Link
        to="/platform/tenants/$id"
        params={{ id: tenant.organizationId }}
        search={{ offset: 0 }}
        className="text-xs text-blue-600 hover:underline"
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
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">名称</th>
              <th className="py-2 pr-4 font-medium">Slug</th>
              <th className="py-2 pr-4 font-medium">状态</th>
              <th className="py-2 font-medium">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.organizationId} className="border-b border-slate-100">
                <td className="py-2 pr-4 font-medium text-slate-800">{t.name}</td>
                <td className="py-2 pr-4 text-slate-600">{t.slug}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={t.status} />
                </td>
                <td className="py-2 text-slate-500">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
