/**
 * F2b 最小表单基元（raw Tailwind·按需 shadcn 式·不引整库·裁⑤）。
 * 仅在 mutation 操作面使用；F2a 只读页不依赖本模块。
 */
import type { FormEvent, ReactNode } from 'react';

/** 标签 + 输入框（`error` 现形时逐字段标红 + 无障碍关联·不传时与现状一致）。 */
export function Field({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  required,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600 dark:text-slate-300">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded border px-2 py-1.5 text-sm bg-white text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-slate-100 ${
          error
            ? 'border-red-400 focus:border-red-500 dark:border-red-500'
            : 'border-slate-300 focus:border-slate-500 dark:border-slate-700'
        }`}
      />
      {error ? (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
}

/** 下拉选择（`error` 现形时逐字段标红 + 无障碍关联·不传时与现状一致）。 */
export function Select({
  label,
  name,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`rounded border px-2 py-1.5 text-sm bg-white text-slate-900 focus:outline-none dark:bg-slate-900 dark:text-slate-100 ${
          error
            ? 'border-red-400 focus:border-red-500 dark:border-red-500'
            : 'border-slate-300 focus:border-slate-500 dark:border-slate-700'
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
}

/** 提交按钮（disabled 当 pending）。 */
export function SubmitButton({
  pending,
  children,
  onClick,
}: {
  pending: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={pending}
      className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
    >
      {pending ? '处理中…' : children}
    </button>
  );
}

/** 危险操作确认按钮（点击即执行·无二次确认弹窗·简洁）。 */
export function DangerButton({
  pending,
  children,
  onClick,
}: {
  pending: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
    >
      {children}
    </button>
  );
}

/** 操作反馈条（error/success）。 */
export function Feedback({ error, success }: { error: string | null; success: string | null }) {
  if (error)
    return (
      <p
        className="rounded bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
        role="alert"
      >
        {error}
      </p>
    );
  if (success)
    return (
      <p
        className="rounded bg-green-50 px-3 py-1.5 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-300"
        role="status"
      >
        {success}
      </p>
    );
  return null;
}

/** 包装表单提交（preventDefault + callback）。 */
export function FormWrap({
  onSubmit,
  children,
  className,
}: {
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form onSubmit={onSubmit} className={className ?? 'flex flex-wrap items-end gap-3'}>
      {children}
    </form>
  );
}
