// @vitest-environment jsdom
import type { OrganizationOdooAvailabilityView, PaymentStatusView } from '@saas/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HealthStatusPanel,
  OdooIntegrationPanel,
  PaymentIntegrationPanel,
} from './settings.integrations';

type PaymentStatus = PaymentStatusView;
type OdooAvailability = OrganizationOdooAvailabilityView;

afterEach(() => cleanup());

describe('HealthStatusPanel', () => {
  it('渲染 ok 状态徽标', () => {
    render(<HealthStatusPanel status="ok" />);
    expect(screen.getByText('ok')).toBeTruthy();
  });

  it('degraded 状态原样现形', () => {
    render(<HealthStatusPanel status="degraded" />);
    expect(screen.getByText('degraded')).toBeTruthy();
  });
});

describe('PaymentIntegrationPanel（typed 契约锁）', () => {
  const status: PaymentStatus = {
    status: 'ok',
    selected: 'alipay',
    available: ['stripe', 'alipay'],
  };

  it('高亮选定通道并列出可用通道集合', () => {
    render(<PaymentIntegrationPanel status={status} />);
    // selected 'alipay' 现形两处（选定徽标 + 可用列表）。
    expect(screen.getAllByText('alipay').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('stripe')).toBeTruthy();
    // 未列入 available 的通道不现形。
    expect(screen.queryByText('wechat_pay')).toBeNull();
  });
});

describe('OdooIntegrationPanel（按绑定态渲染·映射切片 D）', () => {
  it('available=true → 显「可用」', () => {
    const view: OdooAvailability = {
      available: true,
      odooBindingStatus: 'ready',
      odooCompanyId: 42,
    };
    render(<OdooIntegrationPanel view={view} />);
    expect(screen.getByText('可用')).toBeTruthy();
  });

  it('provisioning（建司中·非可用）→ 显「开通中」', () => {
    const view: OdooAvailability = {
      available: false,
      odooBindingStatus: 'provisioning',
      odooCompanyId: null,
    };
    render(<OdooIntegrationPanel view={view} />);
    expect(screen.getByText('开通中')).toBeTruthy();
  });

  it('failed → 显「开通失败」', () => {
    const view: OdooAvailability = {
      available: false,
      odooBindingStatus: 'failed',
      odooCompanyId: null,
    };
    render(<OdooIntegrationPanel view={view} />);
    expect(screen.getByText('开通失败')).toBeTruthy();
  });

  it('未绑定（null）→ 显「未开通」', () => {
    const view: OdooAvailability = {
      available: false,
      odooBindingStatus: null,
      odooCompanyId: null,
    };
    render(<OdooIntegrationPanel view={view} />);
    expect(screen.getByText('未开通')).toBeTruthy();
  });
});
