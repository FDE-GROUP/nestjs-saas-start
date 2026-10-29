// @vitest-environment jsdom
import type { PlatformTenantRowView } from '@saas/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionEnabled,
  OrganizationApprovalActions,
  StatusBadge,
  TenantActions,
} from '../components/platform-tenants';
import { TenantsListView } from './platform.tenants';

type TenantRow = PlatformTenantRowView;

const rows: TenantRow[] = [
  {
    tenantId: 't1',
    name: 'Acme Inc',
    slug: 'acme',
    status: 'active',
    organizationCount: 3,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
  },
  {
    tenantId: 't2',
    name: 'Globex',
    slug: 'globex',
    status: 'suspended',
    organizationCount: 1,
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
  },
];

const noop = () => {};

afterEach(cleanup);

// loader/详情动作依赖 router + api-client（相对 URL fetch）在 dev 反代下运行——
// 端到端真跑归人工验收；此处锁纯展示基元的 typed 契约形与状态机动作矩阵。
describe('TenantsListView（纯展示 · typed 渲染 / 空态 / 状态徽标）', () => {
  it('typed 渲染名称 / slug / 组织数 / 状态徽标 / 创建时间', () => {
    render(<TenantsListView items={rows} />);
    expect(screen.getByText('Acme Inc')).toBeTruthy();
    expect(screen.getByText('acme')).toBeTruthy();
    expect(screen.getByText('Globex')).toBeTruthy();
    expect(screen.getByText('生效')).toBeTruthy();
    expect(screen.getByText('已暂停')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getAllByText('2026-01-02')).toHaveLength(2);
  });

  it('空态（items=[]）', () => {
    render(<TenantsListView items={[]} />);
    expect(screen.getByText('平台暂无租户数据。')).toBeTruthy();
  });

  it('缺省（undefined）→ 空态，不崩', () => {
    render(<TenantsListView />);
    expect(screen.getByText('平台暂无租户数据。')).toBeTruthy();
  });
});

describe('StatusBadge（四态文案映射）', () => {
  it('pending_approval → 待审批', () => {
    render(<StatusBadge status="pending_approval" />);
    expect(screen.getByText('待审批')).toBeTruthy();
  });
  it('deleted → 已删除', () => {
    render(<StatusBadge status="deleted" />);
    expect(screen.getByText('已删除')).toBeTruthy();
  });
});

describe('actionEnabled（镜像 tenant.status TRANSITIONS 状态机矩阵）', () => {
  it('active：可暂停 / 可软删 · 不可恢复 / 不可硬删', () => {
    expect(actionEnabled('active')).toEqual({
      suspend: true,
      resume: false,
      softDelete: true,
      permanentDelete: false,
    });
  });
  it('suspended：可恢复 / 可软删 · 不可暂停 / 不可硬删', () => {
    expect(actionEnabled('suspended')).toEqual({
      suspend: false,
      resume: true,
      softDelete: true,
      permanentDelete: false,
    });
  });
  it('deleted 终态：仅可硬删', () => {
    expect(actionEnabled('deleted')).toEqual({
      suspend: false,
      resume: false,
      softDelete: false,
      permanentDelete: true,
    });
  });
  it('pending_approval：不可生命周期动作 · 仅可软删', () => {
    expect(actionEnabled('pending_approval')).toEqual({
      suspend: false,
      resume: false,
      softDelete: true,
      permanentDelete: false,
    });
  });
});

describe('TenantActions（按钮 disable 矩阵 · 纯展示）', () => {
  it('active 态：暂停/软删可用，恢复/硬删禁用', () => {
    render(
      <TenantActions
        status="active"
        pending={false}
        onSuspend={noop}
        onResume={noop}
        onSoftDelete={noop}
        onPermanentDelete={noop}
      />,
    );
    const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
    expect(btn('暂停').disabled).toBe(false);
    expect(btn('软删除').disabled).toBe(false);
    expect(btn('恢复').disabled).toBe(true);
    expect(btn('硬删除').disabled).toBe(true);
  });

  it('deleted 态：硬删可用且回调触发', () => {
    const onPermanentDelete = vi.fn();
    render(
      <TenantActions
        status="deleted"
        pending={false}
        onSuspend={noop}
        onResume={noop}
        onSoftDelete={noop}
        onPermanentDelete={onPermanentDelete}
      />,
    );
    const hard = screen.getByRole('button', {
      name: '硬删除',
    }) as HTMLButtonElement;
    expect(hard.disabled).toBe(false);
    fireEvent.click(hard);
    expect(onPermanentDelete).toHaveBeenCalledTimes(1);
  });

  it('pending=true → 全部禁用（防重复提交）', () => {
    render(
      <TenantActions
        status="active"
        pending
        onSuspend={noop}
        onResume={noop}
        onSoftDelete={noop}
        onPermanentDelete={noop}
      />,
    );
    for (const el of screen.getAllByRole('button')) {
      expect((el as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe('OrganizationApprovalActions（入驻审批动作·仅 pending_approval 显·F7）', () => {
  it('pending_approval → 渲「批准/驳回」且回调各触发一次', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <OrganizationApprovalActions
        status="pending_approval"
        pending={false}
        onApprove={onApprove}
        onReject={onReject}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '批准' }));
    fireEvent.click(screen.getByRole('button', { name: '驳回' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('非 pending_approval（active）→ 不渲任何审批钮', () => {
    render(
      <OrganizationApprovalActions
        status="active"
        pending={false}
        onApprove={noop}
        onReject={noop}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pending_approval + pending=true → 审批钮均禁用（防重复提交）', () => {
    render(
      <OrganizationApprovalActions
        status="pending_approval"
        pending
        onApprove={noop}
        onReject={noop}
      />,
    );
    for (const el of screen.getAllByRole('button')) {
      expect((el as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
