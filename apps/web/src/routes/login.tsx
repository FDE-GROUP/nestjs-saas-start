import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { type SignInOutcome, signInEmail } from '../lib/auth';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const outcome: SignInOutcome = await signInEmail(email, password);
    setPending(false);
    if (outcome.ok) {
      await navigate({ to: '/' });
      return;
    }
    setError(outcome.error ?? '登录失败');
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border border-slate-200 p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold">登录</h1>
      <label className="flex flex-col gap-1 text-sm">
        邮箱
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        密码
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? '登录中…' : '登录'}
      </button>
      <p className="text-center text-sm text-slate-500">
        没有账号？
        <Link to="/register" className="ml-1 text-blue-600 hover:underline">
          注册
        </Link>
      </p>
    </form>
  );
}
