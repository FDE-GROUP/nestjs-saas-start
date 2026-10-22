// @vitest-environment jsdom
import type { components } from '@saas/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HealthStatusPanel, PaymentIntegrationPanel } from './settings.integrations';

type PaymentStatus = components['schemas']['PaymentStatusResponse'];

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
