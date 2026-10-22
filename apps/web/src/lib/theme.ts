/**
 * 明暗主题运行时单一真源（纯逻辑·可脱离 React/SSR 测）：三态 light/dark/system，
 * system 跟随 `prefers-color-scheme`。落 `.dark` 于 `<html>` 供 Tailwind v4 `dark:` 变体响应
 * （见 index.css `@custom-variant`）。`index.html` 内联防 FOUC 脚本与本模块语义同构（测锁映射一致）。
 */

export type ThemeMode = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

/** localStorage 持久化键（与 index.html 内联脚本单义）。 */
export const STORAGE_KEY = 'saas-theme';

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system'];

/** 读存储模式：缺键/非法值一律回落 `'system'`（跟随系统）。 */
export function readStoredMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw !== null && (MODES as readonly string[]).includes(raw) ? (raw as ThemeMode) : 'system';
}

/** 系统是否偏好暗色：无 matchMedia 环境（SSR/老引擎）保守返 false。 */
export function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 解析显式模式为生效主题：`system` 依系统偏好，`light`/`dark` 强制覆盖。 */
export function resolveEffective(mode: ThemeMode): EffectiveTheme {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light';
  return mode;
}

/** 应用主题到文档（切 `.dark` 类），回传生效值。无 DOM（SSR）短路返 light。 */
export function applyTheme(mode: ThemeMode): EffectiveTheme {
  const effective = resolveEffective(mode);
  if (typeof document === 'undefined') return effective;
  document.documentElement.classList.toggle('dark', effective === 'dark');
  return effective;
}

/** 持久化用户显式模式选择。无 localStorage 短路。 */
export function writeStoredMode(mode: ThemeMode): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, mode);
}
