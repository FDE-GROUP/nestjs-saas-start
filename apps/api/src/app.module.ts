import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthModule } from './common/health/health.module';
// 限流全局墙（module-common-rate-limit 甲裁）：必须排在 AuthModule 之前——APP_GUARD 执行序
// 按模块注册序 = 限流(最廉价拒绝) → 会话墙 401 → 租户墙 403。
import { RateLimitModule } from './common/rate-limit.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
// ORM 修宪案 B · 切片 2：app-Mikro 装配根（@Global·懒建·不劫持 DB-free 装配冒烟）。
import { MikroOrmModule } from './database/mikro/mikro-orm.module';
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
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [
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
    // 注册于 TenancyModule 前——两者互不依赖（guard 的 TenantContextService 经全局解析）。
    AuthorizationModule,
    // 领域细化重构 D：平台治理上下文（@Global·operator 闸门/审计单点/平台端口适配）。
    PlatformModule,
    TenancyModule,
    UsersModule,
    PostsModule,
    WorkspacesModule,
    OrganizationsModule,
    SubscriptionsModule,
    StorageModule.register(),
    PaymentModule.register(),
    MailerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
