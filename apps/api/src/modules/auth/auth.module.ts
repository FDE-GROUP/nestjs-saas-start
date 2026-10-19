import { ConfigModule } from '@app/config/config.module';
import { DatabaseModule } from '@app/database/database.module';
import { MailerModule } from '@app/mailer/mailer.module';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthBootstrapService } from './auth.bootstrap';
import { AuthInstanceInjectKey } from './auth.constant';
import type { AuthInstance } from './auth.interface';
import { AuthService } from './auth.service';
import { SessionGuard } from './guards/session.guard';

@Module({})
export class AuthModule {
  static forRoot(): DynamicModule {
    const authProvider: Provider = {
      provide: AuthInstanceInjectKey,
      useFactory: () => {
        let auth: AuthInstance;
        return {
          get() {
            return auth;
          },
          set(value: AuthInstance) {
            auth = value;
          },
        };
      },
    };

    return {
      module: AuthModule,
      imports: [ConfigModule, DatabaseModule, MailerModule],
      providers: [
        AuthService,
        SessionGuard,
        authProvider,
        // BA HTTP 面接线（module-auth-http-surface·甲1/丙）：装配 BA handler 并以 Fastify
        // 实例级通配路由暴露 /api/v1/auth/*；原 AuthMiddleware（forRoutes 无路由可绑·整面 404）
        // 与 AuthController stub 死面已清算删除。
        AuthBootstrapService,
        // S11 · 高危#4 收口：全局会话墙（deny-by-default）。SessionGuard 已在本模块 provide，
        // 其依赖（AuthInstanceInjectKey 本地 · UserStatusService 经 @Global TenancyModule）均可解析；
        // useExisting 复用同一实例。@Public() 路由经 Reflector 旁路。
        { provide: APP_GUARD, useExisting: SessionGuard },
      ],
      exports: [AuthService, SessionGuard, authProvider],
      global: true,
    };
  }
}
