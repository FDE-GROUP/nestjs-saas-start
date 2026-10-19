import { type PipeTransform, StandardSchemaValidationPipe } from '@nestjs/common';
import {
  StandardSchemaValidationException,
  type ValidationIssueLike,
} from './errors/standard-schema-validation.exception';

/**
 * 全局校验管的**单一装配源**（SSOT）：生产入口 `main.ts` 与各 gated e2e harness 共用本工厂，
 * 消除「测试装配不复现生产 pipe → DTO 默认值/校验静默失效」的对拍缺口
 * （全栈 CI 拼 PG 首跑拓出：`@Query() ListCursorDto` 在无管装配下 `limit=undefined`→SQL `NaN`）。
 *
 * **S9 换轨收官（global-validation-zod-constitution-amendment）**：全部请求面已翻官方
 * `@Body/@Param/@Query({ schema })`（class DTO 于 S3b 删尽），旧 class-validator 委托支成死码，
 * 故直接装配官方 `StandardSchemaValidationPipe`——参数带 `schema` 走官方校验（自定 `exceptionFactory`
 * 抛 `StandardSchemaValidationException(issues)`·由 S5 过滤器渲染成 `ErrorResponse`），无 `schema`
 * 的参数（如 `@Param('id') id: string`·custom 装饰器）**原样返回**（见其 `transform` 早退）。
 * 数值/类型转换一律下沉到各 schema（`z.coerce` 复刻旧 `enableImplicitConversion`）。
 */
export function createValidationPipe(): PipeTransform {
  return new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) =>
      new StandardSchemaValidationException(issues as readonly ValidationIssueLike[]),
  });
}
