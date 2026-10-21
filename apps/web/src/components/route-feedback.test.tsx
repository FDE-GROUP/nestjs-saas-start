// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteError, RouteNotFound, RoutePending } from './route-feedback';

// 路由兜底纯件：无 router 依赖（返回首页走原生 <a>·reset 经 prop 注入）→ 可脱离 router 直测。
afterEach(cleanup);

describe('RouteNotFound（404 兜底）', () => {
  it('渲染「页面不存在」+ 返回首页链接', () => {
    const { container } = render(<RouteNotFound />);
    expect(screen.getByText('页面不存在')).toBeTruthy();
    expect(container.querySelector('a[href="/"]')).toBeTruthy();
  });
});

describe('RoutePending（加载态）', () => {
  it('渲染加载提示', () => {
    render(<RoutePending />);
    expect(screen.getByText(/加载/)).toBeTruthy();
  });
});

describe('RouteError（错误边界）', () => {
  it('渲染统一错误文案 + dev 下附 error 摘要', () => {
    render(<RouteError error={new Error('boom')} />);
    expect(screen.getByText(/页面加载出错了/)).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
  });

  it('传入 reset → 点「重试」调用一次', () => {
    const reset = vi.fn();
    render(<RouteError error={new Error('x')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('未传 reset → 不渲染「重试」按钮', () => {
    render(<RouteError error={new Error('x')} />);
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });
});
