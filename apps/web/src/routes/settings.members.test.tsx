// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MembersView } from './settings.members';

afterEach(cleanup);

describe('MembersView（BA 透传面 · 防御性渲染 / 空态）', () => {
  it('透传 {members:[...]} → 用户 ID + 角色表', () => {
    render(
      <MembersView
        raw={{
          members: [
            { id: 'm1', userId: 'u1', role: 'owner' },
            { id: 'm2', userId: 'u2', role: 'member' },
          ],
        }}
      />,
    );
    expect(screen.getByText('u1')).toBeTruthy();
    expect(screen.getByText('owner')).toBeTruthy();
    expect(screen.getByText('u2')).toBeTruthy();
    expect(screen.getByText('member')).toBeTruthy();
  });

  it('非预期形（无 members 数组）→ 空态，不崩', () => {
    render(<MembersView raw={{ unexpected: true }} />);
    expect(screen.getByText('当前组织暂无成员数据。')).toBeTruthy();
  });

  it('缺字段行 → 占位破折号', () => {
    render(<MembersView raw={{ members: [{ id: 'm1' }] }} />);
    expect(screen.getAllByText('—').length).toBe(2);
  });
});
