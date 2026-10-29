import { STATUS_CODES } from 'node:http';
import { LoggerService } from '@app/logger/logger.service';
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
import { errorEnvelopeFields } from '../errors/error-envelope-fields';
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
    // 甲·global-error-envelope-reason-phrase：`error` 缺省由状态短名（HTTP reason phrase）推导，
    // 使裸 HttpException（object 无 error / string response）的 4xx 不再误标 500 味串；未知码回落
    // 旧缺省保 500/非-HttpException 行为不变。下方 object 分支 `obj.error || …` 令子类自带 error 优先。
    let error = STATUS_CODES[status] ?? 'Internal Server Error';
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
    }
    // 甲档收口（#4·module-p0-async-boundary-correctness 切片 A）：**非** HttpException 的任意 Error
    // （框架兜底 500：DB 驱动 / PG / 连接层错误等）**不再**把 `exception.message` 赋给响应体——原文常含
    // SQL 片段、约束名、表列名、连接拓扑，属内部信息泄露。`message` 保持上方缺省 `'Internal server error'`，
    // 原文经下方 5xx 日志段随堆栈留存（`Error.stack` 首行即 `Error: <message>`）。HttpException（含
    // authored 5xx `InternalServerErrorException(msg)`）走上方分支，其 message 是安全文本、照常透传。

    const responseBody: ErrorResponse = {
      statusCode: status,
      message,
      error,
      // 关联三字段单源 helper（承换轨评审 M3·与 MCP 裸面包同文，防各面漂移）。
      ...errorEnvelopeFields(request),
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
