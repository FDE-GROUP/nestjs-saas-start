// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MembersView } from './settings.members';

afterEach(cleanup);

describe('MembersView（租级成员 SSOT · 防御性渲染 / 空态）', () => {
  it('扁平数组 → 成员（name/email）+ roleKey 表', () => {
    render(
      <MembersView
        raw={[
          { userId: 'u1', email: 'a@x.com', name: 'Alice', roleKey: 'owner' },
          { userId: 'u2', email: 'b@x.com', roleKey: 'member' },
        ]}
      />,
    );
    // name 优先展示；缺 name 回落 email；roleKey 直接渲染
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('owner')).toBeTruthy();
    expect(screen.getByText('b@x.com')).toBeTruthy();
    expect(screen.getByText('member')).toBeTruthy();
  });

  it('兼容形 {members:[...]} → 同样解析（过渡期旧透传面兜底）', () => {
    render(<MembersView raw={{ members: [{ userId: 'u3', roleKey: 'admin' }] }} />);
    expect(screen.getByText('u3')).toBeTruthy();
    expect(screen.getByText('admin')).toBeTruthy();
  });

  it('非预期形（既非数组也无 members）→ 空态，不崩', () => {
    render(<MembersView raw={{ unexpected: true }} />);
    expect(screen.getByText('当前租户暂无成员。')).toBeTruthy();
  });

  it('缺 roleKey 行 → 角色列占位破折号', () => {
    render(<MembersView raw={[{ userId: 'u1' }]} />);
    expect(screen.getByText('u1')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBe(1);
  });
});
