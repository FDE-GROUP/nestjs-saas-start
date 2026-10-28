import type { z } from 'zod';

/**
 * SaaS 服务端 Odoo 只读数据面（GET /api/v1/odoo/{partners,products}）。
 *
 * 响应校验走 `@odoo-feature` 单源 **wire schema**（vite alias 直指后端 feature 侧源文件
 * `apps/api/src/features/odoo-rpc-api/api/odoo-rpc.schemas.ts`——feature 叠加层契约例外·tooling §3）：
 * 全局 TransformInterceptor 的成功信封
 * `{data, statusCode, message}` 也在契约内，前后端同一 zod 定义、零复制漂移；
 * 解析失败即上游形状漂移，UI 落错误态。401/403 由路由守卫面处理；此处只负责数据/错误的二分。
 */
export class OdooFetchError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function fetchOdooList<T>(
  path: 'partners' | 'products',
  limit: number,
  wireSchema: z.ZodType<{ data: T }>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/odoo/${path}?limit=${limit}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new OdooFetchError(0, 'SaaS 服务端不可达（网络异常）');
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { message?: string };
    const hint =
      res.status === 503
        ? 'Odoo 未配置或不可达（服务端 ODOO_* env / 上游连接）'
        : (detail.message ?? `请求失败（${res.status}）`);
    throw new OdooFetchError(res.status, hint);
  }
  return wireSchema.parse(await res.json()).data;
}
