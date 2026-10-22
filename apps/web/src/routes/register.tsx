/**
 * 注册页（dev only·后端 emailAndPassword 仅非生产启用）。
 * 成功后自动登录（BA 发 session cookie）并安全回跳 `?next`（默认首页）。
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { type SignInOutcome, signUpEmail } from '../lib/auth';
import { safeInternalPath } from '../lib/safe-redirect';

export const Route = createFileRoute('/register')({
  // 与登录页一致的回跳载体（注册极少携 next·失败面回落首页）。
  validateSearch: (search: Record<string, unknown>): { next?: string } =>
    typeof search.next === 'string' ? { next: search.next } : {},
  component: RegisterPage,
});

function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { next } = Route.useSearch();
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const outcome: SignInOutcome = await signUpEmail(email, password, name);
    setPending(false);
    if (outcome.ok) {
      const target = safeInternalPath(next);
      if (target) await navigate({ href: target });
      else await navigate({ to: '/' });
      return;
    }
    setError(outcome.error ?? '注册失败');
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border border-slate-200 p-6 shadow-sm dark:border-slate-700"
    >
      <h1 className="text-xl font-semibold">注册</h1>
      <p className="text-xs text-amber-600 dark:text-amber-400">
        仅开发环境可用（后端 emailAndPassword 非生产启用）
      </p>
      <label className="flex flex-col gap-1 text-sm">
        姓名
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        邮箱
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        密码
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
        />
      </label>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {pending ? '注册中…' : '注册'}
      </button>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        已有账号？
        <Link to="/login" className="ml-1 text-blue-600 hover:underline dark:text-blue-400">
          登录
        </Link>
      </p>
    </form>
  );
}
