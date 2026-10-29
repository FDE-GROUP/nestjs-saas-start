import { Module } from '@nestjs/common';
import { ORPCModule } from '@orpc/nest';
import { CommonModule } from './common/common.module';
import { HealthModule } from './common/health/health.module';
import { createOrpcContext } from './common/orpc/orpc-context';
import { restErrorStatusMap } from './common/orpc/rest-error.middleware';
import { restErrorResponseBodyEncoder } from './common/orpc/rest-error.serializer';
// 限流全局墙（module-common-rate-limit 甲裁）：必须排在 AuthModule 之前——APP_GUARD 执行序
// 按模块注册序 = 限流(最廉价拒绝) → 会话墙 401 → 租户墙 403。
import { RateLimitModule } from './common/rate-limit.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
// ORM 修宪案 B · 切片 2：app-Mikro 装配根（@Global·懒建·不劫持 DB-free 装配冒烟）。
import { MikroOrmModule } from './database/mikro/mikro-orm.module';
// Feature 叠加层装配桩（module-odoo-rpc-frontend 切片 A·开源边界重划 2026-10-28 后 features 常驻本仓）：
// 运行期探测装配，缺席分支仍展开为空数组、主应用构建不被具体叠加层绑架；机制见 feature-loader.ts 头注。
import { FEATURE_MODULES } from './features/feature-loader';
import { AppI18nModule } from './i18n/i18n.module';
import { LoggerModule } from './logger/logger.module';
import { MailerModule } from './mailer/mailer.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PostsModule } from './modules/posts/posts.module';
import { StorageModule } from './modules/storage/storage.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TenantIsolationModule } from './tenant-isolation/tenant-isolation.module';

@Module({
  imports: [
    // oRPC 换轨 WP-A：@orpc/nest 集成根（提供 ImplementInterceptor + ORPC_MODULE_CONFIG），
    // `@Impl(contract)` 借此在既有 Nest 路由生命周期上服务 oRPC procedure。
    // WP-D 错误面承接：全局 `customErrorResponseBodyEncoder` 把 oRPC 错误（in-handler HttpException
    // 归一形 / standard-schema 校验 issues / 兜底 500）复刻成 HttpExceptionFilter 认得的响应体形，
    // 再由其对 `status>=300` 对象体重抛 `HttpException(body,status)` → 既有过滤器逐字补 statusCode/
    // timestamp/path/requestId（错误信封单源不变·状态经 code 由 `restErrorStatusMap`〔common ∪ HTTP_400–599〕复原）。
    // WP-C 请求上下文：`context` 工厂转读守卫已挂的 `req.sessionUser`（见 orpc-context.ts·取代旧 `@CurrentUser()`·
    // 会话写权仍单源于 SessionGuard·此处只转读不重解析）。
    ORPCModule.forRoot({
      customErrorResponseBodyEncoder: restErrorResponseBodyEncoder,
      errorStatusMap: restErrorStatusMap,
      context: createOrpcContext,
    }),
    ConfigModule,
    RateLimitModule,
    LoggerModule,
    DatabaseModule,
    MikroOrmModule,
    AppI18nModule,
    CommonModule,
    HealthModule,
    AuthModule.forRoot(),
    // 领域细化重构 A3：授权上下文（@Global·guard/裁决端口/published port 的全局供给源），
    // 注册于 TenantIsolationModule 前——两者互不依赖（guard 的 TenantIsolationService 经全局解析）。
    AuthorizationModule,
    // 领域细化重构 D：平台治理上下文（@Global·operator 闸门/审计单点/平台端口适配）。
    PlatformModule,
    TenantIsolationModule,
    UsersModule,
    PostsModule,
    WorkspacesModule,
    OrganizationsModule,
    SubscriptionsModule,
    StorageModule.register(),
    PaymentModule.register(),
    MailerModule,
    // 叠加层尾置：feature 不注册 APP_GUARD、不涉守卫排序，落尾部保持既有导入序语义不变。
    ...FEATURE_MODULES,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
