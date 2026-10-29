import type { FileUploadResult } from '@saas/contracts';

/**
 * 【换轨 B-6c · multipart carve-out】存储上传原生 fetch 助手。
 *
 * oRPC `OpenAPILink` 走 JSON compact 编码，不承接二进制 `multipart/form-data`；此路沿用原生
 * `fetch`（同源相对 `/api/v1`·dev 经 vite 反代至 :7009·`credentials:'same-origin'` 保会话 Cookie）。
 * 成功出线仍是 REST 信封 `{data, statusCode, message}` → 取 `data`（`FileUploadResult`）；
 * 非 2xx 交回解析后的 REST 错误体（供 `useAction` 走 `describeApiError` 归一），网络异常则裸抛
 * 由 `useAction` catch 段兜「网络异常」文案——与旧 openapi-fetch 面错误语义等价。
 */
export interface UploadOutcome {
  data?: FileUploadResult;
  error?: unknown;
}

export async function uploadStorageFile(fd: FormData): Promise<UploadOutcome> {
  const res = await fetch('/api/v1/storage/upload', {
    method: 'POST',
    body: fd,
    credentials: 'same-origin',
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    return { error: parsed };
  }
  const envelope = parsed as { data?: FileUploadResult } | undefined;
  return { data: envelope?.data };
}
