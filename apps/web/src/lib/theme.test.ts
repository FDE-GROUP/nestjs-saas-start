// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  prefersDark,
  readStoredMode,
  resolveEffective,
  STORAGE_KEY,
  writeStoredMode,
} from './theme';

// 主题运行时 SSOT 纯逻辑测：锁三态解析、存储回落、系统偏好探测降级、.dark 落文档、持久化，
// 以及 `index.html` 内联防 FOUC 脚本与本模块的映射一致（同一 (stored, system) → effective 表）。

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  document.documentElement.classList.remove('dark');
  vi.unstubAllGlobals();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

/** 安装 matchMedia 桩：偏好暗色与否由 sysDark 决定（模拟 mql.addEventListener 存在）。 */
function stubMatchMedia(sysDark: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: sysDark,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('resolveEffective（显式模式解析为生效主题）', () => {
  it('dark/light 强制覆盖系统偏好', () => {
    stubMatchMedia(true);
    expect(resolveEffective('dark')).toBe('dark');
    expect(resolveEffective('light')).toBe('light');
    stubMatchMedia(false);
    expect(resolveEffective('dark')).toBe('dark');
    expect(resolveEffective('light')).toBe('light');
  });

  it('system 跟随系统偏好（暗→dark、亮→light）', () => {
    stubMatchMedia(true);
    expect(resolveEffective('system')).toBe('dark');
    stubMatchMedia(false);
    expect(resolveEffective('system')).toBe('light');
  });
});

describe('prefersDark（系统偏好探测·降级保守）', () => {
  it('无 matchMedia 环境返 false', () => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    expect(prefersDark()).toBe(false);
  });

  it('matchMedia 命中暗色返 true、未命中返 false', () => {
    stubMatchMedia(true);
    expect(prefersDark()).toBe(true);
    stubMatchMedia(false);
    expect(prefersDark()).toBe(false);
  });
});

describe('readStoredMode（缺/非法回落 system）', () => {
  it('合法值原样返回', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    expect(readStoredMode()).toBe('dark');
    localStorage.setItem(STORAGE_KEY, 'light');
    expect(readStoredMode()).toBe('light');
  });

  it('非法值/缺键回落 system', () => {
    localStorage.setItem(STORAGE_KEY, 'blue');
    expect(readStoredMode()).toBe('system');
    localStorage.removeItem(STORAGE_KEY);
    expect(readStoredMode()).toBe('system');
  });
});

describe('applyTheme（切 .dark 于 documentElement）', () => {
  it('生效 dark 落 .dark、light 移除', () => {
    stubMatchMedia(false);
    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('system 随系统偏好落类', () => {
    stubMatchMedia(true);
    expect(applyTheme('system')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('writeStoredMode（持久化到 STORAGE_KEY）', () => {
  it('落 key', () => {
    writeStoredMode('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    writeStoredMode('system');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('system');
  });
});

describe('index.html 内联脚本 ↔ theme.ts 映射一致', () => {
  // 复刻 index.html 内联防 FOUC 脚本语义（同一 saas-theme key）：
  // stored ∈ {light,dark} 取之、否则 system；dark = mode==='dark' || (system && 系统偏好暗)。
  function inlineResolvesDark(stored: string | null, sysDark: boolean): boolean {
    const mode = stored === 'light' || stored === 'dark' ? stored : 'system';
    return mode === 'dark' || (mode === 'system' && sysDark);
  }

  const STORED: (string | null)[] = ['light', 'dark', 'system', 'bogus', null];
  const SYS: boolean[] = [true, false];

  it('同一 (stored, system) 下 theme.ts 生效暗判定与内联脚本逐格一致', () => {
    for (const stored of STORED) {
      for (const sysDark of SYS) {
        if (stored === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, stored);
        stubMatchMedia(sysDark);
        const viaTheme = resolveEffective(readStoredMode()) === 'dark';
        expect(viaTheme).toBe(inlineResolvesDark(stored, sysDark));
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  });
});
