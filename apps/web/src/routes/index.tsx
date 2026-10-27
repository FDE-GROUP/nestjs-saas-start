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

/** 透传面防御形（GET /organizations 返回 BA organization 列表·无 Nest typed 契约）。 */
interface OrganizationOrg {
  id?: string;
  name?: string;
  slug?: string;
}
function extractOrganizations(raw: unknown): OrganizationOrg[] {
  if (Array.isArray(raw)) return raw as OrganizationOrg[];
  if (raw && typeof raw === 'object' && 'organizations' in raw) {
    const list = (raw as { organizations?: unknown }).organizations;
    if (Array.isArray(list)) return list as OrganizationOrg[];
  }
  return [];
}

/**
 * 租户目录防御形（GET /tenants·Nest typed 契约经 api-client 导出·此处取窄面供双层切换器渲染）。
 * 顶层=租户（隔离与计费边界），二级=组织（绑一家 Odoo 公司）。
 */
interface TenantDirectoryOrg {
  organizationId?: string;
  name?: string;
  slug?: string;
}
interface TenantDirectoryEntry {
  tenantId?: string;
  name?: string;
  slug?: string;
  status?: string;
  organizations?: TenantDirectoryOrg[];
}
function extractTenants(raw: unknown): TenantDirectoryEntry[] {
  const list = (raw as { tenants?: unknown } | undefined)?.tenants;
  return Array.isArray(list) ? (list as TenantDirectoryEntry[]) : [];
}

/** 租户准入态人类标签（顶层说租户·状态可辨）。 */
const TENANT_STATUS_LABEL: Record<string, string> = {
  pending_approval: '待审批',
  active: '生效',
  suspended: '已暂停',
  deleted: '已删除',
};

