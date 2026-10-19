import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { type SignInOutcome, signInEmail, signInMagicLink } from '../lib/auth';

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
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-4 rounded-lg border border-slate-200 p-6 shadow-sm"
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
      <MagicLinkSection />
    </div>
  );
}

/**
 * 魔法链接登录分区（module-auth-magic-link + module-auth-magic-link-production）：输邮箱→`POST /sign-in/magic-link`
 * （后端**无条件挂载**·含生产）→提示已发信；用户点邮件链接后由 BA `/magic-link/verify` 落会话并重定向回本站（callbackURL）。
 * 形态采乙（`disableSignUp:true`）：仅存量账号可免密登录·陌生邮箱 verify 时被拒（不新增公开注册口）。
 */
function MagicLinkSection() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const outcome = await signInMagicLink(email, window.location.origin);
    setPending(false);
    if (outcome.ok) setNotice('登录邮件已发送，请查收邮箱并点击链接完成登录。');
    else setError(outcome.error ?? '邮件发送失败');
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-slate-700">
        已有账号免密登录（魔法链接·一次性邮件）
      </h2>
      <label className="flex flex-col gap-1 text-sm">
        邮箱（接收登录邮件）
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      {notice ? (
        <p role="status" className="text-sm text-green-700">
          {notice}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-slate-800 px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? '发送中…' : '发送登录邮件'}
      </button>
    </form>
  );
}
