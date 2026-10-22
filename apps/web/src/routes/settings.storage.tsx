import type { components } from '@saas/api-client';
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { DangerButton, Feedback, Field, FormWrap, SubmitButton } from '../components/forms';
import { SectionHeading } from '../components/panels';
import { api } from '../lib/api';
import { useAction } from '../lib/mutation';
import { requireSession } from '../lib/session';

/** 真相源 = `FileUploadResultDto`（`@saas/api-client` schema 派生·编译期契约锁定）。 */
type StoredFile = components['schemas']['FileUploadResultDto'];

/**
 * 前端 F5 · Storage 消费面（module-frontend-storage）。
 * 后端 `StorageController` 类级 `@TenantExempt`（用户级·仅需会话·无需 active 租户）；三 op 已全 typed。
 * 对象存储无状态、后端无 LIST op → 非列表页：仅「本次会话上传件」+「手动输入既有 key」可操作。
 * 体积/MIME 限制属后端 config 单源，前端不重复造二源，仅 surface 后端 `STORAGE_*` errorCode 文案（经 useAction）。
 */
export const Route = createFileRoute('/settings/storage')({
  loader: async () => {
    await requireSession();
    return null;
  },
  component: StoragePage,
});

function StoragePage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<StoredFile | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [manualKey, setManualKey] = useState('');
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const upload = useAction();
  const getUrl = useAction();
  const del = useAction();

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    // 零知识本地守卫：未选文件不发无效往返（体积/MIME 属后端单源，不在此重复）。
    if (!file) {
      setFileErr('请先选择要上传的文件');
      return;
    }
    setFileErr(null);
    const fd = new FormData();
    fd.append('file', file);
    const ok = await upload.run({
      path: '/api/v1/storage/upload',
      method: 'POST',
      scope: 'storage.upload',
      successMessage: '上传成功',
      thunk: async () => {
        // openapi-typescript 把 `format: binary` 映射为 `file?: string`，openapi-fetch 运行期识别
        // FormData 实例直传 multipart——typed body 形与实际 FormData 之既有张力，须窄化（承 plan 裁④）。
        const { data, error } = await api.POST('/api/v1/storage/upload', { body: fd as never });
        if (error) return { error };
        setUploaded(data?.data ?? null);
        setSignedUrl(null);
        return {};
      },
    });
    if (ok) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleRefreshSignedUrl(key: string) {
    await getUrl.run({
      path: `/api/v1/storage/${key}/url`,
      method: 'GET',
      scope: 'storage.url',
      successMessage: '已生成签名 URL',
      thunk: async () => {
        const { data, error } = await api.GET('/api/v1/storage/{key}/url', {
          params: { path: { key } },
        });
        if (error) return { error };
        setSignedUrl(data?.data?.url ?? null);
        return {};
      },
    });
  }

  async function handleDeleteUploaded(key: string) {
    const ok = await del.run({
      path: `/api/v1/storage/${key}`,
      method: 'DELETE',
      scope: 'storage.delete',
      successMessage: '已删除',
      thunk: async () => {
        const { error } = await api.DELETE('/api/v1/storage/{key}', { params: { path: { key } } });
        return { error };
      },
    });
    if (ok) {
      setUploaded(null);
      setSignedUrl(null);
    }
  }

  async function handleManualUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!manualKey) return;
    await getUrl.run({
      path: `/api/v1/storage/${manualKey}/url`,
      method: 'GET',
      scope: 'storage.url.manual',
      successMessage: '已生成签名 URL',
      thunk: async () => {
        const { data, error } = await api.GET('/api/v1/storage/{key}/url', {
          params: { path: { key: manualKey } },
        });
        if (error) return { error };
        setManualUrl(data?.data?.url ?? null);
        return {};
      },
    });
  }

  async function handleManualDelete() {
    if (!manualKey) return;
    const ok = await del.run({
      path: `/api/v1/storage/${manualKey}`,
      method: 'DELETE',
      scope: 'storage.delete.manual',
      successMessage: '已删除',
      thunk: async () => {
        const { error } = await api.DELETE('/api/v1/storage/{key}', {
          params: { path: { key: manualKey } },
        });
        return { error };
      },
    });
    if (ok) {
      setManualUrl(null);
      setManualKey('');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading>文件存储</SectionHeading>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        上传单文件并管理其访问签名 URL /
        删除。对象存储无状态、后端无文件列表，故本页仅操作「本次上传件」与「手动输入的既有
        key」。体积与类型限制由服务端裁决，前端只回显其错误提示。
      </p>

      <section className="flex flex-col gap-3">
        <FormWrap onSubmit={handleUpload} className="flex flex-col items-start gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-300">选择文件</span>
            <input
              ref={fileInput}
              type="file"
              name="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-white hover:file:bg-slate-700 dark:text-slate-200 dark:file:bg-slate-100 dark:file:text-slate-900"
            />
          </label>
          <div className="flex items-center gap-3">
            <SubmitButton pending={upload.pending}>上传</SubmitButton>
            <Feedback error={fileErr ?? upload.error} success={upload.success} />
          </div>
        </FormWrap>

        {uploaded && (
          <div className="flex flex-col gap-2">
            <UploadResultPanel result={uploaded} signedUrl={signedUrl} />
            <div className="flex items-center gap-3">
              <SubmitButton
                pending={getUrl.pending}
                onClick={() => handleRefreshSignedUrl(uploaded.key)}
              >
                刷新签名 URL
              </SubmitButton>
              <DangerButton
                pending={del.pending}
                onClick={() => handleDeleteUploaded(uploaded.key)}
              >
                删除
              </DangerButton>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <h2 className="text-base font-medium text-slate-700 dark:text-slate-200">
          按 key 操作既有文件
        </h2>
        <FormWrap onSubmit={handleManualUrl} className="flex flex-wrap items-end gap-3">
          <Field label="文件 key" name="manualKey" value={manualKey} onChange={setManualKey} />
          <div className="flex items-center gap-3">
            <SubmitButton pending={getUrl.pending}>取签名 URL</SubmitButton>
            <DangerButton pending={del.pending} onClick={handleManualDelete}>
              删除
            </DangerButton>
          </div>
        </FormWrap>
        {manualUrl && (
          <p className="text-sm">
            <span className="text-slate-500 dark:text-slate-400">签名 URL：</span>
            <a
              href={manualUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              {manualUrl}
            </a>
          </p>
        )}
        <Feedback error={getUrl.error ?? del.error} success={getUrl.success ?? del.success} />
      </section>
    </div>
  );
}

/**
 * 纯展示上传结果（typed `FileUploadResultDto` 驱动·无 fetch·供单测锁契约形）。
 * 列 originalname / key / size / mimetype + 访问 URL；如已生成签名 URL 则附展示。
 */
export function UploadResultPanel({
  result,
  signedUrl,
}: {
  result: StoredFile;
  signedUrl?: string | null;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      <div className="flex gap-2">
        <dt className="text-slate-500 dark:text-slate-400">文件名</dt>
        <dd className="break-all text-slate-800 dark:text-slate-100">{result.originalname}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-slate-500 dark:text-slate-400">大小</dt>
        <dd className="text-slate-800 dark:text-slate-100">{result.size} 字节</dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-slate-500 dark:text-slate-400">类型</dt>
        <dd className="text-slate-800 dark:text-slate-100">{result.mimetype}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-slate-500 dark:text-slate-400">Key</dt>
        <dd className="break-all text-slate-800 dark:text-slate-100">{result.key}</dd>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <dt className="text-slate-500 dark:text-slate-400">访问 URL</dt>
        <dd className="break-all">
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline dark:text-blue-400"
          >
            {result.url}
          </a>
        </dd>
      </div>
      {signedUrl && (
        <div className="flex gap-2 sm:col-span-2">
          <dt className="text-slate-500 dark:text-slate-400">签名 URL</dt>
          <dd className="break-all">
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline dark:text-blue-400"
            >
              {signedUrl}
            </a>
          </dd>
        </div>
      )}
    </dl>
  );
}
