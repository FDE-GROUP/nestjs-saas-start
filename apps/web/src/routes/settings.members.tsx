import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DangerButton, Feedback, FormWrap, Select, SubmitButton } from '../components/forms';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { TenantContextGuidePanel } from '../components/tenant-context-guide';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';
import { probeTenantContext } from '../lib/tenant-context-guide';

/** Better Auth `auth.api.listMembers` 透传成员项（非 Nest 契约类型·形参真相源见下）。 */
interface MemberRow {
  id?: string;
  userId?: string;
  role?: string;
}

export const Route = createFileRoute('/settings/members')({
  loader: async () => {
    const session = await requireSession();
    const { data, error } = await api.GET('/api/v1/tenants/members');
    if (error) {
      logApiError({ path: '/api/v1/tenants/members', scope: 'members' }, error);
      const guide = await probeTenantContext(error);
      if (guide) return { kind: 'guide' as const, guide };
      return { kind: 'error' as const, body: error };
    }
    return { kind: 'ok' as const, raw: data?.data, orgId: session.session.activeOrganizationId };
  },
  component: MembersPage,
});

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
];

function MembersPage() {
  const result = Route.useLoaderData();
  const leave = useAction();

  if (result.kind === 'guide')
    return <TenantContextGuidePanel hasMemberships={result.guide.hasMemberships} />;
  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;

  const members = extractMembers(result.raw);

  async function handleLeave() {
    const orgId = result.orgId;
    if (!orgId) return;
    await leave.run({
      path: '/api/v1/tenants/members/leave',
      method: 'POST',
      scope: 'member.leave',
      successMessage: '已退出租户',
      thunk: () =>
        api.POST('/api/v1/tenants/members/leave', {
          body: { organizationId: orgId },
        }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <MembersView raw={result.raw} />

      {members.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading>成员操作</SectionHeading>
          {members.map((m) => (
            <MemberActions key={m.id ?? m.userId} member={m} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeading>退出当前租户</SectionHeading>
        <DangerButton pending={leave.pending} onClick={handleLeave}>
          退出租户
        </DangerButton>
        <Feedback error={leave.error} success={leave.success} />
      </section>
    </div>
  );
}

/** 单成员改角色/移除操作。 */
function MemberActions({ member }: { member: MemberRow }) {
  const [role, setRole] = useState(member.role ?? 'member');
  const roleAction = useAction();
  const removeAction = useAction();

  async function handleChangeRole(e: React.FormEvent) {
    e.preventDefault();
    await roleAction.run({
      path: '/api/v1/tenants/members/role',
      method: 'POST',
      scope: 'member.role',
      successMessage: `${member.userId} 角色已更新`,
      thunk: () =>
        // role: Record<string,never> 系 codegen gap，实参真相源 = BA role key 字符串
        api.POST('/api/v1/tenants/members/role', {
          body: { memberId: member.id ?? '', role: role as unknown as Record<string, never> },
        }),
    });
  }

  async function handleRemove() {
    await removeAction.run({
      path: '/api/v1/tenants/members/remove',
      method: 'POST',
      scope: 'member.remove',
      successMessage: `${member.userId} 已移除`,
      thunk: () =>
        api.POST('/api/v1/tenants/members/remove', {
          body: { memberId: member.id ?? '' },
        }),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm">
      <span className="w-32 truncate text-slate-600">{member.userId ?? member.id}</span>
      <FormWrap onSubmit={handleChangeRole} className="flex items-center gap-2">
        <Select label="角色" name="role" options={ROLES} value={role} onChange={setRole} />
        <SubmitButton pending={roleAction.pending}>改角色</SubmitButton>
      </FormWrap>
      <DangerButton pending={removeAction.pending} onClick={handleRemove}>
        移除
      </DangerButton>
      <Feedback
        error={roleAction.error ?? removeAction.error}
        success={roleAction.success ?? removeAction.success}
      />
    </div>
  );
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
