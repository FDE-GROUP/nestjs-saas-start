import { Global, Module } from '@nestjs/common';
import { StandardSchemaSerializerInterceptor } from '@nestjs/common/serializer/index.js';
import { APP_FILTER, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { LoggerModule } from '../logger/logger.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { StandardSchemaValidationExceptionFilter } from './filters/standard-schema-validation.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { TransformInterceptor } from './interceptors/transform.interceptor';

@Global()
@Module({
  imports: [LoggerModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // S5 官方 standard-schema 校验渲染器（global-validation-zod-constitution-amendment）：
    // 注册在 HttpExceptionFilter（@Catch() 兜底）之后——Nest 反转全局过滤器列表（末位先选），
    // 故本器先于兜底 HttpExceptionFilter 命中 StandardSchemaValidationException，把 Issue[]
    // 渲染成逐字同形的 ErrorResponse（顶层 message 译文数组 + errors[] 明细 + i18n）。
    //（S9：class-validator 校验支摘除·旧 I18nValidationExceptionFilter 已卸）
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
    // S7b 响应白名单序列化（官方 standard-schema 件·global-validation-zod §4 S7）：
    // 注册在 Transform **之后**（最内层）——只对 controller 返回的 data 载荷生效（出线前），
    // 信封包裹与日志仍在外层不受波及；无 @SerializeOptions({schema}) 的端点原样透传（逐端点 opt-in）。
    // ⚠ 路径取 `@nestjs/common/serializer/index.js`：Node-ESM 下裸目录子路径不可解析（exports 通配无 index 回退）。
    {
      provide: APP_INTERCEPTOR,
      useFactory: (reflector: Reflector) => new StandardSchemaSerializerInterceptor(reflector),
      inject: [Reflector],
    },
  ],
  exports: [],
})
export class CommonModule {}
