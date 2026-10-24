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
