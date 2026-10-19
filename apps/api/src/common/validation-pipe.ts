import {
  type ArgumentMetadata,
  type PipeTransform,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { I18nValidationPipe } from 'nestjs-i18n';
import {
  StandardSchemaValidationException,
  type ValidationIssueLike,
} from './errors/standard-schema-validation.exception';

/**
 * 全局校验管的**单一装配源**（SSOT）：生产入口 `main.ts` 与各 gated e2e harness 共用本工厂，
 * 消除「测试装配不复现生产 pipe → DTO 默认值/校验静默失效」的对拍缺口
 * （全栈 CI 拼 PG 首跑拓出：`@Query() ListCursorDto` 在无管装配下 `limit=undefined`→SQL `NaN`）。
 *
 * **S4 换轨（global-validation-zod-constitution-amendment）·共存式**：返回一个组合管——
 * - 参数带 `schema`（官方 `@Body/@Param/@Query({ schema })`）→ 走官方 `StandardSchemaValidationPipe`，
 *   自定 `exceptionFactory` 抛 `StandardSchemaValidationException(issues)`，由 S5 过滤器渲染成
 *   与旧 class-validator **逐字同形**的 `ErrorResponse`（含 i18n 本地化）；
 * - 其余（含尚未翻转的 class DTO 路由）→ **原样委托** `I18nValidationPipe`（whitelist/forbid/transform/
 *   enableImplicitConversion 全保），故各 context 可**逐片**翻 `@Body({schema})` 而装配点（main.ts / 各 e2e）不动。
 *
 * 官方管对无 `schema` 参数**原样返回**（见其 `transform` 早退），故组合管的 schema 分支与非 schema 分支互不干扰。
 */
class CompositeValidationPipe implements PipeTransform {
  private readonly standard = new StandardSchemaValidationPipe({
    transform: true,
    exceptionFactory: (issues) =>
      new StandardSchemaValidationException(issues as readonly ValidationIssueLike[]),
  });

  private readonly i18n = new I18nValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });

  transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if ((metadata as { schema?: unknown }).schema) {
      return this.standard.transform(value, metadata);
    }
    return this.i18n.transform(value, metadata);
  }
}

export function createValidationPipe(): PipeTransform {
  return new CompositeValidationPipe();
}
