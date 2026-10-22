// @vitest-environment jsdom
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../lib/theme-provider';
import { routeTree } from '../routeTree.gen';

/**
 * 注册页路由级集成（切片 A·A-1）。`/register` 无 loader，登录门面走 `lib/auth` 裸 `fetch`
 * （非 openapi `api`）→ 承 `login.test` 手法：真实 routeTree 的 memory router + `vi.stubGlobal('fetch')`。
 * 锁：表单字段渲染、后端 error message 回显（`signUpEmail` 非 2xx→`outcome.error`）、成功后跳转。
 */
function renderRegister() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/register'] }),
  });
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('注册页（路由级 · F0 最小闭环）', () => {
  it('渲染姓名/邮箱/密码字段与提交按钮 + dev 提示', async () => {
    renderRegister();
    await vi.waitFor(() => expect(screen.getByRole('button', { name: '注册' })).toBeTruthy());
    expect(screen.getByLabelText('姓名')).toBeTruthy();
    expect(screen.getByLabelText('邮箱')).toBeTruthy();
    expect(screen.getByLabelText('密码')).toBeTruthy();
    expect(screen.getByText(/仅开发环境可用/)).toBeTruthy();
  });

  it('提交失败 → 回显后端 message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: '邮箱已被占用' }),
      }),
    );
    renderRegister();
    await vi.waitFor(() => expect(screen.getByLabelText('邮箱')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('姓名'), { target: { value: 'Ann' } });
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: '注册' }));
    await vi.waitFor(() => expect(screen.getByText('邮箱已被占用')).toBeTruthy());
  });
});
