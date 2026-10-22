/** 自助面共用展示块（raw Tailwind 最小自绘 · shadcn 基元按需缓采）。 */

export function SectionHeading({ children }: { children: string }) {
  return <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{children}</h1>;
}

export function EmptyPanel({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
      {label}
    </p>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      {message}
    </div>
  );
}
