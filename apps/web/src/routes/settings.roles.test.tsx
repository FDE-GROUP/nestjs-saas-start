// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RolesView } from './settings.roles';

type TenantRoleView = import('@saas/contracts').TenantRoleView;

const roles: TenantRoleView[] = [
  { id: 'r1', key: 'owner', name: 'Owner', isSystem: true },
  { id: 'r2', key: 'editor', name: 'Editor', isSystem: false },
];

afterEach(cleanup);

// loader 的 api-client 取数（相对 URL fetch）在浏览器同源/dev 反代下运行，jsdom 的 Request
// 不解析 document base → 端到端真跑归「dev 反代取证」；此处锁纯展示的 typed 契约形。
describe('RolesView（纯展示 · typed 渲染 / 空态 / 系统标记）', () => {
  it('typed 渲染名称 / key / 系统 vs 自定义', () => {
    render(<RolesView roles={roles} />);
    expect(screen.getByText('Owner')).toBeTruthy();
    expect(screen.getByText('owner')).toBeTruthy();
    expect(screen.getByText('Editor')).toBeTruthy();
    expect(screen.getByText('editor')).toBeTruthy();
    expect(screen.getByText('系统')).toBeTruthy();
    expect(screen.getByText('自定义')).toBeTruthy();
  });

  it('空态（无角色）', () => {
    render(<RolesView roles={[]} />);
    expect(screen.getByText('当前组织暂无角色数据。')).toBeTruthy();
  });

  it('缺省（undefined）→ 空态，不崩', () => {
    render(<RolesView />);
    expect(screen.getByText('当前组织暂无角色数据。')).toBeTruthy();
  });
});
