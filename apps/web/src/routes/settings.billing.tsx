import { createFileRoute } from '@tanstack/react-router';
import {
  PaymentStatusView,
  SubscriptionSummaryView,
  type UpgradeDto,
  UpgradeForm,
} from '../components/billing-panels';
import { Feedback } from '../components/forms';
import { ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { apiErrorDetail, describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';

/**
 * 租户订阅计费面（Epic 06 §6.1 快照 / §6.4 支付状态 / §6.2 开通-升级）。
 * 消费面纯接线：读面 typed GET，写面 POST 经 useAction（成功 invalidate 重载快照·失败现形）。
 */
export const Route = createFileRoute('/settings/billing')({
  loader: async () => {
    await requireSession();
    const [cur, pay] = await Promise.all([
      api.GET('/api/v1/subscriptions/current'),
      api.GET('/api/v1/payment/test'),
    ]);
    if (cur.error) {
      logApiError(
        { path: '/api/v1/subscriptions/current', method: 'GET', scope: 'billing.subscription' },
        cur.error,
      );
    }
    // /payment/test 契约无错误响应分支→openapi-fetch 的 error 恒 undefined 类型，
    // 若 if(pay.error) 会把 pay 收窄为 never；改以 response.ok 现形运行期非 2xx 失败。
    if (!pay.response.ok) {
      logApiError(
        { path: '/api/v1/payment/test', method: 'GET', scope: 'billing.payment-status' },
        pay.error,
      );
    }
    return {
      snap: cur.error ? null : (cur.data?.data ?? null),
      snapDenied: !!cur.error && apiErrorDetail(cur.error).statusCode === 403,
      snapErr: cur.error ? describeApiError(cur.error) : null,
      status: pay.response.ok ? (pay.data?.data ?? null) : null,
    };
  },
  component: BillingPage,
});

function BillingPage() {
  const result = Route.useLoaderData();
  const action = useAction();
  const noChannel = !result.status || result.status.available.length === 0;

  async function doUpgrade(dto: UpgradeDto) {
    await action.run({
      path: '/api/v1/subscriptions',
      method: 'POST',
      scope: 'billing.subscription.provision',
      successMessage: '已更新订阅档位',
      thunk: () => api.POST('/api/v1/subscriptions', { body: dto }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeading>当前订阅</SectionHeading>
        {result.snap ? (
          <SubscriptionSummaryView snap={result.snap} />
        ) : result.snapDenied ? (
          <ErrorPanel message="无活跃租户上下文，请先选择或加入一个租户后再查看订阅。" />
        ) : (
          <ErrorPanel message={result.snapErr ?? '订阅快照不可用。'} />
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>支付集成状态</SectionHeading>
        {result.status ? (
          <PaymentStatusView status={result.status} />
        ) : (
          <p className="text-sm text-slate-400">支付通道状态不可用。</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeading>开通 / 升级</SectionHeading>
        <UpgradeForm pending={action.pending} disabled={noChannel} onSubmit={doUpgrade} />
        <Feedback error={action.error} success={action.success} />
      </section>
    </div>
  );
}