export const Route = createFileRoute('/')({
  // 未登录直接弹回登录页（deny-by-default 的前端映射·与后端会话墙同向）。
  loader: async () => {
    const session = await requireSession();
    // 先取「我可成员的组织」列表（GET /organizations）——用于判定是否需引导落租（须先于订阅取数）。
    const { data: organizationData, error: organizationError } =
      await api.GET('/api/v1/organizations');
    if (organizationError)
      logApiError({ path: '/api/v1/organizations', scope: 'organizations' }, organizationError);
    const organizations = organizationError ? [] : extractOrganizations(organizationData?.data);

    // 租户目录（GET /tenants·双层切换器数据源）：把成员组织按派生租户归组。与 `organizations`
    // 取数正交（后者仍供引导落租/订阅门控），目录缺席（未携/错）降级为空→切换器不渲。
    const { data: tenantData, error: tenantError } = await api.GET('/api/v1/tenants');
    if (tenantError) logApiError({ path: '/api/v1/tenants', scope: 'tenants' }, tenantError);
    const tenants = tenantError ? [] : extractTenants(tenantData?.data);

    // 引导落租（module-frontend-organization-bootstrap-activation）：会话未带 activeOrganizationId 且
    // **恰有一个**成员组织时自动 `POST /api/v1/organizations/active`（消订阅面冷 403·多组织交手动切换器·不自动择）。
    let activeOrganizationId = session.session.activeOrganizationId;
    let note: string | null = null;
    if (!activeOrganizationId && organizations.length === 1 && organizations[0]?.id) {
      const { error: activateError } = await api.POST('/api/v1/organizations/active', {
        body: { organizationId: organizations[0].id },
      });
      if (activateError) {
        logApiError(
          { path: '/api/v1/organizations/active', scope: 'organization.bootstrap' },
          activateError,
        );
        note = describeApiError(activateError);
      } else {
        activeOrganizationId = organizations[0].id;
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
      hasActiveOrganization: !!activeOrganizationId,
      subscription,
      note,
      organizations,
      tenants,
    };
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user, hasActiveOrganization, subscription, note, organizations, tenants } =
    Route.useLoaderData();
  const navigate = useNavigate();

  async function onSignOut() {
    await signOut();
    await navigate({ to: '/login' });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <SectionHeading>当前会话</SectionHeading>
        <dl className="grid grid-cols-1 gap-x-2 gap-y-1 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-[6rem_1fr] dark:border-slate-700">
          <dt className="text-slate-500 dark:text-slate-400">邮箱</dt>
          <dd data-testid="session-email" className="min-w-0 break-words">
            {user.email}
          </dd>
          <dt className="text-slate-500 dark:text-slate-400">用户 ID</dt>
          <dd className="min-w-0 break-all">{user.id}</dd>
        </dl>
        <div>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            登出
          </button>
        </div>
      </section>

      <TenantSwitchSection tenants={tenants} />

      <section className="flex flex-col gap-3">
        <SectionHeading>订阅摘要</SectionHeading>
        {!hasActiveOrganization && organizations.length === 0 ? (
          <OrganizationOnboardingPanel />
        ) : !hasActiveOrganization ? (
          <EmptyPanel label="尚无活跃租户，请在「租户与组织」中选择。" />
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
    <dl className="grid grid-cols-1 gap-x-2 gap-y-1 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-[8rem_1fr] dark:border-slate-700">
      <dt className="text-slate-500 dark:text-slate-400">档位</dt>
      <dd data-testid="sub-plan" className="min-w-0 break-words">
        {subscription.plan}
      </dd>
      <dt className="text-slate-500 dark:text-slate-400">座位上限</dt>
      <dd className="min-w-0 break-words">{subscription.seatsLimit}</dd>
      <dt className="text-slate-500 dark:text-slate-400">已用 / 剩余</dt>
      <dd className="min-w-0 break-words">
        {subscription.used} / {subscription.remaining}
      </dd>
    </dl>
  );
}

/** 双层切换器（顶层租级激活 · 二级组织选择·X7 租级化：顶层点击写会话 activeTenantId）。 */
function TenantSwitchSection({ tenants }: { tenants: TenantDirectoryEntry[] }) {
  const switchAction = useAction();
  const tenantAction = useAction();

  async function handleSwitch(orgId: string, orgName: string) {
    await switchAction.run({
      path: '/api/v1/organizations/active',
      method: 'POST',
      scope: 'organization.switch',
      successMessage: `已切换到「${orgName}」`,
      thunk: () =>
        api.POST('/api/v1/organizations/active', {
          body: { organizationId: orgId },
        }),
    });
  }

  // 顶层租级激活（X7·PUT /tenants/active）：写会话 activeTenantId，后续租级端点（计费/席位/成员）据此作用域。非本租成员后端 403（fail-closed）。
  async function handleSwitchTenant(tenantId: string, tenantName: string) {
    await tenantAction.run({
      path: '/api/v1/tenants/active',
      method: 'PUT',
      scope: 'tenant.switch',
      successMessage: `已切换到租户「${tenantName}」`,
      thunk: () => api.PUT('/api/v1/tenants/active', { body: { tenantId } }),
    });
  }

  if (tenants.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>租户与组织</SectionHeading>
      <div className="flex flex-col gap-3">
        {tenants.map((tenant) => (
          <div
            key={tenant.tenantId}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                租户：{tenant.name ?? tenant.tenantId}
              </span>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400">
                  {TENANT_STATUS_LABEL[tenant.status ?? ''] ?? tenant.status}
                </span>
                <SubmitButton
                  pending={tenantAction.pending}
                  onClick={() =>
                    tenant.tenantId &&
                    handleSwitchTenant(tenant.tenantId, tenant.name ?? tenant.tenantId)
                  }
                >
                  切换到此租户
                </SubmitButton>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {(tenant.organizations ?? []).map((org) => (
                <div
                  key={org.organizationId}
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {org.name ?? org.organizationId}
                  </span>
                  <SubmitButton
                    pending={switchAction.pending}
                    onClick={() =>
                      org.organizationId &&
                      handleSwitch(org.organizationId, org.name ?? org.organizationId)
                    }
                  >
                    切换到此组织
                  </SubmitButton>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Feedback
        error={switchAction.error ?? tenantAction.error}
        success={switchAction.success ?? tenantAction.success}
      />
    </section>
  );
}

/**
 * 零组织新注册引导（module-frontend-organization-onboarding）：承 A 片 §4 发现项，替此前纯文案死胡同。
 * 两条**合规**出路——① 申请创建自有组织（走 `POST /api/v1/organizations/applications`·落 `pending_approval`
 * 经平台审批·FR-1/FR-12）；② 经邀请链接加入既有组织（引导至既有 `/invitations` 页）。
 * **不**自动建活跃组织（直冲 S4 审批制·见 plan §4-① 建议拒绝），MVP 以静态 pending 回执呈现。
 */
function OrganizationOnboardingPanel() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const applyAction = useAction();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await applyAction.run({
      path: '/api/v1/organizations/applications',
      method: 'POST',
      scope: 'organization.apply',
      successMessage: '已提交，等待平台审批。',
      thunk: () => api.POST('/api/v1/organizations/applications', { body: { name, slug } }),
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <p className="text-sm text-slate-600 dark:text-slate-300">
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
      <p className="text-sm text-slate-500 dark:text-slate-400">
        收到邀请？
        <Link to="/invitations" className="ml-1 text-blue-600 hover:underline dark:text-blue-400">
          前往接受邀请
        </Link>
      </p>
    </div>
  );
}
