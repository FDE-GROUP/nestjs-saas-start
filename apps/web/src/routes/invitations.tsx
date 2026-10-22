/**
 * F2b · 我的邀请：列出发给当前用户的待处理邀请 + 接受/拒绝。
 */
import { createFileRoute } from '@tanstack/react-router';
import { DangerButton, Feedback, SubmitButton } from '../components/forms';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';

interface MyInvitationRow {
  id?: string;
  email?: string;
  role?: string;
  organizationName?: string;
}

function extractMyInvitations(raw: unknown): MyInvitationRow[] {
  if (Array.isArray(raw)) return raw as MyInvitationRow[];
  if (raw && typeof raw === 'object' && 'invitations' in raw) {
    const list = (raw as { invitations?: unknown }).invitations;
    if (Array.isArray(list)) return list as MyInvitationRow[];
  }
  return [];
}

export const Route = createFileRoute('/invitations')({
  loader: async () => {
    await requireSession();
    const { data, error } = await api.GET('/api/v1/tenants/invitations/mine');
    if (error) {
      logApiError({ path: '/api/v1/tenants/invitations/mine', scope: 'my-invitations' }, error);
      return { kind: 'error' as const, body: error };
    }
    return { kind: 'ok' as const, raw: data?.data };
  },
  component: MyInvitationsPage,
});

function MyInvitationsPage() {
  const result = Route.useLoaderData();
  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;
  const invitations = extractMyInvitations(result.raw);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading>我的邀请</SectionHeading>
      {invitations.length === 0 ? (
        <EmptyPanel label="暂无待处理的邀请。" />
      ) : (
        <div className="flex flex-col gap-2">
          {invitations.map((inv) => (
            <MyInvitationActions key={inv.id} invitation={inv} />
          ))}
        </div>
      )}
    </div>
  );
}

function MyInvitationActions({ invitation }: { invitation: MyInvitationRow }) {
  const accept = useAction();
  const reject = useAction();

  async function handleAccept() {
    await accept.run({
      path: '/api/v1/tenants/invitations/accept',
      method: 'POST',
      scope: 'my-invitation.accept',
      successMessage: `已接受邀请`,
      thunk: () =>
        api.POST('/api/v1/tenants/invitations/accept', {
          body: { invitationId: invitation.id ?? '' },
        }),
    });
  }

  async function handleReject() {
    await reject.run({
      path: '/api/v1/tenants/invitations/reject',
      method: 'POST',
      scope: 'my-invitation.reject',
      successMessage: '已拒绝邀请',
      thunk: () =>
        api.POST('/api/v1/tenants/invitations/reject', {
          body: { invitationId: invitation.id ?? '' },
        }),
    });
  }

  return (
    <div className="flex items-center gap-3 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
      <span className="flex-1 text-slate-800 dark:text-slate-100">
        {invitation.organizationName ?? invitation.email}
        <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
          ({invitation.role ?? '—'})
        </span>
      </span>
      <SubmitButton pending={accept.pending} onClick={handleAccept}>
        接受
      </SubmitButton>
      <DangerButton pending={reject.pending} onClick={handleReject}>
        拒绝
      </DangerButton>
      <Feedback error={accept.error ?? reject.error} success={accept.success ?? reject.success} />
    </div>
  );
}
