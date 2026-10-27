import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DangerButton, Feedback, FormWrap, Select, SubmitButton } from '../components/forms';
import { OrganizationContextGuidePanel } from '../components/organization-context-guide';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { probeOrganizationContext } from '../lib/organization-context-guide';
import { requireSession } from '../lib/session';

/** 租级成员视图（对齐后端 `TenantMemberView`：userId/email/name/roleKey·无独立 id）。 */
interface MemberRow {
  userId?: string;
  email?: string;
  name?: string;
  roleKey?: string;
}

export const Route = createFileRoute('/settings/members')({
  loader: async () => {
    const session = await requireSession();
    const { data, error } = await api.GET('/api/v1/organizations/members');
    if (error) {
      logApiError({ path: '/api/v1/organizations/members', scope: 'members' }, error);
      const guide = await probeOrganizationContext(error);
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
    return <OrganizationContextGuidePanel hasMemberships={result.guide.hasMemberships} />;
  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;

  const members = extractMembers(result.raw);

  async function handleLeave() {
    const orgId = result.orgId;
    if (!orgId) return;
    await leave.run({
      path: '/api/v1/organizations/members/leave',
      method: 'POST',
      scope: 'member.leave',
      successMessage: '已退出组织',
      thunk: () =>
        api.POST('/api/v1/organizations/members/leave', {
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
            <MemberActions key={m.userId} member={m} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionHeading>退出当前组织</SectionHeading>
        <DangerButton pending={leave.pending} onClick={handleLeave}>
          退出组织
        </DangerButton>
        <Feedback error={leave.error} success={leave.success} />
      </section>
    </div>
  );
}

/** 单成员改角色/移除操作。 */
function MemberActions({ member }: { member: MemberRow }) {
  const [role, setRole] = useState(member.roleKey ?? 'member');
  const roleAction = useAction();
  const removeAction = useAction();

  async function handleChangeRole(e: React.FormEvent) {
    e.preventDefault();
    await roleAction.run({
      path: '/api/v1/organizations/members/role',
      method: 'POST',
      scope: 'member.role',
      successMessage: `${member.userId} 角色已更新`,
      thunk: () =>
        api.POST('/api/v1/organizations/members/role', {
          body: { memberId: member.userId ?? '', role },
        }),
    });
  }

  async function handleRemove() {
    await removeAction.run({
      path: '/api/v1/organizations/members/remove',
      method: 'POST',
      scope: 'member.remove',
      successMessage: `${member.userId} 已移除`,
      thunk: () =>
        api.POST('/api/v1/organizations/members/remove', {
          body: { memberId: member.userId ?? '' },
        }),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 p-3 text-sm dark:border-slate-700">
      <span className="w-32 truncate text-slate-600 dark:text-slate-300">
        {member.email ?? member.userId ?? '—'}
      </span>
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
  // 租级 SSOT 端点返回扁平数组（经信封 data:[]）；保留 {members} 兼容形以防过渡期旧透传面。
  if (Array.isArray(raw)) return raw as MemberRow[];
  if (raw && typeof raw === 'object' && 'members' in raw) {
    const list = (raw as { members?: unknown }).members;
    if (Array.isArray(list)) return list as MemberRow[];
  }
  return [];
}

/**
 * 纯展示（成员只读表）。
 * 数据来源 = 租级成员 SSOT（`GET /organizations/members` → tenant_membership ⋈ tenant_role_assignment ⋈ user），
 * 响应项携 userId/email/name/roleKey（切片 D 起·非旧 Better Auth 透传形）。
 */
export function MembersView({ raw }: { raw?: unknown }) {
  const members = extractMembers(raw);
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>成员</SectionHeading>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        数据来源：租级成员 SSOT（tenant_membership ⋈ tenant_role_assignment ⋈ user）。
      </p>
      {members.length === 0 ? (
        <EmptyPanel label="当前租户暂无成员。" />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">成员</th>
              <th className="py-2 font-medium">角色</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">
                  {m.name ?? m.email ?? m.userId ?? '—'}
                </td>
                <td className="py-2 text-slate-600 dark:text-slate-300">{m.roleKey ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
