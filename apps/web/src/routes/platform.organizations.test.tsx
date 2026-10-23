// @vitest-environment jsdom
import type { components } from '@saas/api-client';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  actionEnabled,
  OrganizationActions,
  StatusBadge,
} from '../components/platform-organizations';
import { OrganizationsListView } from './platform.organizations';

type OrganizationRow = components['schemas']['PlatformOrganizationRowResponse'];

const rows: OrganizationRow[] = [
  {
    organizationId: 'o1',
    name: 'Acme Inc',
    slug: 'acme',
    status: 'active',
    createdAt: '2026-01-02T03:04:05.000Z',
  },
  {
    organizationId: 'o2',
    name: 'Globex',
    slug: 'globex',
    status: 'suspended',
    createdAt: '2026-01-02T03:04:05.000Z',
  },
];

const noop = () => {};

afterEach(cleanup);

// loader/详情动作依赖 router + api-client（相对 URL fetch）在 dev 反代下运行——
// 端到端真跑归人工验收；此处锁纯展示基元的 typed 契约形与状态机动作矩阵。
describe('OrganizationsListView（纯展示 · typed 渲染 / 空态 / 状态徽标）', () => {
  it('typed 渲染名称 / slug / 状态徽标 / 创建时间', () => {
    render(<OrganizationsListView items={rows} />);
    expect(screen.getByText('Acme Inc')).toBeTruthy();
    expect(screen.getByText('acme')).toBeTruthy();
    expect(screen.getByText('Globex')).toBeTruthy();
    expect(screen.getByText('生效')).toBeTruthy();
    expect(screen.getByText('已暂停')).toBeTruthy();
    expect(screen.getAllByText('2026-01-02')).toHaveLength(2);
  });

  it('空态（items=[]）', () => {
    render(<OrganizationsListView items={[]} />);
    expect(screen.getByText('平台暂无组织数据。')).toBeTruthy();
  });

  it('缺省（undefined）→ 空态，不崩', () => {
    render(<OrganizationsListView />);
    expect(screen.getByText('平台暂无组织数据。')).toBeTruthy();
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

describe('actionEnabled（镜像 TRANSITIONS 状态机矩阵）', () => {
  it('active：可暂停 / 可软删 · 不可恢复 / 不可硬删 / 不可审批驳回', () => {
    expect(actionEnabled('active')).toEqual({
      approve: false,
      reject: false,
      suspend: true,
      resume: false,
      softDelete: true,
      permanentDelete: false,
    });
  });
  it('suspended：可恢复 / 可软删 · 不可暂停 / 不可硬删', () => {
    expect(actionEnabled('suspended')).toEqual({
      approve: false,
      reject: false,
      suspend: false,
      resume: true,
      softDelete: true,
      permanentDelete: false,
    });
  });
  it('deleted 终态：仅可硬删', () => {
    expect(actionEnabled('deleted')).toEqual({
      approve: false,
      reject: false,
      suspend: false,
      resume: false,
      softDelete: false,
      permanentDelete: true,
    });
  });
  it('pending_approval：可审批 / 可驳回 · 不可其它生命周期动作', () => {
    expect(actionEnabled('pending_approval')).toEqual({
      approve: true,
      reject: true,
      suspend: false,
      resume: false,
      softDelete: true,
      permanentDelete: false,
    });
  });
});

describe('OrganizationActions（按钮 disable 矩阵 · 纯展示）', () => {
  it('active 态：暂停/软删可用，恢复/硬删/审批/驳回禁用', () => {
    render(
      <OrganizationActions
        status="active"
        pending={false}
        onApprove={noop}
        onReject={noop}
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
    expect(btn('审批通过').disabled).toBe(true);
    expect(btn('驳回申请').disabled).toBe(true);
  });

  it('pending_approval 态：审批/驳回可用且回调触发', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <OrganizationActions
        status="pending_approval"
        pending={false}
        onApprove={onApprove}
        onReject={onReject}
        onSuspend={noop}
        onResume={noop}
        onSoftDelete={noop}
        onPermanentDelete={noop}
      />,
    );
    const approve = screen.getByRole('button', {
      name: '审批通过',
    }) as HTMLButtonElement;
    const reject = screen.getByRole('button', { name: '驳回申请' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    expect(reject.disabled).toBe(false);
    fireEvent.click(approve);
    fireEvent.click(reject);
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('pending=true → 全部禁用（防重复提交）', () => {
    render(
      <OrganizationActions
        status="pending_approval"
        pending
        onApprove={noop}
        onReject={noop}
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
