import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { signInEmail } from '../lib/auth';

/**
 * 登录页（BA 会话入口·与 apps/web 同面 sign-in/email）。email+password 仅非生产启用
 * （既有裁点）；dev 演示账号见公共仓 seed（admin@example.com / admin123）。
 */
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
    const outcome = await signInEmail(email, password);
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
      className="mx-auto mt-12 max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-base font-semibold">登录以继续</h2>
      <label className="block text-sm">
        <span className="text-gray-600">邮箱</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">密码</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? '登录中…' : '登录'}
      </button>
    </form>
  );
}
