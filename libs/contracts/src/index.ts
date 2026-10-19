/**
 * 共享传输契约单源（@saas/contracts）。
 * 定位：仅放跨前后端共享的传输契约（zod schema + 派生类型）——运行时校验 / 编译期类型 / OpenAPI 文档三态同源。
 * 不含领域逻辑（领域在 @core/saas-kit·saas-kit 不变）、不含 Nest/HTTP/ORM（适配在 apps/api）、
 * **零依赖 @core**（前端可安全消费·wire enum 内联 + apps/api 对拍测锁漂移）。
 *
 * 见 docs/plans/global-validation-zod-constitution-amendment.md（全栈校验换轨 zod）。
 *
 * S3（契约上移·增量）：请求入参 zod schema 单源落此（apps/api 各 context 经
 * `@Body/@Param/@Query({ schema })` 逐片消费；class DTO 暂留·待各 context 翻转后 S9 摘除）。
 */

export * from './request/index';
export { strictObject } from './strict';
