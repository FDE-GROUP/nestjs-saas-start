import 'reflect-metadata';
import { AppModule } from '@app/app.module';
import { QuotaGuard } from '@core/saas-kit/modules/subscriptions/quota/quota.guard';
import { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import { QUOTA_STORE } from '@core/saas-kit/modules/subscriptions/quota/quota.store';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { MikroQuotaStore } from './infrastructure/mikro-quota.store';

/**
 * 机制层提纯（未决项 4·module-tenancy-lifecycle-quota-relocation）——quota 归位后的
 * 真实装配锁测：席位配额（`QuotaService`/`QuotaGuard` + `QUOTA_STORE` 绑定）由本上下文
 * `@Global` 供给，整树跨上下文消费面（租级门面 `acceptInvitation`·路由 `@Quota` opt-in）
 * 在新家可解析——非手工桩。与 lifecycle 归位锁测对称。
 */
describe('未决项 4 · quota 归位 subscriptions 真实装配（整树 DB-free）', () => {
  it('AppModule 整树解析 QuotaService/QuotaGuard 与 QUOTA_STORE Mikro 适配', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef.get(QuotaService)).toBeInstanceOf(QuotaService);
    expect(moduleRef.get(QuotaGuard)).toBeInstanceOf(QuotaGuard);
    expect(moduleRef.get(QUOTA_STORE)).toBeInstanceOf(MikroQuotaStore);
  });
});
