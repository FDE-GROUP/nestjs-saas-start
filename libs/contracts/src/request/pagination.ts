import { z } from 'zod';
import { strictObject } from '../strict';

/**
 * 分页入参共享字段（对应旧 `ListPageDto` 基类的 limit/offset）。
 * query 参数恒为字符串，`z.coerce.number()` 复刻旧 `@Transform(Number)` + `enableImplicitConversion`；
 * `.default()` 复刻 DTO 字段初始值（limit=20 / offset=0）。缺字段即取默认，present 空串 `?limit=`
 * 归 0 后触发 `.min()`——与旧管口径一致。
 */
export const pageShape = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
};

/** 偏移分页查询（旧 `ListPageDto`）。 */
export const listPageQuerySchema = strictObject(pageShape);
export type ListPageQuery = z.infer<typeof listPageQuerySchema>;

/**
 * 游标分页查询（旧 `ListCursorDto`）：limit 同分页；cursor 为不透明 base64url。
 * 空串 `?cursor=` 经 `preprocess` 归一为 `undefined`（视作首页），复刻旧 `@Transform(''→undefined)`；
 * 语义合法性（可解码）仍由仓储 `decodeCursor` 兜底，此处只锁字符集 + 长度上限。
 */
export const listCursorQuerySchema = strictObject({
  limit: pageShape.limit,
  cursor: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/, { error: 'validate.cursor.invalid' })
      .max(512)
      .optional(),
  ),
});
export type ListCursorQuery = z.infer<typeof listCursorQuerySchema>;
