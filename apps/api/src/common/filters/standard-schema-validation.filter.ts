import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { I18nContext } from 'nestjs-i18n';
import { errorEnvelopeFields } from '../errors/error-envelope-fields';
import type { ResponseErrorDetail } from '../errors/response-error-detail';
import {
  joinIssuePath,
  StandardSchemaValidationException,
} from '../errors/standard-schema-validation.exception';

/**
 * 官方 standard-schema 校验失败渲染过滤器（S5 · global-validation-zod-constitution-amendment）。
 *
 * 目标：`@Body/@Param/@Query({schema})` 路由的校验失败，产出与旧 `I18nValidationExceptionFilter` +
 * `validationErrorBodyFormatter` **逐字同形**的 `ErrorResponse`——顶层 `message` 为**译文数组**、
 * `errors[]` 为 `{path?, message}` 字段级明细、`error:'Bad Request'`、带 `timestamp/path/requestId`、
 * **不**预填 `errorCode`。i18n key 命中即译，未命中（含 zod 默认英文）原样透传（同旧口径）。
 *
 * 注册：`CommonModule` 内排在 `HttpExceptionFilter`（`@Catch()` 兜底）之后、与 i18n 校验过滤器并列——
 * Nest 反转全局过滤器序，各自 `@Catch` 类型互斥（本类只捕 `StandardSchemaValidationException`）。
 */
@Catch(StandardSchemaValidationException)
export class StandardSchemaValidationExceptionFilter implements ExceptionFilter {
  catch(exception: StandardSchemaValidationException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<{ url: string; id?: string | number }>();

    const i18nCtx = I18nContext.current(host) ?? I18nContext.current();
    const service = i18nCtx?.service;
    const lang = i18nCtx?.lang;
    const translate = (msg: string): string => {
      if (!service) return msg;
      try {
        return String(service.translate(msg, { lang, defaultValue: msg }));
      } catch {
        return msg;
      }
    };

    const details: ResponseErrorDetail[] = exception.issues.map((issue) => {
      const path = joinIssuePath(issue.path);
      return { ...(path ? { path } : {}), message: translate(issue.message) };
    });

    reply.status(HttpStatus.BAD_REQUEST).send({
      statusCode: HttpStatus.BAD_REQUEST,
      message: details.map((d) => d.message),
      error: 'Bad Request',
      // 关联三字段单源 helper（承换轨评审 M3·与 HttpExceptionFilter/MCP 面同文）。
      ...errorEnvelopeFields(request),
      ...(details.length > 0 ? { errors: details } : {}),
    });
  }
}
