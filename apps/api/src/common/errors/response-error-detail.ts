/**
 * 结构化错误明细类型再导出（就绪预备 §2.3 #3 · S7a·③ 裁定）。
 *
 * 契约单源已上移 `@saas/contracts`（`responseErrorDetailSchema` 派生），本处只留**类型再导出**
 * 保持消费方 import 路径不变。RFC 9457 `errors` 思想，但**不换响应壳**——`ErrorResponse.errors?`
 * 为可选加法字段，顶层 `message`（string | string[]）逐字保留以兼容既有消费者。
 *
 * S9：旧 `fromValidationErrors`（class-validator `ValidationError` 树展平器）随 class-validator
 * 摘除一并删除——校验明细现由 S5 `StandardSchemaValidationExceptionFilter` 从 `Issue[]` 直产。
 */
export type { ResponseErrorDetail } from '@saas/contracts/index';
