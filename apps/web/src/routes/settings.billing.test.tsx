// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type PaymentStatus,
  PaymentStatusView,
  planLabel,
  type SubscriptionSnapshot,
  SubscriptionSummaryView,
  seatState,
  type UpgradeDto,
  UpgradeForm,
} from '../components/billing-panels';

// loader/写面动作依赖 router + api-client（相对 URL fetch）在 jsdom 下不可靠——
// 端到端真跑归人工验收；此处只锁纯展示/判定基元的 typed 契约形与状态矩阵。
afterEach(cleanup);

describe('planLabel（档位中文标签）', () => {
  it('三档映射 + 未知回落原串', () => {
    expect(planLabel('free')).toBe('基础');
    expect(planLabel('pro')).toBe('专业');
    expect(planLabel('enterprise')).toBe('企业');
    expect(planLabel('gold')).toBe('gold');
  });
});

describe('seatState（席位用量判定基元）', () => {
  it('used==limit → full', () => {
    expect(seatState(5, 5)).toEqual({ pct: 100, tone: 'full' });
  });
  it('used>limit → pct 钳位 100 且 full', () => {
    expect(seatState(8, 5)).toEqual({ pct: 100, tone: 'full' });
  });
  it('用量 80%..99% → near', () => {
    expect(seatState(4, 5)).toEqual({ pct: 80, tone: 'near' });
  });
  it('低用量 → ok', () => {
    expect(seatState(1, 5)).toEqual({ pct: 20, tone: 'ok' });
  });
  it('limit<=0：used>0 → 100/full；used==0 → 0/ok', () => {
    expect(seatState(3, 0)).toEqual({ pct: 100, tone: 'full' });
    expect(seatState(0, 0)).toEqual({ pct: 0, tone: 'ok' });
  });
});

const snapWith: SubscriptionSnapshot = {
  hasSubscription: true,
  plan: 'pro',
  seatsLimit: 5,
  used: 4,
  remaining: 1,
  providerCustomerId: 'cus_123',
};

describe('SubscriptionSummaryView（typed 快照渲染）', () => {
  it('有订阅：档位 / 席位 / 余量 / 客户 id', () => {
    render(<SubscriptionSummaryView snap={snapWith} />);
    expect(screen.getByText('专业')).toBeTruthy();
    expect(screen.getByText(/4 \/ 5/)).toBeTruthy();
    expect(screen.getByText(/cus_123/)).toBeTruthy();
  });
  it('providerCustomerId=null → 未绑定支付客户', () => {
    render(<SubscriptionSummaryView snap={{ ...snapWith, providerCustomerId: null }} />);
    expect(screen.getByText(/未绑定支付客户/)).toBeTruthy();
  });
  it('hasSubscription=false → 空态提示', () => {
    render(
      <SubscriptionSummaryView
        snap={{
          hasSubscription: false,
          plan: 'free',
          seatsLimit: 0,
          used: 0,
          remaining: 0,
          providerCustomerId: null,
        }}
      />,
    );
    expect(screen.getByText(/尚无生效订阅/)).toBeTruthy();
  });
});

describe('PaymentStatusView（§6.4 通道现状）', () => {
  it('有可用通道：渲染 selected 与各通道', () => {
    const status: PaymentStatus = { status: 'ok', selected: 'stripe', available: ['stripe'] };
    render(<PaymentStatusView status={status} />);
    expect(screen.getAllByText('stripe').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/未配置可用支付通道/)).toBeNull();
  });
  it('available 为空 → 红提示', () => {
    const status: PaymentStatus = { status: 'ok', selected: 'stripe', available: [] };
    render(<PaymentStatusView status={status} />);
    expect(screen.getByText(/未配置可用支付通道/)).toBeTruthy();
  });
});

describe('UpgradeForm（纯表单·回调外置）', () => {
  it('提交回调收到 typed dto（默认 pro + 邮箱 + 席位）', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <UpgradeForm pending={false} disabled={false} onSubmit={onSubmit} />,
    );
    fireEvent.change(container.querySelector('input[name="customerEmail"]') as HTMLInputElement, {
      target: { value: 'billing@example.com' },
    });
    fireEvent.change(container.querySelector('input[name="seatsLimit"]') as HTMLInputElement, {
      target: { value: '10' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交开通/升级' }));
    const dto: UpgradeDto = { plan: 'pro', customerEmail: 'billing@example.com', seatsLimit: 10 };
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(dto);
  });
  it('disabled → 提交不触发回调', () => {
    const onSubmit = vi.fn();
    const { container } = render(<UpgradeForm pending={false} disabled onSubmit={onSubmit} />);
    fireEvent.change(container.querySelector('input[name="customerEmail"]') as HTMLInputElement, {
      target: { value: 'x@y.z' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交开通/升级' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
