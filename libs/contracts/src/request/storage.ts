import { z } from 'zod';

/**
 * 存储签名 URL 的 `expiresIn` query 契约（S9·global-validation-zod-constitution-amendment）。
 *
 * @remarks
 * `GET /storage/:key/url` 的 `expiresIn` 旧无校验装饰器、仅靠 `I18nValidationPipe` 的
 * `enableImplicitConversion` 做 query 字符串→数字；摘 class-validator 后改显式 `z.coerce.number()`
 * 复刻同一隐式转换（不擅自加 int/positive 约束·守保真口径：旧面 `type: number` 不变）。
 *
 * @public
 */
export const storageExpiresInQuerySchema = z.coerce.number().optional();
export type StorageExpiresInQuery = z.infer<typeof storageExpiresInQuerySchema>;

/**
 * 存储删除入参（换轨 WP-C·`DELETE /storage/:key` 路径参）。
 *
 * @remarks
 * 旧 `@Param('key')` 无校验（命中即非空串）；紧凑 input 结构下路径参平并入单一对象。
 * 取**非-strict** `z.object`（默认 strip）以保真旧 REST 对未声明 query/param 的忽略语义（不新增 400）。
 */
export const storageDeleteInputSchema = z.object({ key: z.string() });
export type StorageDeleteInput = z.infer<typeof storageDeleteInputSchema>;

/**
 * 签名 URL 入参（换轨 WP-C·`GET /storage/:key/url`·路径 `key` ⊕ query `expiresIn`）。
 *
 * @remarks
 * `expiresIn` 沿用 {@link storageExpiresInQuerySchema} 的 `z.coerce.number()` 隐式转换语义（query 字符串→数字）·
 * 非-strict 保真旧面对多余 query 的忽略。
 */
export const storageUrlInputSchema = z.object({
  key: z.string(),
  expiresIn: z.coerce.number().optional(),
});
export type StorageUrlInput = z.infer<typeof storageUrlInputSchema>;
