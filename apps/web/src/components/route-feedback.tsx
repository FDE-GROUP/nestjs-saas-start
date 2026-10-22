import { EmptyPanel, ErrorPanel } from './panels';

/**
 * 路由级兜底纯件（前端健壮性收口·错误边界 / 404 / 加载态）。
 *
 * 挂于 `createRootRoute`（errorComponent/notFoundComponent）与 `createRouter`
 * （defaultErrorComponent/defaultPendingComponent），使任意 loader 抛错、渲染崩溃、
 * 未知路由都落到友好统一面板而非裸默认/白屏。三者无副作用、不依赖 router hook，
 * 「返回首页」走原生 `<a href="/">`（错误/404 逃逸整页导航合理）以便脱离 router 单测。
 */

/** 路由错误边界（TanStack 注入 `{error, reset}`·本版本 reset 即重试回调）。 */
export function RouteError({ error, reset }: { error: unknown; reset?: () => void }) {
  const detail = import.meta.env.DEV
    ? error instanceof Error
      ? error.message
      : String(error)
    : null;
  return (
    <div className="flex flex-col gap-3">
      <ErrorPanel message="页面加载出错了，请稍后重试。" />
      {detail && (
        <pre className="overflow-x-auto rounded bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          {detail}
        </pre>
      )}
      <div className="flex items-center gap-3 text-sm">
        {reset && (
          <button
            type="button"
            onClick={reset}
            className="rounded bg-slate-800 px-3 py-1.5 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            重试
          </button>
        )}
        <a
          href="/"
          className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          返回首页
        </a>
      </div>
    </div>
  );
}

/** 未知路由 404 兜底。 */
export function RouteNotFound() {
  return (
    <div className="flex flex-col gap-3">
      <EmptyPanel label="页面不存在" />
      <a
        href="/"
        className="text-sm text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        返回首页
      </a>
    </div>
  );
}

/** 路由切换加载态（defaultPendingComponent）。 */
export function RoutePending() {
  return <p className="text-sm text-slate-400 dark:text-slate-500">加载中…</p>;
}
