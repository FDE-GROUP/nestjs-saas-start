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
  /** 实际发请求的 thunk：旧链返回 `{error?}` 对象（openapi-fetch）；新链（oRPC）成功回载荷、失败抛 `ORPCError`。 */
  thunk: () => Promise<unknown>;
}

/** 返回当前操作状态 + `run` 触发 mutation + `reset` 清除反馈。 */
export function useAction() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ pending: false, error: null, success: null });

  const run = useCallback(
    async (opts: RunOptions) => {
      setState((s) => ({ ...s, pending: true, error: null, success: null }));
      try {
        const result = await opts.thunk();
        // 旧链（openapi-fetch）以 `{error}` 表错；新链（oRPC）成功直接回载荷（无 error 字段）、失败抛异常。
        const errField =
          result && typeof result === 'object' && 'error' in result
            ? (result as { error?: unknown }).error
            : undefined;
        if (errField) {
          logApiError({ path: opts.path, method: opts.method, scope: opts.scope }, errField);
          setState({ pending: false, error: describeApiError(errField), success: null });
          return false;
        }
        await router.invalidate();
        setState({ pending: false, error: null, success: opts.successMessage ?? '操作成功' });
        return true;
      } catch (e: unknown) {
        // 新链失败面：ORPCError（.data 携 REST 体）走结构化窄化；其余归网络异常。
        const isOrpc = e && typeof e === 'object' && (e as { name?: string }).name === 'ORPCError';
        if (isOrpc) {
          logApiError({ path: opts.path, method: opts.method, scope: opts.scope }, e);
          setState({ pending: false, error: describeApiError(e), success: null });
          return false;
        }
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
