/**
 * 分页契约（module-common-pagination-contract · softkit 借鉴 #2「借思路不借库」）：
 * 平台侧两个同构分页面（PlatformTenantPage/PlatformUserPage）的重复形状收敛为
 * 单一泛型契约。纯 TS 零依赖（与 DomainEvent 同居 shared-kernel，
 * core 外部依赖不变：仅 node/peer）。`Page<T>` 为 offset 语义（治理面/中小数据量）；
 * `CursorPage<T>` 为游标语义（就绪预备切片 B·立「新列表端点宜游标·offset 为例外」标准），
 * 两套契约并存·expand 非破坏——`Page`/`createPage`/`PageRequest` 一字不动。
 */

/** 分页请求（校验/默认值在应用侧 ListPageDto 基类，port 层只收已裁决的数）。 */
export interface PageRequest {
  readonly limit: number;
  readonly offset: number;
}

/** 分页结果：items + 全量计数 + 回显请求（前端免二次拼装）。 */
export interface Page<T> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * 唯一构造点（丙裁）：形状纪律所在；items 浅复制，防 adapter 内部数组引用泄漏。
 */
export function createPage<T>(items: readonly T[], total: number, request: PageRequest): Page<T> {
  return { items: [...items], total, limit: request.limit, offset: request.offset };
}

// —— 游标分页契约（就绪预备 §2.3 #5·切片 B·丁裁 (createdAt,id) 复合降序）——

/** 游标分页请求：limit + 可选不透明 cursor（缺省 = 首页）。 */
export interface CursorPageRequest {
  readonly limit: number;
  readonly cursor?: string;
}

/** 游标分页结果：items + hasMore + 可选 nextCursor（前端免二次拼装）。 */
export interface CursorPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

/**
 * 唯一构造点：形状纪律所在；items 浅复制，防 adapter 内部数组引用泄漏。
 * `nextCursor` 仅首页之后有值——hasMore=false 时不应传。
 */
export function createCursorPage<T>(
  items: readonly T[],
  hasMore: boolean,
  nextCursor?: string,
): CursorPage<T> {
  return { items: [...items], hasMore, ...(nextCursor !== undefined ? { nextCursor } : {}) };
}

// —— 游标编解码（opaque base64url·复合键 (createdAt ISO, id)）——

/** 游标承载的排序键对（与 DB 列对齐：createdAt 为 Date 的 ISO 串·id 为 uuid）。 */
export interface CursorKey {
  readonly createdAt: string;
  readonly id: string;
}

/**
 * 编码：`CursorKey → base64url(JSON [createdAt, id])`。
 * 不透明防实现细节泄漏，非授权替代——守卫面不变。
 */
export function encodeCursor(key: CursorKey): string {
  return Buffer.from(JSON.stringify([key.createdAt, key.id])).toString('base64url');
}

/**
 * 解码：`base64url → CursorKey`，格式非法时抛 `Error`（上层 catch → 400）。
 * 校验维度：合法 base64url、JSON 可解、数组长度 2、两元素皆 string、createdAt 合法日期。
 */
export function decodeCursor(raw: string): CursorKey {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8'));
  } catch {
    throw new Error('Invalid cursor: not decodable');
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new Error('Invalid cursor: expected [date, id]');
  }
  const [dateStr, id] = parsed as [unknown, unknown];
  if (typeof dateStr !== 'string' || typeof id !== 'string' || id.length === 0) {
    throw new Error('Invalid cursor: malformed segments');
  }
  if (Number.isNaN(Date.parse(dateStr))) {
    throw new Error('Invalid cursor: unparseable date');
  }
  return { createdAt: dateStr, id };
}
