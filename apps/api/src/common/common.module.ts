import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';
import { type ExecutionContext, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { type I18nValidationException, I18nValidationExceptionFilter } from 'nestjs-i18n';
import { LoggerModule } from '../logger/logger.module';
import { fromValidationErrors, type ResponseErrorDetail } from './errors/response-error-detail';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { StandardSchemaValidationExceptionFilter } from './filters/standard-schema-validation.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';

// Localized validation errors keep the exact same response contract as the generic
// filter below (statusCode / message / error / timestamp / path / requestId) — only
// `message` content changes from raw i18n keys to translated strings.
// `errors[]`（就绪预备 #3·丙裁）与 HttpExceptionFilter 产出点同形：顶层 `message` 逐字保留（兼容），
// 另从 exc.errors（class-validator 树）展平字段级明细（path + 译文 message）。
const validationErrorBodyFormatter = (
  host: ExecutionContext,
  exception: Pick<I18nValidationException, 'getStatus' | 'errors'>,
  error: unknown,
) => {
  const request = host.switchToHttp().getRequest<{ url: string; id?: string | number }>();
  const details: ResponseErrorDetail[] = fromValidationErrors(exception.errors ?? []);
  return {
    statusCode: exception.getStatus(),
    message: error,
    error: 'Bad Request',
    timestamp: new Date().toISOString(),
    path: request.url,
    // 与 HttpExceptionFilter / LoggingInterceptor 同一兜底链口径（不为校验失败预填 errorCode 码）
    requestId: currentRequestId() ?? String(request.id ?? 'req-unknown'),
    ...(details.length > 0 ? { errors: details } : {}),
  };
};

@Global()
@Module({
  imports: [LoggerModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Registered AFTER the catch-all HttpExceptionFilter on purpose: Nest reverses the
    // global filter list (external-exception-filter-context `filters.reverse()`), so the
    // LAST-registered filter is selected FIRST — making this one win for
    // I18nValidationException before the generic filter can leak untranslated keys.
    {
      provide: APP_FILTER,
      useFactory: () =>
        new I18nValidationExceptionFilter({
          detailedErrors: false,
          responseBodyFormatter: validationErrorBodyFormatter,
        }),
    },
    // S5 官方 standard-schema 校验渲染器（global-validation-zod-constitution-amendment）：
    // 排在 HttpExceptionFilter（@Catch() 兜底）之后·与 i18n 校验过滤器并列·各自 @Catch 类型互斥
    //（本类只捕 StandardSchemaValidationException·class-validator 路由仍由上方 i18n 过滤器接管）。
    {
      provide: APP_FILTER,
      useClass: StandardSchemaValidationExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
  exports: [],
})
export class CommonModule {}
