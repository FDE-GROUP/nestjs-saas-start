// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '../lib/theme';
import { ThemeProvider } from '../lib/theme-provider';
import { ThemeToggle } from './theme-toggle';

// 主题切换器三态循环测：锁 system→light→dark 推进、documentElement .dark 随动、localStorage 持久化，
// 及 aria-label 反映当前显式模式与生效主题（无障碍基调）。

afterEach(() => {
  cleanup();
  localStorage.removeItem(STORAGE_KEY);
  document.documentElement.classList.remove('dark');
  vi.restoreAllMocks();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

function stubMatchMedia(sysDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: sysDark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('ThemeToggle（三态循环 + 落类 + 持久化）', () => {
  it('初始无存储→system，系统偏好亮时生效 light 且无 .dark', () => {
    stubMatchMedia(false);
    renderToggle();
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toContain('跟随系统');
    expect(btn.getAttribute('aria-label')).toContain('亮色');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('初始 system + 系统偏好暗 → 生效 dark 落 .dark', () => {
    stubMatchMedia(true);
    renderToggle();
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('暗色');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('点击循环 system→light→dark→system，.dark 与 localStorage 随动', () => {
    stubMatchMedia(true); // 系统偏好暗：system 态生效 dark
    renderToggle();
    const btn = screen.getByRole('button');

    // system → light：强制亮，移除 .dark，落库 light
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-label')).toContain('浅色');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // light → dark：强制暗，落 .dark，落库 dark
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-label')).toContain('深色');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // dark → system：回落跟随系统（偏好暗→仍 dark），落库 system
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-label')).toContain('跟随系统');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
