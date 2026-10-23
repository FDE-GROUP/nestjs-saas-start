import { ConfigModule } from '@app/config/config.module';
import { DatabaseModule } from '@app/database/database.module';
import { MailerModule } from '@app/mailer/mailer.module';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CsrfOriginGuard } from './api/guards/csrf-origin.guard';
import { SessionGuard } from './api/guards/session.guard';
import { AuthInstanceInjectKey } from './auth.constant';
import type { AuthInstance } from './auth.interface';
import { AUTH_SESSION_STORE } from './domain/ports/session-store.port';
import { AUTH_USER_STORE } from './domain/ports/user-store.port';
import { AuthBootstrapService } from './infrastructure/auth.bootstrap';
import { SessionReclaimService } from './infrastructure/session-reclaim.service';
import { MikroSessionStoreAdapter } from './infrastructure/session-store.adapter';
import { MikroUserStoreAdapter } from './infrastructure/user-store.adapter';

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
        SessionGuard,
        CsrfOriginGuard,
        authProvider,
        // BA HTTP 面接线（module-auth-http-surface·甲1/丙）：装配 BA handler 并以 Fastify
        // 实例级通配路由暴露 /api/v1/auth/*；原 AuthMiddleware（forRoutes 无路由可绑·整面 404）
        // 与 AuthController stub 死面已清算删除。
        AuthBootstrapService,
        // S11 · 高危#4 收口：全局会话墙（deny-by-default）。SessionGuard 已在本模块 provide，
        // 其依赖（AuthInstanceInjectKey 本地 · UserStatusService 经 @Global TenantIsolationModule）均可解析；
        // useExisting 复用同一实例。@Public() 路由经 Reflector 旁路。
        { provide: APP_GUARD, useExisting: SessionGuard },
        // module-auth-csrf-defense 甲：CSRF Origin/Referer 校验墙（全局·排 SessionGuard 之后，401 先 403）。
        // 依赖 ConfigService（@Global）+ Reflector（内置）均可解析。
        { provide: APP_GUARD, useExisting: CsrfOriginGuard },
        // 架构精度修宪 S3：治理面对 session 表的受控写入口（原 suspend-user 直捅 em 越界收编）。
        { provide: AUTH_SESSION_STORE, useClass: MikroSessionStoreAdapter },
        // global-ba-entity-domain-placement 切片 A：user 表归 auth 域——users 模块 PIPL 硬删经此端口（S3 同型）。
        { provide: AUTH_USER_STORE, useClass: MikroUserStoreAdapter },
        // module-session-index-and-expiry-reclaim F2（甲′·镜像 OutboxRelay 零依赖）：过期 session 周期回收。
        // 缺省 SESSION_RECLAIM_ENABLED=false ⇒ 不启 timer·不触库（DB-free 不变量不动）。
        SessionReclaimService,
      ],
      exports: [SessionGuard, authProvider, AUTH_SESSION_STORE, AUTH_USER_STORE],
      global: true,
    };
  }
}
