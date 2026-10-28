import { odooPartnersWireSchema, odooProductsWireSchema } from '@odoo-feature';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { getSession, signOut } from '../lib/auth';
import { fetchOdooList, OdooFetchError } from '../lib/odoo';

type Tab = 'partners' | 'products';
type View =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; body: ReactNode };

/**
 * 数据页（deny-by-default：loader 会话守卫与后端会话墙同向）——
 * 客户/商品两个只读 tab，展示「SaaS 服务端 → Odoo」链路；
 * 503（未配置/上游不可达）落引导态而非崩溃（方案 §3.3）。
 */
export const Route = createFileRoute('/')({
  loader: async () => {
    const session = await getSession();
    if (!session?.user) throw redirect({ to: '/login' });
    return { email: session.user.email };
  },
  component: DataPage,
});

function DataPage() {
  const { email } = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>('partners');
  const [view, setView] = useState<View>({ kind: 'loading' });
  const navigate = useNavigate();

  const load = useCallback(async (which: Tab) => {
    setView({ kind: 'loading' });
    try {
      const body = which === 'partners' ? await fetchPartners() : await fetchProducts();
      setView({ kind: 'ready', body });
    } catch (err) {
      const message =
        err instanceof OdooFetchError
          ? err.message
          : `数据解析失败（上游契约漂移）：${(err as Error).message}`;
      setView({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function onSignOut() {
    await signOut();
    await navigate({ to: '/login' });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <nav className="flex gap-2" aria-label="数据面切换">
          <TabButton active={tab === 'partners'} onClick={() => setTab('partners')}>
            客户（res.partner）
          </TabButton>
          <TabButton active={tab === 'products'} onClick={() => setTab('products')}>
            商品（product.template）
          </TabButton>
        </nav>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{email}</span>
          <button type="button" onClick={onSignOut} className="underline">
            登出
          </button>
        </div>
      </div>
      {view.kind === 'loading' ? (
        <p className="text-sm text-gray-500">加载中…</p>
      ) : view.kind === 'error' ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-800">Odoo 数据不可用</p>
          <p className="mt-1 text-amber-700">{view.message}</p>
          <p className="mt-2 text-xs text-amber-600">
            引导：服务端需注入 ODOO_BASE_URL / ODOO_DB / ODOO_LOGIN / ODOO_API_KEY 四键（feature
            私有叠加层），并保证 Odoo 实例可达。
          </p>
        </div>
      ) : (
        view.body
      )}
    </div>
  );
}

async function fetchPartners() {
  const data = await fetchOdooList('partners', 20, odooPartnersWireSchema);
  return (
    <Table caption={`客户 · ${data.total} 条（显示前 ${data.limit}）`}>
      <thead>
        <tr>
          <Th>Id</Th>
          <Th>名称</Th>
          <Th>邮箱</Th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((p) => (
          <tr key={p.id}>
            <Td>{p.id}</Td>
            <Td>{p.name}</Td>
            <Td>{p.email ?? '—'}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

async function fetchProducts() {
  const data = await fetchOdooList('products', 20, odooProductsWireSchema);
  return (
    <Table caption={`商品模板 · ${data.total} 条（显示前 ${data.limit}）`}>
      <thead>
        <tr>
          <Th>Id</Th>
          <Th>名称</Th>
          <Th>售价</Th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((p) => (
          <tr key={p.id}>
            <Td>{p.id}</Td>
            <Td>{p.name}</Td>
            <Td>{p.listPrice.toFixed(2)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm ${active ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
    >
      {children}
    </button>
  );
}

function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="pb-2 text-left text-xs text-gray-500">{caption}</caption>
      {children}
    </table>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="border-b border-gray-200 px-3 py-2 text-left font-medium">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="border-b border-gray-100 px-3 py-2">{children}</td>;
}
