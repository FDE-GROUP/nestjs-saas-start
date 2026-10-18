import type { components } from '@saas/api-client';

/**
 * 平台租户治理面纯展示/判定基元（前端 F4a · module-frontend-platform §2.3）。
 * 生命周期动作可用性镜像后端 `tenant-lifecycle.ts` TRANSITIONS——前端 disable 非法转移
 * 仅为止损体验，最终裁判仍是后端 409（双保险·对齐 F3 系统角色模式）。
 */
export type TenantStatus = components['schemas']['PlatformTenantRowResponse']['status'];

const LABELS: Record<TenantStatus, string> = {
  pending_approval: '待审批',
  active: '生效',
  suspended: '已暂停',
  deleted: '已删除',
};

const STYLES: Record<TenantStatus, string> = {
  pending_approval: 'bg-amber-50 text-amber-700',
  active: 'bg-green-50 text-green-700',
  suspended: 'bg-orange-50 text-orange-700',
  deleted: 'bg-slate-100 text-slate-500',
};

/** 状态徽标（未知值回落原串·防渲染崩）。 */
export function StatusBadge({ status }: { status: TenantStatus }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${STYLES[status] ?? 'bg-slate-100 text-slate-500'}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}

/**
 * 按当前状态判定四类治理动作是否合法（镜像 TRANSITIONS）：
 * suspend 仅 active · resume 仅 suspended · 软删非 deleted · 硬删仅 deleted 终态。
 */
export function actionEnabled(status: TenantStatus): {
  suspend: boolean;
  resume: boolean;
  softDelete: boolean;
  permanentDelete: boolean;
} {
  return {
    suspend: status === 'active',
    resume: status === 'suspended',
    softDelete: status !== 'deleted',
    permanentDelete: status === 'deleted',
  };
}

const BTN =
  'rounded border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';
const DANGER =
  'rounded border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * 生命周期动作按钮组（纯·回调外置·可脱离 router/mutation 测 enable/disable 矩阵）。
 * 破坏性动作（软删/硬删）的实际确认由调用方在回调里把关（见详情路由）。
 */
export function TenantActions({
  status,
  pending,
  onSuspend,
  onResume,
  onSoftDelete,
  onPermanentDelete,
}: {
  status: TenantStatus;
  pending: boolean;
  onSuspend: () => void;
  onResume: () => void;
  onSoftDelete: () => void;
  onPermanentDelete: () => void;
}) {
  const en = actionEnabled(status);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={!en.suspend || pending}
        title={en.suspend ? '暂停（active→suspended）' : '当前状态不允许暂停'}
        onClick={onSuspend}
        className={BTN}
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
      <button
        type="button"
        disabled={!en.softDelete || pending}
        title={en.softDelete ? '软删除（→ deleted · 行留供导出）' : '当前状态不允许删除'}
        onClick={onSoftDelete}
        className={DANGER}
      >
        软删除
      </button>
      <button
        type="button"
        disabled={!en.permanentDelete || pending}
        title={
          en.permanentDelete ? '不可逆硬删（需先软删 · FK 级联 + 事件清除）' : '仅已删除终态可硬删'
        }
        onClick={onPermanentDelete}
        className={DANGER}
      >
        硬删除
      </button>
    </div>
  );
}
