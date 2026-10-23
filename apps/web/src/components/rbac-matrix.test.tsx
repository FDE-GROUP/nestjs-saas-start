// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cellKey, type OrganizationRoleGrantView, RbacMatrix } from './rbac-matrix';

afterEach(cleanup);

const whole = (subject: string, action: string): OrganizationRoleGrantView => ({
  subject: subject as OrganizationRoleGrantView['subject'],
  action: action as OrganizationRoleGrantView['action'],
  conditions: null,
});

describe('RbacMatrix（6x5 grid · checked 判定 · toggle 回调）', () => {
  it('渲染 30 个 cell（6 subject × 5 action）', () => {
    render(<RbacMatrix grants={[]} pendingCell={null} onToggle={vi.fn()} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(30);
  });

  it('whole-subject 行（conditions=null）→ 对应格勾选', () => {
    render(<RbacMatrix grants={[whole('Member', 'read')]} pendingCell={null} onToggle={vi.fn()} />);
    expect((screen.getByLabelText('成员 查看') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('成员 删除') as HTMLInputElement).checked).toBe(false);
  });

  it('instance-level 行（conditions 非空）→ 不计入勾选（本片仅管理 whole-subject）', () => {
    render(
      <RbacMatrix
        grants={[{ subject: 'Workspace', action: 'update', conditions: { ownerId: 'u1' } }]}
        pendingCell={null}
        onToggle={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('工作区 修改') as HTMLInputElement).checked).toBe(false);
  });

  it('未勾格点击 → onToggle(subject, action, false)', () => {
    const onToggle = vi.fn();
    render(<RbacMatrix grants={[]} pendingCell={null} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText('角色 新建'));
    expect(onToggle).toHaveBeenCalledWith('Role', 'create', false);
  });

  it('已勾格点击 → onToggle(subject, action, true)', () => {
    const onToggle = vi.fn();
    render(
      <RbacMatrix grants={[whole('RoleGrant', 'delete')]} pendingCell={null} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByLabelText('授权 删除'));
    expect(onToggle).toHaveBeenCalledWith('RoleGrant', 'delete', true);
  });

  it('pendingCell 命中的格禁用（防连点竞态）', () => {
    render(<RbacMatrix grants={[]} pendingCell={cellKey('Member', 'create')} onToggle={vi.fn()} />);
    expect((screen.getByLabelText('成员 新建') as HTMLInputElement).disabled).toBe(true);
    // 其余格不受影响
    expect((screen.getByLabelText('成员 查看') as HTMLInputElement).disabled).toBe(false);
  });
});
