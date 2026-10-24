import { z } from 'zod';

/**
 * 「默认严格」请求对象的书写入口：对 zod 对象施加 `.strict()`，未知字段（含嵌套）一律拒。
 *
 * @remarks
 * ④ 裁定「默认严格」——复刻现 class-validator 的 `whitelist + forbidNonWhitelisted`
 * （未知键 issue.code = `unrecognized_keys`）。
 *
 * 为什么默认严格：现 `I18nValidationPipe` 已配 `forbidNonWhitelisted: true`，今天多传未知字段本就返回 400，
 * 故 `.strict()` 是**行为保真、非回归**。
 *
 * ⚠ zod v4 语义（S1 实测坐实·迁移必知）：
 *  1. 普通 `z.object` 对未知键**默认静默 strip（删除、不报错）**，并非 passthrough；故只有显式
 *     `.strict()` 才等价现 `forbidNonWhitelisted`（报错 400）。
 *  2. 外层 `.strict()` **不向嵌套对象继承**——嵌套对象须**各自**用本 helper，否则其未知键会被静默 strip。
 *
 * 例外（须显式、可审计）：确需开放输入的端点（典型：Stripe webhook 签名原始体）不要用本 helper，
 * 改用 `z.object({ ... }).passthrough()` 并在 schema 处注释原因——使「宽松」永远是有意为之。
 *
 * @param shape - zod 原始形状（字段名 → schema）。
 * @returns 施加 `.strict()` 的 zod 对象 schema。
 * @internal
 */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}
