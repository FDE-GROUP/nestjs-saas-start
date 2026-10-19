import { LoggerService } from '@app/logger/logger.service';
import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { ErrorResponse as ErrorResponseContract } from '@saas/contracts/index';
import type { FastifyReply } from 'fastify';
import type { ResponseErrorDetail } from '../errors/response-error-detail';

/**
 * 错误响应体形状：单源已上移 `@saas/contracts`（S7a·③ 裁定），本处取派生型——
 * 外形换轨前后逐字不变；逐字段语义见 contracts `envelope.ts`。
 */
type ErrorResponse = ErrorResponseContract;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LoggerService) private readonly loggerService: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let errorCode: string | undefined;
    let details: ResponseErrorDetail[] | undefined;

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const exceptionResponseObj = exceptionResponse as Record<string, unknown>;
        message = (exceptionResponseObj.message as string | string[]) || message;
        error = (exceptionResponseObj.error as string) || error;
        // 业务错误码走 HttpException 原生 object response 携带（如 throw new ForbiddenException({ message, errorCode }))
        if (typeof exceptionResponseObj.errorCode === 'string') {
          errorCode = exceptionResponseObj.errorCode;
        }
        // 结构化明细（业务子错误可选携带·与校验产出点同形）
        if (Array.isArray(exceptionResponseObj.errors)) {
          details = exceptionResponseObj.errors as ResponseErrorDetail[];
        }
      } else {
        message = exceptionResponse as string;
      }
      // Nest 12 原生 `errorCode`：子类经 `createBody` 已入响应体对象；基类 `HttpException(msg, status, { errorCode })`
      // 的 `getResponse()` 为裸串（走不到上面的 object 分支），故从实例属性兜底（覆盖 402 seat 超限等）。
      const nativeErrorCode = (exception as HttpException & { errorCode?: string }).errorCode;
      if (typeof nativeErrorCode === 'string' && errorCode === undefined) {
        errorCode = nativeErrorCode;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const responseBody: ErrorResponse = {
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: currentRequestId() ?? String(request.id ?? 'req-unknown'),
      ...(errorCode !== undefined ? { errorCode } : {}),
      ...(details !== undefined ? { errors: details } : {}),
    };

    if (status >= 500) {
      this.loggerService.error(
        `${request.method} ${request.url}`,
        exception instanceof Error
          ? exception.stack || 'No stack trace'
          : JSON.stringify(exception),
      );
    } else {
      this.loggerService.warn(`${request.method} ${request.url} - ${JSON.stringify(responseBody)}`);
    }

    reply.status(status).send(responseBody);
  }
}
