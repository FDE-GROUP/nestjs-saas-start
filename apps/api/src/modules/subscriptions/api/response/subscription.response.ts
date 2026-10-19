import type { TenantSubscriptionView } from '@core/saas-kit/modules/subscriptions/application/read-models/subscription.read-model';
import { ApiProperty } from '@nestjs/swagger';
import type { SubscriptionView } from '@saas/contracts/index';

/**
 * 订阅/配额面响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 * 真相源 = `SubscriptionsController` 实际返回类型 `TenantSubscriptionView (≡ SeatQuotaSnapshot)`。
 * 漂移防线：文末编译期双向赋值锁（tsc 结构恒等·build 拓红）。
 */
export class SubscriptionResponse {
  @ApiProperty({ description: '是否已有生效订阅。' })
  hasSubscription!: boolean;

  @ApiProperty({ description: '生效档位 plan key（缺订阅回落 FREE_PLAN）。' })
  plan!: string;

  @ApiProperty({ description: '座位上限。' })
  seatsLimit!: number;

  @ApiProperty({ description: '已用座位（= 成员数·实时算）。' })
  used!: number;

  @ApiProperty({ description: '剩余座位。' })
  remaining!: number;

  @ApiProperty({
    nullable: true,
    type: 'string',
    description: '支付通道 customer id；无订阅 = null。',
  })
  providerCustomerId!: string | null;
}

const _subf: SubscriptionResponse = {} as TenantSubscriptionView;
const _subb: TenantSubscriptionView = {} as SubscriptionResponse;
void _subf;
void _subb;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源。——
const _tsv1: SubscriptionView = {} as TenantSubscriptionView;
const _tsv2: TenantSubscriptionView = {} as SubscriptionView;
void _tsv1;
void _tsv2;
