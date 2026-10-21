import type { components } from '@saas/api-client';
import { useState } from 'react';

/**
 * 订阅计费面纯展示/判定基元（Epic 06 §6.1/§6.4/§6.2 · 前端消费面）。
 *
 * 视图与判定纯件化（回调外置·可脱离 router/mutation 单测）；typed 形直接取生成契约
 * `SubscriptionResponse` / `PaymentStatusResponse`，写面 dto 对齐 `createSubscriptionSchema`。
 */
export type SubscriptionSnapshot = components['schemas']['SubscriptionResponse'];
export type PaymentStatus = components['schemas']['PaymentStatusResponse'];

export interface UpgradeDto {
  plan: 'free' | 'pro' | 'enterprise';
  customerEmail: string;
  seatsLimit?: number;
  storageQuota?: number;
  apiQuota?: number;
}

const PLAN_LABELS: Record<UpgradeDto['plan'], string> = {
  free: '基础',
  pro: '专业',
  enterprise: '企业',
};

/** 档位中文标签（未知回落原串·防渲染崩）。 */
export function planLabel(plan: string): string {
  return PLAN_LABELS[plan as UpgradeDto['plan']] ?? plan;
}

export type SeatTone = 'ok' | 'near' | 'full';

/**
 * 席位用量判定基元：`pct` 钳位 0..100（limit<=0 时按 used 是否>0 归 100/0）；
 * `used>0 且 used>=limit` 记 `full`（促升级·0/0 不算满）·`pct>=80` 记 `near`·余 `ok`。
 */
export function seatState(used: number, seatsLimit: number): { pct: number; tone: SeatTone } {
  const pct =
    seatsLimit > 0
      ? Math.min(100, Math.max(0, Math.round((used / seatsLimit) * 100)))
      : used > 0
        ? 100
        : 0;
  const tone: SeatTone = used > 0 && used >= seatsLimit ? 'full' : pct >= 80 ? 'near' : 'ok';
  return { pct, tone };
}

const TONE_BAR: Record<SeatTone, string> = {
  ok: 'bg-green-500',
  near: 'bg-amber-500',
  full: 'bg-red-500',
};

/** 当前订阅快照（§6.1·纯展示）。无生效订阅走空态提示。 */
export function SubscriptionSummaryView({ snap }: { snap: SubscriptionSnapshot }) {
  if (!snap.hasSubscription) {
    return <p className="text-sm text-slate-400">本租户尚无生效订阅，可在下方开通档位。</p>;
  }
  const { pct, tone } = seatState(snap.used, snap.seatsLimit);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-slate-500">当前档位</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white">
          {planLabel(snap.plan)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            席位用量 {snap.used} / {snap.seatsLimit}（余 {snap.remaining}）
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
          <div className={`h-full ${TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        支付客户：
        {snap.providerCustomerId ?? '未绑定支付客户'}
      </p>
    </div>
  );
}

/** 支付集成状态（§6.4·纯展示）。无可用通道走红提示。 */
export function PaymentStatusView({ status }: { status: PaymentStatus }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-slate-500">选定通道</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {status.selected}
        </span>
      </div>
      {status.available.length === 0 ? (
        <p className="text-xs text-red-600" role="alert">
          未配置可用支付通道，开通/升级将不可用。
        </p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="text-slate-500">可用通道</span>
          {status.available.map((p) => (
            <span key={p} className="rounded border border-slate-200 px-2 py-0.5">
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 开通/升级表单（§6.2·纯·回调外置）。无可用通道时 `disabled` 禁提交并给提示；
 * 破坏性无·不预填业务配额（留档由后端按档位默认兜底）。
 */
export function UpgradeForm({
  pending,
  disabled,
  onSubmit,
}: {
  pending: boolean;
  disabled: boolean;
  onSubmit: (dto: UpgradeDto) => void;
}) {
  const [plan, setPlan] = useState<string>('pro');
  const [customerEmail, setEmail] = useState('');
  const [seatsLimit, setSeatsLimit] = useState('');
  const [storageQuota, setStorageQuota] = useState('');
  const [apiQuota, setApiQuota] = useState('');

  const num = (v: string): number | undefined => {
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || pending) return;
    const dto: UpgradeDto = {
      plan: plan as UpgradeDto['plan'],
      customerEmail,
    };
    const seats = num(seatsLimit);
    const storage = num(storageQuota);
    const api = num(apiQuota);
    if (seats !== undefined) dto.seatsLimit = seats;
    if (storage !== undefined) dto.storageQuota = storage;
    if (api !== undefined) dto.apiQuota = api;
    onSubmit(dto);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">
            档位<span className="text-red-500"> *</span>
          </span>
          <select
            name="plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="free">基础（free）</option>
            <option value="pro">专业（pro）</option>
            <option value="enterprise">企业（enterprise）</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">
            客户邮箱<span className="text-red-500"> *</span>
          </span>
          <input
            name="customerEmail"
            type="email"
            required
            value={customerEmail}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="billing@example.com"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">席位上限</span>
          <input
            name="seatsLimit"
            type="number"
            min={0}
            value={seatsLimit}
            onChange={(e) => setSeatsLimit(e.target.value)}
            className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">存储配额</span>
          <input
            name="storageQuota"
            type="number"
            min={0}
            value={storageQuota}
            onChange={(e) => setStorageQuota(e.target.value)}
            className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">API 配额</span>
          <input
            name="apiQuota"
            type="number"
            min={0}
            value={apiQuota}
            onChange={(e) => setApiQuota(e.target.value)}
            className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
      </div>
      {disabled && (
        <p className="text-xs text-amber-600">当前无可用支付通道，暂不能提交开通/升级。</p>
      )}
      <div>
        <button
          type="submit"
          disabled={disabled || pending}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? '处理中…' : '提交开通/升级'}
        </button>
      </div>
    </form>
  );
}
