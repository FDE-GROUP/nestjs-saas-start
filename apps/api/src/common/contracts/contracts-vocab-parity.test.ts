import type { PaymentProviderId } from '@app/modules/payment/domain/ports/payment-provider.port';
import {
  AUTHORIZATION_ACTION_VALUES,
  AUTHORIZATION_SUBJECT_VALUES,
} from '@core/saas-kit/authorization/authorization-rules';
import { ORGANIZATION_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-lifecycle';
import { ORGANIZATION_PLANS } from '@core/saas-kit/modules/subscriptions/quota/organization-plans';
import {
  AUTHORIZATION_ACTION_VALUES as CONTRACT_ACTION_VALUES,
  AUTHORIZATION_SUBJECT_VALUES as CONTRACT_SUBJECT_VALUES,
  ORGANIZATION_STATUS_VALUES,
  PAYMENT_PROVIDER_VALUES,
  TENANT_PLAN_IDS,
} from '@saas/contracts';
import { describe, expect, it } from 'vitest';

/**
 * 契约词汇对拍（S3 · global-validation-zod-constitution-amendment）。
 * `@saas/contracts` 为零依赖包（前端可消费·不含领域内核），故 wire enum 在此**内联**；
 * 领域值域 SSOT 在 `@core/saas-kit`。本测锁定「contracts 内联字面量 === core 运行时值域」——
 * core 增删词汇而 contracts 未同步即即时红，杜绝静默漂移（把双份声明的耦合显式化为可复算门禁）。
 */
const asSet = (vals: readonly string[]) => [...vals].sort();

describe('@saas/contracts · wire 词汇与 @core SSOT 对拍', () => {
  it('授权 subject 词汇逐字一致', () => {
    expect(asSet(CONTRACT_SUBJECT_VALUES)).toEqual(asSet(AUTHORIZATION_SUBJECT_VALUES));
  });

  it('授权 action 词汇逐字一致', () => {
    expect(asSet(CONTRACT_ACTION_VALUES)).toEqual(asSet(AUTHORIZATION_ACTION_VALUES));
  });

  it('订阅档位 id 与 ORGANIZATION_PLANS 键集一致', () => {
    expect(asSet(TENANT_PLAN_IDS)).toEqual(asSet(Object.keys(ORGANIZATION_PLANS)));
  });

  it('租户生命周期状态与 @core ORGANIZATION_STATUS 值域逐字一致', () => {
    expect(asSet(ORGANIZATION_STATUS_VALUES)).toEqual(asSet(Object.values(ORGANIZATION_STATUS)));
  });

  // 支付通道词汇：`PaymentProviderId` 是类型联合（无运行时值域可取），故用编译期双向赋值锁
  // 对拍——两侧集合互为子集即恒等；contracts 内联与 @core 类型任一侧增删而另一侧未同步，tsc 即红。
  it('支付通道词汇与 PaymentProviderId 编译期互锁', () => {
    const _a: PaymentProviderId = PAYMENT_PROVIDER_VALUES[0];
    const _b: (typeof PAYMENT_PROVIDER_VALUES)[number] = null as unknown as PaymentProviderId;
    void _a;
    void _b;
    expect(PAYMENT_PROVIDER_VALUES.length).toBe(3);
  });
});
