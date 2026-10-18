import type { components } from '@saas/api-client';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { signOut } from '../lib/auth';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { requireSession } from '../lib/session';

type SubscriptionResponse = components['schemas']['SubscriptionResponse'];

export const Route = createFileRoute('/')({
  // 未登录直接弹回登录页（deny-by-default 的前端映射·与后端会话墙同向）。
  loader: async () => {
    const session = await requireSession();
    const { data, error } = await api.GET('/api/v1/subscriptions/current');
    if (error) logApiError({ path: '/api/v1/subscriptions/current', scope: 'subscription' }, error);
    return {
      user: session.user,
      subscription: error ? null : (data?.data ?? null),
      note: error ? describeApiError(error) : null,
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user, subscription, note } = Route.useLoaderData();
  const navigate = useNavigate();

  async function onSignOut() {
    await signOut();
    await navigate({ to: '/login' });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <SectionHeading>当前会话</SectionHeading>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 rounded-lg border border-slate-200 p-4 text-sm">
          <dt className="text-slate-500">邮箱</dt>
          <dd data-testid="session-email">{user.email}</dd>
          <dt className="text-slate-500">用户 ID</dt>
          <dd>{user.id}</dd>
        </dl>
        <div>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            登出
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>订阅摘要</SectionHeading>
        {note ? <ErrorPanel message={note} /> : <SubscriptionView subscription={subscription} />}
      </section>
    </div>
  );
}

/** 纯展示（收 typed 订阅快照·可脱离 router 组件测）。 */
export function SubscriptionView({ subscription }: { subscription?: SubscriptionResponse | null }) {
  if (!subscription?.hasSubscription) {
    return <EmptyPanel label="当前租户尚无生效订阅。" />;
  }
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-y-1 rounded-lg border border-slate-200 p-4 text-sm">
      <dt className="text-slate-500">档位</dt>
      <dd data-testid="sub-plan">{subscription.plan}</dd>
      <dt className="text-slate-500">座位上限</dt>
      <dd>{subscription.seatsLimit}</dd>
      <dt className="text-slate-500">已用 / 剩余</dt>
      <dd>
        {subscription.used} / {subscription.remaining}
      </dd>
    </dl>
  );
}
