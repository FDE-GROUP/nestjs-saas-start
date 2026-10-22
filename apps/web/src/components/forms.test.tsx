// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Field, Select } from './forms';

// 表单基元无障碍纯件测：锁 error 现形时的 aria 关联与内联提示，及不传 error 时与现状一致的向后兼容。
afterEach(cleanup);

describe('Field（error 逐字段无障碍关联）', () => {
  it('传 error → input 标 aria-invalid + aria-describedby，控件下现 role=alert 错误文案', () => {
    const { container } = render(
      <Field label="名称" name="name" value="" onChange={() => {}} error="名称不能为空" />,
    );
    const input = container.querySelector('input[name="name"]');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-describedby')).toBe('name-error');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('名称不能为空');
    expect(alert.id).toBe('name-error');
  });

  it('不传 error → 无 aria-invalid/aria-describedby 且无错误节点（向后兼容·渲染同现状）', () => {
    const { container } = render(<Field label="名称" name="name" value="x" onChange={() => {}} />);
    const input = container.querySelector('input[name="name"]');
    expect(input?.hasAttribute('aria-invalid')).toBe(false);
    expect(input?.hasAttribute('aria-describedby')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Select（error 逐字段无障碍关联）', () => {
  it('传 error → select 标 aria-invalid + aria-describedby，控件下现 role=alert 错误文案', () => {
    const { container } = render(
      <Select
        label="角色"
        name="role"
        options={[{ value: 'member', label: 'Member' }]}
        value=""
        onChange={() => {}}
        error="角色不能为空"
      />,
    );
    const select = container.querySelector('select[name="role"]');
    expect(select?.getAttribute('aria-invalid')).toBe('true');
    expect(select?.getAttribute('aria-describedby')).toBe('role-error');
    expect(screen.getByRole('alert').textContent).toContain('角色不能为空');
  });

  it('不传 error → 无 aria 关联且无错误节点（向后兼容）', () => {
    const { container } = render(
      <Select
        label="角色"
        name="role"
        options={[{ value: 'member', label: 'Member' }]}
        value="member"
        onChange={() => {}}
      />,
    );
    const select = container.querySelector('select[name="role"]');
    expect(select?.hasAttribute('aria-invalid')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
