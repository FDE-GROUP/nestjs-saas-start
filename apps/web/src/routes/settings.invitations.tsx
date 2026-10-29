/**
 * F2b · 邀请管理（管理员面）：列出待处理邀请 + 发邀 + 撤回。
 */
import { createInvitationSchema } from '@saas/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DangerButton, Feedback, Field, FormWrap, Select, SubmitButton } from '../components/forms';
import { OrganizationContextGuidePanel } from '../components/organization-context-guide';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { rpc } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { probeOrganizationContext } from '../lib/organization-context-guide';
import { requireSession } from '../lib/session';
import { clientValidateFields } from '../lib/validation';

interface InvitationRow {
  id?: string;
  email?: string;
  roleKey?: string;
  status?: string;
}

function extractInvitations(raw: unknown): InvitationRow[] {
  if (Array.isArray(raw)) return raw as InvitationRow[];
  if (raw && typeof raw === 'object' && 'invitations' in raw) {
    const list = (raw as { invitations?: unknown }).invitations;
    if (Array.isArray(list)) return list as InvitationRow[];
  }
  return [];
}

const INVITE_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
];

export const Route = createFileRoute('/settings/invitations')({
  loader: async () => {
    await requireSession();
    try {
      const raw = await rpc.organizations.invitations.list();
      return { kind: 'ok' as const, raw };
    } catch (e) {
      logApiError({ path: '/api/v1/organizations/invitations', scope: 'invitations' }, e);
      const guide = await probeOrganizationContext(e);
      if (guide) return { kind: 'guide' as const, guide };
      return { kind: 'error' as const, body: e };
    }
  },
  component: InvitationsAdminPage,
});

function InvitationsAdminPage() {
  const result = Route.useLoaderData();
  const create = useAction();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  if (result.kind === 'guide')
    return <OrganizationContextGuidePanel hasMemberships={result.guide.hasMemberships} />;
  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;

  const invitations = extractInvitations(result.raw);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    // 共享契约前置校验：与后端同一 createInvitationSchema·本地即时逐字段拦空免无效往返。
    const fields = clientValidateFields(createInvitationSchema, { email, role });
    if (Object.keys(fields).length > 0) {
      setFieldErr(fields);
      return;
    }
    setFieldErr({});
    const ok = await create.run({
      path: '/api/v1/organizations/invitations',
      method: 'POST',
      scope: 'invitation.create',
      successMessage: `已邀请 ${email}`,
      thunk: () => rpc.organizations.invitations.create({ email, role }),
    });
    if (ok) setEmail('');
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHeading>发送邀请</SectionHeading>
        <FormWrap onSubmit={handleCreate}>
          <Field
            label="邮箱"
            name="email"
            type="email"
            value={email}
            onChange={setEmail}
            required
            error={fieldErr.email}
          />
          <Select
            label="角色"
            name="role"
            options={INVITE_ROLES}
            value={role}
            onChange={setRole}
            error={fieldErr.role}
          />
          <SubmitButton pending={create.pending}>邀请</SubmitButton>
        </FormWrap>
        <Feedback error={create.error} success={create.success} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>待处理邀请</SectionHeading>
        {invitations.length === 0 ? (
          <EmptyPanel label="暂无待处理邀请。" />
        ) : (
          <div className="flex flex-col gap-2">
            {invitations.map((inv) => (
              <InvitationCancelRow key={inv.id} invitation={inv} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function InvitationCancelRow({ invitation }: { invitation: InvitationRow }) {
  const cancel = useAction();

  async function handleCancel() {
    await cancel.run({
      path: '/api/v1/organizations/invitations/cancel',
      method: 'POST',
      scope: 'invitation.cancel',
      successMessage: `${invitation.email} 的邀请已撤回`,
      thunk: () => rpc.organizations.invitations.cancel({ invitationId: invitation.id ?? '' }),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
      <span className="flex-1 text-slate-800 dark:text-slate-100">
        {invitation.email}
        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
          ({invitation.roleKey ?? '—'})
        </span>
      </span>
      <DangerButton pending={cancel.pending} onClick={handleCancel}>
        撤回
      </DangerButton>
      <Feedback error={cancel.error} success={cancel.success} />
    </div>
  );
}
