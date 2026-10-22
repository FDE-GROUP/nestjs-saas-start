/**
 * 主题 React 接线：`ThemeProvider` 持显式模式、应用生效主题到文档、`system` 态随系统偏好联动；
 * `useTheme()` 供切换器读 `{mode, effective, setMode}`。承 `lib/theme.ts` 运行时 SSOT。
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  applyTheme,
  type EffectiveTheme,
  readStoredMode,
  resolveEffective,
  type ThemeMode,
  writeStoredMode,
} from './theme';

interface ThemeContextValue {
  /** 用户显式模式（light/dark/system）。 */
  mode: ThemeMode;
  /** 解析后的生效主题（system→系统偏好）。 */
  effective: EffectiveTheme;
  /** 设置显式模式（持久化 + 立即应用）。 */
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [effective, setEffective] = useState<EffectiveTheme>(() =>
    resolveEffective(readStoredMode()),
  );

  useEffect(() => {
    setEffective(applyTheme(mode));
    if (mode !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setEffective(applyTheme('system'));
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    writeStoredMode(next);
    setModeState(next);
  }, []);

  const value = useMemo(() => ({ mode, effective, setMode }), [mode, effective, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** 读主题上下文；必须在 `ThemeProvider` 内使用，否则抛清晰错（不静默降级）。 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}
