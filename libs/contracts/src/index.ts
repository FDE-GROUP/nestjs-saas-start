import { z } from 'zod';

/**
 * 共享传输契约单源（@saas/contracts）。
 * 定位：仅放跨前后端共享的传输契约（zod schema + 派生类型）——运行时校验 / 编译期类型 / OpenAPI 文档三态同源。
 * 不含领域逻辑（领域在 @core/saas-kit·saas-kit 不变）、不含 Nest/HTTP/ORM（适配在 apps/api）。
 *
 * 见 docs/plans/global-validation-zod-constitution-amendment.md（全栈校验换轨 zod）。
 */

/**
 * ④ 裁定「默认严格」的书写入口：复刻现 class-validator 的 `whitelist + forbidNonWhitelisted`
 * ——未知字段（含嵌套）一律拒（issue.code = `unrecognized_keys`）。
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
 */
export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.object(shape).strict();
}
