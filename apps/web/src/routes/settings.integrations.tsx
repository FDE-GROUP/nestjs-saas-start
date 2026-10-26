import type { components } from '@saas/api-client';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { SubmitButton } from '../components/forms';
import { ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { requireSession } from '../lib/session';

/** 真相源 = `PaymentStatusResponse`（`@saas/api-client` schema 派生·编译期契约锁定）。 */
type PaymentStatus = components['schemas']['PaymentStatusResponse'];

/** 当前活跃租户 Odoo 可用性视图（切片 D · apps 面板数据源·后端 `canUseOdoo` 单源裁决透传）。 */
type OdooAvailability = components['schemas']['OrganizationOdooAvailabilityResponse'];

/**
 * health 探针运行期被 `TransformInterceptor` 全局包成 `{data,statusCode,message}`，而 openapi/schema.d.ts
 * 文档为 terminus 透传体（顶层 `status`）——既存文档↔运行时落差（见 plan §2 发现·非本片修）。双兜解包保运行正确。
 */
type HealthProbe = { status?: string; data?: { status?: string } };

type Panel<T> = { kind: 'ok'; value: T } | { kind: 'error'; message: string };

interface LoaderResult {
  health: Panel<string>;
  payment: Panel<PaymentStatus>;
  odoo: Panel<OdooAvailability>;
  checkedAt: string;
}

/**
 * 前端 F6 · 运维与支付集成状态面（module-frontend-integrations·只读）。
 * 消费 `GET /api/v1/health`（`@Public`·零凭据）+ `GET /api/v1/payment/test`（`@TenantIsolationExempt`·仅需会话）。
 * 诚实边界：payment 操作面（checkout/customer/refund·需真 PSP 键·无凭据仅 503）不建·缓至运维真值另片。
 */
export const Route = createFileRoute('/settings/integrations')({
  loader: async (): Promise<LoaderResult> => {
    await requireSession();
    const checkedAt = new Date().toLocaleString();
    // 解构取（`{data,error}`）而非整体 res：openapi-fetch 单 200 响应面直接成员访问 `.error` 会塌 never。
    const { data: healthData, error: healthError } = await api.GET('/api/v1/health');
    let health: Panel<string>;
    if (healthError) {
      logApiError({ path: '/api/v1/health', scope: 'integrations.health' }, healthError);
      health = { kind: 'error', message: describeApiError(healthError) };
    } else {
      // 双兜解包（envelope 优先·承 §2 文档↔运行时落差）。
      const body = healthData as unknown as HealthProbe;
      health = { kind: 'ok', value: body?.data?.status ?? body?.status ?? 'unknown' };
    }

    const { data: paymentData, error: paymentError } = await api.GET('/api/v1/payment/test');
    let payment: Panel<PaymentStatus>;
    if (paymentError) {
      logApiError({ path: '/api/v1/payment/test', scope: 'integrations.payment' }, paymentError);
      payment = { kind: 'error', message: describeApiError(paymentError) };
    } else if (paymentData?.data) {
      payment = { kind: 'ok', value: paymentData.data };
    } else {
      payment = { kind: 'error', message: '支付集成状态不可用' };
    }

    // Odoo 可用性（GET 只读·无活跃租户/未登录均返 available=false，非错误态）。
    const { data: odooData, error: odooError } = await api.GET(
      '/api/v1/organizations/odoo/availability',
    );
    let odoo: Panel<OdooAvailability>;
    if (odooError) {
      logApiError(
        { path: '/api/v1/organizations/odoo/availability', scope: 'integrations.odoo' },
        odooError,
      );
      odoo = { kind: 'error', message: describeApiError(odooError) };
    } else if (odooData?.data) {
      odoo = { kind: 'ok', value: odooData.data };
    } else {
      odoo = { kind: 'error', message: 'Odoo 可用性状态不可用' };
    }

    return { health, payment, odoo, checkedAt };
  },
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { health, payment, odoo, checkedAt } = Route.useLoaderData();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <SectionHeading>运维与集成状态</SectionHeading>
        <SubmitButton pending={false} onClick={() => router.invalidate()}>
          刷新
        </SubmitButton>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        最近检查：{checkedAt}（只读探针面·支付操作面需服务端配置真实通道后另片开放）
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-medium text-slate-700 dark:text-slate-200">服务存活</h2>
        {health.kind === 'ok' ? (
          <HealthStatusPanel status={health.value} />
        ) : (
          <ErrorPanel message={health.message} />
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <h2 className="text-base font-medium text-slate-700 dark:text-slate-200">支付集成</h2>
        {payment.kind === 'ok' ? (
          <PaymentIntegrationPanel status={payment.value} />
        ) : (
          <ErrorPanel message={payment.message} />
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <h2 className="text-base font-medium text-slate-700 dark:text-slate-200">Odoo 集成</h2>
        {odoo.kind === 'ok' ? (
          <OdooIntegrationPanel view={odoo.value} />
        ) : (
          <ErrorPanel message={odoo.message} />
        )}
      </section>
    </div>
  );
}

/** 存活探针状态色值映射（ok 绿 / degraded 琥珀 / 其余含 down·unknown 红）。 */
function healthTone(status: string): string {
  if (status === 'ok') return 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400';
  if (status === 'degraded')
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
}

/**
 * 纯展示服务存活面板（typed 字符串驱动·无 fetch·供单测锁）。
 */
export function HealthStatusPanel({ status }: { status: string }) {
  return (
    <p className="flex items-center gap-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400">状态</span>
      <span className={`rounded px-2 py-0.5 text-xs font-medium ${healthTone(status)}`}>
        {status}
      </span>
    </p>
  );
}

/**
 * Odoo 绑定态 → 展示档位（颜色 + 文案）。可用性 `available` 恒由后端 `canUseOdoo` 单源裁决透传；
 * 非可用时按绑定生命周期态细分（开通中/失败/未开通），仅供展示、不作放行判据。
 */
function odooTone(view: OdooAvailability): { label: string; cls: string; hint: string } {
  if (view.available) {
    return {
      label: '可用',
      cls: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
      hint: '当前租户已就绪，可经单点登录进入 Odoo 后台（入口地址由部署同域反代配置）。',
    };
  }
  if (view.odooBindingStatus === 'provisioning' || view.odooBindingStatus === 'pending') {
    return {
      label: '开通中',
      cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
      hint: 'Odoo 公司开通进行中（建司/本地化基线），就绪前暂不可进入。',
    };
  }
  if (view.odooBindingStatus === 'failed') {
    return {
      label: '开通失败',
      cls: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
      hint: 'Odoo 公司开通失败，需平台侧排查后重试。',
    };
  }
  return {
    label: '未开通',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    hint: '当前租户尚未绑定 Odoo 公司（未审批通过或未开通）。',
  };
}

/**
 * 纯展示 Odoo 集成面板（typed `OrganizationOdooAvailabilityResponse` 驱动·无 fetch·供单测锁契约形）。
 */
export function OdooIntegrationPanel({ view }: { view: OdooAvailability }) {
  const tone = odooTone(view);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex items-center gap-2">
        <span className="text-slate-500 dark:text-slate-400">Odoo 后台</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone.cls}`}>{tone.label}</span>
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">{tone.hint}</p>
    </div>
  );
}

/**
 * 纯展示支付集成面板（typed `PaymentStatusResponse` 驱动·无 fetch·供单测锁契约形）。
 * selected 通道高亮，available 通道以徽标列表呈现（selected 恒属 available 集合）。
 */
export function PaymentIntegrationPanel({ status }: { status: PaymentStatus }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex items-center gap-2">
        <span className="text-slate-500 dark:text-slate-400">选定通道</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
          {status.selected}
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-slate-500 dark:text-slate-400">可用通道</span>
        {status.available.map((channel) => (
          <span
            key={channel}
            className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            {channel}
          </span>
        ))}
      </p>
    </div>
  );
}
