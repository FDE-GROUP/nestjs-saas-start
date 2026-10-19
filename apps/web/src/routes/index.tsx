import type { components } from '@saas/api-client';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Feedback, Field, FormWrap, SubmitButton } from '../components/forms';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { signOut } from '../lib/auth';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';

type SubscriptionResponse = components['schemas']['SubscriptionResponse'];

/** 透传面防御形（GET /tenants 返回 BA organization 列表·无 Nest typed 契约）。 */
interface TenantOrg {
  id?: string;
  name?: string;
  slug?: string;
}
function extractTenants(raw: unknown): TenantOrg[] {
  if (Array.isArray(raw)) return raw as TenantOrg[];
  if (raw && typeof raw === 'object' && 'organizations' in raw) {
    const list = (raw as { organizations?: unknown }).organizations;
    if (Array.isArray(list)) return list as TenantOrg[];
  }
  return [];
}

export const Route = createFileRoute('/')({
  // 未登录直接弹回登录页（deny-by-default 的前端映射·与后端会话墙同向）。
  loader: async () => {
    const session = await requireSession();
    // 先取「我可成员的组织」列表（GET /tenants）——用于判定是否需引导落租（须先于订阅取数）。
    const { data: tenantData, error: tenantError } = await api.GET('/api/v1/tenants');
    if (tenantError) logApiError({ path: '/api/v1/tenants', scope: 'tenants' }, tenantError);
    const tenants = tenantError ? [] : extractTenants(tenantData?.data);

    // 引导落租（module-frontend-tenant-bootstrap-activation）：会话未带 activeOrganizationId 且
    // **恰有一个**成员组织时自动 `POST /api/v1/tenants/active`（消订阅面冷 403·多组织交手动切换器·不自动择）。
    let activeOrganizationId = session.session.activeOrganizationId;
    let note: string | null = null;
    if (!activeOrganizationId && tenants.length === 1 && tenants[0]?.id) {
      const { error: activateError } = await api.POST('/api/v1/tenants/active', {
        body: { organizationId: tenants[0].id },
      });
      if (activateError) {
        logApiError({ path: '/api/v1/tenants/active', scope: 'tenant.bootstrap' }, activateError);
        note = describeApiError(activateError);
      } else {
        activeOrganizationId = tenants[0].id;
      }
    }

    // 订阅取数 gate 在「有活跃租户」之后：无活跃租户则不打（避免无谓 403）。
    let subscription: SubscriptionResponse | null = null;
    if (activeOrganizationId) {
      const { data: subData, error: subError } = await api.GET('/api/v1/subscriptions/current');
      if (subError) {
        logApiError({ path: '/api/v1/subscriptions/current', scope: 'subscription' }, subError);
        note = describeApiError(subError);
      } else {
        subscription = subData?.data ?? null;
      }
    }

    return {
      user: session.user,
      hasActiveTenant: !!activeOrganizationId,
      subscription,
      note,
      tenants,
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user, hasActiveTenant, subscription, note, tenants } = Route.useLoaderData();
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

      <TenantSwitchSection tenants={tenants} />

      <section className="flex flex-col gap-3">
        <SectionHeading>订阅摘要</SectionHeading>
        {!hasActiveTenant && tenants.length === 0 ? (
          <TenantOnboardingPanel />
        ) : !hasActiveTenant ? (
          <EmptyPanel label="尚无活跃租户，请在「我的租户」切换到一个组织。" />
        ) : note ? (
          <ErrorPanel message={note} />
        ) : (
          <SubscriptionView subscription={subscription} />
        )}
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

/** 租户切换区域（操作面）。 */
function TenantSwitchSection({ tenants }: { tenants: TenantOrg[] }) {
  const switchAction = useAction();

  async function handleSwitch(orgId: string, orgName: string) {
    await switchAction.run({
      path: '/api/v1/tenants/active',
      method: 'POST',
      scope: 'tenant.switch',
      successMessage: `已切换到「${orgName}」`,
      thunk: () =>
        api.POST('/api/v1/tenants/active', {
          body: { organizationId: orgId },
        }),
    });
  }

  if (tenants.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>我的租户</SectionHeading>
      <div className="flex flex-col gap-2">
        {tenants.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
          >
            <span className="font-medium text-slate-800">{t.name ?? t.id}</span>
            <SubmitButton
              pending={switchAction.pending}
              onClick={() => t.id && handleSwitch(t.id, t.name ?? t.id)}
            >
              切换到此租户
            </SubmitButton>
          </div>
        ))}
      </div>
      <Feedback error={switchAction.error} success={switchAction.success} />
    </section>
  );
}

/**
 * 零组织新注册引导（module-frontend-tenant-onboarding）：承 A 片 §4 发现项，替此前纯文案死胡同。
 * 两条**合规**出路——① 申请创建自有组织（走 `POST /api/v1/tenants/applications`·落 `pending_approval`
 * 经平台审批·FR-1/FR-12）；② 经邀请链接加入既有组织（引导至既有 `/invitations` 页）。
 * **不**自动建活跃组织（直冲 S4 审批制·见 plan §4-① 建议拒绝），MVP 以静态 pending 回执呈现。
 */
function TenantOnboardingPanel() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const applyAction = useAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await applyAction.run({
      path: '/api/v1/tenants/applications',
      method: 'POST',
      scope: 'tenant.apply',
      successMessage: '已提交，等待平台审批。',
      thunk: () => api.POST('/api/v1/tenants/applications', { body: { name, slug } }),
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4">
      <p className="text-sm text-slate-600">
        你尚未加入任何组织。可申请创建自己的组织（提交后进入平台审批），或经由邀请链接加入既有组织。
      </p>
      <FormWrap onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="组织名称" name="name" value={name} onChange={setName} required />
        <Field label="组织标识（slug）" name="slug" value={slug} onChange={setSlug} required />
        <div>
          <SubmitButton pending={applyAction.pending}>申请创建组织</SubmitButton>
        </div>
      </FormWrap>
      <Feedback error={applyAction.error} success={applyAction.success} />
      <p className="text-sm text-slate-500">
        收到邀请？
        <Link to="/invitations" className="ml-1 text-blue-600 hover:underline">
          前往接受邀请
        </Link>
      </p>
    </div>
  );
}
