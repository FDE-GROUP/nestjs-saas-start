import {
  TENANT_ACTION_VALUES,
  TENANT_SUBJECT_VALUES,
  type TenantAction,
  type TenantSubject,
} from '@core/saas-kit/authorization/tenant-rules';
import { ApiProperty } from '@nestjs/swagger';
import type { tenantRoleGrantViewSchema, tenantRoleViewSchema } from '@saas/contracts/index';
import type { z } from 'zod';
import type {
  TenantRoleGrantView,
  TenantRoleView,
} from '../../domain/repositories/tenant-rbac.repository';

/**
 * 角色/授权面响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 * 真相源 = `AuthorizationAdminController` 实际返回类型；漂移防线：文末编译期双向赋值锁。
 * subject/action 词汇复用 @core CASL 单源数组（conditions 为白名单自由对象）。
 */
export class TenantRoleViewResponse {
  @ApiProperty({ description: 'UUIDv7。' })
  id!: string;

  @ApiProperty({ description: '角色 key（租户内唯一）。' })
  key!: string;

  @ApiProperty({ description: '人面可读名。' })
  name!: string;

  @ApiProperty({ description: '系统内置角色（不可改名/删除）。' })
  isSystem!: boolean;
}

const _trvf: TenantRoleViewResponse = {} as TenantRoleView;
const _trvb: TenantRoleView = {} as TenantRoleViewResponse;
void _trvf;
void _trvb;

export class TenantRoleGrantViewResponse {
  @ApiProperty({ enum: [...TENANT_SUBJECT_VALUES], description: '授权主体词汇。' })
  subject!: TenantSubject;

  @ApiProperty({ enum: [...TENANT_ACTION_VALUES], description: '动作词汇。' })
  action!: TenantAction;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'CASL 条件（白名单字段）；null = 无约束。',
  })
  conditions!: Record<string, unknown> | null;
}

const _trgf: TenantRoleGrantViewResponse = {} as TenantRoleGrantView;
const _trgb: TenantRoleGrantView = {} as TenantRoleGrantViewResponse;
void _trgf;
void _trgb;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源。——
const _arv1: z.infer<typeof tenantRoleViewSchema> = {} as TenantRoleView;
const _arv2: TenantRoleView = {} as z.infer<typeof tenantRoleViewSchema>;
const _agv1: z.infer<typeof tenantRoleGrantViewSchema> = {} as TenantRoleGrantView;
const _agv2: TenantRoleGrantView = {} as z.infer<typeof tenantRoleGrantViewSchema>;
void _arv1;
void _arv2;
void _agv1;
void _agv2;
