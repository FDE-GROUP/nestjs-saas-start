/**
 * 主题切换器（三态循环 system→light→dark）：依 `useTheme()` 显式模式，点击推进到下一态并即时持久化+应用。
 * 文案取当前显式模式；aria-label/title 附「生效」主题，屏幕阅读器可辨。承全局 a11y 基调。
 */
import type { ThemeMode } from '../lib/theme';
import { useTheme } from '../lib/theme-provider';

const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<ThemeMode, string> = { system: '跟随系统', light: '浅色', dark: '深色' };
const ICON: Record<ThemeMode, string> = { system: '◐', light: '☀', dark: '☾' };

export function ThemeToggle() {
  const { mode, effective, setMode } = useTheme();
  const ariaLabel = `主题：${LABEL[mode]}（当前${effective === 'dark' ? '暗色' : '亮色'}，点击切换）`;
  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <span aria-hidden>{ICON[mode]}</span> {LABEL[mode]}
    </button>
  );
}
