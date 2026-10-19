/**
 * 官方 `StandardSchemaValidationPipe` 校验失败专用异常（S4/S5 · global-validation-zod-constitution-amendment）。
 *
 * 设计：校验管经自定 `exceptionFactory` **不直接产 HTTP 响应**，而是抛出携带原始 `Issue[]` 的本异常，
 * 交由 `StandardSchemaValidationExceptionFilter` 在持有 `ExecutionContext`（request.url / ALS requestId /
 * i18n locale）处渲染成**与旧 class-validator 逐字同形**的 `ErrorResponse`——复刻现
 * `I18nValidationExceptionFilter`+`responseBodyFormatter` 的「管抛原始错误 · 过滤器渲染」分工。
 *
 * 刻意**不**继承 `HttpException`：使其只被本过滤器命中（`HttpExceptionFilter` 的 `@Catch()` 兜底链在
 * 反转序中排其后），避免漏给通用面产 500/裸 message。
 */

/** standard-schema `Issue` 的结构子集（避免依赖具体 @standard-schema 类型包·zod 产出的 issue 满足此形）。 */
export interface ValidationIssueLike {
  message: string;
  code?: string;
  path?: readonly (string | number | { key: string | number })[];
}

export class StandardSchemaValidationException extends Error {
  readonly issues: readonly ValidationIssueLike[];

  constructor(issues: readonly ValidationIssueLike[]) {
    super('standard-schema-validation-failed');
    this.name = 'StandardSchemaValidationException';
    this.issues = issues;
    // SWC/ESM 下跨编译目标保 instanceof 可靠。
    Object.setPrototypeOf(this, StandardSchemaValidationException.prototype);
  }
}

/** 把 issue.path 展平为点分串（对象段取 `.key`），与官方 `formatIssueMessages` 口径一致。 */
export function joinIssuePath(
  path?: readonly (string | number | { key: string | number })[],
): string {
  return (path ?? [])
    .map((seg) =>
      typeof seg === 'object' && seg !== null && 'key' in seg ? String(seg.key) : String(seg),
    )
    .join('.');
}
