// @vitest-environment jsdom
import type { PlatformUserRowView } from '@saas/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UserRowActions, UsersListView, userActionEnabled } from '../components/platform-users';

type UserRow = PlatformUserRowView;

const rows: UserRow[] = [
  {
    userId: 'u1',
    name: 'Alice',
    email: 'alice@example.com',
    status: 'active',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
  },
  {
    userId: 'u2',
    name: 'Bob',
    email: 'bob@example.com',
    status: 'suspended',
    createdAt: new Date('2026-01-03T03:04:05.000Z'),
  },
];

const noop = () => {};

afterEach(cleanup);

// loader/行内动作依赖 router + api-client（相对 URL fetch）在 dev 反代下运行——
// 端到端真跑归人工验收；此处锁纯展示基元的 typed 契约形与动作矩阵。
describe('UsersListView（纯展示 · typed 渲染 / 空态 / 状态徽标）', () => {
  it('typed 渲染名称 / 邮箱 / 状态徽标 / 创建时间', () => {
    render(<UsersListView items={rows} />);
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('生效')).toBeTruthy();
    expect(screen.getByText('已暂停')).toBeTruthy();
    expect(screen.getByText('2026-01-02')).toBeTruthy();
  });

  it('空态（items=[]）', () => {
    render(<UsersListView items={[]} />);
    expect(screen.getByText('平台暂无用户数据。')).toBeTruthy();
  });

  it('缺省（undefined）→ 空态，不崩', () => {
    render(<UsersListView />);
    expect(screen.getByText('平台暂无用户数据。')).toBeTruthy();
  });
});

describe('userActionEnabled（镜像 TRANSITIONS 子集·无 delete）', () => {
  it('active：可暂停 · 不可恢复', () => {
    expect(userActionEnabled('active')).toEqual({ suspend: true, resume: false });
  });
  it('suspended：可恢复 · 不可暂停', () => {
    expect(userActionEnabled('suspended')).toEqual({ suspend: false, resume: true });
  });
  it('deleted 终态：均不可', () => {
    expect(userActionEnabled('deleted')).toEqual({ suspend: false, resume: false });
  });
  it('pending_approval：均不可', () => {
    expect(userActionEnabled('pending_approval')).toEqual({ suspend: false, resume: false });
  });
});

describe('UserRowActions（按钮 disable 矩阵 · 纯展示）', () => {
  it('active 态：暂停可用，恢复禁用', () => {
    render(<UserRowActions status="active" pending={false} onSuspend={noop} onResume={noop} />);
    const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
    expect(btn('暂停').disabled).toBe(false);
    expect(btn('恢复').disabled).toBe(true);
  });

  it('pending=true → 全部禁用（防重复提交）', () => {
    render(<UserRowActions status="active" pending onSuspend={noop} onResume={noop} />);
    for (const el of screen.getAllByRole('button')) {
      expect((el as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
