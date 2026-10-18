import { createFileRoute } from '@tanstack/react-router';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { requireSession } from '../lib/session';

/** Better Auth `auth.api.listMembers` 透传成员项（非 Nest 契约类型·形参真相源见下）。 */
interface MemberRow {
  id?: string;
  userId?: string;
  role?: string;
}

export const Route = createFileRoute('/settings/members')({
  loader: async () => {
    await requireSession();
    const { data, error } = await api.GET('/api/v1/tenants/members');
    if (error) {
      logApiError({ path: '/api/v1/tenants/members', scope: 'members' }, error);
      return { kind: 'error' as const, body: error };
    }
    return { kind: 'ok' as const, raw: data?.data };
  },
  component: MembersPage,
});

function MembersPage() {
  const result = Route.useLoaderData();
  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;
  return <MembersView raw={result.raw} />;
}

function extractMembers(raw: unknown): MemberRow[] {
  if (raw && typeof raw === 'object' && 'members' in raw) {
    const list = (raw as { members?: unknown }).members;
    if (Array.isArray(list)) return list as MemberRow[];
  }
  return [];
}

/**
 * 纯展示（成员只读表）。
 * 注意：GET /tenants/members 系 Better Auth 服务端直调**透传面**（F1 诚实降档·非 Nest 契约类型），
 * 故此处据运行时 `{ members: [...] }` 形防御性取值，不假称 typed 字段。
 */
export function MembersView({ raw }: { raw?: unknown }) {
  const members = extractMembers(raw);
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>成员</SectionHeading>
      <p className="text-xs text-slate-400">
        数据来源：Better Auth membership 透传面（非 Nest 契约类型）。
      </p>
      {members.length === 0 ? (
        <EmptyPanel label="当前租户暂无成员数据。" />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2 pr-4 font-medium">用户 ID</th>
              <th className="py-2 font-medium">角色</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id ?? m.userId} className="border-b border-slate-100">
                <td className="py-2 pr-4 text-slate-800">{m.userId ?? '—'}</td>
                <td className="py-2 text-slate-600">{m.role ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
