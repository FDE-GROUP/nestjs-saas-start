import type { PlatformUserRowView } from '@saas/contracts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Feedback, Field, FormWrap, SubmitButton } from '../components/forms';
import { ErrorPanel, SectionHeading } from '../components/panels';
import { UserRowActions, UsersListView } from '../components/platform-users';
import { rpc } from '../lib/api';
import { apiErrorDetail, describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';

type UserRow = PlatformUserRowView;

const LIMIT = 20;

interface UserSearch {
  offset: number;
  q?: string;
}

export const Route = createFileRoute('/platform/users')({
  validateSearch: (search: Record<string, unknown>): UserSearch => ({
    offset: Number(search.offset ?? 0) || 0,
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
  }),
  // search 经 loaderDeps 注入 deps（对齐 TanStack Router 1.x：LoaderFnContext 无 search 字段，
  // validated search 只在 loaderDeps 的 opts 暴露）——此前直取 ctx.search 运行期恒 undefined 致崩。
  loaderDeps: ({ search }): UserSearch => ({ offset: search.offset, q: search.q }),
  loader: async ({ deps }) => {
    await requireSession();
    try {
      const page = (await rpc.platform.users.list({
        limit: LIMIT,
        offset: deps.offset,
        search: deps.q,
      })) as unknown as { items?: UserRow[]; total?: number };
      return { kind: 'ok' as const, page, offset: deps.offset, q: deps.q };
    } catch (e) {
      logApiError({ path: '/api/v1/platform/users', scope: 'platform.users' }, e);
      return {
        kind: 'error' as const,
        denied: apiErrorDetail(e).statusCode === 403,
        body: describeApiError(e),
      };
    }
  },
  component: PlatformUsersPage,
});

function PlatformUsersPage() {
  const result = Route.useLoaderData();
  const navigate = useNavigate();
  // hooks 全置早退前（rules-of-hooks·对齐 F4a 纠偏）。
  const [q, setQ] = useState(result.kind === 'ok' ? (result.q ?? '') : '');

  if (result.kind === 'error') {
    return (
      <ErrorPanel
        message={
          result.denied ? `无平台运营权限（仅平台运营者可访问）：${result.body}` : result.body
        }
      />
    );
  }

  const items = result.page?.items ?? [];
  const total = result.page?.total ?? 0;
  const offset = result.offset;

  function goPage(nextOffset: number) {
    navigate({
      to: '/platform/users',
      search: (prev) => ({ ...prev, offset: Math.max(0, nextOffset) }),
    });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ to: '/platform/users', search: () => ({ offset: 0, q: q || undefined }) });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading>用户治理</SectionHeading>

      <FormWrap onSubmit={submitSearch} className="flex items-end gap-3">
        <Field
          label="搜索"
          name="q"
          value={q}
          onChange={setQ}
          placeholder="按名称 / 邮箱 模糊匹配"
        />
        <button
          type="submit"
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          搜索
        </button>
      </FormWrap>

      <UsersListView items={items} renderActions={(u) => <UserGovernanceRow user={u} />} />

      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
        <button
          type="button"
          onClick={() => goPage(offset - LIMIT)}
          disabled={offset <= 0}
          className="rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          上一页
        </button>
        <span>
          共 {total} 条 · 偏移 {offset}
        </span>
        <button
          type="button"
          onClick={() => goPage(offset + LIMIT)}
          disabled={offset + LIMIT >= total}
          className="rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

/**
 * 行内治理动作容器（含 useAction + api·页面级·不入纯展示测）。
 * suspend 采行内 toggle：点「暂停」→ 展开 reason 输入 → 确认提交（裁①甲·承 settings.roles rename 模式）；
 * resume 单击即执行。成功经 useAction 内 router.invalidate() 重跑 loader。
 */
function UserGovernanceRow({ user }: { user: UserRow }) {
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const id = user.userId;

  async function doSuspend(e: React.FormEvent) {
    e.preventDefault();
    const ok = await action.run({
      path: `/api/v1/platform/users/${id}/suspend`,
      method: 'PATCH',
      scope: 'platform.user.suspend',
      successMessage: '已暂停（active→suspended · 会话失效）',
      thunk: () =>
        rpc.platform.users.suspend({ id, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
    });
    if (ok) {
      setEditing(false);
      setReason('');
    }
  }

  async function doResume() {
    await action.run({
      path: `/api/v1/platform/users/${id}/resume`,
      method: 'PATCH',
      scope: 'platform.user.resume',
      successMessage: '已恢复（suspended→active）',
      thunk: () => rpc.platform.users.resume({ id }),
    });
  }

  if (editing) {
    return (
      <FormWrap onSubmit={doSuspend} className="flex flex-col gap-2">
        <Field
          label="暂停理由（可选·写审计）"
          name={`reason-${id}`}
          value={reason}
          onChange={setReason}
          placeholder="如：违规内容 / 风控"
        />
        <div className="flex items-center gap-2">
          <SubmitButton pending={action.pending}>确认暂停</SubmitButton>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setReason('');
            }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            取消
          </button>
        </div>
        <Feedback error={action.error} success={action.success} />
      </FormWrap>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <UserRowActions
        status={user.status}
        pending={action.pending}
        onSuspend={() => setEditing(true)}
        onResume={doResume}
      />
      <Feedback error={action.error} success={action.success} />
    </div>
  );
}
