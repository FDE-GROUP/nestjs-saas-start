/**
 * F2b 操作面统一 mutation hook（对齐 router loader + api-client 裸调·不引 react-query·裁②甲）。
 *
 * 模式：submit → 成功 invalidate loader 重载 → 失败展示 describeApiError + logApiError 结构化。
 * 每个操作页面调用一次 `useAction()`，在表单提交/按钮点击时走 `run()`。
 */
import { useRouter } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { describeApiError } from './format';
import { logApiError } from './log';

export interface ActionState {
  pending: boolean;
  error: string | null;
  success: string | null;
}

export interface RunOptions {
  /** 请求路径（供 logApiError）。 */
  path: string;
  method?: string;
  scope?: string;
  /** 成功后的 toast 文案。 */
  successMessage?: string;
  /** 实际发请求的 thunk（由调用方组装 api.POST/PATCH/DELETE 等）。 */
  thunk: () => Promise<{ error?: unknown }>;
}

/** 返回当前操作状态 + `run` 触发 mutation + `reset` 清除反馈。 */
export function useAction() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ pending: false, error: null, success: null });

  const run = useCallback(
    async (opts: RunOptions) => {
      setState((s) => ({ ...s, pending: true, error: null, success: null }));
      try {
        const { error } = await opts.thunk();
        if (error) {
          logApiError({ path: opts.path, method: opts.method, scope: opts.scope }, error);
          setState({ pending: false, error: describeApiError(error), success: null });
          return false;
        }
        await router.invalidate();
        setState({ pending: false, error: null, success: opts.successMessage ?? '操作成功' });
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '网络异常';
        setState({ pending: false, error: msg, success: null });
        return false;
      }
    },
    [router],
  );

  const reset = useCallback(() => {
    setState({ pending: false, error: null, success: null });
  }, []);

  return { ...state, run, reset };
}
