import type { components } from '@saas/api-client';
import type { ReactNode } from 'react';
import { StatusBadge } from './platform-tenants';

/**
 * 平台用户治理面纯展示/判定基元（前端 F4b · module-frontend-platform §F4b）。
 * 治理动作可用性镜像后端 `UserStatus = TenancyStatus` 状态机——suspend 仅 active · resume 仅
 * suspended（无删除面）。前端 disable 非法动作仅为止损体验，最终裁判仍是后端 409（双保险·对齐 F4a）。
 */
type UserRow = components['schemas']['PlatformUserRowResponse'];
export type UserStatus = UserRow['status'];

/**
 * 按当前状态判定两类治理动作是否合法（镜像 TRANSITIONS 子集·无 delete）：
 * suspend 仅 active · resume 仅 suspended。
 */
export function userActionEnabled(status: UserStatus): { suspend: boolean; resume: boolean } {
  return {
    suspend: status === 'active',
    resume: status === 'suspended',
  };
}

const BTN =
  'rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800';
const DANGER =
  'rounded border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/50 dark:text-red-400 dark:hover:bg-red-500/10';

/**
 * 生命周期动作按钮组（纯·回调外置·可脱离 router/mutation 测 enable/disable 矩阵）。
 * suspend 的实际确认（键 reason）由调用方在 onSuspend 里把关（见路由行内 toggle）。
 */
export function UserRowActions({
  status,
  pending,
  onSuspend,
  onResume,
}: {
  status: UserStatus;
  pending: boolean;
  onSuspend: () => void;
  onResume: () => void;
}) {
  const en = userActionEnabled(status);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={!en.suspend || pending}
        title={en.suspend ? '暂停（active→suspended · 会话失效）' : '当前状态不允许暂停'}
        onClick={onSuspend}
        className={DANGER}
      >
        暂停
      </button>
      <button
        type="button"
        disabled={!en.resume || pending}
        title={en.resume ? '恢复（suspended→active）' : '当前状态不允许恢复'}
        onClick={onResume}
        className={BTN}
      >
        恢复
      </button>
    </div>
  );
}

/**
 * 纯展示（收 typed 用户页·可脱离 router 组件测：typed 渲染 / 空态 / 状态徽标）。
 * 数据源 = `PlatformUserPageResponse`（`{items,total,limit,offset}`·offset 分页）。
 * 动作列经 `renderActions` 插槽外置（页面级传带 useAction 的行容器·纯展示测不传则不渲动作列）。
 */
export function UsersListView({
  items,
  renderActions,
}: {
  items?: UserRow[];
  renderActions?: (user: UserRow) => ReactNode;
}) {
  const list = items ?? [];
  return (
    <section className="flex flex-col gap-3">
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          平台暂无用户数据。
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">名称</th>
              <th className="py-2 pr-4 font-medium">邮箱</th>
              <th className="py-2 pr-4 font-medium">状态</th>
              <th className="py-2 pr-4 font-medium">创建时间</th>
              {renderActions && <th className="py-2 font-medium">操作</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.userId} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 font-medium text-slate-800 dark:text-slate-100">
                  {u.name}
                </td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">{u.email}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={u.status} />
                </td>
                <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">
                  {u.createdAt ? u.createdAt.slice(0, 10) : '—'}
                </td>
                {renderActions && <td className="py-2">{renderActions(u)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
