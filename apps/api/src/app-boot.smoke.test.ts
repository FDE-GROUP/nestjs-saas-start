import { ConfigModule } from '@app/config/config.module';
import { SessionGuard } from '@app/modules/auth/api/guards/session.guard';
import { PostsController } from '@app/modules/posts/api/posts.controller';
import { TenantPermissionGuard } from '@core/saas-kit/authorization/tenant-permission.guard';
import {
  TENANT_PERMISSION_CHECKER,
  TENANT_PERMISSION_INVALIDATOR,
} from '@core/saas-kit/authorization/tenant-permission.port';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';
import { TenantScopeGuard } from '@core/saas-kit/tenancy/tenant-scope.guard';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

/**
 * S9 补遗 · 全栈 e2e 分层之第一层：**DB-free 全应用 boot 冒烟**（NFR-7）。
 *
 * S9 的 `di-context.integration.test.ts` 只把 tenancy 那一条鉴权栈放进容器；这片把它升级为
 * **整个 `AppModule` 图**的解析冒烟——`Test.createTestingModule({ imports: [AppModule] })
 * .compile()` 会实例化全部 provider（含守卫/中间件/控制器/CQRS handler/仓储），任何一个因
 * `design:paramtypes` 元数据缺失或 token 未注册而无法解析，`compile()` 当场抛
 * `UnknownDependenciesException`。这正是 S9 抓到的守卫 bug 的**全局防线**：此前所有守卫/处理器
 * 测试都走手工 `new`，CI 又无真实容器 boot，故「整树能否起」从未被验证。
 *
 * **刻意不调用 `init()` / `listen()`**：`.compile()` 只实例化 provider、不触发 `onModuleInit`/
 * `onApplicationBootstrap` 生命周期钩子——故 BA 的 `CreateAuth`（会懒连 Mikro）不执行，
 * `MikroOrmService` 又为懒建（构造不连库），故本测天然 **DB-free**、可进默认 CI。
 */
describe('全 AppModule boot 冒烟（DI 图整树可解析 · DB-free · 进 CI）', () => {
  it('compile 整树 AppModule 依赖图不抛 UnknownDependenciesException', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    // 关键接线节点均可被容器解析出实例（这些是历片只手工 new、从未走真实 DI 的类）。
    expect(moduleRef.get(TenantScopeGuard)).toBeInstanceOf(TenantScopeGuard);
    expect(moduleRef.get(TenantPermissionGuard)).toBeInstanceOf(TenantPermissionGuard);
    expect(moduleRef.get(PlatformOperatorGuard)).toBeInstanceOf(PlatformOperatorGuard);
    expect(moduleRef.get(SessionGuard)).toBeInstanceOf(SessionGuard);
    expect(moduleRef.get(PostsController)).toBeInstanceOf(PostsController);
    // 全局配置面也在图中就绪（ConfigModule 为 @Global，供跨模块 getter 解析）。
    expect(moduleRef.get(ConfigModule)).toBeInstanceOf(ConfigModule);
    // module-rbac-dynamic-roles S3 热改正确性不变量：读侧 checker 与写侧 invalidator 必须解析到
    // **同一单例**（useExisting 归一）——否则门面失效作用不到守卫裁决命中的缓存，热改不生效。
    expect(moduleRef.get(TENANT_PERMISSION_INVALIDATOR)).toBe(
      moduleRef.get(TENANT_PERMISSION_CHECKER),
    );
  });
});
