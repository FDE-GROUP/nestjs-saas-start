import type { components } from '@saas/api-client';
import { createPostSchema } from '@saas/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Feedback, Field, FormWrap, SubmitButton } from '../components/forms';
import { EmptyPanel, ErrorPanel, SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { describeApiError } from '../lib/format';
import { logApiError } from '../lib/log';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';
import { clientValidate } from '../lib/validation';

/** 真相源 = `PostResponse`（`@saas/api-client` schema 派生·编译期契约锁定）。 */
type Post = components['schemas']['PostResponse'];

// S8 前后端共享契约单源：客户端前置校验直接用 `@saas/contracts` 的 `createPostSchema`（与后端
// `@Body({ schema: createPostSchema })` 同一实例），校验与友好文案映射统一走 `clientValidate` 基元。

const PAGE_LIMIT = 20;

export const Route = createFileRoute('/posts')({
  loader: async () => {
    await requireSession();
    const { data, error } = await api.GET('/api/v1/posts', {
      params: { query: { limit: PAGE_LIMIT } },
    });
    if (error) {
      logApiError({ path: '/api/v1/posts', scope: 'posts' }, error);
      return { kind: 'error' as const, body: error };
    }
    return { kind: 'ok' as const, page: data?.data };
  },
  component: PostsPage,
});

function PostsPage() {
  const result = Route.useLoaderData();
  const firstPage = result.kind === 'ok' ? result.page : undefined;

  // 游标分页：无 react-query → 首页由 loader 供，「加载更多」在本地累积后续页。
  const [items, setItems] = useState<Post[]>(firstPage?.items ?? []);
  const [cursor, setCursor] = useState<string | undefined>(firstPage?.nextCursor);
  const [hasMore, setHasMore] = useState(firstPage?.hasMore ?? false);
  const [loadingMore, setLoadingMore] = useState(false);

  // 创建表单本地态。
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [published, setPublished] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const create = useAction();

  // 创建成功 → useAction 内 router.invalidate() 重跑 loader → firstPage 换新引用 →
  // 游标分页态重置回首屏（新建置顶可见·见 plan 假设「创建后整表回首页可接受」）。
  useEffect(() => {
    setItems(firstPage?.items ?? []);
    setCursor(firstPage?.nextCursor);
    setHasMore(firstPage?.hasMore ?? false);
  }, [firstPage]);

  if (result.kind === 'error') return <ErrorPanel message={describeApiError(result.body)} />;

  async function handleLoadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    const { data, error } = await api.GET('/api/v1/posts', {
      params: { query: { limit: PAGE_LIMIT, cursor } },
    });
    setLoadingMore(false);
    if (error) {
      logApiError({ path: '/api/v1/posts', method: 'GET', scope: 'posts.more' }, error);
      return;
    }
    const page = data?.data;
    if (page) {
      setItems((prev) => [...prev, ...(page.items ?? [])]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore ?? false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    // 共享 schema 前置校验：命中即本地拦截，免去无效往返（与后端同一 createPostSchema·S8）。
    const draft = { title, content: content || undefined, published };
    const err = clientValidate(createPostSchema, draft);
    if (err) {
      setFormErr(err);
      return;
    }
    setFormErr(null);
    const ok = await create.run({
      path: '/api/v1/posts',
      method: 'POST',
      scope: 'posts.create',
      successMessage: '文章已创建',
      thunk: () => api.POST('/api/v1/posts', { body: draft }),
    });
    if (ok) {
      setTitle('');
      setContent('');
      setPublished(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PostsView posts={items} />

      {hasMore && cursor && (
        <div>
          <SubmitButton pending={loadingMore} onClick={handleLoadMore}>
            加载更多
          </SubmitButton>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeading>新建文章</SectionHeading>
        <FormWrap onSubmit={handleCreate} className="flex flex-col gap-3">
          <Field
            label="标题"
            name="title"
            value={title}
            onChange={setTitle}
            required
            placeholder="文章标题"
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">正文</span>
            <textarea
              name="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="内容（可选）"
              rows={4}
              className="rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              name="published"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            立即发布
          </label>
          <div className="flex items-center gap-3">
            <SubmitButton pending={create.pending}>创建</SubmitButton>
            <Feedback error={formErr ?? create.error} success={create.success} />
          </div>
        </FormWrap>
      </section>
    </div>
  );
}

/**
 * 纯展示（游标列表累积项）·导出供单测锁 typed 契约形。
 * 列：标题 / 摘要（content 截断·null 占位）/ 状态（published 徽标）/ 创建时间。
 */
export function PostsView({ posts }: { posts?: Post[] }) {
  const list = posts ?? [];
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>文章</SectionHeading>
      {list.length === 0 ? (
        <EmptyPanel label="当前组织暂无文章。" />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-2 pr-4 font-medium">标题</th>
              <th className="py-2 pr-4 font-medium">摘要</th>
              <th className="py-2 pr-4 font-medium">状态</th>
              <th className="py-2 font-medium">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">{p.title}</td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-300">
                  {p.content ? p.content.slice(0, 40) : '—'}
                </td>
                <td className="py-2 pr-4">
                  {p.published ? (
                    <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700 dark:bg-green-500/15 dark:text-green-400">
                      已发布
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      草稿
                    </span>
                  )}
                </td>
                <td className="py-2 text-slate-500 dark:text-slate-400">
                  {p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
