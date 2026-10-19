// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../routeTree.gen';

// 登录页组件级渲染：经真实 routeTree 的 memory router，fetch 全 mock。
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderLoginAt() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/login'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('登录页（F0 最小闭环）', () => {
  it('渲染邮箱/密码表单与提交按钮', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );
    renderLoginAt();
    // loader 不发网络（login 无 loader），等微任务冲刷后断言。
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toBeTruthy());
    expect(screen.getByLabelText('邮箱')).toBeTruthy();
    expect(screen.getByLabelText('密码')).toBeTruthy();
  });

  it('登录失败展示后端 message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: '邮箱或密码错误' }),
      }),
    );
    renderLoginAt();
    await vi.waitFor(() => expect(screen.getByLabelText('邮箱')).toBeTruthy());
    const email = screen.getByLabelText('邮箱');
    const password = screen.getByLabelText('密码');
    fireEvent.change(email, { target: { value: 'a@b.c' } });
    fireEvent.change(password, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '登录' }));
    await vi.waitFor(() => expect(screen.getByText('邮箱或密码错误')).toBeTruthy());
  });

  it('渲染魔法链接分区（独立邮箱 label）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    );
    renderLoginAt();
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: '发送登录邮件' })).toBeTruthy(),
    );
    // 魔法链接邮箱 label 与密码登录邮箱 label 文案不同，防 getByLabelText('邮箱') 破唯一性。
    expect(screen.getByLabelText('邮箱（接收登录邮件）')).toBeTruthy();
  });

  it('发起魔法链接登录：POST /sign-in/magic-link 并回执已发信', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    renderLoginAt();
    await vi.waitFor(() => expect(screen.getByLabelText('邮箱（接收登录邮件）')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('邮箱（接收登录邮件）'), {
      target: { value: 'a@b.c' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送登录邮件' }));
    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/sign-in/magic-link',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('登录邮件已发送'),
    );
  });
});
