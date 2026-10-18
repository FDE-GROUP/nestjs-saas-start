/**
 * PIPL 自助面（C1·FR-7）：数据导出 + 账号注销（硬删·consent 匿名保留）。
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { DangerButton, Feedback, SubmitButton } from '../components/forms';
import { SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';

export const Route = createFileRoute('/settings/account')({
  loader: async () => {
    await requireSession();
    return { ok: true as const };
  },
  component: AccountPage,
});

function AccountPage() {
  const _result = Route.useLoaderData();
  const navigate = useNavigate();
  const exportAction = useAction();
  const deleteAction = useAction();
  const [confirmText, setConfirmText] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExportError(null);
    const { data, error } = await api.GET('/api/v1/users/me/data-export');
    if (error) {
      logApiError({ path: '/api/v1/users/me/data-export', scope: 'pipl.export' }, error);
      setExportError(describeApiError(error));
      return;
    }
    // 浏览器下载 JSON
    const json = JSON.stringify(data?.data ?? data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `personal-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    if (confirmText !== 'DELETE') return;
    const ok = await deleteAction.run({
      path: '/api/v1/users/me',
      method: 'DELETE',
      scope: 'pipl.erase',
      successMessage: '账号已注销',
      thunk: () => api.DELETE('/api/v1/users/me'),
    });
    if (ok) {
      await navigate({ to: '/login' });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <SectionHeading>数据导出（PIPL 可携带权）</SectionHeading>
        <p className="text-sm text-slate-500">下载个人数据聚合快照（不含凭据）。</p>
        <SubmitButton pending={exportAction.pending} onClick={handleExport}>
          导出个人数据
        </SubmitButton>
        {exportError ? <Feedback error={exportError} success={null} /> : null}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-red-200 p-4">
        <SectionHeading>注销账号（PIPL 被遗忘权）</SectionHeading>
        <p className="text-sm text-red-600">
          永久删除个人账号及关联数据，操作不可逆。输入 DELETE 确认。
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='输入 "DELETE" 确认'
          className="rounded border border-red-300 px-2 py-1 text-sm"
        />
        <DangerButton pending={deleteAction.pending} onClick={handleDelete}>
          永久注销
        </DangerButton>
        <Feedback error={deleteAction.error} success={deleteAction.success} />
      </section>
    </div>
  );
}
