import 'reflect-metadata';
import { AppModule } from '@app/app.module';
import { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import { TENANT_STATUS_STORE } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.store';
import { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import { USER_STATUS_STORE } from '@core/saas-kit/modules/organizations/lifecycle/user-status.store';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { MikroTenantStatusStore } from './infrastructure/mikro-tenant-status.store';
import { MikroUserStatusStore } from './infrastructure/mikro-user-status.store';

/**
 * 机制层提纯（未决项 4·module-tenancy-lifecycle-quota-relocation）——lifecycle 归位后的
 * 真实装配锁测：deny-list 状态机（服务 + 两 store 端口绑定）由本上下文 `@Global` 供给，
 * 整树（含 TenantIsolationModule 中间件 / auth 会话墙 / platform 闸门等跨上下文消费面）在新家
 * 可解析——非手工桩。与 `tenancy/di-context.integration.test.ts` 的机制面锁测互补。
 * （rehierarchy 片二 K1：`OrganizationStatusService` 死服务退役·治理读写卡点改锚 `TenantStatusService`。）
 */
describe('未决项 4 · lifecycle 归位 tenants 真实装配（整树 DB-free）', () => {
  it('AppModule 整树解析 TenantStatusService/UserStatusService 与两 store Mikro 适配', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(TenantStatusService)).toBeInstanceOf(TenantStatusService);
    expect(moduleRef.get(UserStatusService)).toBeInstanceOf(UserStatusService);
    expect(moduleRef.get(TENANT_STATUS_STORE)).toBeInstanceOf(MikroTenantStatusStore);
    expect(moduleRef.get(USER_STATUS_STORE)).toBeInstanceOf(MikroUserStatusStore);
  });
});
